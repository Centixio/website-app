// Offline film studio: deterministic renderer + post-processing + helpers.
// Films are rendered frame-by-frame in headless Chromium (GPU) by
// scripts/render-films.mjs, encoded with ffmpeg, and scrubbed by scroll on
// the landing page and sample sites. Nothing here ships to the browser.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export { THREE };

/** Seeded PRNG so every render of a frame is identical (frame-exact seams). */
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const ease = {
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

/**
 * A camera move: a Catmull-Rom path for the position and one for the look
 * target, sampled with an easing so velocity is zero at both ends (which is
 * what makes dive→connector seams continuous in both scroll directions).
 */
export function cameraMove({ pos, target, fov = [32, 32], focus = null, easing = ease.inOut }) {
  const p = new THREE.CatmullRomCurve3(pos.map((v) => new THREE.Vector3(...v)), false, "centripetal", 0.5);
  const t = new THREE.CatmullRomCurve3(target.map((v) => new THREE.Vector3(...v)), false, "centripetal", 0.5);
  return {
    sample(u) {
      const e = easing(Math.min(1, Math.max(0, u)));
      const position = p.getPoint(e);
      const look = t.getPoint(e);
      const f = fov[0] + (fov[fov.length - 1] - fov[0]) * e;
      const focusDist = focus ? focus[0] + (focus[1] - focus[0]) * e : position.distanceTo(look);
      return { position, look, fov: f, focus: focusDist };
    },
    first: p.points[0].toArray(),
    last: p.points[p.points.length - 1].toArray(),
    firstTarget: t.points[0].toArray(),
    lastTarget: t.points[t.points.length - 1].toArray(),
  };
}

export class Studio {
  constructor({ width, height, supersample = 2, background = "#0B0B0D", bloom = 0.35, aperture = 0.0009, ao = true }) {
    this.width = width;
    this.height = height;
    this.ss = supersample;
    const canvas = document.createElement("canvas");
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(width * supersample, height * supersample, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
    this.scene.environmentIntensity = 0.55;
    pmrem.dispose();

    this.camera = new THREE.PerspectiveCamera(32, width / height, 0.05, 400);

    const W = width * supersample;
    const H = height * supersample;
    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(W, H);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (ao) {
      this.gtao = new GTAOPass(this.scene, this.camera, W, H);
      this.gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
      this.gtao.blendIntensity = 0.85;
      this.composer.addPass(this.gtao);
    }
    this.bokeh = new BokehPass(this.scene, this.camera, { focus: 10, aperture, maxblur: 0.008 });
    this.composer.addPass(this.bokeh);
    if (bloom > 0) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(W, H), bloom, 0.45, 0.94));
    this.composer.addPass(new OutputPass());

    // Downsample target (supersampling = clean edges at the final size).
    this.out = document.createElement("canvas");
    this.out.width = width;
    this.out.height = height;
    this.ctx = this.out.getContext("2d");
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";
  }

  setCamera({ position, look, fov, focus }) {
    this.camera.position.copy(position);
    this.camera.fov = fov;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(look);
    this.bokeh.uniforms.focus.value = focus;
  }

  render() {
    this.composer.render();
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.drawImage(this.renderer.domElement, 0, 0, this.width, this.height);
    return this.out.toDataURL("image/jpeg", 0.95);
  }
}

// ---------------------------------------------------------------- materials

