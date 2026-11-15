export type Priority = 'P1' | 'P2' | 'P3';

export type ExtractedKind = 'complaint' | 'decision' | 'commit' | 'action';

export type WorkflowNodeKind =
  | 'trigger'
  | 'loop'
  | 'ticket'
  | 'approval'
  | 'email'
  | 'calendar'
  | 'wait_condition'
  | 'slack';

export type NodeRunStatus =
  | 'idle'
  | 'queued'
  | 'running'
  | 'waiting_approval'
  | 'waiting_timer'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  handle: string;
  initials: string;
}

export interface TranscriptSegment {
  id: string;
  timestamp: string;
  seconds: number;
  speakerId?: string;
  speakerName: string;
  text: string;
}

export interface ExtractedItem {
  id: string;
  kind: ExtractedKind;
  title: string;
  rawQuote: string;
  ownerId?: string;
  ownerName?: string;
  duePhrase?: string;
  dueDateIso?: string;
  priority?: Priority;
  timestamp: string;
  mappingNote?: string;
}

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  title: string;
  subtitle: string;
  toolLabel: string;
  x: number;
  y: number;
  config: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  draftedFrom: 'meeting' | 'plain_english';
  promptUsed?: string;
  updatedAt: string;
}

export interface MeetingRecord {
  id: string;
  title: string;
  clientName: string;
  dateLabel: string;
  referenceDateIso: string;
  durationLabel: string;
  durationSeconds: number;
  speakerCount: number;
  audioWaveform: number[];
  summary: string;
  transcript: TranscriptSegment[];
  extracted: ExtractedItem[];
  workflow: WorkflowDefinition;
}

export interface NodeExecutionState {
  nodeId: string;
  status: NodeRunStatus;
  startedAt?: string;
  finishedAt?: string;
  attempts: number;
  idempotencyKey: string;
  deduplicated?: boolean;
  outputSummary?: string;
  outputData?: Record<string, any>;
  error?: string;
}

export interface RunLogEntry {
  id: string;
  timestamp: string;
  nodeId?: string;
  nodeTitle?: string;
  level: 'info' | 'success' | 'warn' | 'error';
  message: string;
}

export interface WorkflowRun {
  id: string;
  runNumber: number;
  meetingId: string;
  meetingTitle: string;
  status: 'running' | 'paused_approval' | 'completed' | 'failed' | 'rejected';
  startedAt: string;
  finishedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  idempotencyScope: string;
  nodeStates: Record<string, NodeExecutionState>;
  logs: RunLogEntry[];
}

export interface Ticket {
  id: string;
  code: string;
  title: string;
  description: string;
  priority: Priority;
  status: 'open' | 'in_progress' | 'resolved';
  ownerName: string;
  ownerId?: string;
  dueDateIso: string;
  meetingId: string;
  meetingTitle: string;
  runId?: string;
  idempotencyKey?: string;
  createdAt: string;
}

export interface EmailRecord {
  id: string;
  to: string;
  subject: string;
  body: string;
  ticketCodes: string[];
  meetingId: string;
  runId: string;
  deliveryMode: 'outbox' | 'webhook_relay';
  webhookStatusCode?: number;
  status: 'sent' | 'failed';
  sentAt: string;
  idempotencyKey: string;
}

export interface CalendarEventRecord {
  id: string;
  title: string;
  startIso: string;
  durationMin: number;
  attendees: string[];
  description: string;
  meetingId: string;
  runId: string;
  status: 'scheduled';
  createdAt: string;
  idempotencyKey: string;
}

export interface SlackMessageRecord {
  id: string;
  channel: string;
  text: string;
  webhookDelivered: boolean;
  webhookStatusCode?: number;
  webhookTarget?: string;
  meetingId: string;
  runId: string;
  sentAt: string;
  idempotencyKey: string;
}

export interface IntegrationConfig {
  slackWebhookUrl: string;
  emailWebhookUrl: string;
  workspaceDomain: string;
  simulateFailureNodeKind: WorkflowNodeKind | null;
}

export interface WorkspaceState {
  team: TeamMember[];
  meetings: MeetingRecord[];
  runs: WorkflowRun[];
  tickets: Ticket[];
  emails: EmailRecord[];
  calendarEvents: CalendarEventRecord[];
  slackMessages: SlackMessageRecord[];
  integrations: IntegrationConfig;
  nextTicketNumber: number;
  nextRunNumber: number;
}
