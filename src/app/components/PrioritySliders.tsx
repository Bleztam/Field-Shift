"use client";

import React from "react";
import { FarmerPriorities } from "@/lib/types";
import { Droplets, Leaf, DollarSign, Wheat, X, Sparkles } from "lucide-react";

interface PrioritySlidersProps {
  priorities: FarmerPriorities;
  onChange: (p: FarmerPriorities) => void;
  onClose?: () => void;
  bestMatchStrategyName?: string;
  bestMatchScore?: number;
}

const SLIDERS = [
  {
    key: "waterConservation" as const,
    label: "Water Conservation",
    icon: Droplets,
    color: "from-blue-500 to-cyan-400",
    track: "bg-blue-950/40",
    desc: "Reduces runoff & preserves SMAP root-zone moisture",
  },
  {
    key: "soilNitrogen" as const,
    label: "Soil Nitrogen",
    icon: Leaf,
    color: "from-emerald-500 to-green-400",
    track: "bg-emerald-950/40",
    desc: "Maximizes legume bio-fixation & minimizes synthetic N",
  },
  {
    key: "cashIncome" as const,
    label: "Cash Income",
    icon: DollarSign,
    color: "from-amber-500 to-yellow-400",
    track: "bg-amber-950/40",
    desc: "Prioritizes immediate seasonal grain market revenue",
  },
  {
    key: "livestockForage" as const,
    label: "Livestock Forage",
    icon: Wheat,
    color: "from-orange-500 to-red-400",
    track: "bg-orange-950/40",
    desc: "Supplies high-protein fodder & dry-season grazing",
  },
];

export default function PrioritySliders({
  priorities,
  onChange,
  onClose,
  bestMatchStrategyName,
  bestMatchScore,
}: PrioritySlidersProps) {
  return (
    <div className="bg-black/90 backdrop-blur-2xl rounded-3xl p-4 border border-white/15 shadow-2xl text-white">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎯</span>
          <div>
            <h3 className="text-sm font-bold tracking-tight text-white">
              Farmer Priorities & Goals
            </h3>
            <p className="text-[10px] text-white/50">
              Live matching algorithm re-ranks strategies instantly
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-colors"
            aria-label="Close priorities"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Live Best Match Banner */}
      {bestMatchStrategyName && (
        <div className="mb-3.5 px-3 py-2 rounded-xl bg-gradient-to-r from-emerald-950/80 to-cyan-950/80 border border-emerald-500/30 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="text-white/80">
              Top Fit:{" "}
              <strong className="text-emerald-300 font-semibold">
                {bestMatchStrategyName}
              </strong>
            </span>
          </div>
          {bestMatchScore && (
            <span className="font-mono font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-md border border-emerald-500/40">
              {bestMatchScore}%
            </span>
          )}
        </div>
      )}

      {/* Sliders */}
      <div className="space-y-3">
        {SLIDERS.map(({ key, label, icon: Icon, color, track, desc }) => (
          <div key={key} className="bg-white/5 rounded-2xl p-2.5 border border-white/5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <Icon className="w-3.5 h-3.5 text-white/70 shrink-0" />
                <span className="text-xs font-medium text-white/90">
                  {label}
                </span>
              </div>
              <span className="text-xs font-mono font-bold text-cyan-300 tabular-nums">
                {priorities[key]}%
              </span>
            </div>

            <div className={`relative h-5 ${track} rounded-full overflow-hidden border border-white/10`}>
              <div
                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${color} rounded-full transition-all duration-75`}
                style={{ width: `${priorities[key]}%` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={priorities[key]}
                onChange={(e) =>
                  onChange({ ...priorities, [key]: parseInt(e.target.value) })
                }
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
                aria-label={label}
              />
            </div>
            <p className="text-[10px] text-white/40 mt-1 pl-1">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
