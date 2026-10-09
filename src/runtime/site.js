// Centixio site runtime: boots 3D stages and scroll/motion effects for a
// generated website. Bundled with three.js into one classic script
// (public/vendor/centixio-runtime.min.js) by scripts/build-runtime.mjs.
//
// Everything here must degrade gracefully: no WebGL -> static fallback,
// no GSAP -> content stays visible, prefers-reduced-motion -> no animation.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import Lenis from "lenis";
import { buildModel, applyExplode } from "./models.js";
import { createMaterialFactory, addLighting } from "./materials.js";

const FRAMINGS = {
  "hero-close": { pos: [0, 0.15, 3.6], fov: 32, target: [0, 0, 0] },
  "three-quarter": { pos: [2.5, 1.3, 3.1], fov: 34, target: [0, 0, 0] },
  wide: { pos: [0, 0.7, 6.2], fov: 36, target: [0, 0, 0] },
  "low-angle": { pos: [0.9, -1.0, 3.7], fov: 36, target: [0, 0.25, 0] },
};
const INTENSITY = { subtle: 0.6, balanced: 1, dramatic: 1.6 };

// Camera choreography, as offsets from the fitted base pose (azimuth/elevation in
// radians, distance as a factor). Page keys play across the whole page scroll;
// chapter keys are one composed shot per showcase step.
const PAGE_KEYS = [
  { at: 0, az: 0, el: 0, dist: 1 },
  { at: 0.35, az: 0.9, el: 0.24, dist: 0.82 },
  { at: 0.7, az: 1.85, el: -0.04, dist: 0.9 },
  { at: 1, az: 2.7, el: 0.18, dist: 1.04 },
];
const CHAPTER_KEYS = [
  { az: 0, el: 0.04, dist: 1 },
  { az: 0.85, el: 0.42, dist: 0.68 },
  { az: -0.75, el: 0.1, dist: 0.76 },
  { az: 1.6, el: 0.24, dist: 0.92 },
  { az: 2.4, el: 0.3, dist: 0.84 },
];
const smoothstep = (x) => x * x * (3 - 2 * x);
function pageKey(p, k) {
  let a = PAGE_KEYS[0];
  let b = PAGE_KEYS[PAGE_KEYS.length - 1];
  for (let i = 0; i < PAGE_KEYS.length - 1; i++) {
    if (p >= PAGE_KEYS[i].at && p <= PAGE_KEYS[i + 1].at) {
      a = PAGE_KEYS[i];
      b = PAGE_KEYS[i + 1];
      break;
    }
  }
  const u = smoothstep((p - a.at) / Math.max(b.at - a.at, 1e-6));
  return { az: (a.az + (b.az - a.az) * u) * 0.8 * k, el: (a.el + (b.el - a.el) * u) * Math.min(k, 1.2), dist: 1 + (a.dist + (b.dist - a.dist) * u - 1) * Math.min(k, 1.2) };
}

let bridge = { post() {} };

function setupBridge(cfg) {
  if (!cfg.preview || window.parent === window) return;
  const nonce = cfg.previewNonce;
  let sent = 0;
  bridge = {
    post(type, data) {
      if (type === "error" && ++sent > 20) return;
      try {
        window.parent.postMessage({ source: "centixio-preview", nonce, type, ...data }, "*");
      } catch {
        /* parent unavailable */
      }
    },
  };
  window.addEventListener("error", (e) => {
    bridge.post("error", { message: String(e.message || "Script error").slice(0, 500), where: `${e.filename || ""}:${e.lineno || 0}` });
  });
  window.addEventListener("unhandledrejection", (e) => {
    bridge.post("error", { message: String((e.reason && e.reason.message) || e.reason || "Unhandled rejection").slice(0, 500), where: "promise" });
  });
  // Keep the preview on this page: in-page anchors scroll, everything else is reported.
  document.addEventListener(
    "click",
    (e) => {
      const a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a) return;
      const href = a.getAttribute("href") || "";
      if (href.startsWith("#")) return;
      e.preventDefault();
      bridge.post("navigation-blocked", { href: href.slice(0, 300) });
    },
    true,
  );
}

function detectEnv(cfg) {
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  const reduced = mq("(prefers-reduced-motion: reduce)");
  const mobile = mq("(max-width: 767px)") || (mq("(pointer: coarse)") && mq("(max-width: 1024px)"));
  const finePointer = mq("(pointer: fine)") && mq("(hover: hover)");
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = Boolean(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    webgl = false;
  }
  const reduceMobile = mobile && cfg.motion.reduceOnMobile;
  return { reduced, mobile, finePointer, webgl, reduceMobile };
}

