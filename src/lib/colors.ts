// Colour themes for the navbar picker. Each id matches an html[data-color] block in globals.css;
// the swatch is that family's 500 and 700 shades.
export const COLOR_THEMES = [
  { id: "blue", label: "Blue", swatch: ["#3b82f6", "#1d4ed8"] },
  { id: "indigo", label: "Indigo", swatch: ["#6366f1", "#4338ca"] },
  { id: "violet", label: "Violet", swatch: ["#8b5cf6", "#6d28d9"] },
  { id: "fuchsia", label: "Fuchsia", swatch: ["#d946ef", "#a21caf"] },
  { id: "rose", label: "Rose", swatch: ["#f43f5e", "#be123c"] },
  { id: "red", label: "Red", swatch: ["#ef4444", "#b91c1c"] },
  { id: "orange", label: "Orange", swatch: ["#f97316", "#c2410c"] },
  { id: "amber", label: "Amber", swatch: ["#f59e0b", "#b45309"] },
  { id: "emerald", label: "Emerald", swatch: ["#10b981", "#047857"] },
  { id: "teal", label: "Teal", swatch: ["#14b8a6", "#0f766e"] },
  { id: "cyan", label: "Cyan", swatch: ["#06b6d4", "#0e7490"] },
  { id: "slate", label: "Slate", swatch: ["#64748b", "#334155"] },
] as const;

export const DEFAULT_COLOR = "blue";
