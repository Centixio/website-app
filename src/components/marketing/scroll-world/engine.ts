/* ============================================================================
   Scroll-world engine — embedded variant.

   Adapted from scroll-world's portable scrub engine (references/scrub-engine.js,
   https://github.com/oso95/scroll-world, MIT © 2026 cyw). Changes for Centixio:
   - runs inside ONE page section (sticky stage) instead of owning the document:
     scroll progress is measured relative to the section, so other content can sit
     above and below it;
   - TypeScript, no injected global CSS (styles live in the React component);
   - an explicit destroy() for React unmounts.
   Kept from the original: blob-loaded clips (always seekable, no byte-range
   dependency), lazy prefetch, seek coalescing, native mobile clips + posters,
   poster-until-painted, iOS priming on first touch, linger pacing, seam
   crossfades, URL-bar-safe resize, and stills-only under reduced motion.
   ========================================================================== */

export interface WorldSection {
  id: string;
  label: string;
  still: string;
  stillMobile?: string;
  clip: string;
  clipMobile?: string;
  /** Viewport-heights of scroll for this scene (default diveScroll). */
  scroll?: number;
  /** 0..1: the camera settles mid-scene while the copy peaks. */
  linger?: number;
}

export interface WorldConfig {
  sections: WorldSection[];
  connectors: (string | null)[];
  connectorsMobile?: (string | null)[];
  diveScroll?: number;
  connScroll?: number;
  crossfade?: number;
}

export interface WorldCallbacks {
  /** Per-section copy opacity/offset, called every frame the scroll changes. */
  onCopy(index: number, opacity: number, progress: number): void;
  onActive(index: number): void;
  onProgress(p: number): void;
}

interface Segment {
  kind: "dive" | "conn";
  si: number;
  clip: string;
  clipM?: string;
  still: string;
  stillM?: string;
  w: number;
  linger: number;
  start: number;
  end: number;
  el: HTMLDivElement;
  img: HTMLImageElement;
  video: HTMLVideoElement | null;
  hasClip: boolean;
  loading: boolean;
  ready: boolean;
  cur: number;
  target: number;
  visible: boolean;
}

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (x: number) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const lingerEase = (x: number, L: number) => {
  L = clamp(L);
  const c = x - 0.5;
  return (1 - L) * x + L * (4 * c * c * c + 0.5);
};

