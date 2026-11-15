// ─── Shared BCP-47 language code mapping (client + server safe) ───
import { Language } from "./types";

export function mapLanguageToCode(lang?: Language | string): string {
  switch (lang) {
    case "Amharic":
      return "am-ET";
    case "Afaan Oromo":
      return "om-ET";
    case "Spanish":
      return "es-ES";
    case "English":
    default:
      return "en-US";
  }
}

// Ge'ez (Ethiopic) script block — used to detect Amharic text server-side
// even when the caller omits the language hint.
export function looksLikeAmharic(text: string): boolean {
  return /[\u1200-\u137F]/.test(text);
}