// ---------------------------------------------------------------- 3D stages

const stages = [];
const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let rafId = 0;

class Stage {
  constructor(el, cfg, env) {
    this.el = el;
    this.cfg = cfg;
    this.env = env;
    this.kind = el.dataset.cxStage || "main";
    this.modelId = el.dataset.model || cfg.scene.modelId;
    this.modelUrl = el.dataset.modelUrl || null;
    this.visible = false;
    this.progress = 0;
    this.explode = 0;
    this.ready = false;
  }

  quality() {
    const q = this.cfg.scene.quality;
    if (this.env.mobile && this.cfg.scene.mobile === "simplified") return "low";
    return q;
  }

  async init() {
    const { cfg, env } = this;
    const q = this.quality();
    const canvas = document.createElement("canvas");
    canvas.className = "cx-canvas";
    canvas.setAttribute("aria-hidden", "true");
    this.el.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: q !== "low", alpha: true, powerPreference: q === "high" ? "high-performance" : "default" });
    const dprCap = q === "high" ? 2 : q === "medium" ? 1.5 : 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, env.mobile ? Math.min(dprCap, 1.25) : dprCap));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer = renderer;
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.fail("WebGL context lost");
    });

    const scene = new THREE.Scene();
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    const lighting = this.el.dataset.lighting || cfg.scene.lighting;
    scene.environmentIntensity = addLighting(scene, lighting, cfg.palette);

    const framingId = this.el.dataset.framing || cfg.scene.framing;
    const framing = FRAMINGS[framingId] || FRAMINGS["three-quarter"];
    const camera = new THREE.PerspectiveCamera(framing.fov, 1, 0.1, 200);
    this.camera = camera;
    this.framing = framing;
    this.margin = ({ "hero-close": 1.12, "three-quarter": 1.3, wide: 1.8, "low-angle": 1.3 }[framingId] || 1.3) * (this.kind === "exploded" ? 1.35 : 1);

    this.root = new THREE.Group();
    scene.add(this.root);
    await this.loadSubject(q);
    // Fit the camera to the subject's bounding sphere (recomputed on resize for aspect).
    this.sphere = new THREE.Box3().setFromObject(this.root).getBoundingSphere(new THREE.Sphere());
    this.target = this.sphere.center.clone().add(new THREE.Vector3(...framing.target));
    this.fitCamera();
    this.setupShadows(q);
    this.pose = { az: 0, el: 0, dist: 1 };
    this.poseTarget = { az: 0, el: 0, dist: 1 };

    if (cfg.motion.particles && !env.reduced) this.addParticles(q);

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.ready = true;
    this.el.classList.add("cx-stage--ready");
    this.render(0);
  }

  async loadSubject(quality) {
    const { cfg } = this;
    const palette = cfg.palette;
    if (this.modelUrl) {
      const gltf = await new GLTFLoader().loadAsync(this.modelUrl);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const scale = 2.2 / Math.max(size.x, size.y, size.z, 0.0001);
      model.position.sub(center.multiplyScalar(scale));
      model.scale.setScalar(scale);
      const wrapper = new THREE.Group();
      wrapper.add(model);
      this.root.add(wrapper);
      // Separable parts = direct mesh-bearing children of the glTF scene root.
      const parts = [];
      const candidates = model.children.length === 1 && model.children[0].children.length > 1 ? model.children[0].children : model.children;
      const modelCenter = new THREE.Box3().setFromObject(model).getCenter(new THREE.Vector3());
      for (const child of candidates) {
        const c = new THREE.Box3().setFromObject(child).getCenter(new THREE.Vector3());
        const dir = c.sub(modelCenter);
        if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
        dir.normalize().multiplyScalar(0.8 / scale);
        parts.push({ name: child.name, object: child, dir, origin: child.position.clone() });
      }
      this.model = { group: wrapper, parts: parts.length > 1 ? parts : [], tick: () => {} };
      return;
    }
    const factory = createMaterialFactory(this.el.dataset.material || cfg.scene.material, this.el.dataset.modelDefault || cfg.scene.modelDefault, palette);
    this.model = buildModel(this.modelId, factory, { quality, palette });
    this.root.add(this.model.group);
  }

  /** Soft contact shadow on an invisible shadow-catcher (desktop, medium/high quality). */
  setupShadows(quality) {
    const bg = this.kind === "main" && this.cfg.scene.placement === "background";
    if (quality === "low" || this.env.mobile || this.kind === "abstract" || bg) return;
    const box = new THREE.Box3().setFromObject(this.root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const m = Math.max(size.x, size.y, size.z);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const key = new THREE.DirectionalLight(0xffffff, 0.35);
    key.position.copy(center).add(new THREE.Vector3(1.2 * m, 3 * m, 1.6 * m));
    key.target.position.copy(center);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.radius = 9;
    key.shadow.bias = -0.0005;
    const c = key.shadow.camera;
    c.left = c.bottom = -m * 1.4;
    c.right = c.top = m * 1.4;
    c.near = 0.1;
    c.far = m * 10;
    this.scene.add(key, key.target);
    this.root.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(m * 8, m * 8), new THREE.ShadowMaterial({ opacity: 0.26 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.set(center.x, box.min.y - 0.002, center.z);
    catcher.receiveShadow = true;
    this.scene.add(catcher);
  }

  /** Move the camera to the composed shot for showcase chapter i (eased in render). */
  chapter(i) {
    const k = INTENSITY[this.cfg.motion.intensity] || 1;
    const key = CHAPTER_KEYS[i % CHAPTER_KEYS.length];
    this.poseTarget = { az: key.az * Math.min(k, 1.3), el: key.el, dist: 1 + (key.dist - 1) * Math.min(k, 1.3) };
    this.chaptered = true;
    kick(this.env);
  }

  applyPose() {
    const rel = this.basePos.clone().sub(this.target);
    const r0 = rel.length();
    const az0 = Math.atan2(rel.x, rel.z);
    const el0 = Math.asin(THREE.MathUtils.clamp(rel.y / r0, -1, 1));
    const r = r0 * this.pose.dist;
    const az = az0 + this.pose.az;
    const el = THREE.MathUtils.clamp(el0 + this.pose.el, -0.6, 1.2);
    this.camera.position.set(this.target.x + Math.sin(az) * Math.cos(el) * r, this.target.y + Math.sin(el) * r, this.target.z + Math.cos(az) * Math.cos(el) * r);
    this.camera.lookAt(this.target);
  }

  addParticles(quality) {
    const count = this.env.mobile ? 160 : quality === "high" ? 1400 : quality === "medium" ? 700 : 300;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2.2 + Math.random() * 3.5;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi) * 0.6;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: new THREE.Color(this.cfg.palette.accent), size: 0.022, transparent: true, opacity: 0.75, depthWrite: false });
    this.particles = new THREE.Points(geo, material);
    this.scene.add(this.particles);
  }

  resize() {
    if (!this.renderer) return;
    const w = Math.max(1, this.el.clientWidth);
    const h = Math.max(1, this.el.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    if (this.kind === "main" && this.cfg.scene.placement === "background") {
      this.root.position.x = w > 900 ? 1.2 : 0;
    }
    if (this.ready) this.render(performance.now() / 1000);
  }

  fitCamera() {
    if (!this.sphere) return;
    const vFov = THREE.MathUtils.degToRad(this.camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * this.camera.aspect);
    const r = Math.max(this.sphere.radius, 0.5) * this.margin;
    const dist = Math.max(r / Math.sin(vFov / 2), r / Math.sin(hFov / 2));
    const dir = new THREE.Vector3(...this.framing.pos).normalize();
    this.basePos = this.target.clone().addScaledVector(dir, dist);
    this.camera.position.copy(this.basePos);
    this.camera.lookAt(this.target);
  }

  render(t) {
    const { cfg, env } = this;
    const animate = !env.reduced;
    if (this.model && animate) {
      if (cfg.scene.autoRotate && !(this.kind === "exploded")) this.model.group.rotation.y = t * 0.25;
      this.model.tick(t, cfg.scene.pointer ? pointer : null);
    }
    if (cfg.scene.pointer && animate) {
      this.root.rotation.x += (-pointer.y * 0.25 - this.root.rotation.x) * 0.06;
      this.root.rotation.z += (pointer.x * 0.08 - this.root.rotation.z) * 0.06;
    }
    if (this.particles && animate) this.particles.rotation.y = t * 0.03;

    if (animate && (this.scrollDriven || this.chaptered)) {
      if (this.scrollDriven && !this.chaptered) this.poseTarget = pageKey(this.progress, INTENSITY[cfg.motion.intensity] || 1);
      // Critically damped-feeling ease toward the target pose: slow in, slow out.
      const e = this.chaptered ? 0.045 : 0.12;
      this.pose.az += (this.poseTarget.az - this.pose.az) * e;
      this.pose.el += (this.poseTarget.el - this.pose.el) * e;
      this.pose.dist += (this.poseTarget.dist - this.pose.dist) * e;
      this.applyPose();
      if (Math.abs(this.poseTarget.az - this.pose.az) > 0.001) kick(env);
    }
    if (this.model && this.model.parts.length > 1 && this.kind === "exploded") applyExplode(this.model.parts, animate ? this.explode : 0.65);
    this.renderer.render(this.scene, this.camera);
  }

  fail(reason) {
    this.el.classList.add("cx-stage--fallback");
    bridge.post("error", { message: `3D scene unavailable: ${reason}`.slice(0, 300), where: "stage", severity: "warning" });
  }
}

