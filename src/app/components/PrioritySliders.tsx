"use client";

import React from "react";
import { FarmerPriorities } from "@/lib/types";
import { Droplets, Leaf, DollarSign, Wheat } from "lucide-react";

interface PrioritySlidersProps {
  priorities: FarmerPriorities;
  onChange: (p: FarmerPriorities) => void;
}

const SLIDERS = [
  {
    key: "waterConservation" as const,
    label: "Water Conservation",
    icon: Droplets,
    color: "from-blue-500 to-cyan-400",
    track: "bg-blue-900/30",
  },
  {
    key: "soilNitrogen" as const,
    label: "Soil Nitrogen",
    icon: Leaf,
    color: "from-green-500 to-emerald-400",
    track: "bg-green-900/30",
  },
  {
    key: "cashIncome" as const,
    label: "Cash Income",
    icon: DollarSign,
    color: "from-yellow-500 to-amber-400",
    track: "bg-yellow-900/30",
  },
  {
    key: "livestockForage" as const,
    label: "Livestock Forage",
    icon: Wheat,
    color: "from-orange-500 to-red-400",
    track: "bg-orange-900/30",
  },
];

export default function PrioritySliders({
  priorities,
  onChange,
}: PrioritySlidersProps) {
  return (
    <div className="z-20 mx-4 mb-2 bg-black/50 backdrop-blur-md rounded-2xl p-3 border border-white/10">
      <h3 className="text-xs font-semibold text-white/60 uppercase tracking-wider mb-2">
        Farmer Priorities
      </h3>
      <div className="space-y-2">
        {SLIDERS.map(({ key, label, icon: Icon, color, track }) => (
          <div key={key} className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-white/70 flex-shrink-0" />
            <label className="text-xs text-white/80 w-28 flex-shrink-0">
              {label}
            </label>
            <div className={`relative flex-1 h-5 ${track} rounded-full overflow-hidden`}>
              <div
                className={`absolute inset-y-0 left-0 bg-gradient-to-r ${color} rounded-full transition-all`}
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
              />
            </div>
            <span className="text-xs text-white/60 w-8 text-right tabular-nums">
              {priorities[key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
