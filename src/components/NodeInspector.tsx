import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ScrollText,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';
import {
  TeamMember,
  WorkflowEdge,
  WorkflowNode,
  WorkflowRun,
} from '../types';

interface NodeInspectorProps {
  selectedNode: WorkflowNode | null;
  allNodes: WorkflowNode[];
  edges: WorkflowEdge[];
  team: TeamMember[];
  activeRun: WorkflowRun | null;
  isRunningAction: boolean;
  onClose: () => void;
  onSaveNode: (updated: WorkflowNode) => void;
  onDeleteNode: (nodeId: string) => void;
  onApproveRun: (runId: string) => Promise<void>;
  onRejectRun: (runId: string) => Promise<void>;
  onRetryRunNode: (runId: string, nodeId: string) => Promise<void>;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  team,
  activeRun,
  isRunningAction,
  onClose,
  onSaveNode,
  onDeleteNode,
  onApproveRun,
  onRejectRun,
  onRetryRunNode,
}) => {
  const [tab, setTab] = useState<'config' | 'logs'>('config');
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [config, setConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    if (selectedNode) {
      setTitle(selectedNode.title);
      setSubtitle(selectedNode.subtitle);
      setConfig({ ...selectedNode.config });
      setTab('config');
    } else {
      setTab('logs');
    }
  }, [selectedNode?.id]);

  const nodeState =
    selectedNode && activeRun ? activeRun.nodeStates[selectedNode.id] : undefined;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNode) return;
    let nextSubtitle = subtitle;
    if (selectedNode.kind === 'ticket') {
      nextSubtitle = `${config.ticketCode ? `${config.ticketCode} · ` : ''}${
        config.assigneeName || 'Unassigned'
      } · ${config.priority || 'P2'}`;
    } else if (selectedNode.kind === 'approval') {
      nextSubtitle = `Approver: ${config.approverName || 'Anita Rao'}`;
    } else if (selectedNode.kind === 'slack') {
      nextSubtitle = `Slack ${config.channel || '#ops'}`;
    }
    onSaveNode({
      ...selectedNode,
      title,
      subtitle: nextSubtitle,
      config,
    });
  };

  return (
    <aside className="w-[340px] shrink-0 h-full bg-[#101219] border-l border-white/[0.08] flex flex-col overflow-hidden">
      {/* Header + Segmented Tabs */}
      <div className="px-4 pt-3.5 pb-3 border-b border-white/[0.07]">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <span className="text-xs font-semibold text-slate-200 truncate">
            {selectedNode ? `${selectedNode.toolLabel} Step` : 'Execution Logs'}
          </span>
          {selectedNode && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close step inspector"
              className="p-1 text-slate-400 hover:text-slate-100 rounded transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 bg-[#0B0D12] border border-white/[0.06] rounded-lg">
          <button
            type="button"
            disabled={!selectedNode}
            onClick={() => setTab('config')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer disabled:opacity-40 ${
              tab === 'config' && selectedNode
                ? 'bg-[#1D2130] text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            Inspector
          </button>
          <button
            type="button"
            onClick={() => setTab('logs')}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
              tab === 'logs' || !selectedNode
                ? 'bg-[#1D2130] text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ScrollText className="w-3.5 h-3.5" />
            Run Logs ({activeRun?.logs.length ?? 0})
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {tab === 'config' && selectedNode ? (
          <>
            {/* Live Run Status Box for selected node */}
            {nodeState && (
              <div className="p-3 rounded-lg bg-[#151822] border border-white/[0.08] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Run status</span>
                  <span className="font-mono font-medium text-slate-100 capitalize">
                    {nodeState.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Attempts</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {nodeState.attempts}
                  </span>
                </div>
                <div className="pt-1 border-t border-white/[0.06]">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-0.5">
                    <KeyRound className="w-3 h-3 text-indigo-400" />
                    Idempotency key
                  </div>
                  <code className="block font-mono text-[11px] text-slate-300 break-all">
                    {nodeState.idempotencyKey}
                  </code>
                </div>
                {nodeState.outputSummary && (
                  <div className="pt-1 border-t border-white/[0.06] text-[11px] text-emerald-300 flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{nodeState.outputSummary}</span>
                  </div>
                )}
                {nodeState.error && (
                  <div className="pt-1 border-t border-rose-500/20 text-[11px] text-rose-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{nodeState.error}</span>
                  </div>
                )}

                {nodeState.status === 'waiting_approval' && activeRun && (
                  <div className="pt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isRunningAction}
                      onClick={() => onApproveRun(activeRun.id)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-md cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve & Resume
                    </button>
                    <button
                      type="button"
                      disabled={isRunningAction}
                      onClick={() => onRejectRun(activeRun.id)}
                      className="px-2.5 py-1.5 text-xs text-slate-300 bg-white/[0.06] hover:bg-rose-500/20 rounded-md cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                )}

                {nodeState.status === 'failed' && activeRun && (
                  <button
                    type="button"
                    disabled={isRunningAction}
                    onClick={() => onRetryRunNode(activeRun.id, selectedNode.id)}
                    className="w-full mt-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-400 rounded-md cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Retry Failed Step
                  </button>
                )}
              </div>
            )}

            {/* Node Configuration Form */}
            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Step Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
              </div>

              {selectedNode.kind === 'ticket' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Ticket Title
                    </label>
                    <input
                      type="text"
                      value={config.ticketTitle || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, ticketTitle: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Owner
                      </label>
                      <select
                        value={config.assigneeName || ''}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, assigneeName: e.target.value }))
                        }
                        className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      >
                        {team.map((m) => (
                          <option key={m.id} value={m.name}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Priority
                      </label>
                      <select
                        value={config.priority || 'P2'}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, priority: e.target.value }))
                        }
                        className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                      >
                        <option value="P1">P1 (Urgent)</option>
                        <option value="P2">P2 (High)</option>
                        <option value="P3">P3 (Normal)</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Due Date (YYYY-MM-DD)
                    </label>
                    <input
                      type="date"
                      value={config.dueDateIso || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, dueDateIso: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
                    />
                  </div>
                </>
              )}

              {selectedNode.kind === 'approval' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Required Approver
                    </label>
                    <select
                      value={config.approverName || 'Anita Rao'}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, approverName: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    >
                      {team.map((m) => (
                        <option key={m.id} value={m.name}>
                          {m.name} ({m.role})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Approval Policy
                    </label>
                    <textarea
                      rows={3}
                      value={config.reason || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, reason: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </>
              )}

              {selectedNode.kind === 'email' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Recipient Email
                    </label>
                    <input
                      type="email"
                      value={config.to || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, to: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={config.subject || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, subject: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Email Body
                    </label>
                    <textarea
                      rows={5}
                      value={config.bodyTemplate || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, bodyTemplate: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100 leading-relaxed"
                    />
                  </div>
                </>
              )}

              {selectedNode.kind === 'calendar' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Event Title
                    </label>
                    <input
                      type="text"
                      value={config.title || ''}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, title: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Start ISO
                      </label>
                      <input
                        type="text"
                        value={config.startIso || ''}
                        onChange={(e) =>
                          setConfig((c) => ({ ...c, startIso: e.target.value }))
                        }
                        className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-slate-400 mb-1">
                        Duration (min)
                      </label>
                      <input
                        type="number"
                        value={config.durationMin || 30}
                        onChange={(e) =>
                          setConfig((c) => ({
                            ...c,
                            durationMin: Number(e.target.value),
                          }))
                        }
                        className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-100"
                      />
                    </div>
                  </div>
                </>
              )}

              {(selectedNode.kind === 'slack' ||
                selectedNode.kind === 'wait_condition') && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Slack Channel
                    </label>
                    <input
                      type="text"
                      value={config.channel || '#ops'}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, channel: e.target.value }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs font-mono text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Message Payload
                    </label>
                    <textarea
                      rows={3}
                      value={config.messageTemplate || ''}
                      onChange={(e) =>
                        setConfig((c) => ({
                          ...c,
                          messageTemplate: e.target.value,
                        }))
                      }
                      className="w-full bg-[#151822] border border-white/[0.1] rounded-lg px-3 py-1.5 text-xs text-slate-100"
                    />
                  </div>
                </>
              )}

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="submit"
                  className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors cursor-pointer"
                >
                  Save Step Changes
                </button>
                {selectedNode.kind !== 'trigger' && (
                  <button
                    type="button"
                    aria-label="Delete step"
                    onClick={() => onDeleteNode(selectedNode.id)}
                    className="p-2 text-slate-400 hover:text-rose-400 bg-white/[0.04] hover:bg-rose-500/15 rounded-lg transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </form>
          </>
        ) : (
          /* Chronological Live Run Logs */
          <div className="space-y-2.5">
            {!activeRun || activeRun.logs.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                No execution logs recorded yet. Click Run Workflow to start.
              </div>
            ) : (
              activeRun.logs.map((entry) => {
                const levelColor =
                  entry.level === 'success'
                    ? 'text-emerald-400'
                    : entry.level === 'warn'
                    ? 'text-amber-300'
                    : entry.level === 'error'
                    ? 'text-rose-400'
                    : 'text-indigo-300';
                return (
                  <div
                    key={entry.id}
                    className="p-2.5 rounded-lg bg-[#151822] border border-white/[0.06] space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span className={`font-semibold uppercase ${levelColor}`}>
                        {entry.nodeTitle || entry.level}
                      </span>
                      <span className="font-mono text-slate-500 tabular-nums">
                        {new Date(entry.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-snug">
                      {entry.message}
                    </p>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
