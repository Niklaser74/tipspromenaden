/**
 * @file categories.ts
 * @description Tillåtna kategori-koder för publika promenader i biblioteket.
 *
 * **Måste hållas synkad med `firestore.rules` `hasValidWalkShape`** —
 * Firestore-rule:n hardkodar samma lista (kan inte importera TS-konstanter
 * in i .rules-syntax). Vid tillägg: uppdatera båda.
 */

export const WALK_CATEGORIES = [
  "natur",
  "stad",
  "historia",
  "barn",
  "cykel",
  "mat",
  "kultur",
  "annat",
] as const;

export type WalkCategory = (typeof WALK_CATEGORIES)[number];
