// ─── Shared BCP-47 language code mapping (client + server safe) ───
import { Language } from "./types";
import { isAddisLanguageCode, SUPPORTED_LANGUAGES } from "./languageConfig";

/**
 * Maps either a legacy display name ("Amharic", …) or an Addis language code
 * ("am", "om", …) to the BCP-47 tag used by SpeechRecognition and
 * speechSynthesis.
 */
export function mapLanguageToCode(lang?: Language | string): string {
  if (lang && isAddisLanguageCode(lang)) {
    return SUPPORTED_LANGUAGES[lang].speechRecognitionLang;
  }
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

// Ge'ez (Ethiopic) script block — used to detect Amharic/Tigrinya text
// server-side even when the caller omits the language hint.
export function looksLikeAmharic(text: string): boolean {
  return /[\u1200-\u137F]/.test(text);
}
