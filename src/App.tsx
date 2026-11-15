import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw, X } from 'lucide-react';
import {
  IntegrationConfig,
  Ticket,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeKind,
  WorkspaceState,
} from './types';
import { MeetingPane } from './components/MeetingPane';
import { WorkflowCanvas } from './components/WorkflowCanvas';
import { NodeInspector } from './components/NodeInspector';
import { TicketsView } from './components/TicketsView';
import { IntegrationsView } from './components/IntegrationsView';
import { RunsHistoryView } from './components/RunsHistoryView';
import { NewMeetingModal } from './components/NewMeetingModal';

type NavTab = 'workspace' | 'tickets' | 'integrations' | 'runs';

export default function App() {
  const [workspace, setWorkspace] = useState<WorkspaceState | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NavTab>('workspace');
  const [selectedMeetingId, setSelectedMeetingId] = useState<string>('mtg_acme_sync');
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('node_approval');

  const [isNewMeetingOpen, setIsNewMeetingOpen] = useState(false);
  const [isParsingMeeting, setIsParsingMeeting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [isDraftingAI, setIsDraftingAI] = useState(false);
  const [isRunningAction, setIsRunningAction] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);

  const saveGraphTimeoutRef = useRef<number | null>(null);

  const fetchWorkspace = useCallback(async () => {
    try {
      const res = await fetch('/api/workspace');
      if (!res.ok) throw new Error('Failed to load workspace state');
      const data: WorkspaceState = await res.json();
      setWorkspace(data);
      if (data.meetings.length > 0 && !data.meetings.some((m) => m.id === selectedMeetingId)) {
        setSelectedMeetingId(data.meetings[0].id);
      }
    } catch (err: any) {
      setBannerError(err?.message || 'Could not reach MeetMind server.');
    } finally {
      setLoading(false);
    }
  }, [selectedMeetingId]);

  useEffect(() => {
    fetchWorkspace();
  }, []);

  const activeMeeting = useMemo(() => {
    if (!workspace) return null;
    return (
      workspace.meetings.find((m) => m.id === selectedMeetingId) ??
      workspace.meetings[0] ??
      null
    );
  }, [workspace, selectedMeetingId]);

  const activeRun = useMemo(() => {
    if (!workspace || !activeMeeting) return null;
    if (selectedRunId) {
      const explicit = workspace.runs.find(
        (r) => r.id === selectedRunId && r.meetingId === activeMeeting.id
      );
      if (explicit) return explicit;
    }
    const matching = workspace.runs
      .filter((r) => r.meetingId === activeMeeting.id)
      .sort((a, b) => b.runNumber - a.runNumber);
    return matching[0] ?? null;
  }, [workspace, activeMeeting, selectedRunId]);

  const selectedNode = useMemo(() => {
    if (!activeMeeting || !selectedNodeId) return null;
    return activeMeeting.workflow.nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [activeMeeting, selectedNodeId]);

  const handleSelectMeeting = (id: string) => {
    setSelectedMeetingId(id);
    setSelectedRunId(null);
    const mtg = workspace?.meetings.find((m) => m.id === id);
    const approval = mtg?.workflow.nodes.find((n) => n.kind === 'approval');
    setSelectedNodeId(approval?.id ?? mtg?.workflow.nodes[0]?.id ?? null);
  };

  const persistGraphImmediate = async (
    meetingId: string,
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
  ) => {
    try {
      const res = await fetch(`/api/meetings/${meetingId}/workflow`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes, edges }),
      });
      if (!res.ok) throw new Error('Failed to save workflow changes');
      const data = await res.json();
      setWorkspace(data.state);
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to persist workflow edits.');
    }
  };

  const handleUpdateGraph = (nodes: WorkflowNode[], edges: WorkflowEdge[]) => {
    if (!workspace || !activeMeeting) return;
    // Optimistic local state update for smooth 60fps dragging
    setWorkspace((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        meetings: prev.meetings.map((m) =>
          m.id === activeMeeting.id
            ? { ...m, workflow: { ...m.workflow, nodes, edges } }
            : m
        ),
      };
    });

    if (saveGraphTimeoutRef.current) {
      window.clearTimeout(saveGraphTimeoutRef.current);
    }
    const meetingId = activeMeeting.id;
    saveGraphTimeoutRef.current = window.setTimeout(() => {
      persistGraphImmediate(meetingId, nodes, edges);
    }, 300);
  };

  const handleSaveNode = (updated: WorkflowNode) => {
    if (!activeMeeting) return;
    const nextNodes = activeMeeting.workflow.nodes.map((n) =>
      n.id === updated.id ? updated : n
    );
    persistGraphImmediate(activeMeeting.id, nextNodes, activeMeeting.workflow.edges);
  };

  const handleDeleteNode = (nodeId: string) => {
    if (!activeMeeting) return;
    const nextNodes = activeMeeting.workflow.nodes.filter((n) => n.id !== nodeId);
    const nextEdges = activeMeeting.workflow.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    );
    setSelectedNodeId(null);
    persistGraphImmediate(activeMeeting.id, nextNodes, nextEdges);
  };

  const handleDraftFromPlainEnglish = async (prompt: string) => {
    if (!activeMeeting) return;
    setIsDraftingAI(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/meetings/${activeMeeting.id}/draft-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI drafting failed');
      setWorkspace(data.state);
      setSelectedNodeId(null);
    } catch (err: any) {
      setBannerError(err?.message || 'AI workflow drafting failed.');
    } finally {
      setIsDraftingAI(false);
    }
  };

  const handleStartRun = async (mode: 'deduplicate' | 'fresh') => {
    if (!activeMeeting) return;
    setIsRunningAction(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/meetings/${activeMeeting.id}/runs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idempotencyMode: mode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start workflow run');
      setWorkspace(data.state);
      setSelectedRunId(data.run.id);
    } catch (err: any) {
      setBannerError(err?.message || 'Workflow execution failed.');
    } finally {
      setIsRunningAction(false);
    }
  };

  const handleApproveRun = async (runId: string) => {
    setIsRunningAction(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approverName: 'Anita Rao' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Approval failed');
      setWorkspace(data.state);
      setSelectedRunId(data.run.id);
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to approve run.');
    } finally {
      setIsRunningAction(false);
    }
  };

  const handleRejectRun = async (runId: string) => {
    setIsRunningAction(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Rejected by operator on canvas' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Rejection failed');
      setWorkspace(data.state);
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to reject run.');
    } finally {
      setIsRunningAction(false);
    }
  };

  const handleRetryRunNode = async (runId: string, nodeId?: string) => {
    setIsRunningAction(true);
    setBannerError(null);
    try {
      const res = await fetch(`/api/runs/${runId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, clearSimulatedFailure: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Retry failed');
      setWorkspace(data.state);
      setSelectedRunId(data.run.id);
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to retry step.');
    } finally {
      setIsRunningAction(false);
    }
  };

  const handleToggleSimulateFailure = async (kind: WorkflowNodeKind | null) => {
    try {
      const res = await fetch('/api/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simulateFailureNodeKind: kind }),
      });
      const data = await res.json();
      if (res.ok) setWorkspace(data.state);
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to update failure simulation.');
    }
  };

  const handleParseMeeting = async (payload: {
    title: string;
    clientName: string;
    referenceDateIso: string;
    rawTranscript: string;
  }) => {
    setIsParsingMeeting(true);
    setParseError(null);
    try {
      const res = await fetch('/api/meetings/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse transcript');
      setWorkspace(data.state);
      setSelectedMeetingId(data.meeting.id);
      setSelectedRunId(null);
      setSelectedNodeId(data.meeting.workflow.nodes[0]?.id ?? null);
      setActiveTab('workspace');
      setIsNewMeetingOpen(false);
    } catch (err: any) {
      setParseError(err?.message || 'Failed to analyze meeting.');
    } finally {
      setIsParsingMeeting(false);
    }
  };

  const handleUpdateTicketStatus = async (
    ticketId: string,
    status: Ticket['status']
  ) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok) setWorkspace(data.state);
    } catch (err: any) {
      setBannerError(err?.message || 'Failed to update ticket.');
    }
  };

  const handleSaveIntegrations = async (next: Partial<IntegrationConfig>) => {
    const res = await fetch('/api/integrations', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    const data = await res.json();
    if (res.ok) setWorkspace(data.state);
  };

  const handleTestWebhook = async (url: string, kind: string) => {
    const res = await fetch('/api/integrations/test-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, kind }),
    });
    return res.json();
  };

  const handleResetDemo = async () => {
    const res = await fetch('/api/workspace/reset', { method: 'POST' });
    if (res.ok) {
      const fresh: WorkspaceState = await res.json();
      setWorkspace(fresh);
      setSelectedMeetingId('mtg_acme_sync');
      setSelectedRunId(null);
      setSelectedNodeId('node_approval');
      setBannerError(null);
    }
  };

  if (loading || !workspace || !activeMeeting) {
    return (
      <div className="h-screen w-screen bg-[#0B0D12] text-slate-200 flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm">
          <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" />
          <span>Loading MeetMind workspace...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0B0D12] text-slate-100 overflow-hidden">
      {/* Strict 3-Zone Top Bar */}
      <header className="h-14 px-6 border-b border-white/[0.08] bg-[#0F1118] flex items-center justify-between gap-8 shrink-0">
        {/* Zone 1: Single-line wordmark */}
        <button
          type="button"
          onClick={() => setActiveTab('workspace')}
          className="text-lg font-bold tracking-tight text-slate-50 font-display whitespace-nowrap shrink-0 cursor-pointer"
        >
          MeetMind
        </button>

        {/* Zone 2: Clean single-line nav links */}
        <nav className="flex items-center gap-6 text-sm font-medium">
          {(
            [
              ['workspace', 'Workspace'],
              ['tickets', `Tickets (${workspace.tickets.length})`],
              ['integrations', 'Integrations'],
              ['runs', `Run History (${workspace.runs.length})`],
            ] as [NavTab, string][]
          ).map(([tab, label]) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`py-4 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-indigo-400 text-slate-50'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: 1 primary CTA */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={() => {
              setParseError(null);
              setIsNewMeetingOpen(true);
            }}
            className="px-4 py-2 text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            New Meeting
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {bannerError && (
        <div className="px-6 py-2.5 bg-rose-500/15 border-b border-rose-500/30 flex items-center justify-between gap-4 text-xs text-rose-200 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{bannerError}</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerError(null)}
            aria-label="Dismiss error"
            className="p-1 text-rose-300 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Viewport */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        {activeTab === 'workspace' && (
          <div className="flex-1 flex min-w-0 h-full overflow-hidden">
            {/* Left: Meeting Understanding & People Mapping */}
            <div className="w-[370px] xl:w-[400px] shrink-0 h-full">
              <MeetingPane
                meetings={workspace.meetings}
                activeMeeting={activeMeeting}
                onSelectMeeting={handleSelectMeeting}
                onOpenNewMeeting={() => {
                  setParseError(null);
                  setIsNewMeetingOpen(true);
                }}
              />
            </div>

            {/* Center: Visual Workflow Canvas + Plain English AI */}
            <WorkflowCanvas
              meeting={activeMeeting}
              activeRun={activeRun}
              selectedNodeId={selectedNodeId}
              simulateFailureNodeKind={workspace.integrations.simulateFailureNodeKind}
              isDraftingAI={isDraftingAI}
              isRunningAction={isRunningAction}
              onSelectNode={setSelectedNodeId}
              onUpdateGraph={handleUpdateGraph}
              onDraftFromPlainEnglish={handleDraftFromPlainEnglish}
              onStartRun={handleStartRun}
              onApproveRun={handleApproveRun}
              onRejectRun={handleRejectRun}
              onRetryRunNode={handleRetryRunNode}
              onToggleSimulateFailure={handleToggleSimulateFailure}
            />

            {/* Right: Node Inspector & Live Execution Logs */}
            <NodeInspector
              selectedNode={selectedNode}
              allNodes={activeMeeting.workflow.nodes}
              edges={activeMeeting.workflow.edges}
              team={workspace.team}
              activeRun={activeRun}
              isRunningAction={isRunningAction}
              onClose={() => setSelectedNodeId(null)}
              onSaveNode={handleSaveNode}
              onDeleteNode={handleDeleteNode}
              onApproveRun={handleApproveRun}
              onRejectRun={handleRejectRun}
              onRetryRunNode={handleRetryRunNode}
            />
          </div>
        )}

        {activeTab === 'tickets' && (
          <TicketsView
            tickets={workspace.tickets}
            onUpdateTicketStatus={handleUpdateTicketStatus}
            onJumpToMeeting={(mtgId) => {
              handleSelectMeeting(mtgId);
              setActiveTab('workspace');
            }}
          />
        )}

        {activeTab === 'integrations' && (
          <IntegrationsView
            integrations={workspace.integrations}
            emails={workspace.emails}
            calendarEvents={workspace.calendarEvents}
            slackMessages={workspace.slackMessages}
            ticketCount={workspace.tickets.length}
            onSaveIntegrations={handleSaveIntegrations}
            onTestWebhook={handleTestWebhook}
          />
        )}

        {activeTab === 'runs' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="px-6 py-2.5 bg-[#0F1118] border-b border-white/[0.06] flex items-center justify-end">
              <button
                type="button"
                onClick={handleResetDemo}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs text-slate-400 hover:text-slate-100 bg-[#161924] border border-white/[0.08] rounded-md transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Workspace Demo Data
              </button>
            </div>
            <RunsHistoryView
              runs={workspace.runs}
              isRunningAction={isRunningAction}
              onApproveRun={handleApproveRun}
              onRetryRun={(runId) => handleRetryRunNode(runId)}
              onOpenMeetingCanvas={(mtgId, runId) => {
                setSelectedMeetingId(mtgId);
                setSelectedRunId(runId);
                setActiveTab('workspace');
              }}
            />
          </div>
        )}
      </main>

      <NewMeetingModal
        isOpen={isNewMeetingOpen}
        isSubmitting={isParsingMeeting}
        error={parseError}
        onClose={() => setIsNewMeetingOpen(false)}
        onSubmit={handleParseMeeting}
      />
    </div>
  );
}
