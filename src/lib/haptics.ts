// ─── Tiny vibration helper — silently no-ops where unsupported ───

export function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // haptics are best-effort only
  }
}

export const HAPTIC_PRESS = 15;
export const HAPTIC_RELEASE = 15;
export const HAPTIC_ADVICE: number[] = [18, 40, 18];
