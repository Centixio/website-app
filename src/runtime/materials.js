// Material and lighting presets shared by the app gallery and generated sites.
import * as THREE from "three";

const PRESETS = {
  // Reflective glass without a transmission pass: cheaper on mobile and reads cleanly on transparent backgrounds.
  glass: (c) => new THREE.MeshPhysicalMaterial({ color: c.tint, metalness: 0.05, roughness: 0.03, transparent: true, opacity: 0.36, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.03, specularIntensity: 1, ior: 1.5, depthWrite: false }),
  chrome: (c) => new THREE.MeshPhysicalMaterial({ color: c.light, metalness: 1, roughness: 0.06, clearcoat: 0.6 }),
  "brushed-metal": (c) => new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 0.9, roughness: 0.32, anisotropy: 0.6, clearcoat: 0.2 }),
  gold: () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color("#E3B866"), metalness: 1, roughness: 0.18, clearcoat: 0.4 }),
  "satin-plastic": (c) => new THREE.MeshPhysicalMaterial({ color: c.base, metalness: 0, roughness: 0.45, clearcoat: 0.3, sheen: 0.4, sheenColor: c.light }),
  ceramic: (c) => new THREE.MeshPhysicalMaterial({ color: c.ceramic, metalness: 0, roughness: 0.22, clearcoat: 0.9, clearcoatRoughness: 0.2 }),
  "matte-clay": (c) => new THREE.MeshStandardMaterial({ color: c.base, metalness: 0, roughness: 0.92 }),
  iridescent: (c) => new THREE.MeshPhysicalMaterial({ color: c.light.clone().lerp(c.accent, 0.45), metalness: 0.55, roughness: 0.12, iridescence: 1, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 900], clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.6, sheenColor: c.accent2 }),
};

export const MATERIAL_IDS = Object.keys(PRESETS);

function colorsFrom(palette) {
  const accent = new THREE.Color(palette.accent);
  const accent2 = new THREE.Color(palette.accent2);
  const bg = new THREE.Color(palette.background);
  const bgLum = bg.r * 0.2126 + bg.g * 0.7152 + bg.b * 0.0722;
  return {
    accent,
    accent2,
    tint: new THREE.Color("#ffffff").lerp(accent, 0.18),
    light: new THREE.Color("#f2f2f2"),
    // Metals pick up the brand accent (champagne for gold palettes, cool steel for blue ones).
    metal: new THREE.Color("#c9ccd2").lerp(accent, 0.38),
    // Liquids and accent parts read richer as a deeper shade of the accent.
    deep: accent.clone().lerp(new THREE.Color("#2a1406"), 0.38),
    ceramic: new THREE.Color(bgLum > 0.5 ? "#f4f1ea" : "#ece7dd"),
    base: bgLum > 0.5 ? new THREE.Color("#2a2a2e") : new THREE.Color("#d9d4cb").lerp(accent, 0.15),
    dark: new THREE.Color("#141416"),
  };
}

/**
 * Returns mat(role) for buildModel. `preset` applies to the "primary" role;
 * "auto" uses the model's own default material.
 */
export function createMaterialFactory(preset, modelDefault, palette) {
  const c = colorsFrom(palette);
  const primaryId = preset && preset !== "auto" && PRESETS[preset] ? preset : PRESETS[modelDefault] ? modelDefault : "satin-plastic";
  return (role) => {
    switch (role) {
      case "primary":
        return PRESETS[primaryId](c);
      case "secondary":
        return primaryId === "gold" ? PRESETS.chrome(c) : new THREE.MeshPhysicalMaterial({ color: c.metal, metalness: 0.85, roughness: 0.25 });
      case "accent":
        return primaryId === "glass"
          ? new THREE.MeshPhysicalMaterial({ color: c.deep, metalness: 0.05, roughness: 0.12, emissive: c.deep, emissiveIntensity: 0.35, clearcoat: 1 })
          : new THREE.MeshPhysicalMaterial({ color: c.accent, metalness: 0.1, roughness: 0.25, emissive: c.accent, emissiveIntensity: 0.04, clearcoat: 0.6 });
      case "glass":
        return PRESETS.glass(c);
      case "emissive":
        return new THREE.MeshStandardMaterial({ color: c.accent, emissive: c.accent, emissiveIntensity: 1.4, roughness: 0.4 });
      case "dark":
      default:
        return new THREE.MeshStandardMaterial({ color: c.dark, metalness: 0.2, roughness: 0.6 });
    }
  };
}

/** Adds lights for a preset and returns the environment intensity to use. */
export function addLighting(scene, preset, palette) {
  const accent = new THREE.Color(palette.accent);
  const accent2 = new THREE.Color(palette.accent2);
  const add = (light, x, y, z) => {
    light.position.set(x, y, z);
    scene.add(light);
    return light;
  };
  switch (preset) {
    case "golden-hour":
      scene.add(new THREE.HemisphereLight(0xffe2b8, 0x20140a, 0.6));
      add(new THREE.DirectionalLight(0xffc27a, 2.6), -4, 2.5, 3);
      add(new THREE.DirectionalLight(0x8fa8ff, 0.6), 4, 1, -3);
      return 0.7;
    case "moody-rim":
      scene.add(new THREE.AmbientLight(0xffffff, 0.08));
      add(new THREE.DirectionalLight(0xffffff, 1.4), 2, 3, 4);
      add(new THREE.DirectionalLight(accent, 3.2), -3, 1.5, -3);
      add(new THREE.DirectionalLight(accent2, 1.6), 3, -1, -3);
      return 0.45;
    case "neon-dual":
      scene.add(new THREE.AmbientLight(0xffffff, 0.12));
      add(new THREE.PointLight(accent, 30, 12), -2.5, 1.5, 2);
      add(new THREE.PointLight(accent2, 30, 12), 2.5, -1, 2);
      add(new THREE.DirectionalLight(0xffffff, 0.5), 0, 4, 2);
      return 0.35;
    case "daylight":
      scene.add(new THREE.HemisphereLight(0xffffff, 0xbfc6d1, 1.1));
      add(new THREE.DirectionalLight(0xffffff, 2.2), 3, 5, 4);
      return 0.9;
    case "gallery":
      scene.add(new THREE.AmbientLight(0xffffff, 0.25));
      for (const x of [-2, 2]) {
        const spot = add(new THREE.SpotLight(0xfff4e5, 40, 12, Math.PI / 7, 0.5, 1.2), x, 4, 3);
        spot.target.position.set(0, 0, 0);
        scene.add(spot.target);
      }
      return 0.6;
    case "studio":
    default:
      scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.7));
      add(new THREE.DirectionalLight(0xffffff, 2.2), 3, 4, 5);
      add(new THREE.DirectionalLight(0xffffff, 0.8), -4, 2, -2);
      return 1.0;
  }
}