const matCache = new Map();
/** Matte clay: the diorama look. Slight roughness variation per color keeps it from reading as plastic. */
export function clay(color, { rough = 0.88, metal = 0, emissive = null, intensity = 1 } = {}) {
  const key = `${color}|${rough}|${metal}|${emissive}|${intensity}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: rough, metalness: metal });
  if (emissive) {
    m.emissive = new THREE.Color(emissive);
    m.emissiveIntensity = intensity;
  }
  matCache.set(key, m);
  return m;
}

export function physical(opts) {
  return new THREE.MeshPhysicalMaterial(opts);
}

// ---------------------------------------------------------------- geometry helpers

export function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

export function roundedBox(w, h, d, r = 0.08, seg = 4) {
  const shape = new THREE.Shape();
  const x = -w / 2 + r;
  const y = -d / 2 + r;
  const iw = w - 2 * r;
  const id = d - 2 * r;
  shape.moveTo(x, y);
  shape.lineTo(x + iw, y);
  shape.quadraticCurveTo(x + iw + r, y, x + iw + r, y + r);
  shape.lineTo(x + iw + r, y + id);
  shape.quadraticCurveTo(x + iw + r, y + id + r, x + iw, y + id + r);
  shape.lineTo(x, y + id + r);
  shape.quadraticCurveTo(x - r, y + id + r, x - r, y + id);
  shape.lineTo(x - r, y + r);
  shape.quadraticCurveTo(x - r, y, x, y);
  const bevel = Math.min(r, h / 2 - 0.001);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(0.001, h - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.6, bevelSegments: seg, curveSegments: seg * 2 });
  geo.rotateX(-Math.PI / 2);
  geo.center();
  geo.computeVertexNormals();
  return geo;
}

/** A floating rock island: rounded clay top + tapering, faceted underside. */
export function island({ radius = 3.2, topColor = "#C9BBA2", rockColor = "#4A3F39", rimColor = "#A8977C", seed = 1, depth = 3.2 } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  // top slab (slightly irregular disc)
  const shape = new THREE.Shape();
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = radius * (1 + Math.sin(a * 3 + seed) * 0.035 + Math.sin(a * 7 + seed * 2) * 0.02);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  const top = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 5, curveSegments: 48 });
  top.rotateX(-Math.PI / 2);
  const topMesh = mesh(top, clay(topColor));
  topMesh.position.y = -0.32;
  g.add(topMesh);
  const rim = mesh(new THREE.CylinderGeometry(radius * 1.01, radius * 0.97, 0.28, 64), clay(rimColor));
  rim.position.y = -0.62;
  g.add(rim);
  // underside rock
  const rock = new THREE.ConeGeometry(radius * 0.96, depth, 9, 4);
  const pos = rock.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y > depth / 2 - 0.01) continue;
    const k = 0.18 * (1 - (y + depth / 2) / depth);
    pos.setX(i, pos.getX(i) * (1 + (r() - 0.5) * 0.35) + (r() - 0.5) * k);
    pos.setZ(i, pos.getZ(i) * (1 + (r() - 0.5) * 0.35) + (r() - 0.5) * k);
  }
  rock.rotateX(Math.PI);
  rock.computeVertexNormals();
  const rockMat = new THREE.MeshStandardMaterial({ color: rockColor, roughness: 0.95, flatShading: true });
  const rockMesh = mesh(rock, rockMat);
  rockMesh.position.y = -0.76 - depth / 2;
  g.add(rockMesh);
  return g;
}

/** Low-poly figure (capsule body + head), arms optional. */
export function person({ body = "#C8734B", skin = "#E8C7A6", hair = "#2E2622", scale = 1, seated = false } = {}) {
  const g = new THREE.Group();
  const torso = mesh(new THREE.CapsuleGeometry(0.13, seated ? 0.16 : 0.26, 6, 12), clay(body));
  torso.position.y = seated ? 0.32 : 0.42;
  g.add(torso);
  const head = mesh(new THREE.SphereGeometry(0.11, 20, 16), clay(skin));
  head.position.y = seated ? 0.6 : 0.76;
  g.add(head);
  const hairCap = mesh(new THREE.SphereGeometry(0.115, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2.1), clay(hair));
  hairCap.position.y = head.position.y + 0.01;
  hairCap.rotation.x = -0.25;
  g.add(hairCap);
  if (!seated) {
    for (const s of [-1, 1]) {
      const leg = mesh(new THREE.CapsuleGeometry(0.05, 0.18, 4, 8), clay("#2F2B33"));
      leg.position.set(s * 0.06, 0.14, 0);
      g.add(leg);
    }
  }
  g.scale.setScalar(scale);
  return g;
}

/** Canvas-texture panel (screens, posters, signage). Fonts fall back to system faces in headless Chrome. */
export function canvasTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function keyLights(scene, { warm = "#FFD9A8", cool = "#7A8CFF", intensity = 1 } = {}) {
  const hemi = new THREE.HemisphereLight("#FFF1DE", "#1A1512", 0.32 * intensity);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(warm, 1.7 * intensity);
  sun.position.set(-18, 30, 16);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 6;
  const s = sun.shadow.camera;
  s.left = -30;
  s.right = 30;
  s.top = 30;
  s.bottom = -30;
  s.near = 1;
  s.far = 160;
  scene.add(sun);
  scene.add(sun.target);
  const rim = new THREE.DirectionalLight(cool, 0.9 * intensity);
  rim.position.set(20, 8, -24);
  scene.add(rim);
  return { hemi, sun, rim };
}
