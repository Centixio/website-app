// Product films for the sample sites: pre-rendered, scroll-scrubbed hero
// sequences (Apple-style). They complement — not replace — each site's
// real-time WebGL scene: the film carries the heavy, cinematic shot; the
// interactive model stays live for pointer play.
import { THREE, cameraMove, clay, physical, mesh, keyLights, rng, ease } from "./studio.js";
import { buildModel, applyExplode } from "../../src/runtime/models.js";

export const PRODUCT_FILMS = {
  nocturne: { seconds: 9, studio: { background: "#0A0907", bloom: 0.28, aperture: 0.0007, ao: true } },
  halcyon: { seconds: 9, studio: { background: "#07070A", bloom: 0.22, aperture: 0.0006, ao: true } },
  shardfall: { seconds: 9, studio: { background: "#05060B", bloom: 0.42, aperture: 0.0007, ao: false } },
  arcos: { seconds: 10, studio: { background: "#E9E2D6", bloom: 0.12, aperture: 0.0004, ao: true } },
};

function floor(color, rough = 0.35) {
  const f = mesh(new THREE.CircleGeometry(30, 96), physical({ color, roughness: rough, metalness: 0.1, clearcoat: 0.35, envMapIntensity: 0.12 }), { cast: false });
  f.rotation.x = -Math.PI / 2;
  return f;
}

function dust(count, spread, color, seed) {
  const r = rng(seed);
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0045, 6, 5), clay(color, { emissive: color, intensity: 1.1 }), count);
  const base = [];
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const p = [(r() - 0.5) * spread, r() * spread * 0.6, (r() - 0.5) * spread];
    base.push(p);
    m4.makeTranslation(...p);
    inst.setMatrixAt(i, m4);
  }
  inst.castShadow = false;
  return {
    mesh: inst,
    update(t) {
      for (let i = 0; i < count; i++) {
        const [x, y, z] = base[i];
        m4.makeTranslation(x + Math.sin(t * 0.3 + i) * 0.06, y + ((t * 0.04 + i * 0.013) % 0.6), z + Math.cos(t * 0.25 + i) * 0.06);
        inst.setMatrixAt(i, m4);
      }
      inst.instanceMatrix.needsUpdate = true;
    },
  };
}

function nocturne(studio) {
  const s = studio.scene;
  s.fog = new THREE.Fog("#0A0907", 8, 26);
  s.environmentIntensity = 0.55;
  s.add(floor("#070605", 0.28));
  const amber = new THREE.Color("#8A4E17");
  const mat = (role) => {
    switch (role) {
      case "glass":
        return physical({ color: "#fff4e4", transmission: 1, thickness: 2.2, roughness: 0.015, ior: 1.55, clearcoat: 1, specularIntensity: 1, attenuationColor: new THREE.Color("#E9CFA3"), attenuationDistance: 1.6 });
      case "accent":
        // Opaque: three.js transmission can't see other transmissive meshes, so the liquid must be solid to read through the glass.
        return physical({ color: amber, roughness: 0.08, clearcoat: 1, emissive: new THREE.Color("#5A2A06"), emissiveIntensity: 0.4 });
      case "secondary":
        return physical({ color: "#D9B36A", metalness: 1, roughness: 0.2, clearcoat: 0.5 });
      default:
        return physical({ color: "#C9A25A", metalness: 1, roughness: 0.28 });
    }
  };
  const m = buildModel("perfume-bottle", mat, { quality: "high", palette: { accent: "#D4AF6A", accent2: "#8C6B3F" } });
  m.group.scale.setScalar(1.15);
  m.group.position.y = 1.05;
  m.group.traverse((o) => o.isMesh && (o.castShadow = true));
  s.add(m.group);
  const { sun, rim, hemi } = keyLights(s, { warm: "#FFC98A", cool: "#E2B571", intensity: 0.7 });
  hemi.intensity = 0.08;
  sun.intensity = 0.55;
  sun.position.set(-4, 9, 5);
  const key = new THREE.SpotLight("#FFE2B8", 22, 14, Math.PI / 9, 0.8, 1.3);
  key.position.set(1.5, 6.5, 4.5);
  key.target.position.set(0, 1.4, 0);
  key.castShadow = true;
  s.add(key, key.target);
  rim.position.set(5, 3, -6);
  rim.intensity = 2.4;
  const back = new THREE.SpotLight("#FFB65C", 26, 12, Math.PI / 7, 0.7, 1.4);
  back.position.set(0, 4.5, -4);
  back.target.position.set(0, 1.2, 0);
  s.add(back, back.target);
  const motes = dust(140, 5, "#FFD9A0", 3);
  s.add(motes.mesh);
  const move = cameraMove({
    pos: [[0.6, 6.4, 2.2], [3.2, 4.0, 3.8], [3.4, 2.1, 5.0], [0.9, 1.35, 6.4]],
    target: [[0, 1.6, 0], [0, 1.5, 0], [0, 1.4, 0], [0, 1.5, 0]],
    fov: [30, 28],
    focus: [5.0, 6.3],
    easing: ease.inOut,
  });
  return { move, update: (t) => { m.group.rotation.y = 0.4 + t * 0.12; motes.update(t); } };
}

