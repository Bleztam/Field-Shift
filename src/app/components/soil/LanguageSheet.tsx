"use client";

import React from "react";
import { X, Check, MapPin } from "lucide-react";
import {
  AddisLanguageCode,
  ADDIS_LANGUAGE_CODES,
  SUPPORTED_LANGUAGES,
} from "@/lib/languageConfig";

interface LanguageSheetProps {
  open: boolean;
  activeCode: AddisLanguageCode;
  /** Region default, labeled "suggested for your area". */
  suggestedCode?: AddisLanguageCode | null;
  onSelect: (code: AddisLanguageCode) => void;
  onClose: () => void;
}

/**
 * Big-button spoken-language picker. One tap changes the soil's voice;
 * the choice persists in localStorage via the parent.
 */
export default function LanguageSheet({
  open,
  activeCode,
  suggestedCode,
  onSelect,
  onClose,
}: LanguageSheetProps) {
  if (!open) return null;

  return (
    <>
      <div className="why-sheet-backdrop" onClick={onClose} />
      <section
        className="why-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Choose language"
      >
        <div className="why-handle" />
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-extrabold">
            <span className="soil-am" lang="am">ቋንቋ</span>{" "}
            <span className="text-sm font-semibold opacity-60">Language</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-full flex items-center justify-center"
            style={{ background: "rgba(59,42,32,0.08)" }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          {ADDIS_LANGUAGE_CODES.map((code) => {
            const lang = SUPPORTED_LANGUAGES[code];
            const active = code === activeCode;
            const suggested = code === suggestedCode && code !== activeCode;
            return (
              <button
                key={code}
                type="button"
                className="lang-choice"
                data-active={active || undefined}
                onClick={() => onSelect(code)}
                style={{ minHeight: 64 }}
              >
                <span className="flex-1 text-left">
                  <span className="block text-lg font-extrabold leading-tight">
                    {lang.nativeName}
                  </span>
                  <span className="block text-xs font-semibold opacity-60">
                    {lang.englishName}
                  </span>
                  {suggested && (
                    <span
                      className="inline-flex items-center gap-1 mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: "rgba(63,125,58,0.14)",
                        color: "var(--soil-leaf)",
                      }}
                    >
                      <MapPin className="w-3 h-3" />
                      suggested for your area
                    </span>
                  )}
                </span>
                {active && (
                  <Check
                    className="w-6 h-6 shrink-0"
                    style={{ color: "var(--soil-leaf)" }}
                    aria-label="active"
                  />
                )}
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}
