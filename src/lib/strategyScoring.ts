// ─── Real-Time Farmer Priority Matching & Strategy Scoring ───
import { FarmerPriorities, RotationStrategy, StrategyWeights } from "./types";

export const DEFAULT_STRATEGY_WEIGHTS: Record<string, StrategyWeights> = {
  "Current Baseline": {
    waterConservation: 0.30,
    soilNitrogen: 0.25,
    cashIncome: 0.90, // Strong immediate cash income from cash monocrop
    livestockForage: 0.50, // Moderate stubble forage
  },
  "Bare-Window Bridge Crop": {
    waterConservation: 0.65,
    soilNitrogen: 0.95, // High biological N fixation (vetch, cowpea, clover)
    cashIncome: 0.45, // Indirect input savings
    livestockForage: 0.90, // Excellent high-protein green fodder
  },
  "Hydro-Shield Multi-Year Rotation": {
    waterConservation: 0.95, // Max deep-root moisture conservation & runoff shielding
    soilNitrogen: 0.80, // Multi-year soil organic carbon & fertility cycle
    cashIncome: 0.60, // Long-term yield resilience & market diversity
    livestockForage: 0.65, // Multi-species forage blend
  },
};

/**
 * Computes a dynamic match score (0–100%) for a strategy against farmer priorities.
 */
export function computeStrategyMatchScore(
  strategyName: string,
  priorities: FarmerPriorities,
  customWeights?: StrategyWeights
): number {
  const weights =
    customWeights ||
    DEFAULT_STRATEGY_WEIGHTS[strategyName] || {
      waterConservation: 0.5,
      soilNitrogen: 0.5,
      cashIncome: 0.5,
      livestockForage: 0.5,
    };

  const totalPriorityWeight =
    priorities.waterConservation +
    priorities.soilNitrogen +
    priorities.cashIncome +
    priorities.livestockForage;

  if (totalPriorityWeight === 0) return 50;

  const weightedSum =
    priorities.waterConservation * weights.waterConservation +
    priorities.soilNitrogen * weights.soilNitrogen +
    priorities.cashIncome * weights.cashIncome +
    priorities.livestockForage * weights.livestockForage;

  const rawPercent = (weightedSum / totalPriorityWeight) * 100;

  // Scale smoothly between 30% and 98%
  return Math.min(98, Math.max(30, Math.round(rawPercent)));
}

/**
 * Annotates strategies with their live matchScore and identifies the #1 best match.
 */
export function annotateStrategiesWithScores(
  strategies: RotationStrategy[],
  priorities: FarmerPriorities
): {
  scoredStrategies: (RotationStrategy & { isBestMatch: boolean })[];
  bestMatchIndex: number;
} {
  const scored = strategies.map((s) => {
    const score = computeStrategyMatchScore(s.name, priorities, s.weights);
    return {
      ...s,
      matchScore: score,
      weights: s.weights || DEFAULT_STRATEGY_WEIGHTS[s.name],
      isBestMatch: false,
    };
  });

  // Find highest score
  let maxScore = -1;
  let bestIdx = 0;
  scored.forEach((s, idx) => {
    if ((s.matchScore ?? 0) > maxScore) {
      maxScore = s.matchScore ?? 0;
      bestIdx = idx;
    }
  });

  if (scored[bestIdx]) {
    scored[bestIdx].isBestMatch = true;
  }

  return { scoredStrategies: scored, bestMatchIndex: bestIdx };
}
