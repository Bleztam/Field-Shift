"use client";

import React, { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { SatellitePreset, RotationStrategy } from "@/lib/types";
import {
  Sprout,
  Shield,
  RefreshCw,
  Satellite,
  TrendingUp,
  AlertTriangle,
  UserCheck,
  CheckCircle2,
} from "lucide-react";

interface InspectorViewProps {
  preset: SatellitePreset | null;
  strategies: (RotationStrategy & { isBestMatch?: boolean })[];
}

const STRATEGY_ICONS = [Sprout, Shield, RefreshCw];

export default function InspectorView({ preset, strategies }: InspectorViewProps) {
  const [selectedStrategyTab, setSelectedStrategyTab] = useState<number>(0);
  const [viewMode, setViewMode] = useState<"tabs" | "grid">("tabs");

  if (!preset) {
    return (
      <div className="flex items-center justify-center h-full text-white/50 p-6">
        Loading satellite data…
      </div>
    );
  }

  // Build chart data
  const chartData = preset.months.map((month, i) => ({
    month,
    NDVI: preset.landsat_ndvi[i],
    BSI: preset.landsat_bsi[i],
    isErosionRisk: preset.erosion_risk_months.includes(i),
  }));

  // Find contiguous erosion risk windows for ReferenceArea
  const erosionWindows: { start: string; end: string }[] = [];
  let windowStart: string | null = null;
  for (let i = 0; i < chartData.length; i++) {
    if (chartData[i].isErosionRisk && !windowStart) {
      windowStart = chartData[i].month;
    }
    if (
      (!chartData[i].isErosionRisk || i === chartData.length - 1) &&
      windowStart
    ) {
      const endIdx = chartData[i].isErosionRisk ? i : i - 1;
      erosionWindows.push({
        start: windowStart,
        end: chartData[endIdx].month,
      });
      windowStart = null;
    }
  }

  const activeStrategy =
    strategies[selectedStrategyTab] || strategies[0] || null;

  return (
    <div className="bg-gray-950 text-white min-h-screen p-4 md:p-6 overflow-y-auto max-w-5xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-cyan-400 flex items-center gap-2">
            <span>🔬</span> Judge Data Harmonization Inspector
          </h2>
          <p className="text-xs text-white/50">{preset.name}</p>
        </div>
        <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800/40">
          NASA Multi-Resolution Harmonization
        </span>
      </div>

      {/* ── Downscaling Equation ── */}
      <section className="mb-6 bg-gray-900 rounded-2xl p-4 md:p-5 border border-cyan-900/30 shadow-lg">
        <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Satellite className="w-3.5 h-3.5" />
          Multi-Resolution Downscaling Equation
        </h3>
        <div className="bg-black/90 rounded-xl p-3 md:p-4 font-mono text-center overflow-x-auto border border-white/5">
          <p className="text-base md:text-lg text-emerald-400 font-bold">
            M<sub>local</sub> = M<sub>SMAP</sub> × α<sub>SRTM</sub> × β
            <sub>CameraCV</sub>
          </p>
          <div className="mt-2.5 text-[11px] text-white/60 space-y-1 text-left md:text-center">
            <p>
              • <strong className="text-white/80">M<sub>SMAP</sub></strong> = SMAP L4 9 km root-zone moisture ({preset.smap_rootzone_mm[preset.smap_rootzone_mm.length - 1]} mm baseline)
            </p>
            <p>
              • <strong className="text-white/80">α<sub>SRTM</sub></strong> = SRTM 30 m topographic runoff factor (slope {preset.srtm_slope_deg}°, aspect {preset.srtm_aspect_deg}°)
            </p>
            <p>
              • <strong className="text-white/80">β<sub>CameraCV</sub></strong> = 1-cm ground camera residue & crack calibration (uncertainty ±34% → ±11%)
            </p>
          </div>
        </div>
      </section>

      {/* ── NDVI vs BSI Timeline ── */}
      <section className="mb-6 bg-gray-900 rounded-2xl p-4 md:p-5 border border-cyan-900/30 shadow-lg">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
            Landsat 30 m: NDVI vs Bare Soil Index — Bare Erosion Windows in Red
          </h3>
          <span className="text-[10px] text-red-400/90 bg-red-950/60 border border-red-500/30 px-2 py-0.5 rounded-full font-mono">
            ⚠ Red Zones: High Topsoil Loss Risk
          </span>
        </div>
        <div className="h-64 md:h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid rgba(0,255,200,0.3)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#aaa" }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />

              {/* Erosion risk zones */}
              {erosionWindows.map((w, i) => (
                <ReferenceArea
                  key={i}
                  x1={w.start}
                  x2={w.end}
                  fill="rgba(255, 50, 50, 0.15)"
                  stroke="rgba(255, 50, 50, 0.3)"
                  strokeDasharray="4 2"
                  label={{
                    value: "⚠ Bare Window",
                    position: "insideTop",
                    fill: "rgba(255,100,100,0.8)",
                    fontSize: 9,
                  }}
                />
              ))}

              <ReferenceLine
                y={0.3}
                stroke="rgba(255,100,100,0.4)"
                strokeDasharray="4 4"
                label={{ value: "BSI Danger", fill: "#f87171", fontSize: 9 }}
              />

              <Line
                type="monotone"
                dataKey="NDVI"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="NDVI (green vegetation)"
              />
              <Line
                type="monotone"
                dataKey="BSI"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="BSI (bare soil exposure)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── Mobile-Safe 5-Point Strategy Comparison Section ── */}
      <section className="bg-gray-900 rounded-2xl p-4 md:p-5 border border-cyan-900/30 shadow-lg">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div>
            <h3 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">
              5-Point NASA Rubric Strategy Comparison
            </h3>
            <p className="text-[11px] text-white/50">
              Zero text cut-off on mobile screens. Tab through each strategy or view all.
            </p>
          </div>

          {/* Toggle between Tabbed and Grid View on larger screens */}
          <div className="flex bg-black/60 p-1 rounded-xl border border-white/10 text-xs">
            <button
              onClick={() => setViewMode("tabs")}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMode === "tabs"
                  ? "bg-cyan-600 text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Tabbed Cards
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`px-3 py-1 rounded-lg transition-all ${
                viewMode === "grid"
                  ? "bg-cyan-600 text-white font-medium"
                  : "text-white/60 hover:text-white"
              }`}
            >
              Side-by-Side
            </button>
          </div>
        </div>

        {/* ── Pill Tabs ── */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-4">
          {strategies.map((strat, idx) => {
            const Icon = STRATEGY_ICONS[idx] || Sprout;
            const isSelected = selectedStrategyTab === idx;

            return (
              <button
                key={idx}
                onClick={() => setSelectedStrategyTab(idx)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40 border border-cyan-400/50"
                    : "bg-black/50 text-white/70 hover:bg-black/75 border border-white/10"
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{strat.name}</span>
                {strat.matchScore && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                      isSelected ? "bg-black/40 text-cyan-200" : "bg-white/10 text-white/60"
                    }`}
                  >
                    {strat.matchScore}%
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── View: Tabbed Full-Width Card (Mobile-Optimized) ── */}
        {viewMode === "tabs" && activeStrategy && (
          <StrategyRubricCard
            strategy={activeStrategy}
            index={selectedStrategyTab}
          />
        )}

        {/* ── View: Grid Mode (Side-by-Side Cards) ── */}
        {viewMode === "grid" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {strategies.map((strat, idx) => (
              <StrategyRubricCard key={idx} strategy={strat} index={idx} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Individual Rubric Card formatted with icons, color-coded headers, and zero cutoff.
 */
function StrategyRubricCard({
  strategy,
  index,
}: {
  strategy: RotationStrategy & { isBestMatch?: boolean };
  index: number;
}) {
  const Icon = STRATEGY_ICONS[index] || Sprout;
  const cardBorder =
    index === 1
      ? "border-emerald-500/40 bg-emerald-950/20"
      : index === 2
      ? "border-cyan-500/40 bg-cyan-950/20"
      : "border-amber-500/40 bg-amber-950/20";

  return (
    <div
      className={`rounded-2xl border p-4 md:p-5 transition-all shadow-md ${cardBorder}`}
    >
      {/* Strategy Title & Score Header */}
      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-white/10 border border-white/10">
            <Icon className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="font-bold text-white text-sm md:text-base leading-tight">
              {strategy.name}
            </h4>
            <span className="text-[10px] text-white/50 font-mono">
              Rubric Strategy {index + 1}
            </span>
          </div>
        </div>

        {strategy.matchScore && (
          <div className="flex items-center gap-1.5">
            {strategy.isBestMatch && (
              <span className="text-[10px] uppercase font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                ★ Best Match
              </span>
            )}
            <span className="text-xs font-bold font-mono px-2 py-1 rounded-lg bg-black/60 text-cyan-300 border border-cyan-800/40">
              {strategy.matchScore}%
            </span>
          </div>
        )}
      </div>

      {/* All 5 Mandatory NASA Rubric Fields */}
      <div className="space-y-3 text-xs">
        {/* 1. Why Suggested */}
        <RubricField
          icon={<Sprout className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
          label="1. Why Suggested"
          badgeColor="text-amber-400 bg-amber-950/50 border-amber-500/30"
          value={strategy.why_suggested}
        />

        {/* 2. NASA Evidence */}
        <RubricField
          icon={<Satellite className="w-3.5 h-3.5 text-cyan-300 shrink-0" />}
          label="2. NASA Satellite Evidence"
          badgeColor="text-cyan-300 bg-cyan-950/50 border-cyan-500/30"
          value={strategy.nasa_evidence}
          highlight
        />

        {/* 3. Expected Benefits */}
        <RubricField
          icon={<TrendingUp className="w-3.5 h-3.5 text-emerald-300 shrink-0" />}
          label="3. Expected Benefits"
          badgeColor="text-emerald-300 bg-emerald-950/50 border-emerald-500/30"
          value={strategy.expected_benefits}
        />

        {/* 4. Satellite Info Gaps */}
        <RubricField
          icon={<AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />}
          label="4. Satellite Info Gaps (30m–9km Blind Spots)"
          badgeColor="text-yellow-400 bg-yellow-950/50 border-yellow-500/30"
          value={strategy.satellite_info_gaps}
        />

        {/* 5. Local Expert Risks */}
        <RubricField
          icon={<UserCheck className="w-3.5 h-3.5 text-orange-400 shrink-0" />}
          label="5. Local Expert Risks (Requires Agronomist Ground-Truth)"
          badgeColor="text-orange-400 bg-orange-950/50 border-orange-500/30"
          value={strategy.local_expert_risks}
        />
      </div>
    </div>
  );
}

function RubricField({
  icon,
  label,
  value,
  badgeColor,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  badgeColor: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-2.5 border ${
        highlight
          ? "bg-cyan-950/30 border-cyan-800/40"
          : "bg-black/40 border-white/5"
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md border ${badgeColor}`}
        >
          {label}
        </span>
      </div>
      <p className="text-white/85 text-[11px] md:text-xs leading-relaxed mt-1">
        {value}
      </p>
    </div>
  );
}