function loop(now) {
  rafId = 0;
  if (document.hidden) return;
  const t = now / 1000;
  pointer.x += (pointer.tx - pointer.x) * 0.08;
  pointer.y += (pointer.ty - pointer.y) * 0.08;
  let active = false;
  for (const s of stages) {
    if (s.ready && s.visible) {
      s.render(t);
      active = true;
    }
  }
  if (active) rafId = requestAnimationFrame(loop);
}

function kick(env) {
  if (env.reduced) return;
  if (!rafId) rafId = requestAnimationFrame(loop);
}

function initStages(cfg, env) {
  const els = Array.from(document.querySelectorAll("[data-cx-stage]"));
  if (!els.length) return;
  const sceneOff = !cfg.scene.enabled || (env.mobile && cfg.scene.mobile === "disabled");
  const staticOnly = !env.webgl || (env.mobile && cfg.scene.mobile === "static-fallback");
  if (sceneOff) {
    els.forEach((el) => el.classList.add("cx-stage--off"));
    return;
  }
  if (staticOnly) {
    els.forEach((el) => el.classList.add("cx-stage--fallback"));
    if (!env.webgl) bridge.post("info", { message: "WebGL unavailable; showing static fallback." });
    return;
  }

  window.addEventListener(
    "pointermove",
    (e) => {
      pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );
  document.addEventListener("visibilitychange", () => !document.hidden && kick(env));

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const stage = entry.target.__cxStage;
        if (!stage) continue;
        stage.visible = entry.isIntersecting;
        if (entry.isIntersecting && !stage.started) {
          stage.started = true;
          stage
            .init()
            .then(() => {
              if (env.reduced) stage.render(0);
              kick(env);
            })
            .catch((err) => stage.fail((err && err.message) || "init failed"));
        }
        if (entry.isIntersecting) kick(env);
      }
    },
    { rootMargin: "200px 0px" },
  );
  for (const el of els) {
    const stage = new Stage(el, cfg, env);
    el.__cxStage = stage;
    stages.push(stage);
    io.observe(el);
  }
}

