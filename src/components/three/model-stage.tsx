"use client";
/* eslint-disable react-hooks/immutability -- three.js scene graphs are mutable by design; R3F mutates them in effects and useFrame. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { applyExplode, buildModel } from "@/runtime/models.js";
import { addLighting, createMaterialFactory } from "@/runtime/materials.js";
import { getModel } from "@/lib/catalog/models";
import type { Palette } from "@/lib/spec/schema";

export interface ModelStageProps {
  modelId: string;
  palette: Palette;
  material?: string;
  lighting?: string;
  autoRotate?: boolean;
  interactive?: boolean;
  explode?: number;
  quality?: "low" | "medium" | "high";
  className?: string;
  label?: string;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    return () => {
      env.dispose();
      pmrem.dispose();
      scene.environment = null;
    };
  }, [gl, scene]);
  return null;
}

function Lights({ preset, palette }: { preset: string; palette: Palette }) {
  const { scene } = useThree();
  useEffect(() => {
    const before = new Set(scene.children);
    const intensity = addLighting(scene, preset, palette);
    scene.environmentIntensity = intensity;
    const added = scene.children.filter((c) => !before.has(c));
    return () => added.forEach((o) => scene.remove(o));
  }, [scene, preset, palette]);
  return null;
}

function Subject({ modelId, palette, material, quality, autoRotate, explode }: Required<Pick<ModelStageProps, "modelId" | "palette" | "material" | "quality" | "autoRotate" | "explode">>) {
  const built = useMemo(() => {
    const def = getModel(modelId);
    const factory = createMaterialFactory(material, def?.defaultMaterial ?? "satin-plastic", palette);
    const m = buildModel(modelId, factory, { quality, palette });
    const box = new THREE.Box3().setFromObject(m.group);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const wrap = new THREE.Group();
    wrap.add(m.group);
    wrap.position.copy(sphere.center).multiplyScalar(-1);
    const scale = 1.25 / Math.max(sphere.radius, 0.01);
    const outer = new THREE.Group();
    outer.add(wrap);
    outer.scale.setScalar(scale);
    return { ...m, outer };
  }, [modelId, palette, material, quality]);
  useEffect(
    () => () => {
      built.outer.traverse((o) => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
      });
    },
    [built],
  );
  const reduced = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (!reduced) {
      if (autoRotate) built.group.rotation.y = t * 0.35;
      built.tick(t, null);
    }
    if (built.parts.length > 1) applyExplode(built.parts, explode);
  });
  return <primitive object={built.outer} />;
}

/** Genuine interactive WebGL view of a catalog model, using the same builders as exported sites. */
export function ModelStage({ modelId, palette, material = "auto", lighting = "studio", autoRotate = true, interactive = true, explode = 0, quality = "medium", className, label }: ModelStageProps) {
  return (
    <div className={className} role="img" aria-label={label ?? `Interactive 3D preview: ${getModel(modelId)?.name ?? modelId}`}>
      <Canvas
        dpr={[1, quality === "high" ? 2 : 1.5]}
        camera={{ position: [2.4, 1.2, 3.2], fov: 35 }}
        gl={{ antialias: true, alpha: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
      >
        <Environment />
        <Lights preset={lighting === "auto" ? "studio" : lighting} palette={palette} />
        <Subject modelId={modelId} palette={palette} material={material} quality={quality} autoRotate={autoRotate} explode={explode} />
        <ContactShadows position={[0, -1.3, 0]} opacity={0.55} scale={7} blur={2.6} far={3} resolution={512} color="#000000" />
        {interactive && <OrbitControls enablePan={false} enableZoom={false} enableDamping minPolarAngle={0.5} maxPolarAngle={2.3} />}
      </Canvas>
    </div>
  );
}
