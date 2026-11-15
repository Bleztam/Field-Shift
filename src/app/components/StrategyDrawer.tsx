"use client";

import React, { useState, useRef, useEffect } from "react";
import { RotationStrategy } from "@/lib/types";
import {
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Sprout,
  Shield,
  RefreshCw,
  Trophy,
  Sparkles,
} from "lucide-react";

interface StrategyDrawerProps {
  strategies: (RotationStrategy & { isBestMatch?: boolean })[];
  onSelectStrategy?: (index: number) => void;
  activeIndex?: number;
}

const STRATEGY_ICONS = [Sprout, Shield, RefreshCw];
const STRATEGY_COLORS = [
  "border-amber-500/50 bg-amber-950/75",
  "border-emerald-500/50 bg-emerald-950/75",
  "border-cyan-500/50 bg-cyan-950/75",
];

export default function StrategyDrawer({
  strategies,
  onSelectStrategy,
  activeIndex = 0,
}: StrategyDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(activeIndex);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Synchronize external activeIndex if provided
  useEffect(() => {
    setActiveIdx(activeIndex);
  }, [activeIndex]);

  const handleCardChange = (newIdx: number) => {
    setActiveIdx(newIdx);
    onSelectStrategy?.(newIdx);
    if (scrollRef.current) {
      const el = scrollRef.current;
      const card = el.children[newIdx] as HTMLElement | undefined;
      if (card) {
        card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  };

  if (!strategies || strategies.length === 0) return null;

  const bestMatchStrategy = strategies.find((s) => s.isBestMatch) || strategies[0];

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300 pointer-events-auto ${
        open ? "translate-y-0" : "translate-y-[calc(100%-2.75rem)]"
      }`}
    >
      {/* Sleek Pull Tab Handle */}
      <div className="flex justify-center">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-5 py-1.5 bg-black/85 backdrop-blur-xl rounded-t-2xl border border-b-0 border-white/15 text-white/90 hover:text-white transition-all shadow-xl active:scale-[0.98]"
        >
          <ChevronUp
            className={`w-3.5 h-3.5 transition-transform duration-300 text-amber-400 ${
              open ? "rotate-180" : ""
            }`}
          />
          <span className="text-xs font-semibold tracking-wide flex items-center gap-1.5">
            {open ? "Close Strategies" : "3 Rotation Strategies"}
            {!open && bestMatchStrategy.matchScore && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                ★ {bestMatchStrategy.matchScore}% Match
              </span>
            )}
          </span>
          <ChevronUp
            className={`w-3.5 h-3.5 transition-transform duration-300 text-amber-400 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Drawer Body */}
      <div className="bg-black/90 backdrop-blur-2xl border-t border-white/10 px-4 pt-3 pb-8 max-h-[65vh] overflow-y-auto shadow-2xl">
        {/* Navigation & Match Indicator */}
        <div className="flex items-center justify-between mb-3 px-1">
          <button
            onClick={() => handleCardChange(Math.max(0, activeIdx - 1))}
            disabled={activeIdx === 0}
            className="p-1 rounded-full bg-white/5 text-white/60 hover:text-white disabled:opacity-20 transition-colors"
            aria-label="Previous strategy"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Dots & best match summary */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              {strategies.map((s, i) => (
                <button
                  key={i}
                  onClick={() => handleCardChange(i)}
                  className={`h-2 rounded-full transition-all ${
                    i === activeIdx
                      ? "w-5 bg-amber-400"
                      : s.isBestMatch
                      ? "w-2 bg-emerald-400/80"
                      : "w-2 bg-white/25"
                  }`}
                  aria-label={`Go to strategy ${i + 1}`}
                />
              ))}
            </div>
            <span className="text-[11px] text-white/50 font-mono">
              {activeIdx + 1} / {strategies.length}
            </span>
          </div>

          <button
            onClick={() =>
              handleCardChange(Math.min(strategies.length - 1, activeIdx + 1))
            }
            disabled={activeIdx === strategies.length - 1}
            className="p-1 rounded-full bg-white/5 text-white/60 hover:text-white disabled:opacity-20 transition-colors"
            aria-label="Next strategy"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Swipeable Cards Container */}
        <div
          ref={scrollRef}
          className="flex gap-3.5 overflow-x-auto snap-x snap-mandatory pb-3 scrollbar-hide"
        >
          {strategies.map((strat, i) => {
            const Icon = STRATEGY_ICONS[i] || Sprout;
            const isBest = !!strat.isBestMatch;
            const score = strat.matchScore ?? 75;

            return (
              <div
                key={i}
                className={`snap-center shrink-0 w-[86vw] max-w-sm rounded-2xl border p-4 transition-all ${
                  STRATEGY_COLORS[i]
                } ${
                  isBest
                    ? "ring-2 ring-emerald-400/70 shadow-lg shadow-emerald-950/60"
                    : "ring-1 ring-white/10"
                }`}
              >
                {/* Header with Title & Match Badge */}
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-white/10 border border-white/10">
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-bold text-white text-sm leading-tight">
                        {strat.name}
                      </h3>
                      <span className="text-[10px] text-white/50 uppercase tracking-wider font-mono">
                        Strategy {i + 1} of 3
                      </span>
                    </div>
                  </div>

                  {/* Match Score Badge */}
                  <div className="flex flex-col items-end">
                    {isBest && (
                      <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-400/50 px-2 py-0.5 rounded-full mb-1 animate-pulse">
                        <Trophy className="w-2.5 h-2.5" />
                        #1 Best Match
                      </span>
                    )}
                    <span
                      className={`text-xs font-bold font-mono px-2 py-0.5 rounded-md ${
                        score >= 80
                          ? "bg-emerald-500/30 text-emerald-200 border border-emerald-500/40"
                          : score >= 60
                          ? "bg-amber-500/30 text-amber-200 border border-amber-500/40"
                          : "bg-zinc-800 text-white/70"
                      }`}
                    >
                      {score}% Match
                    </span>
                  </div>
                </div>

                {/* 5-Part NASA Rubric Fields */}
                <div className="space-y-2.5 text-xs">
                  <Field label="Why Suggested" value={strat.why_suggested} />
                  <Field label="NASA Evidence" value={strat.nasa_evidence} accent />
                  <Field label="Expected Benefits" value={strat.expected_benefits} success />
                  <Field label="Satellite Info Gaps" value={strat.satellite_info_gaps} warn />
                  <Field label="Local Expert Risks" value={strat.local_expert_risks} alert />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  accent,
  success,
  warn,
  alert,
}: {
  label: string;
  value: string;
  accent?: boolean;
  success?: boolean;
  warn?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="bg-black/35 rounded-xl p-2 border border-white/5">
      <span
        className={`text-[10px] font-bold uppercase tracking-wider block mb-0.5 ${
          alert
            ? "text-red-400"
            : warn
            ? "text-amber-400"
            : success
            ? "text-emerald-300"
            : accent
            ? "text-cyan-300"
            : "text-white/50"
        }`}
      >
        {label}
      </span>
      <p className="text-white/90 leading-relaxed text-[11px]">{value}</p>
    </div>
  );
}
