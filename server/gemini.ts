import { GoogleGenAI, Type } from '@google/genai';
import {
  ExtractedItem,
  TeamMember,
  TranscriptSegment,
  WorkflowEdge,
  WorkflowNode,
} from '../src/types';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Add it in Settings > Secrets to enable AI parsing and workflow drafting.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface ParsedMeetingResult {
  summary: string;
  transcript: TranscriptSegment[];
  extracted: ExtractedItem[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export async function parseMeetingWithGemini(params: {
  title: string;
  clientName: string;
  referenceDateIso: string;
  rawTranscript: string;
  team: TeamMember[];
}): Promise<ParsedMeetingResult> {
  const ai = getGeminiClient();
  const teamDirectory = params.team
    .map((m) => `${m.id}: ${m.name} (${m.role}, ${m.email})`)
    .join('\n');

  const systemInstruction = `You are MeetMind, an enterprise operations assistant that converts raw meeting transcripts into structured intelligence and an executable visual workflow graph.
Reference meeting date (YYYY-MM-DD): ${params.referenceDateIso}.
Team directory for owner mapping:
${teamDirectory}

Rules:
1. Segment the transcript into chronological timestamped turns. If timestamps are missing, assign realistic sequential mm:ss timestamps.
2. Extract all complaints, decisions, commitments, and action items.
3. People & Date Mapping: Resolve spoken names (e.g. "Raj", "Meena", "Anita", "Samira") to the matching TeamMember id & full name. Resolve relative phrases ("by Friday", "next Thursday", "tomorrow", "today") into concrete YYYY-MM-DD dates relative to ${params.referenceDateIso}.
4. Draft a clean executable workflow DAG with positioned nodes (canvas width ~760px, x between 80 and 520, y starting at 36 and stepping by ~125px per layer, branching parallel nodes horizontally at x=130 and x=490, single-column nodes at x=310).
5. Always start with a 'trigger' node, include 'ticket' nodes for complaints/actions, place at least one 'approval' human-in-the-loop gate before external customer actions ('email', 'calendar', 'slack'), and optionally a 'wait_condition' node for escalation.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Meeting Title: ${params.title}
Client: ${params.clientName}
Raw Transcript:
${params.rawTranscript}`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING },
          transcript: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                seconds: { type: Type.INTEGER },
                speakerName: { type: Type.STRING },
                speakerId: { type: Type.STRING },
                text: { type: Type.STRING },
              },
              required: ['id', 'timestamp', 'seconds', 'speakerName', 'text'],
            },
          },
          extracted: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                kind: { type: Type.STRING },
                title: { type: Type.STRING },
                rawQuote: { type: Type.STRING },
                ownerId: { type: Type.STRING },
                ownerName: { type: Type.STRING },
                duePhrase: { type: Type.STRING },
                dueDateIso: { type: Type.STRING },
                priority: { type: Type.STRING },
                timestamp: { type: Type.STRING },
                mappingNote: { type: Type.STRING },
              },
              required: ['id', 'kind', 'title', 'rawQuote', 'timestamp'],
            },
          },
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                kind: { type: Type.STRING },
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                toolLabel: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                configJson: {
                  type: Type.STRING,
                  description:
                    'JSON string of node config fields (e.g. assigneeName, assigneeId, priority, dueDateIso, ticketTitle, approverName, to, subject, bodyTemplate, startIso, durationMin, channel, messageTemplate, waitDays)',
                },
              },
              required: ['id', 'kind', 'title', 'subtitle', 'toolLabel', 'x', 'y', 'configJson'],
            },
          },
          edges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                source: { type: Type.STRING },
                target: { type: Type.STRING },
                label: { type: Type.STRING },
              },
              required: ['id', 'source', 'target'],
            },
          },
        },
        required: ['summary', 'transcript', 'extracted', 'nodes', 'edges'],
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  const parsed = JSON.parse(text);

  const normalizedNodes: WorkflowNode[] = (parsed.nodes || []).map((n: any) => {
    let config: Record<string, any> = {};
    try {
      config = n.configJson ? JSON.parse(n.configJson) : {};
    } catch {
      config = {};
    }
    return {
      id: String(n.id),
      kind: normalizeNodeKind(n.kind),
      title: String(n.title),
      subtitle: String(n.subtitle || ''),
      toolLabel: String(n.toolLabel || String(n.kind).toUpperCase()),
      x: Number(n.x ?? 310),
      y: Number(n.y ?? 40),
      config,
    };
  });

  const normalizedExtracted: ExtractedItem[] = (parsed.extracted || []).map((item: any) => ({
    id: String(item.id),
    kind: normalizeExtractedKind(item.kind),
    title: String(item.title),
    rawQuote: String(item.rawQuote || ''),
    ownerId: item.ownerId || undefined,
    ownerName: item.ownerName || undefined,
    duePhrase: item.duePhrase || undefined,
    dueDateIso: item.dueDateIso || params.referenceDateIso,
    priority: normalizePriority(item.priority),
    timestamp: String(item.timestamp || '00:00'),
    mappingNote: item.mappingNote || undefined,
  }));

  return {
    summary: String(parsed.summary || ''),
    transcript: (parsed.transcript || []).map((s: any, idx: number) => ({
      id: String(s.id || `seg_${idx + 1}`),
      timestamp: String(s.timestamp || '00:00'),
      seconds: Number(s.seconds ?? idx * 45),
      speakerId: s.speakerId || undefined,
      speakerName: String(s.speakerName || 'Speaker'),
      text: String(s.text || ''),
    })),
    extracted: normalizedExtracted,
    nodes: normalizedNodes,
    edges: (parsed.edges || []).map((e: any, idx: number) => ({
      id: String(e.id || `edge_${idx + 1}`),
      source: String(e.source),
      target: String(e.target),
      label: e.label ? String(e.label) : undefined,
    })),
  };
}

