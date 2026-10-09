"use client";

/*
 * Depth gallery — adapted from the "webgl-depth-gallery" skill
 * (nexu-io/open-design, MIT), itself a port of Houmahani Kane's
 * "Atmospheric Depth Gallery" (Codrops, MIT):
 * https://github.com/houmahani/codrops-depth-gallery
 *
 * Changes for Centixio: scroll is the page's native scroll inside a pinned
 * section (no wheel hijacking), the planes are our sample-site posters with
 * mood colors from each sample's real palette, rendering pauses off-screen,
 * DPR is capped, the cursor trail is desktop-only, and reduced-motion / no
 * WebGL visitors get a static grid.
 */
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { ArrowUpRight } from "lucide-react";

export interface DepthItem {
  slug: string;
  name: string;
  direction: string;
  poster: string;
  href: string;
  palette: { background: string; accent: string; accent2: string };
}

const PLANE_GAP = 5;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

function hexToRgb(h: string) {
  const n = h.replace("#", "");
  return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16) };
}
function rgbToCmyk({ r, g, b }: { r: number; g: number; b: number }) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const k = 1 - Math.max(R, G, B);
  if (k >= 0.999) return { c: 0, m: 0, y: 0, k: 100 };
  return { c: Math.round(((1 - R - k) / (1 - k)) * 100), m: Math.round(((1 - G - k) / (1 - k)) * 100), y: Math.round(((1 - B - k) / (1 - k)) * 100), k: Math.round(k * 100) };
}
function lum(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

let webglOk: boolean | null = null;
function canWebGL(): boolean {
  if (webglOk === null) {
    try {
      const c = document.createElement("canvas");
      webglOk = Boolean(c.getContext("webgl2") || c.getContext("webgl"));
    } catch {
      webglOk = false;
    }
  }
  return webglOk;
}
const RM = "(prefers-reduced-motion: reduce)";
function subscribe(cb: () => void) {
  const mq = window.matchMedia(RM);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function DepthGallery({ items }: { items: DepthItem[] }) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [idx, setIdx] = useState(0);
  const mode = useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(RM).matches || !canWebGL() ? "static" : "webgl"),
    () => "webgl",
  );

  useEffect(() => {
    const el = section.current;
    const cv = canvas.current;
    if (mode !== "webgl" || !el || !cv) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: "high-performance" });
    } catch {
      return;
    }
    const fine = window.matchMedia("(pointer: fine)").matches;
    const narrow = () => window.innerWidth < 768;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.autoClear = false;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

    // ---- mood background (blobs + grain), per sample palette
    const bgScene = new THREE.Scene();
    const bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const bgU = {
      uBackgroundColor: { value: new THREE.Color(items[0].palette.background) },
      uBlob1Color: { value: new THREE.Color(items[0].palette.accent) },
      uBlob2Color: { value: new THREE.Color(items[0].palette.accent2) },
      uNoiseStrength: { value: 0.035 },
      uBlobRadius: { value: 0.65 },
      uBlobRadiusSecondary: { value: 0.5 },
      uBlobStrength: { value: 0.75 },
      uTime: { value: 0 },
      uVelocityIntensity: { value: 0 },
    };
    const bgMat = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: bgU,
      vertexShader: "varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }",
      fragmentShader: `varying vec2 vUv;
        uniform vec3 uBackgroundColor,uBlob1Color,uBlob2Color; uniform float uNoiseStrength,uBlobRadius,uBlobRadiusSecondary,uBlobStrength,uTime,uVelocityIntensity;
        float random(vec2 c){ return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453123); }
        void main(){
          vec3 color=uBackgroundColor; float t=uTime*0.00028;
          vec2 b1=vec2(0.62+sin(t)*0.13+sin(t*1.618)*0.05, 0.48+cos(t*0.794)*0.09);
          vec2 b2=vec2(0.32+cos(t*0.927)*0.11, 0.56+sin(t*1.175)*0.07);
          float f1=smoothstep(uBlobRadius,0.0,distance(vUv,b1));
          float f2=smoothstep(uBlobRadiusSecondary,0.0,distance(vUv,b2));
          color=mix(color,mix(uBlob1Color,uBackgroundColor,0.45),f1*uBlobStrength);
          color=mix(color,mix(uBlob2Color,uBackgroundColor,0.5),f2*uBlobStrength);
          color+=uVelocityIntensity*0.06;
          color+=(random(vUv*vec2(1387.13,947.91)+fract(uTime*0.001))-0.5)*uNoiseStrength;
          gl_FragColor=vec4(clamp(color,0.0,1.0),1.0);
        }`,
    });
    bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bgMat));

    // ---- Z-stacked planes
    const loader = new THREE.TextureLoader();
    const geom = new THREE.PlaneGeometry(1, 1);
    const planes = items.map((it, i) => {
      const mat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false, opacity: i === 0 ? 1 : 0, side: THREE.DoubleSide });
      loader.load(it.poster, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        mat.map = t;
        mat.needsUpdate = true;
      });
      const m = new THREE.Mesh(geom, mat);
      // Keep posters left of centre so the colour card on the right never overlaps them.
      const x = i % 2 === 0 ? -0.95 : -0.45;
      m.userData = { baseX: x };
      m.position.set(x, 0, -i * PLANE_GAP);
      scene.add(m);
      return m;
    });
    const nearestZ = 0;
    const deepestZ = -(planes.length - 1) * PLANE_GAP;
    const startZ = nearestZ + 5;
    const minZ = deepestZ + 5;

    function planeBlend(camZ: number) {
      const sampled = camZ - PLANE_GAP;
      const nd = clamp((nearestZ - sampled) / PLANE_GAP, 0, planes.length - 1);
      const ci = Math.floor(nd);
      return { ci, ni: Math.min(ci + 1, planes.length - 1), blend: nd - ci };
    }

    // ---- cursor trail (tapered tube on a Catmull-Rom spline), desktop only
    const trailMat = new THREE.MeshStandardMaterial({ color: "#f6f9ff", emissive: "#ffffff", emissiveIntensity: 1.35, roughness: 0.2, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false });
    let trailMesh: THREE.Mesh | null = null;
    const trailPts: THREE.Vector3[] = [];
    function taperedTube(curve: THREE.CatmullRomCurve3, segments: number) {
      const pts = curve.getSpacedPoints(segments);
      const R = 8;
      const verts: number[] = [];
      const idxs: number[] = [];
      const up = new THREE.Vector3(0, 0, 1);
      const tan = new THREE.Vector3();
      const nor = new THREE.Vector3();
      const bin = new THREE.Vector3();
      for (let i = 0; i < pts.length; i++) {
        const t = i / Math.max(pts.length - 1, 1);
        const radius = 0.003 + (0.012 - 0.003) * Math.pow(t, 1.5);
        curve.getTangent(t, tan).normalize();
        nor.crossVectors(up, tan).normalize();
        if (nor.lengthSq() === 0) nor.set(1, 0, 0);
        bin.crossVectors(tan, nor).normalize();
        for (let j = 0; j <= R; j++) {
          const a = (j / R) * Math.PI * 2;
          const p = pts[i].clone().addScaledVector(nor, -Math.cos(a) * radius).addScaledVector(bin, Math.sin(a) * radius);
          verts.push(p.x, p.y, p.z);
        }
      }
      for (let i = 0; i < pts.length - 1; i++)
        for (let j = 0; j < R; j++) {
          const b = i * (R + 1) + j;
          idxs.push(b, b + R + 1, b + 1, b + R + 1, b + R + 2, b + 1);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(idxs);
      g.computeVertexNormals();
      return g;
    }
    const pointerT = new THREE.Vector2();
    const pointerC = new THREE.Vector2();
    const onMove = (e: PointerEvent) => pointerT.set((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    window.addEventListener("pointermove", onMove, { passive: true });
    scene.add(new THREE.AmbientLight("#ffffff", 1));

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      // Fit the 16:10 posters to the viewport: larger on narrow screens.
      const pw = narrow() ? 3.0 : 3.6;
      planes.forEach((p) => {
        p.scale.set(pw, pw / 1.6, 1);
      });
    }
    resize();
    window.addEventListener("resize", resize);

    let visible = false;
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf) raf = requestAnimationFrame(frame);
    });
    io.observe(el);

    let raf = 0;
    let scrollCur = 0;
    let prev = 0;
    let vel = 0;
    let breath = 0;
    let labelIdx = -1;
    function progress() {
      const r = el!.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      return clamp(-r.top / Math.max(total, 1), 0, 1);
    }
    function frame(time: number) {
      raf = 0;
      if (!visible) return;
      const target = progress() * (startZ - minZ);
      scrollCur = lerp(scrollCur, target, 0.1);
      const raw = scrollCur - prev;
      prev = scrollCur;
      vel = clamp(lerp(vel, raw * 4, 0.12), -1.5, 1.5);
      camera.position.z = startZ - scrollCur;
      const cz = camera.position.z;
      const { ci, ni, blend } = planeBlend(cz);
      pointerC.lerp(pointerT, 0.08);
      const vN = clamp(Math.abs(vel) / 1.5, 0, 1);
      breath = lerp(breath, clamp(vN * 1.1, 0, 1), 0.14);
      planes.forEach((p, i) => {
        let t = 0;
        if (i === ci) t = 1 - blend;
        if (i === ni) t = Math.max(t, blend);
        const mat = p.material as THREE.MeshBasicMaterial;
        mat.opacity = lerp(mat.opacity, t, 0.14);
        const inf = mat.opacity * (1 + i * 0.05);
        p.position.x = (narrow() ? 0 : (p.userData.baseX as number)) + pointerC.x * 0.16 * inf;
        p.position.y = pointerC.y * 0.08 * inf;
        const b = breath * mat.opacity;
        p.rotation.x = -pointerC.y * 0.045 * b;
        p.rotation.y = pointerC.x * 0.045 * b;
        const pulse = 1 + 0.03 * b;
        const pw = narrow() ? 3.0 : 3.6;
        p.scale.set(pw * pulse, (pw / 1.6) * pulse, 1);
      });
      // mood crossfade
      const cur = items[ci].palette;
      const nxt = items[ni].palette;
      bgU.uBackgroundColor.value.set(cur.background).lerp(new THREE.Color(nxt.background), blend);
      bgU.uBlob1Color.value.set(cur.accent).lerp(new THREE.Color(nxt.accent), blend);
      bgU.uBlob2Color.value.set(cur.accent2).lerp(new THREE.Color(nxt.accent2), blend);
      bgU.uTime.value = time;
      bgU.uVelocityIntensity.value = vN * (1 - Math.abs(blend - 0.5) * 2);
      const li = blend >= 0.5 ? ni : ci;
      if (li !== labelIdx) {
        labelIdx = li;
        setIdx(li);
      }
      // trail follows a sine path through depth, revealing direction of travel
      if (fine && !narrow()) {
        const p = progress();
        const head = new THREE.Vector3(-0.96 + Math.sin(p * Math.PI * 2 * 1.85) * 3, -1.05 + Math.sin(p * Math.PI * 2 * 2.1) * 0.78, cz + 1.65 - (4.78 + p * 6.52));
        const last = trailPts[trailPts.length - 1];
        if (!last || head.distanceTo(last) > 0.006) trailPts.push(last ? last.clone().lerp(head, 0.53) : head);
        while (trailPts.length > 14 + p * 200) trailPts.shift();
        if (trailPts.length > 2) {
          const g = taperedTube(new THREE.CatmullRomCurve3(trailPts, false, "centripetal", 0.67), Math.min(220, trailPts.length * 4));
          if (!trailMesh) {
            trailMesh = new THREE.Mesh(g, trailMat);
            trailMesh.renderOrder = 1200;
            scene.add(trailMesh);
          } else {
            trailMesh.geometry.dispose();
            trailMesh.geometry = g;
          }
        }
      }
      renderer.clear(true, true, true);
      renderer.render(bgScene, bgCam);
      renderer.clearDepth();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", resize);
      planes.forEach((p) => {
        const m = p.material as THREE.MeshBasicMaterial;
        m.map?.dispose();
        m.dispose();
      });
      geom.dispose();
      trailMesh?.geometry.dispose();
      trailMat.dispose();
      bgMat.dispose();
      renderer.dispose();
    };
  }, [items, mode]);

  const it = items[idx];
  const rgb = hexToRgb(it.palette.accent);
  const cmyk = rgbToCmyk(rgb);
  const dark = lum(it.palette.background) > 0.55;

  if (mode === "static") {
    return (
      <section aria-labelledby="samples-title" id="samples" className="mx-auto max-w-7xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 id="samples-title" className="font-display text-4xl sm:text-5xl">Sample sites</h2>
        <p className="mt-3 max-w-2xl text-muted-foreground">Working sites for fictional brands, built with the same section library and 3D runtime your projects use.</p>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => (
            <li key={s.slug} className="overflow-hidden rounded-2xl border border-border/60">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.poster} alt={`${s.name} sample site`} className="aspect-[16/10] w-full object-cover" loading="lazy" />
              <div className="flex items-center justify-between p-4"><span>{s.name} <span className="text-xs text-muted-foreground">· Sample project</span></span><a href={s.href} target="_blank" rel="noopener" className="text-sm text-primary">Open</a></div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section ref={section} id="samples" aria-labelledby="samples-title" className="relative scroll-mt-0" style={{ height: `${(items.length + 0.6) * 100}svh` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
        <div className={`pointer-events-none absolute inset-0 transition-colors duration-500 ${dark ? "text-neutral-900" : "text-white"}`}>
          <div className="absolute left-4 top-20 max-w-sm sm:left-8 sm:top-24">
            <h2 id="samples-title" className="font-display text-4xl sm:text-5xl">Sample sites</h2>
            <p className={`mt-2 text-sm ${dark ? "text-neutral-700" : "text-white/70"}`}>Working sites for <strong>fictional brands</strong> — built with the same library your projects use. Scroll to travel through them.</p>
          </div>
          <div className="absolute left-4 top-1/2 hidden -translate-y-1/2 sm:left-8 md:grid md:gap-3">
            <p className="font-mono text-[10px] tracking-[0.12em]">{String(idx + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}</p>
            <span className="size-[18px] rounded-full ring-1 ring-white/15" style={{ background: it.palette.accent }} />
          </div>
          <article aria-live="polite" className="pointer-events-auto absolute bottom-6 left-4 right-4 font-mono text-[11px] uppercase tracking-[0.08em] sm:bottom-auto sm:left-auto sm:right-10 sm:top-1/2 sm:w-[min(30vw,360px)] sm:-translate-y-1/2">
            <p className="mb-1 text-base normal-case tracking-normal" style={{ fontFamily: "var(--font-display-serif)" }}>{it.name}</p>
            <p className="mb-3 opacity-75">{it.direction} · Sample project</p>
            <dl className="grid gap-1">
              <div className="grid grid-cols-[3.5rem_1fr] gap-3"><dt className="opacity-60">CMYK</dt><dd>{cmyk.c}, {cmyk.m}, {cmyk.y}, {cmyk.k}</dd></div>
              <div className="grid grid-cols-[3.5rem_1fr] gap-3"><dt className="opacity-60">RGB</dt><dd>{rgb.r}, {rgb.g}, {rgb.b}</dd></div>
              <div className="grid grid-cols-[3.5rem_1fr] gap-3"><dt className="opacity-60">HEX</dt><dd>{it.palette.accent.replace("#", "").toUpperCase()}</dd></div>
            </dl>
            <Link href={it.href} target="_blank" rel="noopener" className="mt-4 inline-flex items-center gap-1 rounded-full border border-current/30 px-3 py-1.5 normal-case tracking-normal hover:bg-white/10">
              Open the live sample <ArrowUpRight className="size-3.5" aria-hidden />
            </Link>
          </article>
          <p className={`absolute bottom-3 right-4 hidden text-[10px] sm:block ${dark ? "text-neutral-600" : "text-white/45"}`}>Depth effect after Houmahani Kane / Codrops (MIT)</p>
        </div>
        <ul className="sr-only">
          {items.map((s) => (
            <li key={s.slug}><a href={s.href}>{s.name} — {s.direction} (sample project)</a></li>
          ))}
        </ul>
      </div>
    </section>
  );
}
