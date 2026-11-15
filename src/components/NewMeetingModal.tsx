import React, { useState } from 'react';
import { Loader2, Sparkles, X } from 'lucide-react';

interface NewMeetingModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    title: string;
    clientName: string;
    referenceDateIso: string;
    rawTranscript: string;
  }) => Promise<void>;
}

const SAMPLE_TRANSCRIPT = `00:45 Samira: Thanks for joining the Globex Q4 SLA review.
02:10 Anita: Globex flagged two urgent issues. First, CSV bulk exports are timing out over 5,000 rows. Second, their billing seat count didn't sync after Tuesday's upgrade.
03:35 Raj: I'll investigate and deploy a streaming CSV worker by Friday.
04:20 Meena: I will reconcile the Globex Stripe seat webhook and issue a credit note by Wednesday.
05:15 Anita: Good plan. Once I approve both tickets, send Globex a status email today and schedule a verification call for next Tuesday. If either ticket is still open after 2 days, alert #ops.`;

export const NewMeetingModal: React.FC<NewMeetingModalProps> = ({
  isOpen,
  isSubmitting,
  error,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('Globex Q4 SLA review');
  const [clientName, setClientName] = useState('Globex Industries');
  const [referenceDateIso, setReferenceDateIso] = useState('2026-11-14');
  const [rawTranscript, setRawTranscript] = useState(SAMPLE_TRANSCRIPT);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawTranscript.trim() || isSubmitting) return;
    await onSubmit({
      title,
      clientName,
      referenceDateIso,
      rawTranscript,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-meeting-title"
    >
      <div className="w-full max-w-2xl rounded-xl bg-[#11131B] border border-white/[0.12] shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <h2
              id="new-meeting-title"
              className="text-base font-semibold text-slate-100"
            >
              Process Meeting Transcript with AI
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1 text-slate-400 hover:text-slate-100 rounded transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Meeting Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-[#161924] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Client / Account
              </label>
              <input
                type="text"
                required
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full bg-[#161924] border border-white/[0.1] rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Meeting Date
              </label>
              <input
                type="date"
                required
                value={referenceDateIso}
                onChange={(e) => setReferenceDateIso(e.target.value)}
                className="w-full bg-[#161924] border border-white/[0.1] rounded-lg px-3 py-2 text-xs font-mono text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-slate-300">
                Raw Transcript or Meeting Notes
              </label>
              <button
                type="button"
                onClick={() => setRawTranscript(SAMPLE_TRANSCRIPT)}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                Load sample transcript
              </button>
            </div>
            <textarea
              rows={8}
              required
              value={rawTranscript}
              onChange={(e) => setRawTranscript(e.target.value)}
              placeholder="Paste speaker turns (e.g. '04:12 Raj: I will fix the export bug by Friday...')"
              className="w-full bg-[#161924] border border-white/[0.1] rounded-lg px-3.5 py-2.5 text-xs text-slate-100 leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 bg-white/[0.04] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 rounded-lg transition-colors cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Extracting & Drafting Canvas...
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  Analyze & Draft Workflow
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
