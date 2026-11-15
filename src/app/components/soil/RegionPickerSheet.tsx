"use client";

import React from "react";
import { MapPin, X } from "lucide-react";
import { REGION_CHOICES, RegionChoice } from "@/lib/location";

interface RegionPickerSheetProps {
  open: boolean;
  onPick: (choice: RegionChoice) => void;
  /**
   * When provided (a location already exists), the sheet can be dismissed —
   * it is being used to CHANGE region, not as the blocking entry gate.
   */
  onClose?: () => void;
}

/**
 * Region picker shown when neither live geolocation nor a saved fix is
 * available. Blocking by design in that case: the app needs a location
 * before it can pull NASA POWER weather. Representative coordinates are
 * approximate and the chosen location is always labeled as such (never
 * "live").
 */
export default function RegionPickerSheet({ open, onPick, onClose }: RegionPickerSheetProps) {
  if (!open) return null;

  return (
    <>
      <div className="why-sheet-backdrop" onClick={onClose} />
      <section
        className="why-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Choose your region"
      >
        <div className="why-handle" />
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-lg font-extrabold">
            <span className="soil-am" lang="am">እርሻዎ የት ነው?</span>
          </h3>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-11 h-11 rounded-full flex items-center justify-center"
              style={{ background: "rgba(59,42,32,0.08)" }}
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
        <p className="text-sm font-semibold opacity-60 mb-3">
          Where is your field? (approximate — used for satellite weather)
        </p>

        <div className="flex flex-col gap-2.5">
          {REGION_CHOICES.map((choice) => (
            <button
              key={choice.key}
              type="button"
              className="lang-choice"
              onClick={() => onPick(choice)}
              style={{ minHeight: 64 }}
            >
              <MapPin
                className="w-5 h-5 shrink-0"
                style={{ color: "var(--soil-sienna)" }}
              />
              <span className="flex-1 text-left">
                <span className="soil-am block text-lg font-extrabold leading-tight" lang="am">
                  {choice.labelAm}
                </span>
                <span className="block text-xs font-semibold opacity-60">
                  {choice.labelEn}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
