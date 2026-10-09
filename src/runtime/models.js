// Centixio procedural model library.
// Original geometry authored for this project and released under CC0-1.0.
// Used by the in-app gallery (React Three Fiber) and by generated websites.
//
// buildModel(id, mat, opts) -> { group, parts: [{ name, object, dir: Vector3 }], tick(t, pointer) }
//   mat(role) returns a THREE.Material for one of: "primary", "secondary", "accent", "glass", "emissive", "dark".
import * as THREE from "three";

const V = (x, y, z) => new THREE.Vector3(x, y, z);

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function roundedBox(w, h, d, r, segments = 6) {
  const bevel = Math.min(r, d / 2 - 0.001);
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w - bevel * 2, h - bevel * 2, Math.max(0.001, r - bevel * 0.5)), {
    depth: Math.max(0.001, d - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: segments,
    curveSegments: segments * 2,
  });
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

function mesh(geo, material, name) {
  const m = new THREE.Mesh(geo, material);
  m.name = name;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function part(group, name, object, dir) {
  object.name = name;
  group.add(object);
  return { name, object, dir };
}

function screenTexture(colorA, colorB, kind) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = kind === "watch" ? 256 : 512;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, c.width, c.height);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  g.fillStyle = "#050507";
  g.fillRect(0, 0, c.width, c.height);
  if (kind === "watch") {
    g.translate(128, 128);
    for (let i = 0; i < 60; i++) {
      g.save();
      g.rotate((i / 60) * Math.PI * 2);
      g.fillStyle = i % 5 === 0 ? colorA : "rgba(255,255,255,0.35)";
      g.fillRect(-1.5, -112, 3, i % 5 === 0 ? 16 : 7);
      g.restore();
    }
    g.strokeStyle = colorA;
    g.lineWidth = 6;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, -70);
    g.moveTo(0, 0);
    g.lineTo(52, 30);
    g.stroke();
    g.fillStyle = colorB;
    g.beginPath();
    g.arc(0, 0, 7, 0, Math.PI * 2);
    g.fill();
  } else {
    g.fillStyle = grad;
    g.globalAlpha = 0.9;
    g.fillRect(18, 60, 220, 150);
    g.globalAlpha = 1;
    g.fillStyle = "rgba(255,255,255,0.85)";
    g.fillRect(18, 236, 150, 14);
    g.fillStyle = "rgba(255,255,255,0.35)";
    for (let i = 0; i < 6; i++) g.fillRect(18, 270 + i * 34, 220 - (i % 3) * 40, 18);
    g.fillStyle = colorA;
    g.fillRect(18, 470, 220, 22);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const BUILDERS = {
  "perfume-bottle"(mat, opts) {
    const g = new THREE.Group();
    const parts = [];
    const glass = mesh(roundedBox(1.25, 1.5, 0.62, 0.16, opts.seg), mat("glass"));
    parts.push(part(g, "glass", glass, V(0, -0.35, 0)));
    const liquid = mesh(roundedBox(1.0, 1.05, 0.38, 0.1, opts.seg), mat("accent"));
    liquid.position.y = -0.14;
    parts.push(part(g, "liquid", liquid, V(0, -0.1, 1.1)));
    const collar = mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.18, 6 * opts.seg), mat("secondary"));
    collar.position.y = 0.84;
    parts.push(part(g, "collar", collar, V(0, 0.75, 0)));
    const cap = mesh(roundedBox(0.62, 0.52, 0.62, 0.08, opts.seg), mat("secondary"));
    cap.position.y = 1.18;
    parts.push(part(g, "cap", cap, V(0, 1.3, 0)));
    g.position.y = -0.25;
    return { group: g, parts };
  },

  headphones(mat, opts) {
    const g = new THREE.Group();
    const parts = [];
    const band = new THREE.Group();
    band.add(mesh(new THREE.TorusGeometry(1.0, 0.075, 12 * opts.seg / 4, 48 * opts.seg / 4, Math.PI), mat("primary")));
    const pad = mesh(new THREE.TorusGeometry(0.93, 0.06, 10, 40 * opts.seg / 4, Math.PI * 0.6), mat("dark"));
    pad.rotation.z = Math.PI * 0.2;
    band.add(pad);
    parts.push(part(g, "band", band, V(0, 0.9, 0)));
    const cupGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 12 * opts.seg);
    const capGeo = new THREE.SphereGeometry(0.42, 12 * opts.seg, 8, 0, Math.PI * 2, 0, Math.PI / 2.4);
    for (const side of [-1, 1]) {
      const cup = new THREE.Group();
      const body = mesh(cupGeo, mat("primary"));
      body.rotation.z = Math.PI / 2;
      cup.add(body);
      const cap = mesh(capGeo, mat("secondary"));
      cap.rotation.z = (-side * Math.PI) / 2;
      cap.position.x = side * 0.1;
      cup.add(cap);
      const yoke = mesh(new THREE.BoxGeometry(0.06, 0.5, 0.12), mat("secondary"));
      yoke.position.set(side * 0.02, 0.38, 0);
      cup.add(yoke);
      cup.position.set(side * 1.0, -0.12, 0);
      parts.push(part(g, side < 0 ? "left-cup" : "right-cup", cup, V(side * 0.9, -0.1, 0)));
    }
    const cushions = new THREE.Group();
    for (const side of [-1, 1]) {
      const c = mesh(new THREE.TorusGeometry(0.31, 0.12, 12, 12 * opts.seg), mat("dark"));
      c.rotation.y = Math.PI / 2;
      c.position.set(side * 0.82, -0.12, 0);
      cushions.add(c);
    }
    parts.push(part(g, "cushions", cushions, V(0, -0.2, 0.9)));
    g.position.y = -0.2;
    return { group: g, parts };
  },

  smartwatch(mat, opts, palette) {
    const g = new THREE.Group();
    const parts = [];
    const caseMesh = mesh(roundedBox(0.95, 1.12, 0.32, 0.22, opts.seg), mat("primary"));
    parts.push(part(g, "case", caseMesh, V(0, 0, -0.2)));
    const tex = screenTexture(palette.accent, palette.accent2, "watch");
    const faceMat = new THREE.MeshPhysicalMaterial({ color: 0x111111, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.9, roughness: 0.15, clearcoat: 1 });
    const face = mesh(new THREE.CircleGeometry(0.4, 64), faceMat);
    face.scale.set(1, 1.12, 1);
    face.position.z = 0.165;
    parts.push(part(g, "face", face, V(0, 0, 0.8)));
    const crown = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 24), mat("secondary"));
    crown.rotation.z = Math.PI / 2;
    crown.position.set(0.52, 0.12, 0);
    parts.push(part(g, "crown", crown, V(0.7, 0, 0)));
    const strap = new THREE.Group();
    for (const side of [-1, 1]) {
      const s = mesh(roundedBox(0.62, 0.9, 0.08, 0.04, Math.max(2, opts.seg / 2)), mat("dark"));
      s.position.set(0, side * 0.95, -0.12);
      s.rotation.x = side * 0.32;
      strap.add(s);
    }
    parts.push(part(g, "strap", strap, V(0, 0, -0.9)));
    return { group: g, parts };
  },

  smartphone(mat, opts, palette) {
    const g = new THREE.Group();
    const parts = [];
    const body = mesh(roundedBox(0.78, 1.6, 0.09, 0.11, opts.seg), mat("primary"));
    parts.push(part(g, "body", body, V(0, 0, 0)));
    const tex = screenTexture(palette.accent, palette.accent2, "phone");
    const screenMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0a, map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.85, roughness: 0.08, clearcoat: 1 });
    const screen = mesh(new THREE.ShapeGeometry(roundedRectShape(0.7, 1.52, 0.09), 8), screenMat);
    // ShapeGeometry UVs are in shape units; remap to 0..1.
    const uv = screen.geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 0.7 + 0.5, uv.getY(i) / 1.52 + 0.5);
    screen.position.z = 0.047;
    parts.push(part(g, "screen", screen, V(0, 0, 0.7)));
    const camera = new THREE.Group();
    const island = mesh(roundedBox(0.34, 0.34, 0.04, 0.08, opts.seg), mat("secondary"));
    camera.add(island);
    for (const [x, y] of [[-0.07, 0.07], [0.07, 0.07], [-0.07, -0.07]]) {
      const lens = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 24), mat("glass"));
      lens.rotation.x = Math.PI / 2;
      lens.position.set(x, y, -0.02);
      camera.add(lens);
    }
    camera.position.set(-0.17, 0.56, -0.065);
    parts.push(part(g, "camera", camera, V(0, 0, -0.7)));
    const buttons = new THREE.Group();
    for (const [y, h] of [[0.35, 0.22], [0.05, 0.12]]) {
      const b = mesh(new THREE.BoxGeometry(0.02, h, 0.04), mat("secondary"));
      b.position.set(0.395, y, 0);
      buttons.add(b);
    }
    parts.push(part(g, "buttons", buttons, V(0.6, 0, 0)));
    g.rotation.z = -0.08;
    return { group: g, parts };
  },

  speaker(mat, opts) {
    const g = new THREE.Group();
    const parts = [];
    const body = mesh(new THREE.CylinderGeometry(0.55, 0.58, 1.3, 16 * opts.seg), mat("dark"));
    parts.push(part(g, "body", body, V(0, -0.5, 0)));
    const grille = mesh(new THREE.CylinderGeometry(0.585, 0.605, 1.1, 16 * opts.seg, 1, true), mat("primary"));
    grille.position.y = -0.06;
    parts.push(part(g, "grille", grille, V(0, 0, 0.9)));
    const ring = mesh(new THREE.TorusGeometry(0.5, 0.05, 12, 16 * opts.seg), mat("secondary"));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.66;
    parts.push(part(g, "top-ring", ring, V(0, 0.7, 0)));
    const driver = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16 * opts.seg), mat("emissive"));
    driver.position.y = 0.66;
    parts.push(part(g, "driver", driver, V(0, 1.2, 0)));
    return { group: g, parts };
  },

  ring(mat, opts) {
    const g = new THREE.Group();
    const parts = [];
    const band = mesh(new THREE.TorusGeometry(0.75, 0.11, 16 * opts.seg / 4, 32 * opts.seg), mat("primary"));
    parts.push(part(g, "band", band, V(0, -0.3, 0)));
    const profile = [V(0, -0.32, 0), V(0.3, -0.02, 0), V(0.34, 0.04, 0), V(0.22, 0.16, 0), V(0, 0.18, 0)].map((v) => new THREE.Vector2(v.x, v.y));
    const gemGeo = new THREE.LatheGeometry(profile, 8);
    gemGeo.computeVertexNormals();
    const gem = mesh(gemGeo, mat("glass"));
    gem.material.flatShading = true;
    gem.position.y = 1.02;
    parts.push(part(g, "gem", gem, V(0, 0.9, 0)));
    g.position.y = -0.25;
    return { group: g, parts };
  },

  pavilion(mat) {
    const g = new THREE.Group();
    const parts = [];
    const plinth = mesh(new THREE.BoxGeometry(3.4, 0.16, 2.2), mat("secondary"));
    plinth.position.y = -0.7;
    parts.push(part(g, "plinth", plinth, V(0, -0.6, 0)));
    const columns = new THREE.Group();
    for (const x of [-1.3, -0.45, 0.45, 1.3]) {
      for (const z of [-0.8, 0.8]) {
        const c = mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), mat("dark"));
        c.position.set(x, 0, z);
        columns.add(c);
      }
    }
    parts.push(part(g, "columns", columns, V(0, 0, 0)));
    const roof = mesh(new THREE.BoxGeometry(4.2, 0.1, 2.6), mat("primary"));
    roof.position.set(0.35, 0.65, 0);
    parts.push(part(g, "roof", roof, V(0, 1.0, 0)));
    const glazing = new THREE.Group();
    for (const x of [-0.87, 0, 0.87]) {
      const pane = mesh(new THREE.BoxGeometry(0.8, 1.15, 0.02), mat("glass"));
      pane.position.set(x, 0, 0.8);
      glazing.add(pane);
    }
    parts.push(part(g, "glazing", glazing, V(0, 0, 1.1)));
    g.scale.setScalar(0.62);
    return { group: g, parts };
  },

  "crystal-cluster"(mat, opts) {
    const g = new THREE.Group();
    const parts = [];
    const baseGeo = new THREE.DodecahedronGeometry(0.75, 1);
    baseGeo.scale(1.2, 0.42, 1.0);
    const base = mesh(baseGeo, mat("dark"));
    base.material.flatShading = true;
    base.position.y = -0.62;
    parts.push(part(g, "base", base, V(0, -0.6, 0)));
    const shards = new THREE.Group();
    const rand = mulberry32(7);
    const count = opts.seg >= 6 ? 9 : 6;
    const shardDirs = [];
    for (let i = 0; i < count; i++) {
      const h = 0.6 + rand() * 1.0;
      const r = 0.1 + rand() * 0.1;
      const profile = [new THREE.Vector2(0, 0), new THREE.Vector2(r, 0.05), new THREE.Vector2(r, h), new THREE.Vector2(0, h + r * 2.2)];
      const geo = new THREE.LatheGeometry(profile, 6);
      const s = mesh(geo, mat(i % 3 === 0 ? "emissive" : "glass"));
      s.material.flatShading = true;
      const angle = (i / count) * Math.PI * 2 + rand();
      const tilt = i === 0 ? 0 : 0.25 + rand() * 0.45;
      s.position.set(Math.cos(angle) * 0.25 * (i ? 1 : 0), -0.45, Math.sin(angle) * 0.25 * (i ? 1 : 0));
      s.rotation.set(Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt);
      shards.add(s);
      shardDirs.push(new THREE.Vector3(Math.cos(angle) * tilt, 0.3, Math.sin(angle) * tilt));
    }
    const shardPart = part(g, "shards", shards, V(0, 0.4, 0));
    shardPart.childDirs = shardDirs;
    parts.push(shardPart);
    return { group: g, parts };
  },

  "torus-knot"(mat, opts) {
    const g = new THREE.Group();
    const knot = mesh(new THREE.TorusKnotGeometry(0.72, 0.22, 64 * opts.seg / 2, 8 * opts.seg / 2), mat("primary"));
    const parts = [part(g, "knot", knot, V(0, 0, 0))];
    return { group: g, parts, tick: (t) => { knot.rotation.x = t * 0.15; } };
  },

  "liquid-orb"(mat, opts) {
    const g = new THREE.Group();
    const geo = new THREE.IcosahedronGeometry(1, opts.seg * 3);
    const base = geo.attributes.position.array.slice();
    const orb = mesh(geo, mat("primary"));
    const parts = [part(g, "orb", orb, V(0, 0, 0))];
    const pos = geo.attributes.position;
    let frame = 0;
    const tick = (t, pointer) => {
      // Update every frame on high quality, every other frame otherwise.
      frame++;
      if (opts.seg < 6 && frame % 2) return;
      const px = pointer ? pointer.x : 0;
      const py = pointer ? pointer.y : 0;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const n = Math.sin(x * 2.4 + t * 0.9) * Math.cos(y * 2.1 + t * 0.7) * Math.sin(z * 2.2 + t * 0.8);
        const pull = (x * px + y * py) * 0.06;
        const d = 1 + n * 0.14 + pull;
        pos.setXYZ(i, x * d, y * d, z * d);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    };
    return { group: g, parts, tick };
  },

  "wave-field"(mat, opts, palette) {
    const g = new THREE.Group();
    const n = opts.seg >= 6 ? 110 : opts.seg >= 4 ? 80 : 50;
    const positions = new Float32Array(n * n * 3);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const k = (i * n + j) * 3;
        positions[k] = (i / (n - 1) - 0.5) * 6;
        positions[k + 2] = (j / (n - 1) - 0.5) * 6;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: new THREE.Color(palette.accent), size: opts.seg >= 6 ? 0.028 : 0.04, sizeAttenuation: true, transparent: true, opacity: 0.9 });
    const points = new THREE.Points(geo, material);
    points.position.y = -0.5;
    const parts = [part(g, "field", points, V(0, 0, 0))];
    const pos = geo.attributes.position;
    const tick = (t, pointer) => {
      const px = pointer ? pointer.x * 3 : 0;
      const pz = pointer ? -pointer.y * 3 : 0;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const dist = Math.hypot(x - px, z - pz);
        const y = Math.sin(x * 1.2 + t * 0.8) * 0.18 + Math.cos(z * 1.4 + t * 0.6) * 0.18 + Math.exp(-dist * 1.5) * 0.35;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    };
    return { group: g, parts, tick };
  },

  "monolith-stack"(mat, opts) {
    const g = new THREE.Group();
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const slab = mesh(roundedBox(1.6, 0.16, 1.1, 0.05, Math.max(2, opts.seg / 2)), mat(i === 2 ? "accent" : i % 2 ? "secondary" : "primary"));
      slab.position.y = (i - 2) * 0.24;
      slab.rotation.y = (i - 2) * 0.08;
      parts.push(part(g, `slab-${i + 1}`, slab, V(0, (i - 2) * 0.42, 0)));
    }
    return { group: g, parts };
  },
};

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MODEL_IDS = Object.keys(BUILDERS);

/** quality: "low" | "medium" | "high" */
export function buildModel(id, mat, { quality = "medium", palette } = {}) {
  const builder = BUILDERS[id] || BUILDERS["torus-knot"];
  const seg = quality === "high" ? 8 : quality === "medium" ? 6 : 3;
  const pal = palette || { accent: "#F2B84B", accent2: "#60A5FA" };
  const result = builder(mat, { seg }, pal);
  for (const p of result.parts) p.origin = p.object.position.clone();
  if (!result.tick) result.tick = () => {};
  return result;
}

/** Apply an exploded-view amount 0..1 to the parts returned by buildModel. */
export function applyExplode(parts, amount) {
  const ease = amount * amount * (3 - 2 * amount);
  for (const p of parts) {
    p.object.position.copy(p.origin).addScaledVector(p.dir, ease);
    if (p.childDirs) {
      p.object.children.forEach((child, i) => {
        if (!child.userData.origin) child.userData.origin = child.position.clone();
        child.position.copy(child.userData.origin).addScaledVector(p.childDirs[i], ease * 1.4);
      });
    }
  }
}
