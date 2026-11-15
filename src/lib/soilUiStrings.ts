// ─── "The Soil Speaks" UI strings (Amharic + English) ───
// TODO verify: every Amharic string below is machine-assisted and MUST be
// reviewed by a native Amharic speaker before field deployment.
// Voice rule: the soil ALWAYS speaks in first person ("I" / "እኔ").

export interface AmEn {
  am: string;
  en: string;
}

export const SOIL_STRINGS = {
  greeting: {
    am: "ሰላም! እኔ የእርስዎ አፈር ነኝ። ሰብልዎን ይጠይቁኝ።",
    en: "Hello! I am your soil. Ask me about your crops.",
  },
  listening: { am: "እያዳመጥሁ ነው…", en: "I am listening…" },
  thinking: { am: "እያሰብሁ ነው…", en: "I am thinking…" },
  offlineTitle: { am: "ከመስመር ውጪ ነዎት", en: "You are offline" },
  offlineBody: {
    am: "የተቀመጠልዎን ቀዳሚ ምክር እያሳየሁ ነኝ።",
    en: "I am showing your saved advice.",
  },
  errorBody: {
    am: "ይቅርታ፣ አልሰማሁኝም። እባክዎ እንደገና ይሞክሩ።",
    en: "Sorry, I did not catch that. Please try again.",
  },
  retry: { am: "እንደገና ሞክር", en: "Retry" },
  pttHint: { am: "ለመናገር ይጫኑ", en: "Hold to talk" },
  typePlaceholder: { am: "ጥያቄዎን እዚህ ይጻፉ…", en: "Type your question…" },
  send: { am: "ላክ", en: "Send" },
  whyTitle: { am: "ለምን?", en: "Why?" },
  confirmAgent: {
    am: "ዉሳኔውን ከአካባቢ ምክር ባለሙያ ጋር ያረጋግጡ።",
    en: "Confirm this advice with your local extension agent.",
  },
  primerTitle: { am: "ካሜራ እና ማይክ", en: "Camera & microphone" },
  primerBody: {
    am: "ካሜራው እርሻዎን ይመለከታል፤ እኔ ከናሳ ሳተላይት ውሂብ ጋር ተጣምሬ እናገራለሁ። ማይኩ እርስዎን ለመስማት ብቻ ነው።",
    en: "The camera looks at your field; I speak using NASA satellite data. The mic is only so I can hear you.",
  },
  primerAllow: { am: "ቀጥል", en: "Continue" },
  primerSkip: { am: "ዝለል", en: "Skip" },
  sampleData: { am: "ናሙና ውሂብ", en: "sample data" },
  liveData: { am: "ቀጥታ ውሂብ", en: "live data" },
  moistureLabel: { am: "የአፈር እርጥበት", en: "Soil moisture (SMAP root-zone)" },
  confidenceLabel: { am: "እርግጠኝነት", en: "Confidence" },
  seasonLabel: { am: "ወቅት", en: "Season" },
  reasonsLabel: { am: "ምክንያቶች", en: "Reasons" },
  judgeInspector: { am: "", en: "Judge data inspector" },
} satisfies Record<string, AmEn>;

export const VERDICT_STRINGS: Record<
  "plant" | "plant_with_caution" | "wait",
  AmEn
> = {
  plant: { am: "ተክል!", en: "Plant" },
  plant_with_caution: { am: "በጥንቃቄ ተክል", en: "Plant with care" },
  wait: { am: "ጠብቅ", en: "Wait" },
};

export interface CropLens {
  id: string;
  cropQuery: string; // English name embedded in the question for extraction
  labelAm: string; // TODO verify (native-speaker review pending)
  labelEn: string;
}

export const CROP_LENSES: CropLens[] = [
  { id: "teff", cropQuery: "teff", labelAm: "ጤፍ", labelEn: "Teff" },
  { id: "maize", cropQuery: "maize", labelAm: "በቆሎ", labelEn: "Maize" },
  { id: "chickpea", cropQuery: "chickpea", labelAm: "ሽምብራ", labelEn: "Chickpea" },
  { id: "wheat", cropQuery: "wheat", labelAm: "ስንዴ", labelEn: "Wheat" },
  { id: "sorghum", cropQuery: "sorghum", labelAm: "ማሽላ", labelEn: "Sorghum" },
  { id: "haricot", cropQuery: "haricot bean", labelAm: "ቦለቄ", labelEn: "Haricot" },
];

export function cropQuestion(cropQuery: string): string {
  return `Can I plant ${cropQuery} now?`;
}