export function mountScrollWorld(section: HTMLElement, stage: HTMLElement, config: WorldConfig, cb: WorldCallbacks): () => void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const smallMQ = window.matchMedia("(max-width: 860px)");
  const isMobile = () => coarse || smallMQ.matches;
  const S = config.sections;
  const N = S.length;
  const DIVE_W = config.diveScroll ?? 1.3;
  const CONN_W = config.connScroll ?? 0.9;
  const CROSSFADE = config.crossfade ?? 0.12;

  const segs: Segment[] = [];
  const diveOf: Segment[] = [];
  const mk = (partial: Pick<Segment, "kind" | "si" | "clip" | "clipM" | "still" | "stillM" | "w" | "linger">): Segment => {
    const el = document.createElement("div");
    el.className = "sw-scene";
    const img = document.createElement("img");
    img.className = "sw-scene__still";
    img.alt = "";
    img.decoding = "async";
    const poster = isMobile() && partial.stillM ? partial.stillM : partial.still;
    if (poster) img.src = poster;
    el.appendChild(img);
    stage.appendChild(el);
    return { ...partial, start: 0, end: 0, el, img, video: null, hasClip: false, loading: false, ready: false, cur: 0, target: 0, visible: false };
  };
  S.forEach((s, i) => {
    const dive = mk({ kind: "dive", si: i, clip: s.clip, clipM: s.clipMobile, still: s.still, stillM: s.stillMobile, w: s.scroll ?? DIVE_W, linger: s.linger ?? 0 });
    segs.push(dive);
    diveOf.push(dive);
    const c = config.connectors[i];
    if (i < N - 1 && c) {
      segs.push(mk({ kind: "conn", si: i, clip: c, clipM: config.connectorsMobile?.[i] ?? undefined, still: S[i + 1].still, stillM: S[i + 1].stillMobile, w: CONN_W, linger: 0 }));
    }
  });

  let vh = window.innerHeight;
  let totalW = 0;
  let activeIndex = -1;
  let ticking = false;
  let laidOutW = window.innerWidth;
  let raf = 0;
  let alive = true;
  const blobUrls: string[] = [];

  function layout() {
    vh = window.innerHeight;
    laidOutW = window.innerWidth;
    let off = 0;
    for (const s of segs) {
      s.start = off * vh;
      off += s.w;
      s.end = off * vh;
    }
    totalW = off;
    section.style.height = `${totalW * vh + vh}px`; // +1vh so the last flight completes
    read();
  }

  function scrollY() {
    return clamp(-section.getBoundingClientRect().top, -vh * 2, totalW * vh + vh);
  }

  function loadClip(s: Segment) {
    if (reduce || s.loading || !s.clip) return;
    s.loading = true;
    const url = isMobile() && s.clipM ? s.clipM : s.clip;
    fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (!alive) return;
        const v = document.createElement("video");
        v.className = "sw-scene__video";
        v.muted = true;
        v.playsInline = true;
        v.preload = "auto";
        v.setAttribute("muted", "");
        v.setAttribute("playsinline", "");
        v.setAttribute("aria-hidden", "true");
        const u = URL.createObjectURL(blob);
        blobUrls.push(u);
        v.src = u;
        v.addEventListener("loadedmetadata", () => {
          s.ready = true;
          read();
        });
        // Hide the poster only once a real frame painted (iOS shows blank otherwise).
        v.addEventListener("seeked", () => s.el.classList.add("has-clip"), { once: true });
        v.addEventListener("loadeddata", () => {
          try {
            v.pause();
          } catch {}
          if (userReady) primeVideo(v);
        });
        s.el.appendChild(v);
        s.video = v;
        s.hasClip = true;
      })
      .catch(() => {
        s.loading = false;
      });
  }

  function read() {
    const y = scrollY();
    const fade = CROSSFADE * vh;
    let ci = 0;
    for (let i = 0; i < segs.length; i++) if (y >= segs[i].start) ci = i;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (y > s.start - 1.6 * vh && y < s.end + 1.6 * vh) loadClip(s);
      const local = clamp((y - s.start) / (s.end - s.start));
      s.target = s.linger ? lingerEase(local, s.linger) : local;
      let outside = 0;
      if (y < s.start) outside = s.start - y;
      else if (y > s.end) outside = y - s.end;
      // The first scene is fully visible before the section starts (no blank intro).
      const op = i === 0 && y < s.start ? 1 : smooth(1 - outside / fade);
      s.el.style.opacity = String(op);
      s.visible = op > 0.001;
      s.el.style.zIndex = i === ci ? "12" : String(10 + Math.round(op));
      if (!s.hasClip || !s.ready) {
        const sc = reduce ? 1 : 1.02 + local * 0.1;
        s.img.style.transform = `scale(${sc.toFixed(3)})`;
      }
    }
    for (let i = 0; i < N; i++) {
      const seg = diveOf[i];
      const pr = clamp((y - seg.start) / (seg.end - seg.start));
      const before = y < seg.start;
      const after = y > seg.end;
      let cop: number;
      if (i === 0) cop = after ? 0 : smooth(1 - pr / 0.62);
      else if (i === N - 1) cop = before ? 0 : smooth(pr / 0.4);
      else cop = before || after ? 0 : smooth(1 - Math.abs(pr - 0.5) / 0.5);
      cb.onCopy(i, cop, pr);
    }
    const cur = segs[ci];
    const near = clamp(cur.kind === "dive" ? cur.si : (y - cur.start) / (cur.end - cur.start) > 0.5 ? cur.si + 1 : cur.si, 0, N - 1);
    if (near !== activeIndex) {
      activeIndex = near;
      cb.onActive(near);
    }
    cb.onProgress(clamp(y / (totalW * vh)));
    ticking = false;
  }

  function tick() {
    if (!alive) return;
    const eps = isMobile() ? 0.02 : 0.008;
    for (const s of segs) {
      const v = s.video;
      if (!s.hasClip || !s.ready || !v) continue;
      if (v.seeking) continue; // seek coalescing: never queue a seek while decoding one
      if (!s.visible && Math.abs(s.cur - s.target) < 0.002) continue;
      s.cur += (s.target - s.cur) * (reduce ? 1 : 0.18);
      const t = clamp(s.cur, 0, 0.999) * (v.duration || 1);
      if (Math.abs(v.currentTime - t) > eps) {
        try {
          v.currentTime = t;
        } catch {}
      }
    }
    raf = requestAnimationFrame(tick);
  }

  let userReady = false;
  function primeVideo(v: HTMLVideoElement | null) {
    if (!isMobile() || !v) return;
    try {
      const p = v.play();
      p?.then(() => v.pause()).catch(() => {});
    } catch {}
  }
  function onFirstGesture() {
    if (userReady) return;
    userReady = true;
    segs.forEach((s) => primeVideo(s.video));
  }

  const onScroll = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(read);
    }
  };
  const onResize = () => {
    if (coarse && window.innerWidth === laidOutW) return; // ignore URL-bar-only resizes
    layout();
  };
  window.addEventListener("pointerdown", onFirstGesture, { once: true, passive: true });
  window.addEventListener("touchstart", onFirstGesture, { once: true, passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", layout);
  layout();
  raf = requestAnimationFrame(tick);

  const jump = (i: number) => {
    const seg = diveOf[i];
    const top = section.getBoundingClientRect().top + window.scrollY + seg.start + (seg.end - seg.start) * 0.5;
    window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
  };
  (section as HTMLElement & { __swJump?: (i: number) => void }).__swJump = jump;

  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("orientationchange", layout);
    window.removeEventListener("pointerdown", onFirstGesture);
    window.removeEventListener("touchstart", onFirstGesture);
    blobUrls.forEach((u) => URL.revokeObjectURL(u));
    segs.forEach((s) => s.el.remove());
  };
}
