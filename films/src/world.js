// "The Centixio world": five floating clay islands — Describe, Direct,
// Generate, Refine, Ship — connected by one continuous camera flight
// (scroll-world architecture B: a dive into each island, then an aerial
// connector that pulls up and hops to the next). Seams are frame-identical by
// construction: a connector starts on the exact pose (and world time) where
// the previous dive ends, and ends on the exact pose where the next begins.
import { THREE, cameraMove, clay, physical, mesh, roundedBox, island, person, canvasTexture, roundRect, keyLights, rng, ease } from "./studio.js";
import { buildModel } from "../../src/runtime/models.js";
import { createMaterialFactory } from "../../src/runtime/materials.js";

const INK = "#0B0B0D";
const IVORY = "#E6DDCC";
const AMBER = "#F2B84B";
const TERRA = "#C8734B";
const SAGE = "#8FA98A";
const SLATE = "#5B6F8C";
const PLUM = "#6E5A7E";
const WOOD = "#B88A5E";

const PALETTE = { background: INK, surface: "#16130F", text: IVORY, muted: "#A69A86", accent: AMBER, accent2: SLATE };

export const DIVE_SECONDS = 7;
export const CONNECTOR_SECONDS = 4.5;

const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif";

// ---------------------------------------------------------------- props

function plant(scale = 1, seed = 1) {
  const r = rng(seed);
  const g = new THREE.Group();
  const pot = mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.26, 20), clay(TERRA));
  pot.position.y = 0.13;
  g.add(pot);
  for (let i = 0; i < 5; i++) {
    const leaf = mesh(new THREE.SphereGeometry(0.14 + r() * 0.06, 12, 10), clay(i % 2 ? SAGE : "#6E8C69"));
    leaf.position.set((r() - 0.5) * 0.22, 0.38 + r() * 0.22, (r() - 0.5) * 0.22);
    leaf.scale.y = 1.3;
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

function tree(scale = 1, seed = 2) {
  const r = rng(seed);
  const g = new THREE.Group();
  const trunk = mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 8), clay("#6B4E3A"));
  trunk.position.y = 0.35;
  g.add(trunk);
  for (let i = 0; i < 3; i++) {
    const c = mesh(new THREE.IcosahedronGeometry(0.34 - i * 0.07, 1), new THREE.MeshStandardMaterial({ color: i ? SAGE : "#728F6D", roughness: 0.9, flatShading: true }));
    c.position.set((r() - 0.5) * 0.1, 0.78 + i * 0.26, (r() - 0.5) * 0.1);
    g.add(c);
  }
  g.scale.setScalar(scale);
  return g;
}

function lamp() {
  const g = new THREE.Group();
  const base = mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.04, 20), clay(INK, { rough: 0.5 }));
  g.add(base);
  const arm = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.62, 8), clay("#2A2A2E", { rough: 0.4, metal: 0.6 }));
  arm.position.set(0.08, 0.31, 0);
  arm.rotation.z = -0.25;
  g.add(arm);
  const shade = mesh(new THREE.ConeGeometry(0.14, 0.16, 20, 1, true), clay(AMBER, { rough: 0.6 }));
  shade.position.set(0.2, 0.62, 0);
  shade.rotation.z = 0.6;
  g.add(shade);
  const bulb = mesh(new THREE.SphereGeometry(0.045, 12, 10), clay("#FFF4D6", { emissive: "#FFD58A", intensity: 3 }), { cast: false });
  bulb.position.set(0.22, 0.58, 0);
  g.add(bulb);
  const light = new THREE.PointLight("#FFC978", 1.6, 4, 1.6);
  light.position.copy(bulb.position);
  g.add(light);
  return g;
}

function speechBubble(text, w = 0.9) {
  const tex = canvasTexture(512, 220, (c, W, H) => {
    c.fillStyle = IVORY;
    roundRect(c, 4, 4, W - 8, H - 50, 46);
    c.fill();
    c.beginPath();
    c.moveTo(80, H - 48);
    c.lineTo(60, H - 4);
    c.lineTo(130, H - 48);
    c.fill();
    c.fillStyle = "#2A2420";
    c.font = `italic 46px ${SERIF}`;
    c.textBaseline = "middle";
    c.fillText(text, 36, (H - 46) / 2);
  });
  const m = mesh(new THREE.PlaneGeometry(w, (w * 220) / 512), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.85, side: THREE.DoubleSide }), { cast: true, receive: false });
  return m;
}

