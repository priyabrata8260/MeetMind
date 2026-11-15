import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  GitBranch,
  Loader2,
  Mail,
  MessageSquare,
  Play,
  Plus,
  RefreshCw,
  Repeat,
  ShieldAlert,
  Sparkles,
  Ticket as TicketIcon,
  X,
  ZoomIn,
  ZoomOut,
  Zap,
} from 'lucide-react';
import {
  MeetingRecord,
  NodeRunStatus,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowRun,
} from '../types';

interface WorkflowCanvasProps {
  meeting: MeetingRecord;
  activeRun: WorkflowRun | null;
  selectedNodeId: string | null;
  simulateFailureNodeKind: WorkflowNodeKind | null;
  isDraftingAI: boolean;
  isRunningAction: boolean;
  onSelectNode: (nodeId: string | null) => void;
  onUpdateGraph: (nodes: WorkflowNode[], edges: WorkflowEdge[]) => void;
  onDraftFromPlainEnglish: (prompt: string) => Promise<void>;
  onStartRun: (mode: 'deduplicate' | 'fresh') => Promise<void>;
  onApproveRun: (runId: string) => Promise<void>;
  onRejectRun: (runId: string) => Promise<void>;
  onRetryRunNode: (runId: string, nodeId: string) => Promise<void>;
  onToggleSimulateFailure: (kind: WorkflowNodeKind | null) => Promise<void>;
}

const NODE_WIDTH = 236;
const NODE_HEIGHT = 96;

const KIND_META: Record<
  WorkflowNodeKind,
  { icon: React.ComponentType<{ className?: string }>; accentText: string }
> = {
  trigger: { icon: Zap, accentText: 'text-indigo-400' },
  loop: { icon: Repeat, accentText: 'text-sky-400' },
  ticket: { icon: TicketIcon, accentText: 'text-rose-400' },
  approval: { icon: ShieldAlert, accentText: 'text-amber-400' },
  email: { icon: Mail, accentText: 'text-violet-400' },
  calendar: { icon: Calendar, accentText: 'text-emerald-400' },
  wait_condition: { icon: Clock, accentText: 'text-amber-300' },
  slack: { icon: MessageSquare, accentText: 'text-cyan-400' },
};