function halcyon(studio) {
  const s = studio.scene;
  s.fog = new THREE.Fog("#07070A", 6, 16);
  s.environmentIntensity = 0.4;
  s.add(floor("#050507", 0.45));
  const mat = (role) => {
    switch (role) {
      case "primary":
        return physical({ color: "#CFC9BE", roughness: 0.45, clearcoat: 0.3, sheen: 0.4, sheenColor: new THREE.Color("#ffffff") });
      case "secondary":
        return physical({ color: "#BFC3CC", metalness: 1, roughness: 0.22 });
      case "dark":
        return physical({ color: "#1A1A1E", roughness: 0.7, sheen: 0.8, sheenColor: new THREE.Color("#444") });
      default:
        return physical({ color: "#E8B567", metalness: 0.6, roughness: 0.3 });
    }
  };
  const m = buildModel("headphones", mat, { quality: "high", palette: { accent: "#E8B567", accent2: "#6E7BFF" } });
  m.group.scale.setScalar(1.1);
  m.group.position.y = 1.2;
  m.group.traverse((o) => o.isMesh && (o.castShadow = true));
  s.add(m.group);
  const { sun, rim, hemi } = keyLights(s, { warm: "#FFFFFF", cool: "#6E7BFF", intensity: 0.6 });
  hemi.intensity = 0.06;
  sun.intensity = 0.7;
  sun.position.set(3, 8, 6);
  rim.position.set(-4, 2.5, -5);
  rim.intensity = 3;
  const warm = new THREE.DirectionalLight("#E8B567", 0.9);
  warm.position.set(5, 3.5, -3);
  s.add(warm);
  const move = cameraMove({
    pos: [[-4.6, 1.8, 4.4], [-1.2, 2.9, 6.0], [3.4, 2.3, 5.0], [5.6, 1.5, 1.4]],
    target: [[0, 1.2, 0], [0, 1.25, 0], [0, 1.2, 0], [0, 1.2, 0]],
    fov: [32, 30],
    easing: ease.inOut,
  });
  return {
    move,
    update: (t, u) => {
      // explode through the middle third, then reassemble
      const e = u < 0.28 ? 0 : u < 0.55 ? ease.inOut((u - 0.28) / 0.27) : u < 0.72 ? 1 : 1 - ease.inOut((u - 0.72) / 0.28);
      applyExplode(m.parts, e * 0.85);
      m.group.rotation.y = -0.3 + u * 0.4;
    },
  };
}

function shardfall(studio) {
  const s = studio.scene;
  s.fog = new THREE.FogExp2("#05060B", 0.09);
  s.add(floor("#05060A", 0.6));
  const cyan = new THREE.Color("#38F2D0");
  const purple = new THREE.Color("#A855F7");
  const mat = (role) => {
    switch (role) {
      case "emissive":
        return clay("#38F2D0", { emissive: "#38F2D0", intensity: 0.75, rough: 0.3 });
      case "glass":
        return physical({ color: "#C9B8FF", transmission: 0.6, thickness: 0.5, roughness: 0.08, iridescence: 1, iridescenceIOR: 1.7, emissive: purple, emissiveIntensity: 0.15, flatShading: true });
      default:
        return new THREE.MeshStandardMaterial({ color: "#1B1D2A", roughness: 0.9, flatShading: true });
    }
  };
  const r = rng(11);
  const hero = buildModel("crystal-cluster", mat, { quality: "high", palette: { accent: "#38F2D0", accent2: "#A855F7" } });
  hero.group.scale.setScalar(1.6);
  hero.group.position.set(0, 1.0, 0);
  s.add(hero.group);
  for (let i = 0; i < 26; i++) {
    const c = buildModel("crystal-cluster", mat, { quality: "medium", palette: { accent: "#38F2D0", accent2: "#A855F7" } });
    const a = r() * Math.PI * 2;
    const d = 3 + r() * 9;
    c.group.position.set(Math.cos(a) * d, 0.4, -Math.abs(Math.sin(a) * d) - 1 + (i % 3) * 2);
    c.group.scale.setScalar(0.5 + r() * 0.9);
    c.group.rotation.y = r() * 6;
    s.add(c.group);
  }
  s.environmentIntensity = 0.3;
  const p1 = new THREE.PointLight(cyan, 18, 10, 1.6);
  p1.position.set(-2.4, 2.4, 1.8);
  const p2 = new THREE.PointLight(purple, 24, 12, 1.6);
  p2.position.set(2.6, 1.6, -1.6);
  const top = new THREE.DirectionalLight("#9fb2ff", 0.6);
  top.position.set(0, 10, 2);
  s.add(p1, p2, top, new THREE.AmbientLight("#ffffff", 0.06));
  const motes = dust(260, 12, "#7FFFE6", 9);
  s.add(motes.mesh);
  const move = cameraMove({
    pos: [[-7.5, 1.6, -8.5], [-4.6, 1.0, -3.6], [-2.6, 0.8, 2.4], [1.4, 0.55, 5.2]],
    target: [[-3, 0.9, -3], [-1.2, 1.0, -0.6], [0, 1.3, 0], [0, 1.9, 0]],
    fov: [38, 34],
    easing: ease.inOut,
  });
  return {
    move,
    update: (t) => {
      hero.group.rotation.y = t * 0.15;
      p1.intensity = 18 + Math.sin(t * 2.1) * 4;
      motes.update(t);
    },
  };
}

