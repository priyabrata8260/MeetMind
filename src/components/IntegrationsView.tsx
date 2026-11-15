import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  Mail,
  MessageSquare,
  Send,
  Ticket as TicketIcon,
} from 'lucide-react';
import {
  CalendarEventRecord,
  EmailRecord,
  IntegrationConfig,
  SlackMessageRecord,
} from '../types';

interface IntegrationsViewProps {
  integrations: IntegrationConfig;
  emails: EmailRecord[];
  calendarEvents: CalendarEventRecord[];
  slackMessages: SlackMessageRecord[];
  ticketCount: number;
  onSaveIntegrations: (next: Partial<IntegrationConfig>) => Promise<void>;
  onTestWebhook: (
    url: string,
    kind: string
  ) => Promise<{ ok: boolean; status?: number; latencyMs?: number; error?: string }>;
}

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({
  integrations,
  emails,
  calendarEvents,
  slackMessages,
  ticketCount,
  onSaveIntegrations,
  onTestWebhook,
}) => {
  const [slackUrl, setSlackUrl] = useState(integrations.slackWebhookUrl);
  const [emailUrl, setEmailUrl] = useState(integrations.emailWebhookUrl);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'email' | 'calendar' | 'slack'>('email');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSaveIntegrations({
        slackWebhookUrl: slackUrl,
        emailWebhookUrl: emailUrl,
      });
      setTestResult('Integration endpoints saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (url: string, kind: string) => {
    if (!url.trim()) {
      setTestResult(`Enter a ${kind} webhook URL first to send a live test.`);
      return;
    }
    setTestResult('Sending live HTTP POST...');
    const res = await onTestWebhook(url, kind);
    if (res.ok) {
      setTestResult(`Webhook responded HTTP ${res.status} in ${res.latencyMs}ms.`);
    } else {
      setTestResult(`Webhook test failed: ${res.error || `HTTP ${res.status}`}`);
    }
  };

  const buildGoogleCalLink = (ev: CalendarEventRecord) => {
    const start = new Date(ev.startIso);
    const end = new Date(start.getTime() + ev.durationMin * 60000);
    const fmt = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: ev.title,
      dates: `${fmt(start)}/${fmt(end)}`,
      details: ev.description,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  };

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0D12] p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Connected Tools & Live Outbox
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Built-in Ticket engine plus live Email, Calendar (.ics), and Slack Webhook integrations executed by MeetMind runs.
          </p>
        </div>

        {/* Summary Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-[#11131B] border border-white/[0.08]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Built-in Tickets</span>
              <TicketIcon className="w-4 h-4 text-rose-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-100">
              {ticketCount}
            </div>
            <div className="mt-1 text-[11px] text-emerald-400">Native store active</div>
          </div>

          <div className="p-4 rounded-xl bg-[#11131B] border border-white/[0.08]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Emails Dispatched</span>
              <Mail className="w-4 h-4 text-violet-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-100">
              {emails.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {integrations.emailWebhookUrl ? 'Webhook relay connected' : 'Outbox + mailto ready'}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#11131B] border border-white/[0.08]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Calendar Invites</span>
              <Calendar className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-100">
              {calendarEvents.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">RFC-5545 .ics export</div>
          </div>

          <div className="p-4 rounded-xl bg-[#11131B] border border-white/[0.08]">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Slack #ops Alerts</span>
              <MessageSquare className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-slate-100">
              {slackMessages.length}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {integrations.slackWebhookUrl ? 'Live webhook active' : 'Workspace channel ready'}
            </div>
          </div>
        </div>

        {/* Real Outbound Webhook Configuration */}
        <form
          onSubmit={handleSave}
          className="p-5 rounded-xl bg-[#11131B] border border-white/[0.08] space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                Real Outbound Webhook Connectors
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Optional: Connect a Slack Incoming Webhook or HTTP email relay URL (e.g. webhook.site) to receive live POST payloads when workflows run.
              </p>
            </div>
            {testResult && (
              <span className="text-xs font-mono text-indigo-300">
                {testResult}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Slack / Discord Incoming Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={slackUrl}
                  onChange={(e) => setSlackUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  className="flex-1 bg-[#161924] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => handleTest(slackUrl, 'Slack')}
                  className="px-3 py-2 text-xs font-medium text-slate-200 bg-[#1B1F2E] hover:bg-[#23283B] border border-white/[0.1] rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Test POST
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Email / Zapier / Make Relay Webhook URL
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={emailUrl}
                  onChange={(e) => setEmailUrl(e.target.value)}
                  placeholder="https://webhook.site/..."
                  className="flex-1 bg-[#161924] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono text-slate-100 placeholder:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => handleTest(emailUrl, 'Email')}
                  className="px-3 py-2 text-xs font-medium text-slate-200 bg-[#1B1F2E] hover:bg-[#23283B] border border-white/[0.1] rounded-lg whitespace-nowrap cursor-pointer"
                >
                  Test POST
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Endpoints'}
            </button>
          </div>
        </form>

        {/* Delivered Output Tabs */}
        <div className="space-y-4">
          <div className="flex items-center gap-1 p-1 bg-[#11131B] border border-white/[0.08] rounded-lg w-fit">
            {(
              [
                ['email', `Email Outbox (${emails.length})`],
                ['calendar', `Calendar Events (${calendarEvents.length})`],
                ['slack', `Slack #ops (${slackMessages.length})`],
              ] as const
            ).map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  activeTab === tab
                    ? 'bg-indigo-500 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === 'email' && (
            <div className="space-y-3">
              {emails.length === 0 ? (
                <div className="p-10 rounded-xl bg-[#11131B] border border-white/[0.08] text-center text-sm text-slate-400">
                  No emails sent yet. Approve Run #18 on Acme weekly sync to dispatch the Acme recap email.
                </div>
              ) : (
                emails.map((email) => (
                  <div
                    key={email.id}
                    className="p-5 rounded-xl bg-[#11131B] border border-white/[0.08] space-y-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          {email.subject}
                        </div>
                        <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                          <span>To: {email.to}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono text-emerald-400 inline-flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Sent {new Date(email.sentAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                      <a
                        href={`mailto:${encodeURIComponent(email.to)}?subject=${encodeURIComponent(
                          email.subject
                        )}&body=${encodeURIComponent(email.body)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#181C28] hover:bg-[#222738] border border-white/[0.1] rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Open in Mail App
                      </a>
                    </div>
                    <pre className="p-3.5 rounded-lg bg-[#0B0D12] border border-white/[0.06] text-xs text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
                      {email.body}
                    </pre>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-3">
              {calendarEvents.length === 0 ? (
                <div className="p-10 rounded-xl bg-[#11131B] border border-white/[0.08] text-center text-sm text-slate-400">
                  No calendar invites created yet. Approve Run #18 to schedule the Thu 26 Nov follow-up.
                </div>
              ) : (
                calendarEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-5 rounded-xl bg-[#11131B] border border-white/[0.08] flex flex-wrap items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-slate-100">
                        {ev.title}
                      </div>
                      <div className="text-xs text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
                        <span>{new Date(ev.startIso).toUTCString()}</span>
                        <span aria-hidden="true">·</span>
                        <span>{ev.durationMin} min</span>
                        <span aria-hidden="true">·</span>
                        <span>{ev.attendees.join(', ')}</span>
                      </div>
                      <p className="text-xs text-slate-400 pt-1">{ev.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`/api/calendar/${ev.id}/ics`}
                        download={`${ev.id}.ics`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download .ics
                      </a>
                      <a
                        href={buildGoogleCalLink(ev)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#181C28] hover:bg-[#222738] border border-white/[0.1] rounded-lg transition-colors whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Google Calendar
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'slack' && (
            <div className="space-y-3">
              {slackMessages.length === 0 ? (
                <div className="p-10 rounded-xl bg-[#11131B] border border-white/[0.08] text-center text-sm text-slate-400">
                  No Slack messages posted yet.
                </div>
              ) : (
                slackMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="p-4 rounded-xl bg-[#11131B] border border-white/[0.08] space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-cyan-400">
                          {msg.channel}
                        </span>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="text-slate-400">
                          {msg.webhookDelivered
                            ? `Live Webhook HTTP ${msg.webhookStatusCode}`
                            : 'Workspace Feed'}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                        {new Date(msg.sentAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 leading-relaxed">{msg.text}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
