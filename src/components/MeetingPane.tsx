import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  Pause,
  Play,
  UserCheck,
} from 'lucide-react';
import { ExtractedKind, MeetingRecord } from '../types';

interface MeetingPaneProps {
  meetings: MeetingRecord[];
  activeMeeting: MeetingRecord;
  onSelectMeeting: (id: string) => void;
  onOpenNewMeeting: () => void;
}

const KIND_LABELS: Record<ExtractedKind, string> = {
  complaint: 'Complaint',
  decision: 'Decision',
  commit: 'Commit',
  action: 'Action',
};

const KIND_ACCENTS: Record<ExtractedKind, string> = {
  complaint: 'text-rose-400',
  decision: 'text-indigo-400',
  commit: 'text-emerald-400',
  action: 'text-amber-400',
};

export const MeetingPane: React.FC<MeetingPaneProps> = ({
  meetings,
  activeMeeting,
  onSelectMeeting,
  onOpenNewMeeting,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSeconds, setCurrentSeconds] = useState(252);
  const [kindFilter, setKindFilter] = useState<'all' | ExtractedKind>('all');

  useEffect(() => {
    setIsPlaying(false);
    const firstSec = activeMeeting.transcript[1]?.seconds ?? activeMeeting.transcript[0]?.seconds ?? 0;
    setCurrentSeconds(firstSec);
  }, [activeMeeting.id]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setCurrentSeconds((prev) => {
        if (prev + 1 >= activeMeeting.durationSeconds) {
          setIsPlaying(false);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, activeMeeting.durationSeconds]);

  const progressRatio = useMemo(() => {
    if (!activeMeeting.durationSeconds) return 0;
    return Math.min(1, Math.max(0, currentSeconds / activeMeeting.durationSeconds));
  }, [currentSeconds, activeMeeting.durationSeconds]);

  const activeSegmentId = useMemo(() => {
    let matched = activeMeeting.transcript[0]?.id;
    for (const seg of activeMeeting.transcript) {
      if (seg.seconds <= currentSeconds) {
        matched = seg.id;
      }
    }
    return matched;
  }, [activeMeeting.transcript, currentSeconds]);

  const filteredExtracted = useMemo(() => {
    if (kindFilter === 'all') return activeMeeting.extracted;
    return activeMeeting.extracted.filter((e) => e.kind === kindFilter);
  }, [activeMeeting.extracted, kindFilter]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0');
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <aside className="flex flex-col h-full bg-[#101219] border-r border-white/[0.08] overflow-hidden">
      {/* Meeting selector & header */}
      <div className="px-5 pt-4 pb-3.5 border-b border-white/[0.07]">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="relative flex-1 min-w-0">
            <select
              aria-label="Select meeting"
              value={activeMeeting.id}
              onChange={(e) => onSelectMeeting(e.target.value)}
              className="w-full appearance-none bg-[#171A24] border border-white/[0.09] hover:border-white/20 rounded-lg pl-3 pr-8 py-1.5 text-sm font-medium text-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 cursor-pointer truncate"
            >
              {meetings.map((m) => (
                <option key={m.id} value={m.id} className="bg-[#141720] text-slate-100">
                  {m.title} ({m.dateLabel})
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
          </div>
          <button
            type="button"
            onClick={onOpenNewMeeting}
            className="px-2.5 py-1.5 text-xs font-medium text-indigo-300 hover:text-indigo-200 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            + Transcript
          </button>
        </div>

        <h1 className="text-lg font-semibold tracking-tight text-slate-50 truncate">
          {activeMeeting.title}
        </h1>
        <div className="mt-1 flex items-center gap-2 text-xs text-slate-400 tabular-nums">
          <span>{activeMeeting.dateLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{activeMeeting.durationLabel}</span>
          <span aria-hidden="true">·</span>
          <span>{activeMeeting.speakerCount} speakers</span>
          <span aria-hidden="true">·</span>
          <span className="truncate">{activeMeeting.clientName}</span>
        </div>

        {/* Interactive Audio Waveform */}
        <div className="mt-3.5 bg-[#0C0E14] border border-white/[0.07] rounded-lg px-3 py-2.5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsPlaying((p) => !p)}
              aria-label={isPlaying ? 'Pause meeting audio' : 'Play meeting audio'}
              className="w-8 h-8 rounded-md bg-indigo-500 hover:bg-indigo-400 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 ml-0.5" />
              )}
            </button>

            <div
              className="flex-1 flex items-center gap-[3px] h-8 cursor-pointer select-none"
              role="slider"
              aria-label="Audio scrubber"
              aria-valuemin={0}
              aria-valuemax={activeMeeting.durationSeconds}
              aria-valuenow={currentSeconds}
              tabIndex={0}
            >
              {activeMeeting.audioWaveform.map((amp, idx) => {
                const barRatio = (idx + 1) / activeMeeting.audioWaveform.length;
                const played = barRatio <= progressRatio;
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-label={`Jump to ${Math.round(barRatio * 100)}%`}
                    onClick={() =>
                      setCurrentSeconds(
                        Math.round((idx / activeMeeting.audioWaveform.length) * activeMeeting.durationSeconds)
                      )
                    }
                    className={`flex-1 rounded-full transition-colors cursor-pointer ${
                      played ? 'bg-indigo-400' : 'bg-slate-700 hover:bg-slate-600'
                    }`}
                    style={{ height: `${Math.max(18, amp)}%` }}
                  />
                );
              })}
            </div>

            <span className="font-mono text-[11px] text-slate-400 tabular-nums shrink-0">
              {formatTime(currentSeconds)}
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable body: Transcript + Extracted Intelligence */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Transcript section */}
        <section aria-label="Meeting transcript">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold text-slate-300 tracking-wide">
              Transcript
            </h2>
            <span className="text-[11px] text-slate-500">Click timestamp to scrub</span>
          </div>

          <div className="space-y-1.5">
            {activeMeeting.transcript.map((seg) => {
              const isActive = seg.id === activeSegmentId;
              return (
                <button
                  key={seg.id}
                  type="button"
                  onClick={() => setCurrentSeconds(seg.seconds)}
                  className={`w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-indigo-500/10 ring-1 ring-indigo-500/30'
                      : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-baseline gap-2.5">
                    <span className="font-mono text-[11px] text-indigo-400 shrink-0 tabular-nums">
                      {seg.timestamp}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-semibold text-slate-200 mr-1.5">
                        {seg.speakerName}
                      </span>
                      <span className="text-xs leading-relaxed text-slate-400">
                        {seg.text}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <div className="border-t border-white/[0.07]" />

        {/* Extracted decisions, complaints, people mapping */}
        <section aria-label="Extracted actions and people mapping">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-xs font-semibold text-slate-300 tracking-wide">
              Extracted & People Mapping
            </h2>
            <span className="text-[11px] text-slate-500 tabular-nums">
              {filteredExtracted.length} items
            </span>
          </div>

          {/* Interactive Filter Controls */}
          <div className="flex items-center gap-1 p-1 bg-[#0C0E14] border border-white/[0.06] rounded-lg mb-3">
            {(['all', 'complaint', 'decision', 'commit'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setKindFilter(f)}
                className={`flex-1 px-2 py-1 text-[11px] font-medium rounded-md transition-colors capitalize whitespace-nowrap cursor-pointer ${
                  kindFilter === f
                    ? 'bg-[#1D2130] text-slate-100'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {f === 'all' ? 'All' : KIND_LABELS[f]}
              </button>
            ))}
          </div>

          <div className="space-y-2.5">
            {filteredExtracted.map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-lg bg-[#151822] border border-white/[0.07] space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`font-semibold ${KIND_ACCENTS[item.kind]}`}>
                      {KIND_LABELS[item.kind]}
                    </span>
                    {item.priority && (
                      <>
                        <span className="text-slate-600" aria-hidden="true">·</span>
                        <span className="font-mono text-slate-300">{item.priority}</span>
                      </>
                    )}
                    <span className="text-slate-600" aria-hidden="true">·</span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {item.timestamp}
                    </span>
                  </div>
                </div>

                <p className="text-xs font-medium text-slate-100 leading-snug">
                  {item.title}
                </p>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-[11px] text-slate-400">
                  {item.ownerName && (
                    <span className="inline-flex items-center gap-1 text-slate-300">
                      <UserCheck className="w-3 h-3 text-indigo-400" />
                      {item.ownerName}
                    </span>
                  )}
                  {item.dueDateIso && (
                    <span className="inline-flex items-center gap-1 font-mono tabular-nums text-slate-400">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {item.dueDateIso}
                    </span>
                  )}
                </div>

                {item.mappingNote && (
                  <p className="text-[11px] text-slate-500 flex items-start gap-1.5 pt-1 border-t border-white/[0.05]">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500/80 shrink-0 mt-0.5" />
                    <span>{item.mappingNote}</span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </aside>
  );
};
