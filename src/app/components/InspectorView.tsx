"use client";

import React from "react";
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

interface InspectorViewProps {
  preset: SatellitePreset | null;
  strategies: RotationStrategy[];
}

export default function InspectorView({ preset, strategies }: InspectorViewProps) {
  if (!preset) {
    return (
      <div className="flex items-center justify-center h-full text-white/50">
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

  return (
    <div className="bg-gray-950 text-white min-h-screen p-4 md:p-6 overflow-y-auto">
      <h2 className="text-xl font-bold text-cyan-400 mb-1">
        🔬 Judge Data Harmonization Inspector
      </h2>
      <p className="text-sm text-white/50 mb-6">{preset.name}</p>

      {/* ── Downscaling Equation ── */}
      <section className="mb-8 bg-gray-900 rounded-2xl p-5 border border-cyan-900/30">
        <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3">
          Multi-Resolution Downscaling Equation
        </h3>
        <div className="bg-black rounded-xl p-4 font-mono text-center overflow-x-auto">
          <p className="text-lg text-emerald-400">
            M<sub>local</sub> = M<sub>SMAP</sub> × α<sub>SRTM</sub> × β
            <sub>CameraCV</sub>
          </p>
          <div className="mt-3 text-xs text-white/50 space-y-1">
            <p>
              M<sub>SMAP</sub> = SMAP L4 9 km root-zone moisture (
              {preset.smap_rootzone_mm[preset.smap_rootzone_mm.length - 1]} mm
              latest)
            </p>
            <p>
              α<sub>SRTM</sub> = SRTM 30 m topographic correction factor (slope{" "}
              {preset.srtm_slope_deg}°, aspect {preset.srtm_aspect_deg}°)
            </p>
            <p>
              β<sub>CameraCV</sub> = Ground camera computer-vision residue
              calibration (reduces ±34% → ±11%)
            </p>
          </div>
        </div>
      </section>

      {/* ── NDVI vs BSI Timeline ── */}
      <section className="mb-8 bg-gray-900 rounded-2xl p-5 border border-cyan-900/30">
        <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3">
          Landsat 30 m: NDVI vs Bare Soil Index — Erosion Windows in Red
        </h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="month" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 1]} stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: "#111",
                  border: "1px solid rgba(0,255,200,0.3)",
                  borderRadius: 12,
                }}
                labelStyle={{ color: "#aaa" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />

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
                    value: "⚠ Erosion Risk",
                    position: "insideTop",
                    fill: "rgba(255,100,100,0.7)",
                    fontSize: 10,
                  }}
                />
              ))}

              <ReferenceLine y={0.3} stroke="rgba(255,100,100,0.4)" strokeDasharray="4 4" label={{ value: "BSI Threshold", fill: "#f87171", fontSize: 10 }} />

              <Line
                type="monotone"
                dataKey="NDVI"
                stroke="#22c55e"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="NDVI (vegetation)"
              />
              <Line
                type="monotone"
                dataKey="BSI"
                stroke="#ef4444"
                strokeWidth={2.5}
                dot={{ r: 3 }}
                name="BSI (bare soil)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ── 5-Point Strategy Matrix ── */}
      <section className="bg-gray-900 rounded-2xl p-5 border border-cyan-900/30">
        <h3 className="text-sm font-semibold text-cyan-400 uppercase tracking-wider mb-3">
          5-Point NASA Rubric Strategy Matrix
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left p-2 text-white/50">Rubric Field</th>
                {strategies.map((s, i) => (
                  <th key={i} className="text-left p-2 text-white/80 min-w-[200px]">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["why_suggested", "Why Suggested"],
                  ["nasa_evidence", "NASA Evidence"],
                  ["expected_benefits", "Expected Benefits"],
                  ["satellite_info_gaps", "Satellite Info Gaps"],
                  ["local_expert_risks", "Local Expert Risks"],
                ] as const
              ).map(([key, label]) => (
                <tr key={key} className="border-b border-white/5 hover:bg-white/5">
                  <td className="p-2 font-semibold text-cyan-400/80 align-top">
                    {label}
                  </td>
                  {strategies.map((s, i) => (
                    <td key={i} className="p-2 text-white/70 align-top leading-relaxed">
                      {s[key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