function arcos(studio) {
  const s = studio.scene;
  s.background = new THREE.Color("#E9E2D6");
  s.fog = new THREE.Fog("#E9E2D6", 14, 40);
  s.environmentIntensity = 0.5;
  const ground = mesh(new THREE.CircleGeometry(40, 96), new THREE.MeshStandardMaterial({ color: "#D8CFBF", roughness: 0.95 }), { cast: false });
  ground.rotation.x = -Math.PI / 2;
  s.add(ground);
  const water = mesh(new THREE.PlaneGeometry(9, 4), physical({ color: "#9FB3B8", roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 0.8 }), { cast: false });
  water.rotation.x = -Math.PI / 2;
  water.position.set(0.8, 0.012, 3.4);
  s.add(water);
  const mat = (role) => {
    switch (role) {
      case "glass":
        return physical({ color: "#dfe8ea", transmission: 0.9, thickness: 0.05, roughness: 0.04, ior: 1.5 });
      case "dark":
        return new THREE.MeshStandardMaterial({ color: "#3B3631", roughness: 0.5, metalness: 0.4 });
      case "secondary":
        return new THREE.MeshStandardMaterial({ color: "#BDB2A0", roughness: 0.9 });
      default:
        return new THREE.MeshStandardMaterial({ color: "#EDE7DC", roughness: 0.85 });
    }
  };
  const m = buildModel("pavilion", mat, { quality: "high", palette: { accent: "#C2410C", accent2: "#1F2937" } });
  m.group.scale.setScalar(2.2);
  m.group.position.y = 1.55;
  m.group.traverse((o) => o.isMesh && ((o.castShadow = true), (o.receiveShadow = true)));
  s.add(m.group);
  const r = rng(5);
  for (let i = 0; i < 14; i++) {
    const t = new THREE.Group();
    const trunk = mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.4, 8), new THREE.MeshStandardMaterial({ color: "#5C4A3A", roughness: 0.9 }));
    trunk.position.y = 0.7;
    const crown = mesh(new THREE.IcosahedronGeometry(0.7 + r() * 0.4, 1), new THREE.MeshStandardMaterial({ color: "#7E8F6A", roughness: 0.95, flatShading: true }));
    crown.position.y = 1.7;
    crown.scale.y = 1.3;
    t.add(trunk, crown);
    const a = r() * Math.PI * 2;
    const d = 7 + r() * 8;
    t.position.set(Math.cos(a) * d, 0, -Math.abs(Math.sin(a)) * d - 2);
    t.scale.setScalar(0.8 + r() * 0.8);
    s.add(t);
  }
  const { sun, hemi, rim } = keyLights(s, { warm: "#FFD2A0", cool: "#AFC3E8", intensity: 1 });
  hemi.intensity = 0.55;
  sun.intensity = 2.6;
  sun.position.set(-14, 9, 6);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  rim.intensity = 0.4;
  const move = cameraMove({
    pos: [[-13.5, 3.2, 12.5], [-3.5, 2.4, 15.0], [8.5, 3.0, 11.5], [13.5, 2.2, 3.5]],
    target: [[0, 1.4, 0], [0, 1.4, 0], [0, 1.4, 0], [0, 1.6, 0]],
    fov: [30, 32],
    easing: ease.sine,
  });
  return {
    move,
    update: (t, u) => {
      // light travels from afternoon to golden hour across the film
      sun.position.set(-14 + u * 8, 9 - u * 5, 6 + u * 2);
      sun.color.set("#FFE2BE").lerp(new THREE.Color("#FFB070"), u);
    },
  };
}

const BUILDERS = { nocturne, halcyon, shardfall, arcos };

export function buildProductFilm(id, studio, { portrait = false } = {}) {
  const spec = PRODUCT_FILMS[id];
  const scene = BUILDERS[id](studio);
  const segments = [{ name: "film", kind: "clip", seconds: spec.seconds, start: 0 }];
  return {
    segments,
    frame(seg, u) {
      const t = u * seg.seconds;
      scene.update(t, u);
      const cam = scene.move.sample(u);
      if (portrait) {
        cam.fov = Math.min(64, cam.fov * 1.65);
        const dist = cam.look.distanceTo(cam.position);
        cam.look = cam.look.clone().add(new THREE.Vector3(0, -dist * 0.08, 0));
      }
      studio.setCamera(cam);
    },
  };
}
