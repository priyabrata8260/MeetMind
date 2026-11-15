import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { loadState, mutateState, resetSeedState } from './server/store';
import { advanceRun, initializeRun } from './server/engine';
import {
  draftWorkflowFromPlainEnglish,
  parseMeetingWithGemini,
} from './server/gemini';
import { MeetingRecord, Ticket, WorkflowEdge, WorkflowNode } from './src/types';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '4mb' }));

  // Load initial state on boot
  await loadState();

  // Workspace bootstrap state
  app.get('/api/workspace', async (_req, res) => {
    try {
      const state = await loadState();
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to load workspace' });
    }
  });

  // Reset demo state to fresh seed
  app.post('/api/workspace/reset', async (_req, res) => {
    try {
      const fresh = await resetSeedState();
      res.json(fresh);
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to reset workspace' });
    }
  });

  // Parse a raw meeting transcript with Gemini AI & create a new meeting + drafted workflow
  app.post('/api/meetings/parse', async (req, res) => {
    try {
      const { title, clientName, referenceDateIso, rawTranscript } = req.body ?? {};
      if (!rawTranscript || typeof rawTranscript !== 'string' || !rawTranscript.trim()) {
        return res.status(400).json({ error: 'Transcript text is required.' });
      }

      const current = await loadState();
      const meetingTitle = String(title || 'Client Operations Sync').trim();
      const client = String(clientName || 'Client Team').trim();
      const refDate = String(referenceDateIso || new Date().toISOString().slice(0, 10));

      const parsed = await parseMeetingWithGemini({
        title: meetingTitle,
        clientName: client,
        referenceDateIso: refDate,
        rawTranscript,
        team: current.team,
      });

      const speakers = new Set(parsed.transcript.map((s) => s.speakerName));
      const totalSeconds = Math.max(
        180,
        (parsed.transcript[parsed.transcript.length - 1]?.seconds ?? 240) + 30
      );
      const waveform = Array.from({ length: 40 }, (_, i) =>
        Math.round(25 + Math.abs(Math.sin(i * 0.7 + parsed.transcript.length)) * 68)
      );

      const newMeeting: MeetingRecord = {
        id: `mtg_${Date.now().toString(36)}`,
        title: meetingTitle,
        clientName: client,
        dateLabel: new Date(`${refDate}T12:00:00Z`).toLocaleDateString('en-GB', {
          day: 'numeric',
          month: 'short',
        }),
        referenceDateIso: refDate,
        durationLabel: `${Math.max(1, Math.round(totalSeconds / 60))} min`,
        durationSeconds: totalSeconds,
        speakerCount: Math.max(1, speakers.size),
        audioWaveform: waveform,
        summary: parsed.summary,
        transcript: parsed.transcript,
        extracted: parsed.extracted,
        workflow: {
          nodes: parsed.nodes,
          edges: parsed.edges,
          draftedFrom: 'meeting',
          updatedAt: new Date().toISOString(),
        },
      };

      const { state } = await mutateState((s) => {
        s.meetings.unshift(newMeeting);
        return newMeeting;
      });

      res.json({ meeting: newMeeting, state });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to analyze meeting transcript with Gemini AI.',
      });
    }
  });

  // Draft or re-draft a workflow from plain English using Gemini AI
  app.post('/api/meetings/:id/draft-workflow', async (req, res) => {
    try {
      const { id } = req.params;
      const { prompt } = req.body ?? {};
      if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
        return res.status(400).json({ error: 'Plain-English workflow prompt is required.' });
      }

      const current = await loadState();
      const meeting = current.meetings.find((m) => m.id === id);
      if (!meeting) {
        return res.status(404).json({ error: 'Meeting not found.' });
      }

      const extractedSummary = meeting.extracted
        .map(
          (e) =>
            `- [${e.kind}] ${e.title} (Owner: ${e.ownerName || 'Unassigned'}, Due: ${e.dueDateIso || 'TBD'}, Priority: ${e.priority || 'P2'})`
        )
        .join('\n');

      const drafted = await draftWorkflowFromPlainEnglish({
        prompt: prompt.trim(),
        meetingTitle: meeting.title,
        clientName: meeting.clientName,
        referenceDateIso: meeting.referenceDateIso,
        team: current.team,
        extractedSummary,
      });

      const { state } = await mutateState((s) => {
        const target = s.meetings.find((m) => m.id === id);
        if (target) {
          target.workflow = {
            nodes: drafted.nodes,
            edges: drafted.edges,
            draftedFrom: 'plain_english',
            promptUsed: prompt.trim(),
            updatedAt: new Date().toISOString(),
          };
        }
      });

      res.json({ state });
    } catch (err: any) {
      res.status(500).json({
        error: err?.message || 'Failed to draft workflow from plain English.',
      });
    }
  });

  // Update workflow graph (node positions, config edits, add/delete nodes or edges)
  app.put('/api/meetings/:id/workflow', async (req, res) => {
    try {
      const { id } = req.params;
      const { nodes, edges } = req.body as {
        nodes: WorkflowNode[];
        edges: WorkflowEdge[];
      };

      const { state, result } = await mutateState((s) => {
        const target = s.meetings.find((m) => m.id === id);
        if (!target) return null;
        if (Array.isArray(nodes)) target.workflow.nodes = nodes;
        if (Array.isArray(edges)) target.workflow.edges = edges;
        target.workflow.updatedAt = new Date().toISOString();
        return target;
      });

      if (!result) return res.status(404).json({ error: 'Meeting not found.' });
      res.json({ state });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update workflow' });
    }
  });

  // Start a new workflow execution run
  app.post('/api/meetings/:id/runs', async (req, res) => {
    try {
      const { id } = req.params;
      const { idempotencyMode } = req.body ?? {};
      // idempotencyMode: 'deduplicate' (same meeting scope -> prevents duplicates) | 'fresh' (new scope)

      const { state, result } = await mutateState(async (s) => {
        const meeting = s.meetings.find((m) => m.id === id);
        if (!meeting) return null;
        const scope =
          idempotencyMode === 'fresh'
            ? `${meeting.id}:run_${s.nextRunNumber}`
            : `${meeting.id}:v1`;
        const run = initializeRun(s, meeting, { idempotencyScope: scope });
        await advanceRun(s, run, meeting);
        return run;
      });

      if (!result) return res.status(404).json({ error: 'Meeting not found.' });
      res.json({ run: result, state });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to execute workflow' });
    }
  });

  // Approve a paused workflow run and resume execution
  app.post('/api/runs/:runId/approve', async (req, res) => {
    try {
      const { runId } = req.params;
      const { approverName } = req.body ?? {};

      const { state, result } = await mutateState(async (s) => {
        const run = s.runs.find((r) => r.id === runId);
        if (!run) return null;
        const meeting = s.meetings.find((m) => m.id === run.meetingId);
        if (!meeting) return null;

        run.approvedBy = String(approverName || 'Anita Rao');
        run.approvedAt = new Date().toISOString();
        run.logs.push({
          id: `log_${Date.now()}`,
          timestamp: run.approvedAt,
          level: 'success',
          message: `${run.approvedBy} approved workflow continuation. Resuming downstream steps.`,
        });

        await advanceRun(s, run, meeting);
        return run;
      });

      if (!result) return res.status(404).json({ error: 'Run not found.' });
      res.json({ run: result, state });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to approve run' });
    }
  });

  // Reject a paused workflow run
  app.post('/api/runs/:runId/reject', async (req, res) => {
    try {
      const { runId } = req.params;
      const { reason } = req.body ?? {};

      const { state, result } = await mutateState((s) => {
        const run = s.runs.find((r) => r.id === runId);
        if (!run) return null;
        run.status = 'rejected';
        run.finishedAt = new Date().toISOString();
        for (const ns of Object.values(run.nodeStates)) {
          if (ns.status === 'waiting_approval' || ns.status === 'queued') {
            ns.status = 'skipped';
          }
        }
        run.logs.push({
          id: `log_${Date.now()}`,
          timestamp: run.finishedAt,
          level: 'warn',
          message: `Approval rejected${reason ? `: ${reason}` : '.'} Downstream external actions cancelled.`,
        });
        return run;
      });

      if (!result) return res.status(404).json({ error: 'Run not found.' });
      res.json({ run: result, state });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to reject run' });
    }
  });

  // Retry a failed node in a run and resume without creating duplicates
  app.post('/api/runs/:runId/retry', async (req, res) => {
    try {
      const { runId } = req.params;
      const { nodeId, clearSimulatedFailure } = req.body ?? {};

      const { state, result } = await mutateState(async (s) => {
        const run = s.runs.find((r) => r.id === runId);
        if (!run) return null;
        const meeting = s.meetings.find((m) => m.id === run.meetingId);
        if (!meeting) return null;

        if (nodeId && run.nodeStates[nodeId]) {
          run.nodeStates[nodeId].status = 'queued';
          run.nodeStates[nodeId].error = undefined;
        } else {
          for (const ns of Object.values(run.nodeStates)) {
            if (ns.status === 'failed') {
              ns.status = 'queued';
              ns.error = undefined;
            }
          }
        }

        run.logs.push({
          id: `log_${Date.now()}`,
          timestamp: new Date().toISOString(),
          nodeId,
          level: 'info',
          message: `Retrying failed step(s) with idempotency preservation.`,
        });

        await advanceRun(s, run, meeting, {
          forceClearSimulatedFailure: clearSimulatedFailure !== false,
        });
        return run;
      });

      if (!result) return res.status(404).json({ error: 'Run not found.' });
      res.json({ run: result, state });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to retry run' });
    }
  });

  // Update ticket status or owner
  app.patch('/api/tickets/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { status, priority, ownerName } = req.body as Partial<Ticket>;

      const { state, result } = await mutateState((s) => {
        const ticket = s.tickets.find((t) => t.id === id);
        if (!ticket) return null;
        if (status) ticket.status = status;
        if (priority) ticket.priority = priority;
        if (ownerName) ticket.ownerName = ownerName;
        return ticket;
      });

      if (!result) return res.status(404).json({ error: 'Ticket not found.' });
      res.json({ ticket: result, state });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update ticket' });
    }
  });

  // Save real webhook / integration settings
  app.put('/api/integrations', async (req, res) => {
    try {
      const { slackWebhookUrl, emailWebhookUrl, simulateFailureNodeKind } = req.body ?? {};
      const { state } = await mutateState((s) => {
        if (typeof slackWebhookUrl === 'string') {
          s.integrations.slackWebhookUrl = slackWebhookUrl.trim();
        }
        if (typeof emailWebhookUrl === 'string') {
          s.integrations.emailWebhookUrl = emailWebhookUrl.trim();
        }
        if (simulateFailureNodeKind !== undefined) {
          s.integrations.simulateFailureNodeKind = simulateFailureNodeKind;
        }
      });
      res.json({ state });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to update integrations' });
    }
  });

  // Test a real webhook URL directly from backend
  app.post('/api/integrations/test-webhook', async (req, res) => {
    try {
      const { url, kind } = req.body ?? {};
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Webhook URL is required.' });
      }
      const started = Date.now();
      const response = await fetch(url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `[MeetMind] Live integration test (${kind || 'webhook'}) at ${new Date().toISOString()}`,
          source: 'MeetMind',
          kind: kind || 'test',
        }),
      });
      const latencyMs = Date.now() - started;
      res.json({
        ok: response.ok,
        status: response.status,
        latencyMs,
      });
    } catch (err: any) {
      res.status(502).json({
        ok: false,
        error: err?.message || 'Webhook delivery failed',
      });
    }
  });

  // Download .ics calendar file for any scheduled calendar event
  app.get('/api/calendar/:eventId/ics', async (req, res) => {
    const state = await loadState();
    const ev = state.calendarEvents.find((c) => c.id === req.params.eventId);
    if (!ev) return res.status(404).send('Event not found');

    const start = new Date(ev.startIso);
    const end = new Date(start.getTime() + ev.durationMin * 60000);
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//MeetMind//Workflow Engine//EN',
      'BEGIN:VEVENT',
      `UID:${ev.id}@meetmind.app`,
      `DTSTAMP:${fmt(new Date())}`,
      `DTSTART:${fmt(start)}`,
      `DTEND:${fmt(end)}`,
      `SUMMARY:${ev.title}`,
      `DESCRIPTION:${ev.description.replace(/\n/g, '\\n')}`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${ev.id}.ics"`);
    res.send(ics);
  });

  // Mount Vite middleware in dev, or static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MeetMind server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start MeetMind server:', err);
  process.exit(1);
});
