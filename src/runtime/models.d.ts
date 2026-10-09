import type * as THREE from "three";

export interface ModelPart {
  name: string;
  object: THREE.Object3D;
  dir: THREE.Vector3;
  origin: THREE.Vector3;
  childDirs?: THREE.Vector3[];
}

export interface BuiltModel {
  group: THREE.Group;
  parts: ModelPart[];
  tick(t: number, pointer: { x: number; y: number } | null): void;
}

export type MaterialRole = "primary" | "secondary" | "accent" | "glass" | "emissive" | "dark";

export const MODEL_IDS: string[];
export function buildModel(
  id: string,
  mat: (role: MaterialRole) => THREE.Material,
  opts?: { quality?: "low" | "medium" | "high"; palette?: { accent: string; accent2: string; [k: string]: string } },
): BuiltModel;
export function applyExplode(parts: ModelPart[], amount: number): void;
