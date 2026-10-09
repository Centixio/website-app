"use client";

import { useEffect, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { buildModel } from "@/runtime/models.js";
import { addLighting, createMaterialFactory } from "@/runtime/materials.js";
import { getModel } from "@/lib/catalog/models";
import type { Palette } from "@/lib/spec/schema";
import { cn } from "@/lib/utils";

/**
 * Renders still thumbnails of real 3D models with ONE shared offscreen
 * WebGL context (cached by key), instead of a live canvas per card.
 */
let renderer: THREE.WebGLRenderer | null = null;
let envTexture: THREE.Texture | null = null;
const cache = new Map<string, string>();
const queue: (() => void)[] = [];
let busy = false;

function getRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  try {
    const canvas = document.createElement("canvas");
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(360, 270, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return renderer;
  } catch {
    return null;
  }
}

function renderThumb(modelId: string, palette: Palette, material: string, lighting: string): string | null {
  const r = getRenderer();
  if (!r) return null;
  const scene = new THREE.Scene();
  scene.environment = envTexture;
  scene.environmentIntensity = addLighting(scene, lighting, palette);
  const def = getModel(modelId);
  const m = buildModel(modelId, createMaterialFactory(material, def?.defaultMaterial ?? "satin-plastic", palette), { quality: "medium", palette });
  m.tick(1.3, null);
  m.group.rotation.y = -0.6;
  scene.add(m.group);
  const sphere = new THREE.Box3().setFromObject(m.group).getBoundingSphere(new THREE.Sphere());
  const camera = new THREE.PerspectiveCamera(32, 360 / 270, 0.1, 100);
  const dist = (sphere.radius * 1.25) / Math.sin(THREE.MathUtils.degToRad(16));
  camera.position.copy(sphere.center).add(new THREE.Vector3(0.55, 0.3, 1).normalize().multiplyScalar(dist));
  camera.lookAt(sphere.center);
  r.render(scene, camera);
  const url = r.domElement.toDataURL("image/png");
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
  });
  return url;
}

function schedule(job: () => void) {
  queue.push(job);
  if (busy) return;
  busy = true;
  const step = () => {
    const next = queue.shift();
    if (!next) {
      busy = false;
      return;
    }
    next();
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function ModelThumbnail({ modelId, palette, material = "auto", lighting = "studio", className, alt }: { modelId: string; palette: Palette; material?: string; lighting?: string; className?: string; alt?: string }) {
  const key = `${modelId}|${material}|${lighting}|${palette.accent}|${palette.accent2}|${palette.background}`;
  // Cached thumbnails are read during render; only uncached ones are rendered asynchronously.
  const [result, setResult] = useState<{ key: string; src: string | null } | null>(null);
  const cached = cache.get(key);
  useEffect(() => {
    if (cache.has(key)) return;
    let alive = true;
    schedule(() => {
      const url = renderThumb(modelId, palette, material, lighting);
      if (url) cache.set(key, url);
      if (alive) setResult({ key, src: url });
    });
    return () => {
      alive = false;
    };
  }, [key, modelId, palette, material, lighting]);
  const src = cached ?? (result?.key === key ? result.src : undefined);
  const failed = result?.key === key && result.src === null;
  const name = getModel(modelId)?.name ?? modelId;
  if (failed) return <div className={cn("grid place-items-center text-xs text-muted-foreground", className)}>{name}</div>;
  if (!src) return <div className={cn("animate-pulse rounded-md bg-muted/40", className)} aria-hidden />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt ?? `${name} 3D model`} className={cn("object-contain", className)} draggable={false} />;
}
