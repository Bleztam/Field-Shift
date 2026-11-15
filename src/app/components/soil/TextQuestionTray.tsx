"use client";

import React, { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { SOIL_STRINGS } from "@/lib/soilUiStrings";

interface TextQuestionTrayProps {
  open: boolean;
  disabled?: boolean;
  onSend: (question: string) => void;
  onClose: () => void;
}

/** Existing text-input path, restyled — primary fallback when SR is absent. */
export default function TextQuestionTray({
  open,
  disabled,
  onSend,
  onClose,
}: TextQuestionTrayProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);

  if (!open) return null;

  const send = () => {
    const q = value.trim();
    if (!q || disabled) return;
    onSend(q);
    setValue("");
    onClose();
  };

  return (
    <div className="text-tray" role="dialog" aria-label={SOIL_STRINGS.typePlaceholder.en}>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        placeholder={SOIL_STRINGS.typePlaceholder.am}
        aria-label={SOIL_STRINGS.typePlaceholder.en}
        disabled={disabled}
        lang="am"
      />
      <button
        type="button"
        className="send"
        onClick={send}
        disabled={disabled || !value.trim()}
        aria-label={SOIL_STRINGS.send.en}
      >
        <Send className="w-5 h-5" />
      </button>
    </div>
  );
}
