"use client";

import React, { useState, useRef, useEffect } from "react";
import { RotationStrategy } from "@/lib/types";
import { ChevronUp, ChevronLeft, ChevronRight, Sprout, Shield, RefreshCw } from "lucide-react";

interface StrategyDrawerProps {
  strategies: RotationStrategy[];
}

const STRATEGY_ICONS = [Sprout, Shield, RefreshCw];
const STRATEGY_COLORS = [
  "border-amber-500/50 bg-amber-950/60",
  "border-emerald-500/50 bg-emerald-950/60",
  "border-blue-500/50 bg-blue-950/60",
];

export default function StrategyDrawer({ strategies }: StrategyDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      const el = scrollRef.current;
      const card = el.children[activeIdx] as HTMLElement | undefined;
      if (card) {
        card.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [activeIdx]);

  if (!strategies || strategies.length === 0) return null;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-30 transition-transform duration-300 ${
        open ? "translate-y-0" : "translate-y-[calc(100%-3.5rem)]"
      }`}
    >
      {/* Pull tab */}
      <button
        onClick={() => setOpen(!open)}
        className="mx-auto flex items-center gap-2 px-6 py-2 bg-black/70 backdrop-blur-md rounded-t-2xl border border-b-0 border-white/10 text-white/80 hover:text-white transition-colors"
      >
        <ChevronUp
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
        <span className="text-sm font-medium">
          {open ? "Close" : "3 Rotation Strategies"}
        </span>
        <ChevronUp
          className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Drawer body */}
      <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-4 pt-3 pb-6 max-h-[70vh] overflow-y-auto">
        {/* Swipe nav */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setActiveIdx(Math.max(0, activeIdx - 1))}
            disabled={activeIdx === 0}
            className="p-1 text-white/50 hover:text-white disabled:opacity-20"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-1.5">
            {strategies.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveIdx(i)}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i === activeIdx ? "bg-white" : "bg-white/30"
                }`}
              />
            ))}
          </div>
          <button
            onClick={() =>
              setActiveIdx(Math.min(strategies.length - 1, activeIdx + 1))
            }
            disabled={activeIdx === strategies.length - 1}
            className="p-1 text-white/50 hover:text-white disabled:opacity-20"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Cards */}
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 scrollbar-hide"
        >
          {strategies.map((strat, i) => {
            const Icon = STRATEGY_ICONS[i] || Sprout;
            return (
              <div
                key={i}
                className={`snap-center flex-shrink-0 w-[85vw] max-w-md rounded-2xl border p-4 ${STRATEGY_COLORS[i]}`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="w-5 h-5 text-white/80" />
                  <h3 className="font-bold text-white text-base">
                    {strat.name}
                  </h3>
                </div>

                <div className="space-y-2.5 text-sm">
                  <Field label="Why Suggested" value={strat.why_suggested} />
                  <Field label="NASA Evidence" value={strat.nasa_evidence} accent />
                  <Field label="Expected Benefits" value={strat.expected_benefits} />
                  <Field label="Satellite Info Gaps" value={strat.satellite_info_gaps} warn />
                  <Field label="Local Expert Risks" value={strat.local_expert_risks} warn />
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
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <span
        className={`text-xs font-semibold uppercase tracking-wider ${
          warn
            ? "text-yellow-400/80"
            : accent
              ? "text-cyan-400/80"
              : "text-white/50"
        }`}
      >
        {label}
      </span>
      <p className="text-white/90 leading-relaxed mt-0.5">{value}</p>
    </div>
  );
}
