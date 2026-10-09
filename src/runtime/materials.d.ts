import type * as THREE from "three";
import type { MaterialRole } from "./models";

type PaletteLike = { background: string; accent: string; accent2: string; [k: string]: string };

export const MATERIAL_IDS: string[];
export function createMaterialFactory(preset: string, modelDefault: string, palette: PaletteLike): (role: MaterialRole) => THREE.Material;
export function addLighting(scene: THREE.Scene, preset: string, palette: PaletteLike): number;
