"use client";

import React from "react";
import { CROP_LENSES, cropQuestion } from "@/lib/soilUiStrings";
import { CropGlyph } from "./icons";
import { vibrate, HAPTIC_PRESS } from "@/lib/haptics";

interface CropLensCarouselProps {
  selectedCropId?: string | null;
  disabled?: boolean;
  /** Tap = set crop + ask the soil about planting it. */
  onAskCrop: (question: string, cropId: string) => void;
}

/** Snapchat-style crop lens carousel — illustrated chips, Amharic labels. */
export default function CropLensCarousel({
  selectedCropId,
  disabled,
  onAskCrop,
}: CropLensCarouselProps) {
  return (
    <div
      className="crop-carousel"
      role="listbox"
      aria-label="Choose a crop to ask the soil about"
    >
      {CROP_LENSES.map((crop) => (
        <button
          key={crop.id}
          type="button"
          role="option"
          aria-selected={selectedCropId === crop.id}
          className={`crop-chip ${selectedCropId === crop.id ? "selected" : ""}`}
          disabled={disabled}
          onClick={() => {
            vibrate(HAPTIC_PRESS);
            onAskCrop(cropQuestion(crop.cropQuery), crop.id);
          }}
        >
          <CropGlyph id={crop.id} />
          <span className="label" lang="am">
            {crop.labelAm}
          </span>
        </button>
      ))}
    </div>
  );
}