// ---------------------------------------------------------------- motion

function splitWords(el) {
  if (el.dataset.cxSplit) return el.querySelectorAll(".cx-w > span");
  el.dataset.cxSplit = "1";
  const text = el.textContent || "";
  el.setAttribute("aria-label", text.trim());
  el.innerHTML = "";
  text
    .trim()
    .split(/\s+/)
    .forEach((word, i, arr) => {
      const outer = document.createElement("span");
      outer.className = "cx-w";
      outer.setAttribute("aria-hidden", "true");
      const inner = document.createElement("span");
      inner.textContent = word;
      outer.appendChild(inner);
      el.appendChild(outer);
      if (i < arr.length - 1) el.appendChild(document.createTextNode(" "));
    });
  return el.querySelectorAll(".cx-w > span");
}

function initMotion(cfg, env) {
  const gsap = window.gsap;
  const ST = window.ScrollTrigger;
  const root = document.documentElement;
  if (!gsap || !ST || env.reduced) {
    root.classList.add("cx-static");
    // Reduced motion still gets scroll-linked exploded views shown at a fixed state.
    return;
  }
  gsap.registerPlugin(ST);
  const m = cfg.motion;
  const k = (INTENSITY[m.intensity] || 1) * (env.reduceMobile ? 0.6 : 1);
  const mm = gsap.matchMedia();

  // Smooth scrolling via Lenis: keeps native scroll (so position: sticky, pinned
  // sections and scroll-scrubbed films keep working) and leaves touch alone.
  if (m.smoothScroll && !env.mobile) {
    const lenis = new Lenis({ lerp: 0.12 / Math.max(0.8, k), wheelMultiplier: 1, syncTouch: false });
    lenis.on("scroll", ST.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  // Section transitions
  if (m.transition !== "none") {
    gsap.utils.toArray(".cx-section[data-cx-transition] > .cx-inner").forEach((inner) => {
      const style = inner.parentElement.dataset.cxTransition;
      const from = style === "fade" ? { opacity: 0 } : style === "clip-reveal" ? { clipPath: "inset(12% 0% 12% 0%)", opacity: 0.2 } : { y: 60 * k, opacity: 0 };
      const to = style === "clip-reveal" ? { clipPath: "inset(0% 0% 0% 0%)", opacity: 1 } : { y: 0, opacity: 1 };
      gsap.fromTo(inner, from, { ...to, duration: 0.9 * Math.max(0.7, k * 0.8), ease: "power3.out", scrollTrigger: { trigger: inner, start: "top 85%", once: true } });
    });
  }

  if (m.textReveals) {
    gsap.utils.toArray("[data-cx-reveal]").forEach((el) => {
      const words = splitWords(el);
      gsap.fromTo(words, { yPercent: 110 }, { yPercent: 0, duration: 0.8 + 0.25 * k, ease: "power4.out", stagger: 0.04 * k, scrollTrigger: { trigger: el, start: "top 88%", once: true } });
    });
  }
  if (m.stagger) {
    gsap.utils.toArray("[data-cx-stagger]").forEach((el) => {
      gsap.fromTo(el.children, { y: 28 * k, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: "power3.out", stagger: 0.07 * k, scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    });
  }
  if (m.parallax && !env.reduceMobile) {
    gsap.utils.toArray("[data-cx-parallax]").forEach((el) => {
      const speed = parseFloat(el.dataset.cxParallax) || 0.2;
      gsap.to(el, { yPercent: -speed * 60 * k, ease: "none", scrollTrigger: { trigger: el.closest("section") || el, start: "top bottom", end: "bottom top", scrub: true } });
    });
  }
  if (m.imageTransitions) {
    gsap.utils.toArray("[data-cx-img]").forEach((el) => {
      const img = el.querySelector("img") || el;
      gsap.fromTo(el, { clipPath: "inset(18% 8% 18% 8%)" }, { clipPath: "inset(0% 0% 0% 0%)", ease: "power2.out", duration: 1.2, scrollTrigger: { trigger: el, start: "top 85%", once: true } });
      gsap.fromTo(img, { scale: 1 + 0.12 * k }, { scale: 1, ease: "power2.out", duration: 1.6, scrollTrigger: { trigger: el, start: "top 85%", once: true } });
    });
  }

  // Kinetic typography marquee
  gsap.utils.toArray(".cx-marquee-track").forEach((track) => {
    const tween = gsap.to(track, { xPercent: -50, ease: "none", repeat: -1, duration: 34 / k });
    ST.create({ trigger: track, start: "top bottom", end: "bottom top", onUpdate: (self) => gsap.to(tween, { timeScale: 1 + Math.min(4, Math.abs(self.getVelocity()) / 600) * k, duration: 0.3, overwrite: true, onComplete: () => gsap.to(tween, { timeScale: 1, duration: 1 }) }) });
  });

  // Pinned storytelling (desktop pins; mobile stacks)
  mm.add("(min-width: 768px)", () => {
    if (!m.pinned) return;
    gsap.utils.toArray("[data-cx-pin-story]").forEach((section) => {
      const steps = section.querySelectorAll("[data-cx-step]");
      if (!steps.length) return;
      section.classList.add("cx-pinning");
      const setActive = (i) => steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
      setActive(0);
      ST.create({ trigger: section, start: "top top", end: `+=${steps.length * 70}%`, pin: true, scrub: true, onUpdate: (self) => setActive(Math.min(steps.length - 1, Math.floor(self.progress * steps.length))) });
      return () => section.classList.remove("cx-pinning");
    });
  });

  // Horizontal case studies (desktop only; mobile uses native swipe)
  mm.add("(min-width: 768px)", () => {
    if (!m.horizontal) return;
    gsap.utils.toArray("[data-cx-horizontal]").forEach((section) => {
      const track = section.querySelector(".cx-h-track");
      if (!track) return;
      section.classList.add("cx-h-active");
      const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 64);
      gsap.to(track, { x: () => -distance(), ease: "none", scrollTrigger: { trigger: section, start: "top top", end: () => `+=${distance()}`, pin: true, scrub: 0.6, invalidateOnRefresh: true } });
      return () => section.classList.remove("cx-h-active");
    });
  });

  // Scroll-linked 3D: showcase sections orbit the camera; exploded sections separate parts.
  for (const stage of stages) {
    const section = stage.el.closest("section, [data-cx-scroll-root]");
    if (stage.kind === "exploded") {
      ST.create({ trigger: section || stage.el, start: "top 60%", end: "bottom 40%", scrub: true, onUpdate: (self) => { stage.explode = self.progress; kick(env); } });
    } else if (cfg.scene.scrollCamera) {
      stage.scrollDriven = true;
      const isPage = stage.kind === "main" && (cfg.scene.placement === "background" || cfg.scene.placement === "hero");
      ST.create({ trigger: isPage ? document.body : section || stage.el, start: "top top", end: "bottom bottom", scrub: true, onUpdate: (self) => { stage.progress = self.progress; kick(env); } });
    }
  }
  mm.add("(min-width: 768px)", () => {
    gsap.utils.toArray("[data-cx-showcase]").forEach((section) => {
      const steps = section.querySelectorAll("[data-cx-step]");
      const setActive = (i) => steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
      if (steps.length) setActive(0);
      const st = stages.find((x) => x.el.closest("[data-cx-showcase]") === section);
      let last = -1;
      ST.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          if (!steps.length) return;
          const i = Math.min(steps.length - 1, Math.floor(self.progress * steps.length));
          setActive(i);
          if (i !== last && st && st.ready) {
            last = i;
            st.chapter(i);
          }
        },
      });
    });
  });

  // Hover: magnetic buttons
  if (m.hover && env.finePointer) {
    document.querySelectorAll("[data-cx-magnetic]").forEach((btn) => {
      const strength = 0.25 * k;
      btn.addEventListener("pointermove", (e) => {
        const r = btn.getBoundingClientRect();
        gsap.to(btn, { x: (e.clientX - r.left - r.width / 2) * strength, y: (e.clientY - r.top - r.height / 2) * strength, duration: 0.3 });
      });
      btn.addEventListener("pointerleave", () => gsap.to(btn, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" }));
    });
  }

  // Custom cursor (decorative follower; the native cursor stays visible)
  if (m.cursor && env.finePointer) {
    const dot = document.createElement("div");
    dot.className = "cx-cursor";
    dot.setAttribute("aria-hidden", "true");
    document.body.appendChild(dot);
    const xTo = gsap.quickTo(dot, "x", { duration: 0.25, ease: "power3" });
    const yTo = gsap.quickTo(dot, "y", { duration: 0.25, ease: "power3" });
    window.addEventListener("pointermove", (e) => { dot.classList.add("is-on"); xTo(e.clientX); yTo(e.clientY); }, { passive: true });
    document.documentElement.addEventListener("pointerleave", () => dot.classList.remove("is-on"));
    document.addEventListener("pointerover", (e) => dot.classList.toggle("is-link", Boolean(e.target.closest && e.target.closest("a, button, summary"))));
  }

  window.addEventListener("load", () => ST.refresh());
}


// ---------------------------------------------------------------- scroll films
// Pre-rendered video scrubbed by scroll (technique from scroll-world, MIT):
// blob-loaded (always seekable), seek-coalesced, poster until a frame paints,
// native 9:16 clip on phones, poster-only under reduced motion.

function initFilms(cfg, env) {
  const sections = Array.from(document.querySelectorAll("[data-cx-film]"));
  if (!sections.length || env.reduced) return;
  const films = sections.map((section) => ({
    section,
    stage: section.querySelector(".cx-film-stage"),
    steps: Array.from(section.querySelectorAll("[data-cx-film-step]")),
    bar: section.querySelector(".cx-film-progress span"),
    video: null,
    loading: false,
    ready: false,
    cur: 0,
    target: 0,
    near: false,
  }));
  const small = () => env.mobile || window.matchMedia("(max-width: 860px)").matches;
  const urls = [];
  function load(f) {
    if (f.loading) return;
    f.loading = true;
    const src = small() ? f.section.dataset.srcMobile || f.section.dataset.src : f.section.dataset.src;
    fetch(src)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        const v = document.createElement("video");
        v.className = "cx-film-video";
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.setAttribute("aria-hidden", "true");
        const u = URL.createObjectURL(blob);
        urls.push(u);
        v.src = u;
        v.addEventListener("loadedmetadata", () => {
          f.ready = true;
        });
        v.addEventListener("seeked", () => f.section.classList.add("has-clip"), { once: true });
        v.addEventListener("loadeddata", () => {
          try {
            v.pause();
          } catch {
            /* ignore */
          }
        });
        f.stage.insertBefore(v, f.stage.querySelector(".cx-film-scrim"));
        f.video = v;
      })
      .catch((err) => {
        f.loading = false;
        bridge.post("error", { message: `Film failed to load: ${(err && err.message) || err}`.slice(0, 200), where: "film", severity: "warning" });
      });
  }
  function read() {
    const vh = window.innerHeight;
    for (const f of films) {
      const r = f.section.getBoundingClientRect();
      const total = Math.max(1, r.height - vh);
      const p = Math.min(1, Math.max(0, -r.top / total));
      f.target = p;
      f.near = r.top < vh * 2.5 && r.bottom > -vh * 1.5;
      if (f.near) load(f);
      if (f.steps.length) {
        const i = Math.min(f.steps.length - 1, Math.floor(p * f.steps.length * 0.999));
        f.steps.forEach((s, j) => s.classList.toggle("is-active", j === i));
      }
      if (f.bar) f.bar.style.transform = `scaleX(${p.toFixed(4)})`;
    }
  }
  function tick() {
    for (const f of films) {
      const v = f.video;
      if (!v || !f.ready || !f.near || v.seeking) continue;
      f.cur += (f.target - f.cur) * 0.16;
      const t = Math.min(0.999, Math.max(0, f.cur)) * (v.duration || 1);
      if (Math.abs(v.currentTime - t) > (small() ? 0.02 : 0.008)) {
        try {
          v.currentTime = t;
        } catch {
          /* ignore */
        }
      }
    }
    requestAnimationFrame(tick);
  }
  // iOS: prime muted videos on the first touch so the first seek paints.
  window.addEventListener(
    "touchstart",
    () => films.forEach((f) => f.video && f.video.play().then(() => f.video.pause()).catch(() => {})),
    { once: true, passive: true },
  );
  window.addEventListener("scroll", () => requestAnimationFrame(read), { passive: true });
  window.addEventListener("resize", read);
  read();
  requestAnimationFrame(tick);
}

