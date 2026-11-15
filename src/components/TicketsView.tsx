import React, { useMemo, useState } from 'react';
import { Calendar, Search, UserCheck } from 'lucide-react';
import { Ticket } from '../types';

interface TicketsViewProps {
  tickets: Ticket[];
  onUpdateTicketStatus: (
    ticketId: string,
    status: Ticket['status']
  ) => Promise<void>;
  onJumpToMeeting: (meetingId: string) => void;
}

export const TicketsView: React.FC<TicketsViewProps> = ({
  tickets,
  onUpdateTicketStatus,
  onJumpToMeeting,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | Ticket['status']>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (query.trim()) {
        const q = query.toLowerCase();
        return (
          t.code.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q) ||
          t.ownerName.toLowerCase().includes(q) ||
          t.meetingTitle.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [tickets, statusFilter, query]);

  const counts = useMemo(
    () => ({
      all: tickets.length,
      open: tickets.filter((t) => t.status === 'open').length,
      in_progress: tickets.filter((t) => t.status === 'in_progress').length,
      resolved: tickets.filter((t) => t.status === 'resolved').length,
    }),
    [tickets]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[#0B0D12] p-6 lg:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">
              Complaints & Action Tickets
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Tickets created automatically by MeetMind workflows with resolved owners, priorities, and due dates.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search code, title, owner..."
                className="bg-[#141722] border border-white/[0.1] rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 w-60"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#141722] border border-white/[0.08] rounded-lg">
              {(
                [
                  ['all', `All (${counts.all})`],
                  ['open', `Open (${counts.open})`],
                  ['in_progress', `In Progress (${counts.in_progress})`],
                  ['resolved', `Resolved (${counts.resolved})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    statusFilter === key
                      ? 'bg-indigo-500 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* High-Density Data Grid */}
        <div className="rounded-xl bg-[#11131B] border border-white/[0.08] overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-400">
              No tickets match the current filter. Run a meeting workflow to generate tickets.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] text-[11px] font-semibold text-slate-400 bg-[#141722]">
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Complaint / Action</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Priority</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Source Meeting</th>
                  <th className="py-3 px-4 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {filtered.map((ticket) => {
                  const priorityColor =
                    ticket.priority === 'P1'
                      ? 'text-rose-400'
                      : ticket.priority === 'P2'
                      ? 'text-amber-300'
                      : 'text-slate-300';

                  return (
                    <tr
                      key={ticket.id}
                      className="hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-mono font-semibold text-indigo-300 whitespace-nowrap">
                        {ticket.code}
                      </td>
                      <td className="py-3.5 px-4 max-w-md">
                        <div className="font-medium text-slate-100">
                          {ticket.title}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {ticket.description}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-slate-200">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                          {ticket.ownerName}
                        </span>
                      </td>
                      <td
                        className={`py-3.5 px-4 font-mono font-semibold whitespace-nowrap ${priorityColor}`}
                      >
                        {ticket.priority}
                      </td>
                      <td className="py-3.5 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          {ticket.dueDateIso}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => onJumpToMeeting(ticket.meetingId)}
                          className="text-slate-300 hover:text-indigo-300 underline decoration-white/20 underline-offset-4 transition-colors cursor-pointer"
                        >
                          {ticket.meetingTitle}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <select
                          aria-label={`Status for ${ticket.code}`}
                          value={ticket.status}
                          onChange={(e) =>
                            onUpdateTicketStatus(
                              ticket.id,
                              e.target.value as Ticket['status']
                            )
                          }
                          className="bg-[#181C28] border border-white/[0.1] rounded-md px-2.5 py-1 text-xs font-medium text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