export const WorkflowCanvas: React.FC<WorkflowCanvasProps> = ({
  meeting,
  activeRun,
  selectedNodeId,
  simulateFailureNodeKind,
  isDraftingAI,
  isRunningAction,
  onSelectNode,
  onUpdateGraph,
  onDraftFromPlainEnglish,
  onStartRun,
  onApproveRun,
  onRejectRun,
  onRetryRunNode,
  onToggleSimulateFailure,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 12 });
  const [promptInput, setPromptInput] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showRunOptions, setShowRunOptions] = useState(false);

  const dragStateRef = useRef<{
    type: 'canvas' | 'node';
    nodeId?: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const nodes = meeting.workflow.nodes;
  const edges = meeting.workflow.edges;

  const doneCount = useMemo(() => {
    if (!activeRun) return 0;
    return Object.values(activeRun.nodeStates).filter((s) => s.status === 'completed').length;
  }, [activeRun]);

  const totalNodes = nodes.length;

  const handleMouseDownCanvas = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('[data-workflow-node]')) return;
    onSelectNode(null);
    dragStateRef.current = {
      type: 'canvas',
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handleMouseDownNode = (e: React.MouseEvent, node: WorkflowNode) => {
    if ((e.target as HTMLElement).closest('button')) return;
    e.stopPropagation();
    onSelectNode(node.id);
    dragStateRef.current = {
      type: 'node',
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const d = dragStateRef.current;
    if (!d) return;
    if (d.type === 'canvas') {
      setPan({
        x: d.origX + (e.clientX - d.startX),
        y: d.origY + (e.clientY - d.startY),
      });
    } else if (d.type === 'node' && d.nodeId) {
      const dx = (e.clientX - d.startX) / zoom;
      const dy = (e.clientY - d.startY) / zoom;
      const updated = nodes.map((n) =>
        n.id === d.nodeId
          ? { ...n, x: Math.round(d.origX + dx), y: Math.round(d.origY + dy) }
          : n
      );
      onUpdateGraph(updated, edges);
    }
  };

  const handleMouseUp = () => {
    dragStateRef.current = null;
  };

  const handleAddNode = (kind: WorkflowNodeKind) => {
    const id = `node_${Date.now().toString(36)}`;
    const lastNode = nodes[nodes.length - 1];
    const x = lastNode ? lastNode.x : 310;
    const y = lastNode ? lastNode.y + 130 : 40;

    const defaults: Record<
      WorkflowNodeKind,
      { title: string; subtitle: string; toolLabel: string; config: Record<string, any> }
    > = {
      trigger: {
        title: 'Meeting trigger',
        subtitle: meeting.title,
        toolLabel: 'TRIGGER',
        config: { event: 'meeting.processed' },
      },
      loop: {
        title: 'For each item',
        subtitle: 'Iterate extracted items',
        toolLabel: 'LOGIC',
        config: { collection: 'complaints' },
      },
      ticket: {
        title: 'Create action ticket',
        subtitle: 'Raj Mehta · P2',
        toolLabel: 'TICKET',
        config: {
          ticketTitle: 'Follow-up task from meeting',
          assigneeName: 'Raj Mehta',
          priority: 'P2',
          dueDateIso: meeting.referenceDateIso,
        },
      },
      approval: {
        title: 'Human approval gate',
        subtitle: 'Approver: Anita Rao',
        toolLabel: 'APPROVAL',
        config: {
          approverName: 'Anita Rao',
          reason: 'Verify workflow payload before external send',
        },
      },
      email: {
        title: 'Send recap email',
        subtitle: `To ${meeting.clientName}`,
        toolLabel: 'GMAIL',
        config: {
          to: `team@${meeting.clientName.toLowerCase().replace(/\s+/g, '')}.example`,
          subject: `${meeting.title} Recap`,
          bodyTemplate: meeting.summary,
        },
      },
      calendar: {
        title: 'Schedule follow-up',
        subtitle: '30 min sync',
        toolLabel: 'CALENDAR',
        config: {
          title: `${meeting.clientName} Follow-up`,
          startIso: '2026-11-26T10:00:00.000Z',
          durationMin: 30,
          attendees: ['anita@meetmind.app'],
        },
      },
      wait_condition: {
        title: 'Wait & check status',
        subtitle: 'Wait 2 days · If open -> Slack #ops',
        toolLabel: 'WAIT 2 DAYS',
        config: {
          waitDays: 2,
          condition: 'any_ticket_open',
          channel: '#ops',
          messageTemplate: `Reminder: open action items remain for ${meeting.title}.`,
        },
      },
      slack: {
        title: 'Notify Slack channel',
        subtitle: 'Slack #ops',
        toolLabel: 'SLACK',
        config: {
          channel: '#ops',
          messageTemplate: `Workflow update from ${meeting.title}`,
        },
      },
    };

    const spec = defaults[kind];
    const newNode: WorkflowNode = {
      id,
      kind,
      title: spec.title,
      subtitle: spec.subtitle,
      toolLabel: spec.toolLabel,
      x,
      y,
      config: spec.config,
    };

    const nextEdges = [...edges];
    if (lastNode) {
      nextEdges.push({
        id: `edge_${Date.now().toString(36)}`,
        source: lastNode.id,
        target: id,
      });
    }

    onUpdateGraph([...nodes, newNode], nextEdges);
    onSelectNode(id);
    setShowAddMenu(false);
  };

  const handleSubmitPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || isDraftingAI) return;
    await onDraftFromPlainEnglish(promptInput.trim());
    setPromptInput('');
  };

  const getNodeStatus = (nodeId: string): NodeRunStatus => {
    return activeRun?.nodeStates[nodeId]?.status ?? 'idle';
  };

  const renderNodeBorder = (status: NodeRunStatus, isSelected: boolean) => {
    if (isSelected) return 'border-indigo-400 ring-2 ring-indigo-500/25';
    switch (status) {
      case 'completed':
        return 'border-emerald-500/45';
      case 'waiting_approval':
        return 'border-amber-400/80 ring-2 ring-amber-500/15';
      case 'failed':
        return 'border-rose-500/80 ring-2 ring-rose-500/15';
      case 'running':
        return 'border-indigo-400';
      default:
        return 'border-white/[0.1] hover:border-white/[0.22]';
    }
  };

  const renderStatusLabel = (status: NodeRunStatus) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Done
          </span>
        );
      case 'waiting_approval':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-300">
            <ShieldAlert className="w-3.5 h-3.5" />
            Approve
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
            <AlertTriangle className="w-3.5 h-3.5" />
            Failed
          </span>
        );
      case 'running':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Running
          </span>
        );
      case 'queued':
        return <span className="text-[11px] text-slate-400">Queued</span>;
      case 'skipped':
        return <span className="text-[11px] text-slate-500">Skipped</span>;
      default:
        return <span className="text-[11px] text-slate-500">Ready</span>;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0B0D12] overflow-hidden relative">
      {/* Canvas Toolbar */}
      <div className="px-5 py-3 border-b border-white/[0.08] bg-[#0F1118] flex flex-wrap items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-indigo-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-100 whitespace-nowrap">
              Workflow Canvas
            </h2>
          </div>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span className="text-xs text-slate-400 whitespace-nowrap">
            {meeting.workflow.draftedFrom === 'plain_english'
              ? 'Drafted from plain English'
              : 'Drafted by AI from meeting'}
          </span>
          {activeRun && (
            <>
              <span className="text-slate-600" aria-hidden="true">·</span>
              <span className="font-mono text-xs tabular-nums text-slate-200 whitespace-nowrap">
                Run #{activeRun.runNumber} · {doneCount} of {totalNodes} done
              </span>
              {activeRun.status === 'paused_approval' && (
                <span className="text-xs font-medium text-amber-300 whitespace-nowrap">
                  (Awaiting approval)
                </span>
              )}
              {activeRun.status === 'failed' && (
                <span className="text-xs font-medium text-rose-400 whitespace-nowrap">
                  (Action required)
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Retry / Failure test toggle */}
          <button
            type="button"
            onClick={() =>
              onToggleSimulateFailure(simulateFailureNodeKind ? null : 'email')
            }
            title="Test live failure recovery & idempotent retry on Email step"
            className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
              simulateFailureNodeKind
                ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                : 'bg-[#161924] border-white/[0.09] text-slate-300 hover:border-white/20'
            }`}
          >
            {simulateFailureNodeKind ? 'Failure Test: ON (Email)' : 'Test Retry Flow'}
          </button>

          {/* Add node menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#161924] hover:bg-[#1D2130] border border-white/[0.09] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Step
            </button>
            {showAddMenu && (
              <div className="absolute right-0 mt-1.5 w-48 bg-[#161924] border border-white/[0.12] rounded-lg shadow-xl py-1 z-30">
                {(
                  [
                    ['ticket', 'Action Ticket'],
                    ['approval', 'Approval Gate'],
                    ['email', 'Email Recap'],
                    ['calendar', 'Calendar Follow-up'],
                    ['wait_condition', 'Wait & Escalate'],
                    ['slack', 'Slack Message'],
                  ] as [WorkflowNodeKind, string][]
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => handleAddNode(kind)}
                    className="w-full text-left px-3 py-1.5 text-xs text-slate-200 hover:bg-indigo-500/15 hover:text-indigo-200 transition-colors cursor-pointer"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Start Run split menu */}
          <div className="relative flex items-center">
            <button
              type="button"
              disabled={isRunningAction}
              onClick={() => onStartRun('deduplicate')}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 rounded-l-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {isRunningAction ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
              Run Workflow
            </button>
            <button
              type="button"
              aria-label="Run mode options"
              onClick={() => setShowRunOptions((v) => !v)}
              className="px-2 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border-l border-indigo-400/30 rounded-r-lg transition-colors cursor-pointer"
            >
              ▾
            </button>
            {showRunOptions && (
              <div className="absolute right-0 top-full mt-1.5 w-64 bg-[#161924] border border-white/[0.12] rounded-lg shadow-xl p-1.5 z-30">
                <button
                  type="button"
                  onClick={() => {
                    setShowRunOptions(false);
                    onStartRun('deduplicate');
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white/[0.05] cursor-pointer"
                >
                  <div className="text-xs font-medium text-slate-100">
                    Idempotent Run (No Duplicates)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Reuses existing tickets & dispatches if already created.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRunOptions(false);
                    onStartRun('fresh');
                  }}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-white/[0.05] cursor-pointer"
                >
                  <div className="text-xs font-medium text-slate-100">
                    Fresh Scope Run
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    Creates new ticket codes & dispatches for a new cycle.
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Plain-English AI Workflow Drafter Bar */}
      <form
        onSubmit={handleSubmitPrompt}
        className="px-5 py-2.5 bg-[#0D0F16] border-b border-white/[0.06] flex items-center gap-2.5 z-10"
      >
        <Sparkles className="w-4 h-4 text-indigo-400 shrink-0" />
        <input
          type="text"
          value={promptInput}
          onChange={(e) => setPromptInput(e.target.value)}
          placeholder='Draft or reshape workflow in plain English (e.g., "Create P1 ticket for Raj, wait for Anita approval, then email Acme and ping #ops")'
          className="flex-1 bg-transparent text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!promptInput.trim() || isDraftingAI}
          className="px-3 py-1 text-xs font-medium text-indigo-200 bg-indigo-500/15 hover:bg-indigo-500/25 disabled:opacity-40 border border-indigo-500/30 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          {isDraftingAI ? 'Drafting...' : 'Draft with AI'}
        </button>
      </form>

      {/* Interactive Pan/Zoom Dot-Grid Canvas */}
      <div
        className="flex-1 relative overflow-hidden canvas-dot-grid cursor-grab active:cursor-grabbing select-none"
        onMouseDown={handleMouseDownCanvas}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <div
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
          className="absolute inset-0"
        >
          {/* SVG Edges */}
          <svg
            width="2000"
            height="1600"
            className="absolute top-0 left-0 pointer-events-none overflow-visible"
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,1 L7,4 L0,7 Z" fill="#4F5A75" />
              </marker>
              <marker
                id="arrowhead-active"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
              >
                <path d="M0,1 L7,4 L0,7 Z" fill="#34D399" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const src = nodes.find((n) => n.id === edge.source);
              const dst = nodes.find((n) => n.id === edge.target);
              if (!src || !dst) return null;

              const x1 = src.x + NODE_WIDTH / 2;
              const y1 = src.y + NODE_HEIGHT;
              const x2 = dst.x + NODE_WIDTH / 2;
              const y2 = dst.y;
              const midY = (y1 + y2) / 2;
              const path = `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;

              const srcStatus = getNodeStatus(src.id);
              const dstStatus = getNodeStatus(dst.id);
              const isCompletedFlow =
                srcStatus === 'completed' && dstStatus === 'completed';
              const isPendingFlow =
                srcStatus === 'completed' &&
                (dstStatus === 'waiting_approval' || dstStatus === 'running');

              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    fill="none"
                    stroke={
                      isCompletedFlow
                        ? '#10B981'
                        : isPendingFlow
                        ? '#F59E0B'
                        : '#2E3446'
                    }
                    strokeWidth={isCompletedFlow || isPendingFlow ? 2 : 1.5}
                    className={isPendingFlow ? 'edge-flow-active' : ''}
                    markerEnd={
                      isCompletedFlow
                        ? 'url(#arrowhead-active)'
                        : 'url(#arrowhead)'
                    }
                  />
                  {edge.label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={midY - 4}
                      textAnchor="middle"
                      className="fill-slate-500 text-[10px] font-mono"
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Draggable Workflow Nodes */}
          {nodes.map((node) => {
            const status = getNodeStatus(node.id);
            const nodeRunState = activeRun?.nodeStates[node.id];
            const isSelected = selectedNodeId === node.id;
            const meta = KIND_META[node.kind] ?? KIND_META.ticket;
            const Icon = meta.icon;

            return (
              <div
                key={node.id}
                data-workflow-node
                onMouseDown={(e) => handleMouseDownNode(e, node)}
                style={{
                  left: node.x,
                  top: node.y,
                  width: NODE_WIDTH,
                  minHeight: NODE_HEIGHT,
                }}
                className={`absolute rounded-xl bg-[#141722] border p-3.5 transition-shadow cursor-pointer shadow-lg shadow-black/30 ${renderNodeBorder(
                  status,
                  isSelected
                )}`}
              >
                {/* Node header */}
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Icon className={`w-3.5 h-3.5 shrink-0 ${meta.accentText}`} />
                    <span className="font-mono text-[10px] font-semibold tracking-wider text-slate-400 truncate">
                      {node.toolLabel}
                    </span>
                  </div>
                  {renderStatusLabel(status)}
                </div>

                {/* Node title & subtitle */}
                <div className="text-[13px] font-semibold text-slate-100 truncate">
                  {node.title}
                </div>
                <div className="text-[11px] text-slate-400 truncate mt-0.5">
                  {nodeRunState?.deduplicated
                    ? `${node.subtitle} · Deduplicated`
                    : node.subtitle}
                </div>

                {/* Inline Human Approval Controls */}
                {status === 'waiting_approval' && activeRun && (
                  <div className="mt-2.5 pt-2.5 border-t border-white/[0.08] flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isRunningAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        onApproveRun(activeRun.id);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 text-[11px] font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer"
                    >
                      <Check className="w-3 h-3" />
                      Approve & Resume
                    </button>
                    <button
                      type="button"
                      disabled={isRunningAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRejectRun(activeRun.id);
                      }}
                      aria-label="Reject approval"
                      className="p-1 text-slate-400 hover:text-rose-300 bg-white/[0.04] hover:bg-rose-500/15 rounded-md transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Inline Retry Control */}
                {status === 'failed' && activeRun && (
                  <div className="mt-2.5 pt-2.5 border-t border-rose-500/20 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-rose-300 truncate">
                      Attempt #{nodeRunState?.attempts ?? 1} failed
                    </span>
                    <button
                      type="button"
                      disabled={isRunningAction}
                      onClick={(e) => {
                        e.stopPropagation();
                        onRetryRunNode(activeRun.id, node.id);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-rose-500 hover:bg-rose-400 rounded-md transition-colors shrink-0 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Retry
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-4 left-4 flex items-center gap-1 bg-[#141722]/95 border border-white/[0.1] rounded-lg p-1 backdrop-blur">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => setZoom((z) => Math.max(0.65, Number((z - 0.1).toFixed(2))))}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded transition-colors cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-[11px] text-slate-300 px-1.5 tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => setZoom((z) => Math.min(1.4, Number((z + 0.1).toFixed(2))))}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded transition-colors cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPan({ x: 24, y: 12 });
            }}
            className="px-2 py-1 text-[11px] text-slate-400 hover:text-slate-100 rounded transition-colors cursor-pointer"
          >
            Fit
          </button>
        </div>
      </div>
    </div>
  );
};
