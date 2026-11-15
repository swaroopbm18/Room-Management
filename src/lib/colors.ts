// Colour themes for the navbar picker. Each id matches an html[data-color] block in globals.css;
// the swatch is that family's 500 and 700 shades.
export const COLOR_THEMES = [
  { id: "blue", label: "Blue", swatch: ["#3b82f6", "#1d4ed8"] },
  { id: "violet", label: "Purple", swatch: ["#8b5cf6", "#6d28d9"] },
  { id: "red", label: "Red", swatch: ["#ef4444", "#b91c1c"] },
  { id: "amber", label: "Gold", swatch: ["#f59e0b", "#b45309"] },
  { id: "emerald", label: "Emerald", swatch: ["#10b981", "#047857"] },
  { id: "slate", label: "Slate", swatch: ["#64748b", "#334155"] },
] as const;

export const DEFAULT_COLOR = "blue";
