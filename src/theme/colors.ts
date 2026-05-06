/**
 * @file colors.ts
 * @description Brand-tokens från Friluft Folio (se docs/marketing/BRAND.md).
 *
 * Tipspromenaden använder normalt hex-värden inline i StyleSheet.create
 * (medvetet enkelt — ingen theming-overhead). Den här filen exporterar
 * tokens i strukturerad form för komponenter som behöver hela paletten,
 * t.ex. handoff-animationer från design.
 */

export const TP = {
  bg:       "#F5F0E8", // Cream — bakgrund
  surface:  "#FBF7F0", // Något ljusare cream för kort
  fg:       "#2C3E2D", // Text Warm — brödtext
  fgSoft:   "#4F5F50", // Mjukare brödtext
  fgMute:   "#8A9A8D", // Sage — sekundärtext
  hairline: "#D9D2C2", // Rule — avskiljare
  forest:   "#1B6B35", // Forest Green — primär accent (rubriker, CTA)
  forestDk: "#1B3D2B", // Green Dark — bakgrundsytor
  pin:      "#C8362D", // Checkpoint-röd (matchar app-ikonen)
  pinDk:    "#A02A22",
  pinIvory: "#FBF7F0", // Inre ring i pin
  trail:    "#EFE3C8", // Beige stig (matchar T-formen i ikonen)
} as const;
