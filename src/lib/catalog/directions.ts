import type { Palette } from "@/lib/spec/schema";

export type DirectionId =
  | "cinematic-dark"
  | "minimal-editorial"
  | "futuristic"
  | "luxury"
  | "playful"
  | "brutalist"
  | "clean-technology"
  | "custom";

export interface VisualDirection {
  id: DirectionId;
  name: string;
  summary: string;
  palette: Palette;
  fonts: { display: string; body: string };
  defaultLighting: string;
  defaultMaterial: string;
  motionIntensity: "subtle" | "balanced" | "dramatic";
  /** Corner radius used by cards and buttons in generated sites (px). */
  radius: number;
  /** Uppercase display headlines etc. */
  displayCase: "none" | "uppercase";
}

export const VISUAL_DIRECTIONS: VisualDirection[] = [
  {
    id: "cinematic-dark",
    name: "Cinematic dark",
    summary: "Deep blacks, warm highlights, slow camera moves. Built for product reveals.",
    palette: {
      background: "#07070A",
      surface: "#121218",
      text: "#F4F1EA",
      muted: "#9A978F",
      accent: "#E8B567",
      accent2: "#6E7BFF",
    },
    fonts: { display: "Instrument Serif", body: "Inter Tight" },
    defaultLighting: "moody-rim",
    defaultMaterial: "auto",
    motionIntensity: "balanced",
    radius: 14,
    displayCase: "none",
  },
  {
    id: "minimal-editorial",
    name: "Minimal editorial",
    summary: "Paper tones, generous whitespace, magazine typography. Lets imagery lead.",
    palette: {
      background: "#F3F0E9",
      surface: "#FFFFFF",
      text: "#141413",
      muted: "#6B6862",
      accent: "#C2410C",
      accent2: "#1F2937",
    },
    fonts: { display: "Fraunces", body: "Inter" },
    defaultLighting: "gallery",
    defaultMaterial: "ceramic",
    motionIntensity: "subtle",
    radius: 4,
    displayCase: "none",
  },
  {
    id: "futuristic",
    name: "Futuristic",
    summary: "Neon edges, dense grids, particle fields. High energy without clutter.",
    palette: {
      background: "#05060B",
      surface: "#0E1220",
      text: "#E6F1FF",
      muted: "#7D8BA6",
      accent: "#38F2D0",
      accent2: "#A855F7",
    },
    fonts: { display: "Unbounded", body: "Space Grotesk" },
    defaultLighting: "neon-dual",
    defaultMaterial: "iridescent",
    motionIntensity: "dramatic",
    radius: 10,
    displayCase: "uppercase",
  },
  {
    id: "luxury",
    name: "Luxury",
    summary: "Black and champagne, refined serif type, restrained motion and glass.",
    palette: {
      background: "#0A0907",
      surface: "#16130F",
      text: "#F3EBDD",
      muted: "#A69A86",
      accent: "#D4AF6A",
      accent2: "#8C6B3F",
    },
    fonts: { display: "Cormorant Garamond", body: "Manrope" },
    defaultLighting: "golden-hour",
    defaultMaterial: "glass",
    motionIntensity: "subtle",
    radius: 2,
    displayCase: "uppercase",
  },
  {
    id: "playful",
    name: "Playful",
    summary: "Saturated color, rounded shapes, bouncy hover states.",
    palette: {
      background: "#FFF6E9",
      surface: "#FFFFFF",
      text: "#1B1530",
      muted: "#6A6380",
      accent: "#FF5C39",
      accent2: "#4F46E5",
    },
    fonts: { display: "Bricolage Grotesque", body: "Outfit" },
    defaultLighting: "daylight",
    defaultMaterial: "satin-plastic",
    motionIntensity: "balanced",
    radius: 22,
    displayCase: "none",
  },
  {
    id: "brutalist",
    name: "Brutalist",
    summary: "Raw grids, heavy type, hard edges. Confident and graphic.",
    palette: {
      background: "#EDEDE8",
      surface: "#FFFFFF",
      text: "#0A0A0A",
      muted: "#4A4A4A",
      accent: "#2B2BFF",
      accent2: "#FF3B1F",
    },
    fonts: { display: "Archivo Black", body: "IBM Plex Mono" },
    defaultLighting: "daylight",
    defaultMaterial: "matte-clay",
    motionIntensity: "balanced",
    radius: 0,
    displayCase: "uppercase",
  },
  {
    id: "clean-technology",
    name: "Clean technology",
    summary: "Crisp neutrals, precise spacing, readable feature sections.",
    palette: {
      background: "#0B0D12",
      surface: "#141822",
      text: "#EEF2F8",
      muted: "#8A93A6",
      accent: "#5B8CFF",
      accent2: "#34D399",
    },
    fonts: { display: "Sora", body: "Inter" },
    defaultLighting: "studio",
    defaultMaterial: "brushed-metal",
    motionIntensity: "balanced",
    radius: 12,
    displayCase: "none",
  },
  {
    id: "custom",
    name: "Custom",
    summary: "Start neutral and set your own colors and typography.",
    palette: {
      background: "#0E0E10",
      surface: "#18181B",
      text: "#F4F4F5",
      muted: "#A1A1AA",
      accent: "#F2B84B",
      accent2: "#60A5FA",
    },
    fonts: { display: "Inter Tight", body: "Inter" },
    defaultLighting: "studio",
    defaultMaterial: "auto",
    motionIntensity: "balanced",
    radius: 10,
    displayCase: "none",
  },
];

export function getDirection(id: string | undefined | null): VisualDirection {
  return VISUAL_DIRECTIONS.find((d) => d.id === id) ?? VISUAL_DIRECTIONS[0];
}