export async function draftWorkflowFromPlainEnglish(params: {
  prompt: string;
  meetingTitle: string;
  clientName: string;
  referenceDateIso: string;
  team: TeamMember[];
  extractedSummary: string;
}): Promise<{ nodes: WorkflowNode[]; edges: WorkflowEdge[] }> {
  const ai = getGeminiClient();
  const teamDirectory = params.team
    .map((m) => `${m.id}: ${m.name} (${m.role}, ${m.email})`)
    .join('\n');

  const systemInstruction = `You are MeetMind's workflow architect. Turn a user's plain-English automation instruction into a clean visual DAG workflow.
Meeting context: "${params.meetingTitle}" for client "${params.clientName}" (Date: ${params.referenceDateIso}).
Extracted items context:
${params.extractedSummary}

Team members:
${teamDirectory}

Supported node kinds ONLY:
- trigger (toolLabel: TRIGGER)
- loop (toolLabel: LOGIC)
- ticket (toolLabel: TICKET) — configJson: { ticketTitle, description, assigneeName, assigneeId, priority: "P1"|"P2"|"P3", dueDateIso }
- approval (toolLabel: APPROVAL) — configJson: { approverName, approverId, reason }
- email (toolLabel: GMAIL) — configJson: { to, subject, bodyTemplate }
- calendar (toolLabel: CALENDAR) — configJson: { title, startIso, durationMin, attendees, description }
- wait_condition (toolLabel: WAIT 2 DAYS) — configJson: { waitDays, condition: "any_ticket_open", channel: "#ops", messageTemplate }
- slack (toolLabel: SLACK) — configJson: { channel: "#ops", messageTemplate }

Layout coordinates:
- Single centered column nodes: x = 310
- Two parallel branch nodes: left x = 130, right x = 490
- Vertical layers: y = 36, 152, 268, 392, 518, 642.
Keep graph clean, connected, acyclic, with human approval before external email/calendar/slack actions unless requested otherwise.`;

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Draft a workflow from this plain-English request:\n"${params.prompt}"`,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          nodes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                kind: { type: Type.STRING },
                title: { type: Type.STRING },
                subtitle: { type: Type.STRING },
                toolLabel: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
                configJson: { type: Type.STRING },
              },
              required: ['id', 'kind', 'title', 'subtitle', 'toolLabel', 'x', 'y', 'configJson'],
            },
          },
          edges: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                source: { type: Type.STRING },
                target: { type: Type.STRING },
                label: { type: Type.STRING },
              },
              required: ['id', 'source', 'target'],
            },
          },
        },
        required: ['nodes', 'edges'],
      },
    },
  });

  const text = (response.text ?? '{}').trim();
  const parsed = JSON.parse(text);

  const nodes: WorkflowNode[] = (parsed.nodes || []).map((n: any) => {
    let config: Record<string, any> = {};
    try {
      config = n.configJson ? JSON.parse(n.configJson) : {};
    } catch {
      config = {};
    }
    return {
      id: String(n.id),
      kind: normalizeNodeKind(n.kind),
      title: String(n.title),
      subtitle: String(n.subtitle || ''),
      toolLabel: String(n.toolLabel || String(n.kind).toUpperCase()),
      x: Number(n.x ?? 310),
      y: Number(n.y ?? 40),
      config,
    };
  });

  const edges: WorkflowEdge[] = (parsed.edges || []).map((e: any, idx: number) => ({
    id: String(e.id || `edge_${idx + 1}`),
    source: String(e.source),
    target: String(e.target),
    label: e.label ? String(e.label) : undefined,
  }));

  return { nodes, edges };
}

function normalizeNodeKind(kind: string): WorkflowNode['kind'] {
  const k = String(kind || '').toLowerCase();
  if (
    k === 'trigger' ||
    k === 'loop' ||
    k === 'ticket' ||
    k === 'approval' ||
    k === 'email' ||
    k === 'calendar' ||
    k === 'wait_condition' ||
    k === 'slack'
  ) {
    return k;
  }
  if (k.includes('wait')) return 'wait_condition';
  if (k.includes('mail') || k.includes('gmail')) return 'email';
  if (k.includes('cal')) return 'calendar';
  if (k.includes('approv')) return 'approval';
  if (k.includes('slack')) return 'slack';
  if (k.includes('loop')) return 'loop';
  if (k.includes('trig')) return 'trigger';
  return 'ticket';
}

function normalizeExtractedKind(kind: string): ExtractedItem['kind'] {
  const k = String(kind || '').toLowerCase();
  if (k === 'complaint' || k === 'decision' || k === 'commit' || k === 'action') return k;
  if (k.includes('issue') || k.includes('bug')) return 'complaint';
  if (k.includes('decid')) return 'decision';
  return 'action';
}

function normalizePriority(p?: string): 'P1' | 'P2' | 'P3' {
  const s = String(p || '').toUpperCase();
  if (s === 'P1' || s === 'P2' || s === 'P3') return s;
  return 'P2';
}
