import React from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { WorkflowRun } from '../types';

interface RunsHistoryViewProps {
  runs: WorkflowRun[];
  isRunningAction: boolean;
  onApproveRun: (runId: string) => Promise<void>;
  onRetryRun: (runId: string) => Promise<void>;
  onOpenMeetingCanvas: (meetingId: string, runId: string) => void;
}

export const RunsHistoryView: React.FC<RunsHistoryViewProps> = ({
  runs,
  isRunningAction,
  onApproveRun,
  onRetryRun,
  onOpenMeetingCanvas,
}) => {
  const sorted = [...runs].sort((a, b) => b.runNumber - a.runNumber);

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0D12] p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Execution Engine & Audit Log
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Live workflow runs with idempotency keys, human approval checkpoints, and retry recovery without duplicate tasks.
          </p>
        </div>

        <div className="space-y-4">
          {sorted.map((run) => {
            const nodeStates = Object.values(run.nodeStates);
            const completed = nodeStates.filter((n) => n.status === 'completed').length;
            const deduplicatedCount = nodeStates.filter((n) => n.deduplicated).length;

            return (
              <div
                key={run.id}
                className="p-5 rounded-xl bg-[#11131B] border border-white/[0.08] space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
                        Run #{run.runNumber}
                      </span>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => onOpenMeetingCanvas(run.meetingId, run.id)}
                        className="text-sm font-medium text-indigo-300 hover:text-indigo-200 underline decoration-indigo-500/30 underline-offset-4 cursor-pointer"
                      >
                        {run.meetingTitle}
                      </button>
                      <span className="text-slate-600" aria-hidden="true">·</span>
                      {run.status === 'completed' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Completed
                        </span>
                      )}
                      {run.status === 'paused_approval' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
                          <ShieldAlert className="w-3.5 h-3.5" />
                          Paused for approval
                        </span>
                      )}
                      {run.status === 'failed' && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-400">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Failed — retry available
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono tabular-nums">
                      <span>
                        {completed} / {nodeStates.length} steps done
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        <KeyRound className="w-3 h-3 text-indigo-400" />
                        Scope: {run.idempotencyScope}
                      </span>
                      {deduplicatedCount > 0 && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-400">
                            {deduplicatedCount} duplicate(s) prevented
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {run.status === 'paused_approval' && (
                      <button
                        type="button"
                        disabled={isRunningAction}
                        onClick={() => onApproveRun(run.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve & Resume
                      </button>
                    )}
                    {run.status === 'failed' && (
                      <button
                        type="button"
                        disabled={isRunningAction}
                        onClick={() => onRetryRun(run.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-rose-500 hover:bg-rose-400 rounded-lg transition-colors cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry & Resume
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenMeetingCanvas(run.meetingId, run.id)}
                      className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#181C28] hover:bg-[#222738] border border-white/[0.1] rounded-lg transition-colors cursor-pointer"
                    >
                      Inspect Canvas
                    </button>
                  </div>
                </div>

                {/* Recent log lines */}
                <div className="pt-3 border-t border-white/[0.06] space-y-1.5">
                  {run.logs.slice(-4).map((log) => (
                    <div
                      key={log.id}
                      className="flex items-baseline gap-3 text-xs text-slate-300"
                    >
                      <span className="font-mono text-[11px] text-slate-500 shrink-0 tabular-nums">
                        {new Date(log.timestamp).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        })}
                      </span>
                      <span className="text-slate-400">{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