// ---------------------------------------------------------------- depth galleries
// After Houmahani Kane's "Atmospheric Depth Gallery" (Codrops, MIT) via the
// webgl-depth-gallery skill: Z-stacked images crossfade over per-image mood
// colors with velocity "breath". Driven by native scroll (no hijacking).

function initDepthGalleries(cfg, env) {
  if (!env.webgl || env.reduced) return;
  document.querySelectorAll("[data-cx-depth]").forEach((section) => {
    let data;
    try {
      data = JSON.parse(section.querySelector("[data-cx-depth-data]").textContent);
    } catch {
      return;
    }
    const { images, moods } = data;
    const n = images.length;
    const heading = section.querySelector("h2");
    const stage = document.createElement("div");
    stage.className = "cx-depth-stage";
    stage.setAttribute("aria-hidden", "true");
    const canvas = document.createElement("canvas");
    stage.appendChild(canvas);
    const head = document.createElement("div");
    head.className = "cx-depth-head";
    head.innerHTML = `<span class="cx-eyebrow"></span><h3 style="font-size:var(--step-3)"></h3>`;
    head.querySelector("h3").textContent = heading ? heading.textContent : "";
    const eyebrow = section.querySelector(".cx-eyebrow");
    head.querySelector(".cx-eyebrow").textContent = eyebrow ? eyebrow.textContent : "";
    stage.appendChild(head);
    const label = document.createElement("div");
    label.className = "cx-depth-label";
    label.innerHTML = "<span></span><strong></strong>";
    stage.appendChild(label);
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    } catch {
      return;
    }
    section.prepend(stage);
    section.classList.add("cx-depth--on");
    section.style.height = `${(n + 0.6) * 100}vh`;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, env.mobile ? 1.25 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;
    const GAP = 5;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const bgScene = new THREE.Scene();
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const U = {
      uBg: { value: new THREE.Color(moods[0].bg) },
      uB1: { value: new THREE.Color(moods[0].b1) },
      uB2: { value: new THREE.Color(moods[0].b2) },
      uTime: { value: 0 },
      uVel: { value: 0 },
    };
    bgScene.add(
      new THREE.Mesh(
        new THREE.PlaneGeometry(2, 2),
        new THREE.ShaderMaterial({
          depthTest: false,
          depthWrite: false,
          uniforms: U,
          vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }",
          fragmentShader: `varying vec2 vUv; uniform vec3 uBg,uB1,uB2; uniform float uTime,uVel;
            float rnd(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453); }
            void main(){ vec3 c=uBg; float t=uTime*0.00028;
              vec2 a=vec2(0.62+sin(t)*0.13, 0.48+cos(t*0.79)*0.09); vec2 b=vec2(0.32+cos(t*0.93)*0.11, 0.56+sin(t*1.17)*0.07);
              c=mix(c,mix(uB1,uBg,0.5),smoothstep(0.62,0.0,distance(vUv,a))*0.75);
              c=mix(c,mix(uB2,uBg,0.55),smoothstep(0.48,0.0,distance(vUv,b))*0.7);
              c+=uVel*0.05; c+=(rnd(vUv*vec2(1387.13,947.91))-0.5)*0.03; gl_FragColor=vec4(clamp(c,0.0,1.0),1.0); }`,
        }),
      ),
    );
    const loader = new THREE.TextureLoader();
    const geo = new THREE.PlaneGeometry(1, 1);
    const planes = images.map((img, i) => {
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, opacity: i === 0 ? 1 : 0, side: THREE.DoubleSide });
      const m = new THREE.Mesh(geo, mat);
      m.userData = { x: i % 2 ? 0.7 : -0.7, ar: 1.5 };
      loader.load(img.src, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        mat.map = t;
        mat.needsUpdate = true;
        if (t.image && t.image.width) m.userData.ar = t.image.width / t.image.height;
      });
      m.position.z = -i * GAP;
      scene.add(m);
      return m;
    });
    const startZ = 5;
    const minZ = -(n - 1) * GAP + 5;
    const lerp = THREE.MathUtils.lerp;
    let visible = false;
    let raf = 0;
    let cur = 0;
    let prev = 0;
    let vel = 0;
    let breath = 0;
    let li = -1;
    const size = () => {
      const w = stage.clientWidth || window.innerWidth;
      const h = stage.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    size();
    new ResizeObserver(size).observe(stage);
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    }).observe(section);
    function frame(time) {
      raf = 0;
      if (!visible) return;
      const r = section.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      cur = lerp(cur, p * (startZ - minZ), 0.1);
      vel = lerp(vel, (cur - prev) * 4, 0.12);
      prev = cur;
      camera.position.z = startZ - cur;
      const sampled = camera.position.z - GAP;
      const nd = Math.min(n - 1, Math.max(0, -sampled / GAP));
      const ci = Math.floor(nd);
      const ni = Math.min(ci + 1, n - 1);
      const bl = nd - ci;
      breath = lerp(breath, Math.min(1, Math.abs(vel) / 1.5 * 1.1), 0.14);
      const narrow = window.innerWidth < 768;
      const pw = narrow ? 2.6 : 3.4;
      planes.forEach((m, i) => {
        const t = i === ci ? 1 - bl : i === ni ? bl : 0;
        m.material.opacity = lerp(m.material.opacity, t, 0.14);
        const inf = m.material.opacity * (1 + i * 0.05);
        m.position.x = (narrow ? 0 : m.userData.x) + pointer.x * 0.16 * inf;
        m.position.y = -pointer.y * 0.08 * inf;
        m.rotation.y = pointer.x * 0.045 * breath * m.material.opacity;
        const pulse = 1 + 0.03 * breath * m.material.opacity;
        const ar = m.userData.ar;
        m.scale.set((ar >= 1 ? pw : pw * ar) * pulse, (ar >= 1 ? pw / ar : pw) * pulse, 1);
      });
      U.uBg.value.set(moods[ci].bg).lerp(new THREE.Color(moods[ni].bg), bl);
      U.uB1.value.set(moods[ci].b1).lerp(new THREE.Color(moods[ni].b1), bl);
      U.uB2.value.set(moods[ci].b2).lerp(new THREE.Color(moods[ni].b2), bl);
      U.uTime.value = time;
      U.uVel.value = Math.min(1, Math.abs(vel) / 1.5);
      const idx = bl >= 0.5 ? ni : ci;
      if (idx !== li) {
        li = idx;
        label.querySelector("span").textContent = `${String(idx + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}${images[idx].meta ? ` · ${images[idx].meta}` : ""}`;
        label.querySelector("strong").textContent = images[idx].caption || "";
      }
      renderer.clear(true, true, true);
      renderer.render(bgScene, bgCam);
      renderer.clearDepth();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
  });
}

// ---------------------------------------------------------------- boot

export function boot() {
  if (window.__cxBooted) return;
  window.__cxBooted = true;
  let cfg;
  try {
    cfg = JSON.parse(document.getElementById("cx-config").textContent);
  } catch {
    document.documentElement.classList.add("cx-static");
    return;
  }
  setupBridge(cfg);
  try {
    const env = detectEnv(cfg);
    document.documentElement.classList.toggle("cx-reduced", env.reduced);
    initStages(cfg, env);
    initMotion(cfg, env);
    initFilms(cfg, env);
    initDepthGalleries(cfg, env);
    document.documentElement.classList.add("cx-booted");
    bridge.post("ready", { webgl: env.webgl, reducedMotion: env.reduced });
  } catch (err) {
    document.documentElement.classList.add("cx-static");
    bridge.post("error", { message: String((err && err.message) || err).slice(0, 500), where: "boot" });
  }
}