function screenTexture(kind) {
  return canvasTexture(1024, 640, (c, W, H) => {
    c.fillStyle = "#15120F";
    c.fillRect(0, 0, W, H);
    if (kind === "chat") {
      c.fillStyle = "#211C18";
      c.fillRect(0, 0, 300, H);
      c.fillStyle = AMBER;
      c.beginPath();
      c.arc(40, 40, 14, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#3A322B";
      for (let i = 0; i < 5; i++) {
        roundRect(c, 24, 90 + i * 48, 240 - (i % 2) * 60, 26, 8);
        c.fill();
      }
      const bubbles = [
        [340, 60, 560, "A launch site for a perfume"],
        [440, 170, 520, "called “Nocturne”. Warm,"],
        [340, 290, 600, "nocturnal, quietly luxurious."],
      ];
      for (const [x, y, w, t] of bubbles) {
        c.fillStyle = x > 400 ? "#2C2620" : "#F2B84B33";
        roundRect(c, x, y, w, 84, 24);
        c.fill();
        c.fillStyle = "#F3EFE6";
        c.font = `34px ${SANS}`;
        c.fillText(t, x + 26, y + 54);
      }
      c.fillStyle = "#2C2620";
      roundRect(c, 340, H - 110, 640, 70, 20);
      c.fill();
      c.fillStyle = AMBER;
      roundRect(c, 900, H - 100, 64, 50, 14);
      c.fill();
    } else if (kind === "site") {
      const g = c.createRadialGradient(W * 0.68, H * 0.5, 20, W * 0.68, H * 0.5, 420);
      g.addColorStop(0, "#4A3420");
      g.addColorStop(1, "#0D0B09");
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.fillStyle = "#F3EBDD";
      c.font = `italic 78px ${SERIF}`;
      c.fillText("Composed for", 70, 250);
      c.fillText("the night.", 70, 340);
      c.fillStyle = "#D4AF6A";
      roundRect(c, 70, 400, 240, 64, 32);
      c.fill();
      c.fillStyle = "#16130F";
      c.font = `28px ${SANS}`;
      c.fillText("Discover", 130, 442);
      c.fillStyle = "#D4AF6A";
      c.fillRect(70, 60, 140, 8);
      // bottle silhouette
      c.fillStyle = "#E9D9B8AA";
      roundRect(c, 640, 210, 200, 300, 40);
      c.fill();
      c.fillStyle = "#D4AF6A";
      roundRect(c, 690, 140, 100, 80, 14);
      c.fill();
    } else if (kind === "versions") {
      c.fillStyle = "#F3EFE6";
      c.font = `30px ${SANS}`;
      c.fillText("Versions", 60, 80);
      for (let i = 0; i < 4; i++) {
        const y = 140 + i * 110;
        c.fillStyle = i === 3 ? "#F2B84B" : "#3A322B";
        roundRect(c, 60, y, 900, 80, 18);
        c.fill();
        c.fillStyle = i === 3 ? "#16130F" : "#F3EFE6";
        c.font = `30px ${SANS}`;
        c.fillText(`v${i + 1}  ·  ${["generate", "more dramatic scroll", "black and gold", "pricing section"][i]}`, 90, y + 50);
      }
    }
  });
}

function screen(kind, w = 1.2) {
  const g = new THREE.Group();
  const bezel = mesh(roundedBox(w + 0.06, (w * 0.625) + 0.06, 0.05, 0.03), clay("#1E1B1F", { rough: 0.35, metal: 0.4 }));
  g.add(bezel);
  const s = mesh(new THREE.PlaneGeometry(w, w * 0.625), new THREE.MeshStandardMaterial({ map: screenTexture(kind), emissive: "#ffffff", emissiveMap: screenTexture(kind), emissiveIntensity: 0.35, roughness: 0.3 }), { cast: false });
  s.position.z = 0.03;
  g.add(s);
  return g;
}

function typeBlock(ch, color, size = 0.7) {
  const tex = canvasTexture(512, 512, (c, W, H) => {
    c.fillStyle = color;
    c.fillRect(0, 0, W, H);
    c.fillStyle = color === IVORY ? "#1D1A17" : IVORY;
    c.font = `italic 380px ${SERIF}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(ch, W / 2, H / 2 + 20);
  });
  const side = clay(color);
  const face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), [side, side, side, side, face, side]);
  b.castShadow = b.receiveShadow = true;
  return b;
}

function swatchBoard() {
  const tex = canvasTexture(1024, 720, (c, W, H) => {
    c.fillStyle = "#D9D1C2";
    c.fillRect(0, 0, W, H);
    const dirs = [
      ["#07070A", "#E8B567", "Cinematic"],
      ["#D8D2C6", "#C2410C", "Editorial"],
      ["#05060B", "#38F2D0", "Futuristic"],
      ["#0A0907", "#D4AF6A", "Luxury"],
      ["#DDD2C1", "#FF5C39", "Playful"],
      ["#D3D3CE", "#2B2BFF", "Brutalist"],
    ];
    dirs.forEach(([bg, ac, name], i) => {
      const x = 50 + (i % 3) * 320;
      const y = 60 + Math.floor(i / 3) * 320;
      c.fillStyle = bg;
      roundRect(c, x, y, 280, 230, 22);
      c.fill();
      c.fillStyle = ac;
      c.beginPath();
      c.arc(x + 200, y + 80, 56, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = bg === "#D8D2C6" || bg === "#DDD2C1" || bg === "#D3D3CE" ? "#1A1A1A" : "#F3EFE6";
      c.font = `italic 64px ${SERIF}`;
      c.fillText("Aa", x + 24, y + 196);
      c.fillStyle = "#3B352F";
      c.font = `26px ${SANS}`;
      c.fillText(name, x + 4, y + 268);
    });
  });
  const g = new THREE.Group();
  const board = mesh(new THREE.BoxGeometry(2.1, 1.48, 0.06), [clay(WOOD), clay(WOOD), clay(WOOD), clay(WOOD), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }), clay(WOOD)]);
  board.position.y = 1.3;
  board.rotation.x = -0.12;
  g.add(board);
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.0, 8), clay(WOOD));
    leg.position.set(s * 0.85, 0.98, 0.2);
    leg.rotation.x = 0.16;
    g.add(leg);
  }
  return g;
}

function pedestal(material, h = 0.7) {
  const g = new THREE.Group();
  const col = mesh(roundedBox(0.5, h, 0.5, 0.04), clay(IVORY));
  col.position.y = h / 2;
  g.add(col);
  const ball = mesh(new THREE.SphereGeometry(0.22, 48, 32), material);
  ball.position.y = h + 0.22;
  g.add(ball);
  return g;
}

function crane() {
  const g = new THREE.Group();
  const yellow = clay(AMBER, { rough: 0.6 });
  const mast = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const seg = mesh(new THREE.BoxGeometry(0.22, 0.42, 0.22), yellow);
    seg.position.y = 0.21 + i * 0.44;
    mast.add(seg);
    for (const s of [-1, 1]) {
      const brace = mesh(new THREE.BoxGeometry(0.03, 0.5, 0.03), clay("#3A2E1E"));
      brace.position.set(s * 0.12, 0.21 + i * 0.44, 0.12);
      brace.rotation.z = s * 0.5;
      mast.add(brace);
    }
  }
  g.add(mast);
  const top = new THREE.Group();
  top.position.y = 4.05;
  const jib = mesh(new THREE.BoxGeometry(3.6, 0.18, 0.18), yellow);
  jib.position.x = 1.2;
  top.add(jib);
  const counter = mesh(new THREE.BoxGeometry(0.5, 0.36, 0.36), clay("#3A3A40"));
  counter.position.x = -0.55;
  top.add(counter);
  const cab = mesh(roundedBox(0.36, 0.34, 0.36, 0.05), clay(IVORY));
  cab.position.set(0.1, -0.18, 0.24);
  top.add(cab);
  const cable = mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.6, 6), clay("#2A2A2A"), { cast: false });
  cable.position.set(2.3, -0.8, 0);
  top.add(cable);
  const slab = mesh(roundedBox(1.0, 0.16, 0.7, 0.04), clay(SLATE));
  slab.position.set(2.3, -1.7, 0);
  top.add(slab);
  const seam = mesh(new THREE.BoxGeometry(1.0, 0.025, 0.7), clay(AMBER, { emissive: AMBER, intensity: 2.2 }), { cast: false });
  seam.position.set(2.3, -1.6, 0);
  top.add(seam);
  g.add(top);
  return { group: g, top };
}

function pageTower(seed = 3) {
  const r = rng(seed);
  const g = new THREE.Group();
  const colors = [IVORY, SLATE, TERRA, PLUM, IVORY];
  let y = 0;
  colors.forEach((col, i) => {
    const h = 0.22 + r() * 0.1;
    const slab = mesh(roundedBox(1.4 - i * 0.06, h, 1.0 - i * 0.04, 0.05), clay(col));
    slab.position.y = y + h / 2;
    slab.rotation.y = (r() - 0.5) * 0.12;
    g.add(slab);
    const glow = mesh(new THREE.BoxGeometry(1.36 - i * 0.06, 0.02, 0.96 - i * 0.04), clay(AMBER, { emissive: AMBER, intensity: 1.8 }), { cast: false });
    glow.position.y = y + h + 0.012;
    glow.rotation.y = slab.rotation.y;
    g.add(glow);
    y += h + 0.03;
  });
  return g;
}

function softbox() {
  const g = new THREE.Group();
  const stand = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8), clay("#2A2A2E", { metal: 0.5, rough: 0.4 }));
  stand.position.y = 0.75;
  g.add(stand);
  const box = mesh(new THREE.BoxGeometry(0.8, 0.6, 0.18), clay("#1D1C20"));
  box.position.y = 1.6;
  g.add(box);
  const panel = mesh(new THREE.PlaneGeometry(0.72, 0.52), clay("#FFFFFF", { emissive: "#FFF2DD", intensity: 1.4 }), { cast: false });
  panel.position.set(0, 1.6, 0.095);
  g.add(panel);
  const l = new THREE.SpotLight("#FFF0D8", 4.5, 7, Math.PI / 4, 0.6, 1.4);
  l.position.set(0, 1.6, 0.2);
  g.add(l);
  g.userData.light = l;
  return g;
}

function cineCamera() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const leg = mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.1, 6), clay("#2A2A2E", { metal: 0.6, rough: 0.35 }));
    const a = (i / 3) * Math.PI * 2;
    leg.position.set(Math.cos(a) * 0.18, 0.5, Math.sin(a) * 0.18);
    leg.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
    g.add(leg);
  }
  const body = mesh(roundedBox(0.42, 0.3, 0.26, 0.04), clay("#1E1B1F", { rough: 0.45 }));
  body.position.y = 1.16;
  g.add(body);
  const lens = mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.26, 24), clay("#111", { rough: 0.2, metal: 0.5 }));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 1.16, 0.24);
  g.add(lens);
  const glass = mesh(new THREE.CircleGeometry(0.08, 24), physical({ color: "#5577aa", roughness: 0.05, metalness: 0.2, clearcoat: 1 }), { cast: false });
  glass.position.set(0, 1.16, 0.372);
  g.add(glass);
  const rec = mesh(new THREE.SphereGeometry(0.02, 10, 8), clay("#ff3b30", { emissive: "#ff3b30", intensity: 4 }), { cast: false });
  rec.position.set(0.15, 1.27, 0.1);
  g.add(rec);
  return g;
}

function box(label, color = "#C9A877") {
  const tex = canvasTexture(256, 256, (c, W, H) => {
    c.fillStyle = color;
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#3A2B1A";
    c.fillRect(0, H / 2 - 10, W, 20);
    c.font = `bold 54px ${SANS}`;
    c.textAlign = "center";
    c.fillText(label, W / 2, 90);
  });
  const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const b = new THREE.Mesh(roundedBox(0.4, 0.32, 0.4, 0.03), side);
  b.castShadow = b.receiveShadow = true;
  return b;
}

function logoMonument() {
  const g = new THREE.Group();
  const ringMat = physical({ color: AMBER, metalness: 0.85, roughness: 0.22, clearcoat: 0.6 });
  const arc = mesh(new THREE.TorusGeometry(1.45, 0.3, 48, 160, Math.PI * 1.56), ringMat);
  arc.rotation.z = Math.PI * 0.22;
  g.add(arc);
  const sphere = mesh(new THREE.SphereGeometry(0.62, 64, 48), physical({ color: IVORY, roughness: 0.32, clearcoat: 0.8, sheen: 0.4 }));
  sphere.position.x = -0.12;
  g.add(sphere);
  const dot = mesh(new THREE.SphereGeometry(0.22, 32, 24), clay(AMBER, { emissive: AMBER, intensity: 0.5, rough: 0.4 }));
  dot.position.set(1.62, 0, 0);
  g.add(dot);
  const glow = new THREE.PointLight(AMBER, 2.5, 6, 1.5);
  glow.position.set(0.2, 0, 1.2);
  g.add(glow);
  return { group: g, sphere, dot };
}

// ---------------------------------------------------------------- islands

function islandDescribe() {
  const g = island({ radius: 3.1, seed: 11 });
  const rug = mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.02, 48), clay(TERRA, { rough: 0.95 }));
  rug.position.set(0.1, 0.01, 0.2);
  g.add(rug);
  const desk = new THREE.Group();
  const top = mesh(roundedBox(1.8, 0.08, 0.9, 0.03), clay(WOOD));
  top.position.y = 0.76;
  desk.add(top);
  for (const [x, z] of [[-0.8, -0.38], [0.8, -0.38], [-0.8, 0.38], [0.8, 0.38]]) {
    const leg = mesh(new THREE.BoxGeometry(0.06, 0.74, 0.06), clay("#7C5A3C"));
    leg.position.set(x, 0.37, z);
    desk.add(leg);
  }
  const laptopBase = mesh(roundedBox(0.84, 0.03, 0.56, 0.02), clay("#C7C9CF", { rough: 0.35, metal: 0.6 }));
  laptopBase.position.set(0, 0.815, 0.05);
  desk.add(laptopBase);
  const lid = screen("chat", 0.82);
  lid.position.set(0, 1.07, -0.24);
  lid.rotation.x = -0.18;
  desk.add(lid);
  const l = lamp();
  l.position.set(-0.68, 0.8, -0.15);
  desk.add(l);
  const mug = mesh(new THREE.CylinderGeometry(0.06, 0.055, 0.12, 16), clay(IVORY));
  mug.position.set(0.62, 0.86, 0.2);
  desk.add(mug);
  desk.position.set(0, 0, -0.3);
  g.add(desk);
  const chair = mesh(roundedBox(0.5, 0.08, 0.5, 0.05), clay(SLATE));
  chair.position.set(0, 0.46, 0.55);
  g.add(chair);
  const back = mesh(roundedBox(0.5, 0.6, 0.08, 0.05), clay(SLATE));
  back.position.set(0, 0.8, 0.82);
  g.add(back);
  const writer = person({ body: AMBER, seated: true, hair: "#3A2A22" });
  writer.position.set(0, 0.42, 0.55);
  writer.rotation.y = Math.PI;
  g.add(writer);
  const p1 = plant(1.2, 4);
  p1.position.set(-1.9, 0, 0.9);
  g.add(p1);
  const p2 = plant(0.9, 5);
  p2.position.set(1.7, 0, 1.3);
  g.add(p2);
  const t1 = tree(1.5, 6);
  t1.position.set(-2.0, 0, -1.4);
  g.add(t1);
  const shelf = mesh(roundedBox(0.3, 1.5, 1.2, 0.03), clay(WOOD));
  shelf.position.set(2.1, 0.75, -0.6);
  g.add(shelf);
  const r = rng(9);
  for (let i = 0; i < 9; i++) {
    const book = mesh(new THREE.BoxGeometry(0.2, 0.3 + r() * 0.12, 0.08), clay([TERRA, SLATE, PLUM, SAGE, IVORY][i % 5]));
    book.position.set(2.0, 0.42 + Math.floor(i / 3) * 0.45, -1.05 + (i % 3) * 0.12 + Math.floor(i / 3) * 0.25);
    g.add(book);
  }
  const bubbles = ["“a perfume”", "“warm, nocturnal”", "“quietly luxurious”"].map((t, i) => {
    const b = speechBubble(t, 1.0);
    b.position.set(-0.6 + i * 0.55, 1.9 + i * 0.4, 0.2 - i * 0.2);
    g.add(b);
    return b;
  });
  return {
    group: g,
    focal: [0, 1.0, -0.4],
    update(t) {
      bubbles.forEach((b, i) => {
        b.position.y = 1.85 + i * 0.42 + Math.sin(t * 0.9 + i) * 0.08;
        b.rotation.y = Math.sin(t * 0.5 + i * 2) * 0.15;
      });
    },
  };
}

function islandDirect() {
  const g = island({ radius: 3.3, seed: 21 });
  const board = swatchBoard();
  board.position.set(-0.4, 0, -1.1);
  board.rotation.y = 0.18;
  g.add(board);
  const glass = physical({ color: "#ffffff", transmission: 1, thickness: 0.6, roughness: 0.03, ior: 1.5, clearcoat: 1 });
  const chrome = physical({ color: "#f2f2f2", metalness: 1, roughness: 0.06 });
  const gold = physical({ color: "#E3B866", metalness: 1, roughness: 0.18 });
  const peds = [pedestal(chrome, 0.6), pedestal(glass, 0.85), pedestal(gold, 0.7)];
  peds.forEach((p, i) => {
    p.position.set(1.0 + i * 0.62, 0, 0.4 - i * 0.55);
    g.add(p);
  });
  const blocks = [typeBlock("A", IVORY, 0.7), typeBlock("a", TERRA, 0.55), typeBlock("g", SLATE, 0.45)];
  blocks[0].position.set(-1.5, 0.35, 0.9);
  blocks[0].rotation.y = 0.4;
  blocks[1].position.set(-0.9, 0.275, 1.4);
  blocks[1].rotation.y = -0.3;
  blocks[2].position.set(-1.45, 0.925, 0.95);
  blocks[2].rotation.y = 0.9;
  blocks.forEach((b) => g.add(b));
  const d = person({ body: SLATE, hair: "#1E1A18" });
  d.position.set(0.25, 0, -0.35);
  d.rotation.y = -0.6;
  g.add(d);
  const t1 = tree(1.3, 12);
  t1.position.set(2.3, 0, -1.6);
  g.add(t1);
  const spot = new THREE.SpotLight("#FFE3B8", 2.2, 9, Math.PI / 9, 0.6, 1.2);
  spot.position.set(2.6, 4.0, 2.2);
  spot.target.position.set(1.6, 0.8, -0.2);
  g.add(spot);
  g.add(spot.target);
  return {
    group: g,
    focal: [0.6, 1.0, -0.4],
    update(t) {
      peds.forEach((p, i) => {
        p.children[1].position.y = [0.6, 0.85, 0.7][i] + 0.22 + Math.sin(t * 1.2 + i) * 0.05;
      });
    },
  };
}

function islandGenerate() {
  const g = island({ radius: 3.4, seed: 31 });
  const pad = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.04, 48), clay("#CFC6B6", { rough: 0.95 }));
  pad.position.set(0.3, 0.02, 0.3);
  g.add(pad);
  const tower = pageTower();
  tower.position.set(0.5, 0.04, 0.2);
  g.add(tower);
  const { group: cr, top } = crane();
  cr.position.set(-1.6, 0, -1.2);
  g.add(cr);
  // turntable with the perfume bottle (same procedural model generated sites use)
  const tt = mesh(new THREE.CylinderGeometry(0.6, 0.66, 0.12, 48), clay(INK, { rough: 0.4 }));
  tt.position.set(-1.9, 0.06, 1.3);
  g.add(tt);
  // Offline films can afford real transmission glass.
  const filmGlass = (role) =>
    role === "glass"
      ? physical({ color: "#fff8ee", transmission: 1, thickness: 1.0, roughness: 0.03, ior: 1.5, clearcoat: 1 })
      : role === "accent"
        ? physical({ color: "#C7782A", transmission: 0.7, thickness: 0.6, roughness: 0.1, attenuationColor: new THREE.Color("#B05A12"), attenuationDistance: 0.6 })
        : role === "secondary"
          ? physical({ color: "#D9B36A", metalness: 1, roughness: 0.22 })
          : physical({ color: "#C9A25A", metalness: 1, roughness: 0.28 });
  void createMaterialFactory;
  const bottle = buildModel("perfume-bottle", filmGlass, { quality: "high", palette: PALETTE });
  bottle.group.scale.setScalar(0.42);
  bottle.group.position.set(-1.9, 0.6, 1.3);
  bottle.group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  g.add(bottle.group);
  const workers = [person({ body: TERRA }), person({ body: SAGE, hair: "#5A3A28" })];
  workers[0].position.set(-0.4, 0, 1.4);
  workers[0].rotation.y = 0.9;
  workers[1].position.set(1.6, 0, -0.6);
  workers[1].rotation.y = -2.2;
  workers.forEach((w) => g.add(w));
  const cones = [[-0.3, 1.9], [2.2, 0.2], [-2.0, 0.6]].map(([x, z]) => {
    const c = mesh(new THREE.ConeGeometry(0.1, 0.26, 16), clay(TERRA));
    c.position.set(x, 0.13, z);
    g.add(c);
    return c;
  });
  void cones;
  return {
    group: g,
    focal: [0.6, 0.9, 0.4],
    update(t) {
      top.rotation.y = -0.6 + Math.sin(t * 0.25) * 0.5;
      bottle.group.rotation.y = t * 0.6;
      tt.rotation.y = t * 0.6;
    },
  };
}

function islandRefine() {
  const g = island({ radius: 3.3, seed: 41 });
  // cyclorama: floor + curved wall
  const cyc = mesh(new THREE.CylinderGeometry(1.7, 1.7, 2.0, 48, 1, true, Math.PI * 0.75, Math.PI * 1.0), clay("#CFC7BA", { rough: 0.95 }));
  cyc.material.side = THREE.DoubleSide;
  cyc.position.set(0, 1.0, -0.6);
  g.add(cyc);
  const floor = mesh(new THREE.CylinderGeometry(1.7, 1.7, 0.03, 48), clay("#CFC7BA", { rough: 0.95 }));
  floor.position.set(0, 0.02, -0.6);
  g.add(floor);
  const ped = mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.5, 40), clay(INK, { rough: 0.35 }));
  ped.position.set(0, 0.27, -0.7);
  g.add(ped);
  const factory = createMaterialFactory("satin-plastic", "satin-plastic", { ...PALETTE, background: "#F3EFE6" });
  const phones = buildModel("headphones", factory, { quality: "high", palette: PALETTE });
  phones.group.scale.setScalar(0.42);
  phones.group.position.set(0, 0.95, -0.7);
  phones.group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  g.add(phones.group);
  const boxes = [softbox(), softbox()];
  boxes[0].position.set(-1.5, 0, 0.6);
  boxes[0].rotation.y = 0.9;
  boxes[1].position.set(1.5, 0, 0.6);
  boxes[1].rotation.y = -0.9;
  boxes.forEach((b) => {
    g.add(b);
    b.userData.light.target.position.set(0, 0.9, -0.7);
    g.add(b.userData.light.target);
  });
  const rail = new THREE.Group();
  for (const s of [-1, 1]) {
    const bar = mesh(new THREE.BoxGeometry(3.0, 0.04, 0.05), clay("#3A3A40", { metal: 0.5, rough: 0.4 }));
    bar.position.set(0, 0.03, s * 0.2);
    rail.add(bar);
  }
  rail.position.set(0, 0, 1.6);
  g.add(rail);
  const cam = cineCamera();
  cam.position.set(0, 0.05, 1.6);
  cam.rotation.y = Math.PI;
  g.add(cam);
  const mon = screen("versions", 0.7);
  mon.position.set(1.9, 1.0, -0.5);
  mon.rotation.y = -0.7;
  g.add(mon);
  const monStand = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), clay("#2A2A2E"));
  monStand.position.set(1.9, 0.4, -0.5);
  g.add(monStand);
  const dir = person({ body: PLUM, seated: true });
  dir.position.set(-1.0, 0.36, 1.5);
  dir.rotation.y = 2.6;
  g.add(dir);
  const chair = mesh(roundedBox(0.4, 0.06, 0.4, 0.02), clay(TERRA));
  chair.position.set(-1.0, 0.36, 1.5);
  g.add(chair);
  return {
    group: g,
    focal: [0, 0.95, -0.7],
    update(t) {
      phones.group.rotation.y = 0.6 + t * 0.35;
      cam.position.x = Math.sin(t * 0.4) * 0.9;
    },
  };
}

function islandShip() {
  const g = island({ radius: 3.5, seed: 51 });
  const { group: logo, sphere, dot } = logoMonument();
  logo.position.set(0, 2.6, -0.6);
  g.add(logo);
  const plinth = mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.3, 48), clay(INK, { rough: 0.4 }));
  plinth.position.set(0, 0.15, -0.6);
  g.add(plinth);
  const beam = mesh(new THREE.CylinderGeometry(0.06, 0.4, 1.0, 32, 1, true), clay(AMBER, { emissive: AMBER, intensity: 1.2 }), { cast: false });
  beam.material = beam.material.clone();
  beam.material.transparent = true;
  beam.material.opacity = 0.35;
  beam.position.set(0, 0.8, -0.6);
  g.add(beam);
  const site = screen("site", 1.6);
  site.position.set(-2.0, 1.2, 0.6);
  site.rotation.y = 0.9;
  g.add(site);
  for (const s of [-1, 1]) {
    const leg = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8), clay("#2A2A2E"));
    leg.position.set(-2.0 + s * 0.35, 0.4, 0.6 + s * -0.45);
    g.add(leg);
  }
  const belt = mesh(roundedBox(3.0, 0.12, 0.6, 0.04), clay("#2B2A30", { rough: 0.6 }));
  belt.position.set(1.2, 0.2, 1.4);
  belt.rotation.y = -0.5;
  g.add(belt);
  const parcels = [box("ZIP"), box("HTML", "#D9BE8E"), box("ZIP"), box("HTML", "#D9BE8E")];
  parcels.forEach((p) => g.add(p));
  const t1 = tree(1.4, 52);
  t1.position.set(2.5, 0, -1.6);
  g.add(t1);
  const t2 = tree(1.1, 53);
  t2.position.set(-2.6, 0, -1.4);
  g.add(t2);
  const crowd = [person({ body: TERRA }), person({ body: SLATE }), person({ body: SAGE })];
  crowd.forEach((p, i) => {
    p.position.set(-0.7 + i * 0.6, 0, 1.0 + (i % 2) * 0.2);
    p.rotation.y = Math.PI + (i - 1) * 0.3;
    g.add(p);
  });
  const dir = new THREE.Vector3(Math.cos(-0.5), 0, -Math.sin(-0.5));
  return {
    group: g,
    focal: [0, 2.4, -0.6],
    update(t) {
      logo.rotation.y = Math.sin(t * 0.35) * 0.5;
      sphere.position.y = Math.sin(t * 1.1) * 0.06;
      dot.position.y = Math.cos(t * 1.1) * 0.08;
      parcels.forEach((p, i) => {
        const u = ((t * 0.12 + i / parcels.length) % 1) - 0.5;
        p.position.set(1.2 + dir.x * u * 2.6, 0.43, 1.4 + dir.z * u * 2.6);
        p.rotation.y = -0.5;
      });
    },
  };
}

// ---------------------------------------------------------------- world + choreography

export const SCENES = [
  { id: "describe", build: islandDescribe, at: [0, 0, 0] },
  { id: "direct", build: islandDirect, at: [26, 3, -15] },
  { id: "generate", build: islandGenerate, at: [50, -2, 3] },
  { id: "refine", build: islandRefine, at: [74, 2.5, -13] },
  { id: "ship", build: islandShip, at: [98, 0, 0] },
];

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Dive into island i: start high and far, descend with a scene-specific move, end close on the focal point. */
function divePath(i, isl) {
  const c = SCENES[i].at;
  const f = add(c, isl.focal);
  const start = add(c, [-4, 12, 16]);
  const startTarget = add(c, [0, 0.4, 0]);
  const moves = [
    // Describe: glide over the shelf to the writer's shoulder, ending on the laptop.
    { pos: [start, add(c, [3.5, 6.5, 9]), add(c, [2.2, 2.6, 3.2]), add(c, [0.9, 1.75, 1.5])], target: [startTarget, add(c, [0, 0.8, 0]), add(c, [0, 1.0, -0.2]), f], fov: [30, 34] },
    // Direct: half-orbit around the material spheres, ending on the swatch board.
    { pos: [start, add(c, [-5.2, 5, 4]), add(c, [-2.6, 2.4, 3.6]), add(c, [0.4, 1.6, 2.2])], target: [startTarget, add(c, [0.6, 0.9, 0]), add(c, [1.0, 1.0, -0.3]), add(c, [-0.2, 1.3, -1.0])], fov: [30, 36] },
    // Generate: low lateral track past the crane, push in to the page tower.
    { pos: [start, add(c, [5.5, 4.5, 7]), add(c, [3.4, 1.6, 3.6]), add(c, [1.9, 1.25, 2.2])], target: [startTarget, add(c, [-0.5, 1.6, -0.6]), add(c, [0.6, 1.0, 0.4]), f], fov: [30, 34] },
    // Refine: crane down behind the camera rig into the cyclorama, like a dolly shot.
    { pos: [start, add(c, [0, 6.5, 7]), add(c, [0.6, 2.2, 3.0]), add(c, [0.25, 1.15, 1.25])], target: [startTarget, add(c, [0, 1.0, 0]), add(c, [0, 1.0, -0.6]), f], fov: [30, 32] },
    // Ship: rise-and-reveal in front of the logo monument (finale; holds the CTA).
    { pos: [start, add(c, [4.0, 5.0, 9]), add(c, [1.6, 2.4, 5.4]), add(c, [0.3, 2.6, 4.1])], target: [startTarget, add(c, [0, 1.6, -0.4]), add(c, [0, 2.4, -0.6]), f], fov: [30, 36] },
  ];
  const m = moves[i];
  return cameraMove({ pos: m.pos, target: m.target, fov: m.fov, easing: ease.inOut });
}

/** Aerial connector: pull up and out of island i, fly across, arrive on dive i+1's first pose. */
function connectorPath(dive, nextDive, i) {
  const a = SCENES[i].at;
  const b = SCENES[i + 1].at;
  const mid = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + 15, (a[2] + b[2]) / 2 + 12];
  return cameraMove({
    pos: [dive.last, add(dive.last, [0, 3.5, 4.5]), mid, nextDive.first],
    target: [dive.lastTarget, add(a, [2, 1, 0]), add(b, [-4, 0, 0]), nextDive.firstTarget],
    fov: [dive.sample(1).fov, 30],
    easing: ease.inOut,
  });
}

export function buildWorld(studio, { portrait = false } = {}) {
  const scene = studio.scene;
  scene.fog = new THREE.Fog("#0B0B0D", 38, 110);
  const lights = keyLights(scene);
  const islands = SCENES.map((s) => {
    const isl = s.build();
    isl.group.position.set(...s.at);
    scene.add(isl.group);
    return isl;
  });
  // dust motes for depth
  const r = rng(77);
  const motes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 6, 5), clay("#FFE7B8", { emissive: "#FFD58A", intensity: 1.6 }), 900);
  const m4 = new THREE.Matrix4();
  for (let k = 0; k < 900; k++) {
    m4.makeTranslation(-20 + r() * 140, -12 + r() * 34, -36 + r() * 60);
    motes.setMatrixAt(k, m4);
  }
  motes.castShadow = false;
  scene.add(motes);
  // backdrop glow plane far behind
  const glowTex = canvasTexture(512, 512, (c, W, H) => {
    const gr = c.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W / 2);
    gr.addColorStop(0, "rgba(242,184,75,0.38)");
    gr.addColorStop(0.5, "rgba(120,80,40,0.12)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = gr;
    c.fillRect(0, 0, W, H);
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(260, 140), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, fog: false }));
  glow.position.set(50, 6, -90);
  scene.add(glow);

  const dives = islands.map((isl, i) => divePath(i, isl));
  const segments = [];
  let clock = 0;
  islands.forEach((isl, i) => {
    segments.push({ name: `dive-${SCENES[i].id}`, kind: "dive", index: i, seconds: DIVE_SECONDS, start: clock, move: dives[i] });
    clock += DIVE_SECONDS;
    if (i < islands.length - 1) {
      segments.push({ name: `conn-${SCENES[i].id}-${SCENES[i + 1].id}`, kind: "conn", index: i, seconds: CONNECTOR_SECONDS, start: clock, move: connectorPath(dives[i], dives[i + 1], i) });
      clock += CONNECTOR_SECONDS;
    }
  });

  function frame(seg, u) {
    // World time is continuous across segments, so animated props match at every seam.
    const t = seg.start + u * seg.seconds;
    islands.forEach((isl) => isl.update(t));
    motes.rotation.y = Math.sin(t * 0.02) * 0.02;
    const cam = seg.move.sample(u);
    if (portrait) {
      // Native 9:16 composition: widen the vertical field and lift the subject into the
      // upper-middle of the frame, leaving the lower third for the page copy.
      cam.fov = Math.min(68, cam.fov * 1.72);
      const dir = cam.look.clone().sub(cam.position);
      const dist = dir.length();
      cam.look = cam.look.clone().add(new THREE.Vector3(0, -dist * 0.12, 0));
    }
    // The shadow camera follows the action so every island gets crisp shadows.
    lights.sun.target.position.copy(cam.look);
    lights.sun.position.copy(cam.look).add(new THREE.Vector3(-18, 30, 16));
    studio.setCamera(cam);
  }

  return { segments, frame, duration: clock };
}
