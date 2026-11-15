import {
  CalendarEventRecord,
  EmailRecord,
  MeetingRecord,
  NodeExecutionState,
  RunLogEntry,
  SlackMessageRecord,
  Ticket,
  WorkflowNode,
  WorkflowRun,
  WorkspaceState,
} from '../src/types';

function nowIso(): string {
  return new Date().toISOString();
}

function makeLog(
  message: string,
  level: RunLogEntry['level'] = 'info',
  node?: WorkflowNode
): RunLogEntry {
  return {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: nowIso(),
    nodeId: node?.id,
    nodeTitle: node?.title,
    level,
    message,
  };
}

function getParentMap(meeting: MeetingRecord): Map<string, string[]> {
  const parents = new Map<string, string[]>();
  for (const node of meeting.workflow.nodes) {
    parents.set(node.id, []);
  }
  for (const edge of meeting.workflow.edges) {
    const arr = parents.get(edge.target);
    if (arr) arr.push(edge.source);
  }
  return parents;
}

function topologicalOrder(meeting: MeetingRecord): WorkflowNode[] {
  const nodeMap = new Map(meeting.workflow.nodes.map((n) => [n.id, n]));
  const inDegree = new Map<string, number>();
  const children = new Map<string, string[]>();

  for (const n of meeting.workflow.nodes) {
    inDegree.set(n.id, 0);
    children.set(n.id, []);
  }
  for (const e of meeting.workflow.edges) {
    if (nodeMap.has(e.source) && nodeMap.has(e.target)) {
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
      children.get(e.source)!.push(e.target);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }

  const ordered: WorkflowNode[] = [];
  while (queue.length > 0) {
    // Sort by y then x for deterministic visual ordering
    queue.sort((a, b) => {
      const na = nodeMap.get(a)!;
      const nb = nodeMap.get(b)!;
      return na.y !== nb.y ? na.y - nb.y : na.x - nb.x;
    });
    const current = queue.shift()!;
    const node = nodeMap.get(current);
    if (node) ordered.push(node);

    for (const childId of children.get(current) ?? []) {
      const nextDeg = (inDegree.get(childId) ?? 1) - 1;
      inDegree.set(childId, nextDeg);
      if (nextDeg === 0) queue.push(childId);
    }
  }

  // Append any disconnected nodes safely
  for (const n of meeting.workflow.nodes) {
    if (!ordered.some((o) => o.id === n.id)) ordered.push(n);
  }
  return ordered;
}

export function initializeRun(
  state: WorkspaceState,
  meeting: MeetingRecord,
  options?: { idempotencyScope?: string }
): WorkflowRun {
  const runNumber = state.nextRunNumber++;
  const scope = options?.idempotencyScope ?? `${meeting.id}:v1`;
  const nodeStates: Record<string, NodeExecutionState> = {};

  for (const node of meeting.workflow.nodes) {
    nodeStates[node.id] = {
      nodeId: node.id,
      status: 'queued',
      attempts: 0,
      idempotencyKey: `${scope}:${node.id}`,
    };
  }

  const run: WorkflowRun = {
    id: `run_${runNumber}_${Date.now().toString(36)}`,
    runNumber,
    meetingId: meeting.id,
    meetingTitle: meeting.title,
    status: 'running',
    startedAt: nowIso(),
    idempotencyScope: scope,
    nodeStates,
    logs: [
      makeLog(
        `Started Run #${runNumber} for "${meeting.title}" (scope: ${scope}).`,
        'info'
      ),
    ],
  };

  state.runs.push(run);
  return run;
}

export async function advanceRun(
  state: WorkspaceState,
  run: WorkflowRun,
  meeting: MeetingRecord,
  options?: { forceClearSimulatedFailure?: boolean }
): Promise<WorkflowRun> {
  const orderedNodes = topologicalOrder(meeting);
  const parentMap = getParentMap(meeting);

  if (options?.forceClearSimulatedFailure) {
    state.integrations.simulateFailureNodeKind = null;
  }

  run.status = 'running';

  for (const node of orderedNodes) {
    const nodeState = run.nodeStates[node.id] ?? {
      nodeId: node.id,
      status: 'queued',
      attempts: 0,
      idempotencyKey: `${run.idempotencyScope}:${node.id}`,
    };
    run.nodeStates[node.id] = nodeState;

    if (nodeState.status === 'completed' || nodeState.status === 'skipped') {
      continue;
    }

    // Check upstream dependencies
    const parents = parentMap.get(node.id) ?? [];
    const parentStates = parents.map((pid) => run.nodeStates[pid]?.status);
    if (parentStates.some((s) => s === 'failed' || s === 'waiting_approval')) {
      continue;
    }
    if (parentStates.some((s) => s !== 'completed' && s !== 'skipped')) {
      continue;
    }

    // Approval gate pauses unless already approved
    if (node.kind === 'approval') {
      if (run.approvedAt) {
        nodeState.status = 'completed';
        nodeState.finishedAt = nowIso();
        nodeState.outputSummary = `Approved by ${run.approvedBy || node.config.approverName || 'Operator'}`;
        continue;
      }
      nodeState.status = 'waiting_approval';
      nodeState.startedAt = nodeState.startedAt ?? nowIso();
      nodeState.attempts = Math.max(1, nodeState.attempts);
      nodeState.outputSummary = `Waiting for ${node.config.approverName || 'human'} approval`;
      run.status = 'paused_approval';
      run.logs.push(
        makeLog(
          `Paused at approval gate — awaiting sign-off from ${node.config.approverName || 'operator'}.`,
          'warn',
          node
        )
      );
      return run;
    }

    // Execute the node
    nodeState.status = 'running';
    nodeState.startedAt = nowIso();
    nodeState.attempts += 1;
    nodeState.error = undefined;

    try {
      // Optional simulated failure for testing live retries & idempotency
      if (state.integrations.simulateFailureNodeKind === node.kind) {
        throw new Error(
          `Simulated transient error on ${node.toolLabel} (${node.title}). Click Retry to recover without duplicates.`
        );
      }

      await executeSingleNode(state, run, meeting, node, nodeState);
      nodeState.status = 'completed';
      nodeState.finishedAt = nowIso();
    } catch (err: any) {
      nodeState.status = 'failed';
      nodeState.finishedAt = nowIso();
      nodeState.error = err?.message || 'Execution step failed';
      run.status = 'failed';
      run.logs.push(
        makeLog(`Step failed: ${nodeState.error}`, 'error', node)
      );
      return run;
    }
  }

  // Determine overall run completion
  const statuses = Object.values(run.nodeStates).map((s) => s.status);
  if (statuses.some((s) => s === 'waiting_approval')) {
    run.status = 'paused_approval';
  } else if (statuses.some((s) => s === 'failed')) {
    run.status = 'failed';
  } else if (statuses.every((s) => s === 'completed' || s === 'skipped')) {
    run.status = 'completed';
    run.finishedAt = nowIso();
    run.logs.push(
      makeLog(`Run #${run.runNumber} completed all steps cleanly.`, 'success')
    );
  }

  return run;
}

async function executeSingleNode(
  state: WorkspaceState,
  run: WorkflowRun,
  meeting: MeetingRecord,
  node: WorkflowNode,
  nodeState: NodeExecutionState
): Promise<void> {
  const idemKey = nodeState.idempotencyKey;

  switch (node.kind) {
    case 'trigger': {
      nodeState.outputSummary = `Triggered from "${meeting.title}" (${meeting.extracted.length} extracted items)`;
      run.logs.push(makeLog(nodeState.outputSummary, 'info', node));
      return;
    }

    case 'loop': {
      const complaints = meeting.extracted.filter((e) => e.kind === 'complaint');
      nodeState.outputSummary = `Dispatched ${complaints.length || node.config.count || 1} parallel branch(es)`;
      run.logs.push(makeLog(nodeState.outputSummary, 'info', node));
      return;
    }

    case 'ticket': {
      const existing = state.tickets.find((t) => t.idempotencyKey === idemKey);
      if (existing) {
        nodeState.deduplicated = true;
        nodeState.outputSummary = `Idempotent hit — reused ${existing.code} (${existing.ownerName})`;
        nodeState.outputData = { ticketCode: existing.code, ticketId: existing.id };
        run.logs.push(
          makeLog(
            `Skipped duplicate ticket creation; reused ${existing.code} via idempotency key.`,
            'info',
            node
          )
        );
        return;
      }

      const code =
        node.config.ticketCode && !state.tickets.some((t) => t.code === node.config.ticketCode)
          ? String(node.config.ticketCode)
          : `TCK-${state.nextTicketNumber++}`;

      const ticket: Ticket = {
        id: `tck_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        code,
        title: String(node.config.ticketTitle || node.title),
        description: String(
          node.config.description || `Action item extracted from ${meeting.title}`
        ),
        priority: (node.config.priority as Ticket['priority']) || 'P2',
        status: 'open',
        ownerName: String(node.config.assigneeName || 'Anita Rao'),
        ownerId: node.config.assigneeId,
        dueDateIso: String(node.config.dueDateIso || meeting.referenceDateIso),
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        runId: run.id,
        idempotencyKey: idemKey,
        createdAt: nowIso(),
      };
      state.tickets.unshift(ticket);
      nodeState.deduplicated = false;
      nodeState.outputSummary = `Created ${ticket.code} · ${ticket.ownerName} · ${ticket.priority}`;
      nodeState.outputData = { ticketCode: ticket.code, ticketId: ticket.id };
      run.logs.push(
        makeLog(
          `Created ticket ${ticket.code} assigned to ${ticket.ownerName} (Due ${ticket.dueDateIso}).`,
          'success',
          node
        )
      );
      return;
    }

    case 'email': {
      const existing = state.emails.find((e) => e.idempotencyKey === idemKey);
      if (existing) {
        nodeState.deduplicated = true;
        nodeState.outputSummary = `Idempotent hit — email already sent to ${existing.to}`;
        run.logs.push(
          makeLog(
            `Skipped duplicate email to ${existing.to} via idempotency key.`,
            'info',
            node
          )
        );
        return;
      }

      const meetingTickets = state.tickets.filter((t) => t.meetingId === meeting.id);
      const ticketCodes = meetingTickets.map((t) => t.code);
      let body = String(
        node.config.bodyTemplate ||
          `Summary from ${meeting.title}:\n${meeting.summary}\nTickets: ${ticketCodes.join(', ')}`
      );
      body = body.replace(/\{\{TCK-\d+\}\}/g, (match) => match.slice(2, -2));

      const to = String(node.config.to || `team@${meeting.clientName.toLowerCase().replace(/\s+/g, '')}.example`);
      const subject = String(node.config.subject || `${meeting.title} — Recap & Action Items`);

      let deliveryMode: EmailRecord['deliveryMode'] = 'outbox';
      let webhookStatusCode: number | undefined;

      if (state.integrations.emailWebhookUrl?.trim()) {
        deliveryMode = 'webhook_relay';
        const resp = await fetch(state.integrations.emailWebhookUrl.trim(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: 'MeetMind',
            type: 'email.recap',
            to,
            subject,
            body,
            ticketCodes,
            meetingId: meeting.id,
          }),
        });
        webhookStatusCode = resp.status;
        if (!resp.ok) {
          throw new Error(`Email webhook relay returned HTTP ${resp.status}`);
        }
      }

      const record: EmailRecord = {
        id: `eml_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        to,
        subject,
        body,
        ticketCodes,
        meetingId: meeting.id,
        runId: run.id,
        deliveryMode,
        webhookStatusCode,
        status: 'sent',
        sentAt: nowIso(),
        idempotencyKey: idemKey,
      };
      state.emails.unshift(record);
      nodeState.outputSummary =
        deliveryMode === 'webhook_relay'
          ? `Delivered via webhook relay (HTTP ${webhookStatusCode}) to ${to}`
          : `Sent recap email to ${to} (${ticketCodes.length} tickets linked)`;
      nodeState.outputData = { emailId: record.id, to, subject };
      run.logs.push(makeLog(nodeState.outputSummary, 'success', node));
      return;
    }

    case 'calendar': {
      const existing = state.calendarEvents.find((c) => c.idempotencyKey === idemKey);
      if (existing) {
        nodeState.deduplicated = true;
        nodeState.outputSummary = `Idempotent hit — event "${existing.title}" already scheduled`;
        run.logs.push(
          makeLog(
            `Skipped duplicate calendar invite "${existing.title}" via idempotency key.`,
            'info',
            node
          )
        );
        return;
      }

      const event: CalendarEventRecord = {
        id: `cal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: String(node.config.title || `${meeting.clientName} Follow-up`),
        startIso: String(node.config.startIso || '2026-11-26T10:00:00.000Z'),
        durationMin: Number(node.config.durationMin || 30),
        attendees: Array.isArray(node.config.attendees)
          ? node.config.attendees
          : ['anita@meetmind.app'],
        description: String(node.config.description || meeting.summary),
        meetingId: meeting.id,
        runId: run.id,
        status: 'scheduled',
        createdAt: nowIso(),
        idempotencyKey: idemKey,
      };
      state.calendarEvents.unshift(event);
      nodeState.outputSummary = `Scheduled "${event.title}" (${event.durationMin}m)`;
      nodeState.outputData = { eventId: event.id, startIso: event.startIso };
      run.logs.push(makeLog(nodeState.outputSummary, 'success', node));
      return;
    }

    case 'wait_condition':
    case 'slack': {
      const existing = state.slackMessages.find((s) => s.idempotencyKey === idemKey);
      if (existing) {
        nodeState.deduplicated = true;
        nodeState.outputSummary = `Idempotent hit — Slack ${existing.channel} already notified`;
        run.logs.push(
          makeLog(
            `Skipped duplicate Slack message to ${existing.channel} via idempotency key.`,
            'info',
            node
          )
        );
        return;
      }

      if (node.kind === 'wait_condition') {
        const meetingTickets = state.tickets.filter((t) => t.meetingId === meeting.id);
        const hasOpen = meetingTickets.some((t) => t.status !== 'resolved');
        if (!hasOpen && meetingTickets.length > 0) {
          nodeState.outputSummary = `Evaluated after ${node.config.waitDays || 2}d: All ${meetingTickets.length} tickets resolved — escalation skipped`;
          run.logs.push(makeLog(nodeState.outputSummary, 'info', node));
          return;
        }
      }

      const channel = String(node.config.channel || '#ops');
      const text = String(
        node.config.messageTemplate ||
          `MeetMind update for "${meeting.title}": workflow executed.`
      );

      let webhookDelivered = false;
      let webhookStatusCode: number | undefined;
      const webhookUrl = state.integrations.slackWebhookUrl?.trim();

      if (webhookUrl) {
        const resp = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `[MeetMind ${channel}] ${text}`,
            channel,
            meeting: meeting.title,
            runId: run.id,
          }),
        });
        webhookStatusCode = resp.status;
        webhookDelivered = resp.ok;
        if (!resp.ok) {
          throw new Error(`Slack webhook returned HTTP ${resp.status}`);
        }
      }

      const slackMsg: SlackMessageRecord = {
        id: `slk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        channel,
        text,
        webhookDelivered,
        webhookStatusCode,
        webhookTarget: webhookUrl || undefined,
        meetingId: meeting.id,
        runId: run.id,
        sentAt: nowIso(),
        idempotencyKey: idemKey,
      };
      state.slackMessages.unshift(slackMsg);
      nodeState.outputSummary = webhookDelivered
        ? `Posted to ${channel} + live Webhook (HTTP ${webhookStatusCode})`
        : `Posted escalation alert to ${channel}`;
      nodeState.outputData = { slackMessageId: slackMsg.id, channel };
      run.logs.push(makeLog(nodeState.outputSummary, 'success', node));
      return;
    }
  }
}
