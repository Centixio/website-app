import type { DesignSpec } from "@/lib/spec/schema";
import { getFont } from "@/lib/catalog/fonts";
import { luminance, mix, onColor } from "./html";

/** Generates the full stylesheet for a website from its design spec. */
export function buildStyles(spec: DesignSpec): string {
  const p = spec.palette;
  const display = getFont(spec.typography.display);
  const body = getFont(spec.typography.body);
  const dark = luminance(p.background) < 0.35;
  const scale = spec.typography.scale === "large" ? 1.12 : spec.typography.scale === "compact" ? 0.9 : 1;
  const line = mix(p.background, p.text, dark ? 0.14 : 0.16);
  const r = spec.radius;
  const upper = spec.typography.displayCase === "uppercase";

  return `
:root{
  --bg:${p.background};--surface:${p.surface};--text:${p.text};--muted:${p.muted};
  --accent:${p.accent};--accent2:${p.accent2};--on-accent:${onColor(p.accent)};--line:${line};
  --radius:${r}px;--radius-lg:${Math.round(r * 1.6)}px;
  --font-display:'${display.family}',${display.fallback};--font-body:'${body.family}',${body.fallback};
  --step-0:clamp(1rem,0.96rem + 0.2vw,1.125rem);
  --step-1:clamp(1.25rem,1.1rem + 0.6vw,1.6rem);
  --step-2:clamp(1.6rem,1.3rem + 1.4vw,2.6rem);
  --step-3:clamp(${(2.2 * scale).toFixed(2)}rem,${(1.6 * scale).toFixed(2)}rem + ${(3 * scale).toFixed(2)}vw,${(4.4 * scale).toFixed(2)}rem);
  --step-4:clamp(${(2.8 * scale).toFixed(2)}rem,${(1.8 * scale).toFixed(2)}rem + ${(5.5 * scale).toFixed(2)}vw,${(7.4 * scale).toFixed(2)}rem);
  --gutter:clamp(1.25rem,4vw,4rem);--section:clamp(5rem,12vw,10rem);
  color-scheme:${dark ? "dark" : "light"};
}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
html.cx-reduced{scroll-behavior:auto}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:var(--step-0);line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
img{max-width:100%;display:block;height:auto}
a{color:inherit}
h1,h2,h3{font-family:var(--font-display);font-weight:${display.category === "serif" ? 400 : 700};line-height:1.02;letter-spacing:${display.category === "serif" ? "-0.01em" : "-0.03em"};margin:0;${upper ? "text-transform:uppercase;" : ""}text-wrap:balance}
h1{font-size:var(--step-4)}h2{font-size:var(--step-3)}h3{font-size:var(--step-1);line-height:1.2;${upper ? "letter-spacing:0.02em;" : ""}}
p{margin:0 0 1em;max-width:62ch;text-wrap:pretty}
.cx-muted{color:var(--muted)}
.cx-eyebrow{display:inline-block;font-family:var(--font-body);font-size:0.78rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--accent);margin-bottom:1.25rem}
.cx-skip{position:absolute;left:1rem;top:-4rem;z-index:100;background:var(--accent);color:var(--on-accent);padding:0.6rem 1rem;border-radius:var(--radius)}
.cx-skip:focus{top:1rem}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.cx-wrap{width:100%;max-width:1320px;margin:0 auto;padding:0 var(--gutter)}
.cx-section{position:relative;padding:var(--section) 0}
.cx-btn{display:inline-flex;align-items:center;gap:0.6rem;padding:0.95rem 1.5rem;border-radius:calc(var(--radius) + 999px * ${r >= 16 ? 1 : 0});background:var(--accent);color:var(--on-accent);font-weight:600;text-decoration:none;border:1px solid transparent;transition:transform .25s ease,background-color .25s ease,box-shadow .25s ease;will-change:transform}
.cx-btn:hover{box-shadow:0 10px 30px -10px var(--accent)}
.cx-btn--ghost{background:transparent;color:var(--text);border-color:var(--line)}
.cx-btn--ghost:hover{border-color:var(--text);box-shadow:none}
.cx-btn svg{width:1em;height:1em}

/* header */
.cx-header{position:fixed;inset:0 0 auto;z-index:50;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem var(--gutter);background:linear-gradient(${p.background}e6,${p.background}00)}
.cx-logo{display:flex;align-items:center;gap:0.6rem;text-decoration:none;font-family:var(--font-display);font-size:1.25rem;${upper ? "text-transform:uppercase;letter-spacing:0.06em;" : ""}}
.cx-logo img{height:32px;width:auto}
.cx-nav{display:flex;align-items:center;gap:1.75rem}
.cx-nav a{text-decoration:none;color:var(--muted);font-size:0.92rem;transition:color .2s}
.cx-nav a:hover{color:var(--text)}
.cx-menu{display:none;position:relative}
.cx-menu summary{list-style:none;cursor:pointer;padding:0.5rem 0.8rem;border:1px solid var(--line);border-radius:var(--radius)}
.cx-menu summary::-webkit-details-marker{display:none}
.cx-menu div{position:absolute;right:0;top:calc(100% + 0.5rem);display:grid;gap:0.25rem;min-width:200px;padding:0.75rem;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius)}
.cx-menu div a{padding:0.5rem;text-decoration:none}
@media (max-width:767px){.cx-nav{display:none}.cx-menu{display:block}.cx-header .cx-btn{display:none}}

/* stages */
.cx-stage{position:relative;width:100%;height:100%;min-height:320px}
.cx-canvas{position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0;transition:opacity 1.2s ease}
.cx-stage--ready .cx-canvas{opacity:1}
.cx-fallback{position:absolute;inset:0;display:none;align-items:flex-end;justify-content:center;padding:1rem;border-radius:var(--radius-lg);background:radial-gradient(60% 55% at 50% 45%,${mix(p.accent, p.background, 0.35)} 0%,${p.background}00 70%),radial-gradient(40% 40% at 65% 60%,${mix(p.accent2, p.background, 0.45)} 0%,${p.background}00 70%)}
.cx-fallback span{font-size:0.75rem;color:var(--muted)}
.cx-stage--fallback .cx-fallback{display:flex}
.cx-stage--fallback .cx-canvas{display:none}
.cx-stage--off{display:none}
.cx-stage-bg{position:fixed;inset:0;z-index:0;pointer-events:none}
.cx-stage-bg .cx-stage{height:100vh;min-height:0}
.cx-has-bg-stage .cx-header,.cx-has-bg-stage main,.cx-has-bg-stage footer{position:relative;z-index:1}

/* hero */
.cx-hero{min-height:100svh;display:flex;align-items:center;padding-top:7rem;padding-bottom:4rem}
.cx-hero-grid{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,1fr);gap:clamp(1rem,4vw,4rem);align-items:center}
.cx-hero-grid .cx-stage{height:min(78vh,760px)}
.cx-hero-grid h1{font-size:clamp(2.4rem,1.2rem + 3.9vw,${(5.6 * scale).toFixed(2)}rem);overflow-wrap:break-word;hyphens:auto}
.cx-hero--centered{text-align:center}
.cx-hero--centered .cx-wrap{display:flex;flex-direction:column;align-items:center}
.cx-hero--centered p{margin-left:auto;margin-right:auto}
.cx-hero-lead{font-size:var(--step-1);color:var(--muted);margin-top:1.5rem;line-height:1.45}
.cx-actions{display:flex;flex-wrap:wrap;gap:0.9rem;margin-top:2.25rem}
.cx-hero--centered .cx-actions{justify-content:center}
.cx-hero-media{margin-top:3.5rem;width:100%;border-radius:var(--radius-lg);overflow:hidden;aspect-ratio:16/8}
.cx-hero-media img{width:100%;height:100%;object-fit:cover}
.cx-scroll-hint{position:absolute;bottom:2rem;left:50%;transform:translateX(-50%);font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:var(--muted)}
@media (max-width:900px){.cx-hero-grid{grid-template-columns:1fr}.cx-hero-grid .cx-stage{height:52vh;order:-1}}

/* word reveal */
.cx-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:0.08em;margin-bottom:-0.08em}
.cx-w>span{display:inline-block;will-change:transform}

/* showcase */
.cx-showcase{padding:0}
.cx-showcase .cx-sticky{position:sticky;top:0;height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:center;gap:2rem}
.cx-showcase .cx-stage{height:80vh}
.cx-steps{position:relative;min-height:40vh}
.cx-step h3{margin-bottom:0.75rem}
.cx-step .cx-step-meta{font-size:0.8rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--accent);margin-bottom:0.75rem;display:block}
@media (min-width:768px){
  html.cx-booted:not(.cx-static) .cx-showcase .cx-step{position:absolute;inset:auto 0 auto 0;top:50%;transform:translateY(-40%);opacity:0;transition:opacity .6s ease,transform .6s ease;pointer-events:none}
  html.cx-booted:not(.cx-static) .cx-showcase .cx-step.is-active{opacity:1;transform:translateY(-50%);pointer-events:auto}
}
@media (max-width:767px){.cx-showcase .cx-sticky{position:relative;height:auto;grid-template-columns:1fr;padding:var(--section) 0}.cx-showcase .cx-stage{height:56vh}.cx-showcase{height:auto!important}.cx-step{margin-bottom:2rem}}

/* exploded */
.cx-exploded-grid{display:grid;grid-template-columns:1.2fr 0.8fr;gap:3rem;align-items:center}
.cx-exploded .cx-stage{height:min(80vh,720px)}
.cx-parts{list-style:none;padding:0;margin:2rem 0 0;display:grid;gap:1.25rem}
.cx-parts li{border-top:1px solid var(--line);padding-top:1rem}
.cx-parts strong{display:block;font-family:var(--font-display);font-size:var(--step-1);font-weight:inherit}
@media (max-width:900px){.cx-exploded-grid{grid-template-columns:1fr}}

/* story */
.cx-story{min-height:100vh;display:flex;align-items:center}
.cx-story-grid{display:grid;grid-template-columns:1fr 1fr;gap:clamp(2rem,6vw,6rem);align-items:center}
.cx-story-steps{display:grid;gap:1.5rem;counter-reset:step}
.cx-story-step{padding:1.5rem 0 1.5rem 1.5rem;border-left:2px solid var(--line);transition:border-color .4s ease,opacity .4s ease}
.cx-pinning .cx-story-step{opacity:0.32}
.cx-pinning .cx-story-step.is-active{opacity:1;border-color:var(--accent)}
@media (max-width:767px){.cx-story-grid{grid-template-columns:1fr}}

/* features */
.cx-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:end;gap:2rem;margin-bottom:clamp(2.5rem,6vw,5rem)}
.cx-head p{color:var(--muted);margin:0}
.cx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden}
.cx-card{background:var(--bg);padding:clamp(1.75rem,3vw,2.75rem);transition:background-color .3s ease}
.cx-card:hover{background:var(--surface)}
.cx-card .cx-num{font-family:var(--font-display);color:var(--accent);font-size:0.95rem;display:block;margin-bottom:2.5rem}
.cx-card h3{margin-bottom:0.75rem}
.cx-card p{color:var(--muted);margin:0}

/* kinetic type */
.cx-kinetic{padding:clamp(3rem,8vw,6rem) 0;overflow:hidden;border-block:1px solid var(--line)}
.cx-marquee-track{display:flex;width:max-content;gap:3rem;white-space:nowrap}
.cx-marquee-track span{font-family:var(--font-display);font-size:clamp(3rem,10vw,9rem);line-height:1;${upper ? "text-transform:uppercase;" : ""}}
.cx-marquee-track span:nth-child(even){color:transparent;-webkit-text-stroke:1px var(--text)}
.cx-static .cx-marquee-track{flex-wrap:wrap;width:auto;white-space:normal}

/* gallery */
.cx-gallery-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:clamp(0.75rem,1.5vw,1.25rem)}
.cx-gallery-grid figure{margin:0;grid-column:span 4}
.cx-gallery-grid figure:nth-child(5n+1){grid-column:span 7}
.cx-gallery-grid figure:nth-child(5n+2){grid-column:span 5}
.cx-media{overflow:hidden;border-radius:var(--radius);aspect-ratio:4/3;background:var(--surface)}
.cx-media img{width:100%;height:100%;object-fit:cover;transition:transform .8s cubic-bezier(.2,.7,.2,1)}
figure:hover .cx-media img{transform:scale(1.04)}
.cx-art{width:100%;height:100%;display:grid;place-items:center;font-family:var(--font-display);font-size:var(--step-2);color:var(--muted);background:radial-gradient(80% 80% at 20% 20%,${mix(p.accent, p.surface, 0.55)},${p.surface})}
figcaption{display:flex;justify-content:space-between;gap:1rem;font-size:0.9rem;color:var(--muted);padding-top:0.75rem}
figcaption strong{color:var(--text);font-weight:500}
@media (max-width:767px){.cx-gallery-grid figure,.cx-gallery-grid figure:nth-child(n){grid-column:span 12}}

/* horizontal */
.cx-horizontal{overflow:hidden}
.cx-h-track{display:flex;gap:clamp(1rem,2vw,2rem);padding:0 var(--gutter);margin-top:3rem;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.cx-h-active .cx-h-track{overflow:visible}
.cx-h-card{flex:0 0 min(78vw,520px);scroll-snap-align:start;background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden}
.cx-h-card .cx-media{border-radius:0;aspect-ratio:16/11}
.cx-h-card .cx-h-body{padding:1.5rem 1.75rem 2rem}
.cx-h-card .cx-step-meta{font-size:0.78rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--accent)}
.cx-h-card h3{margin:0.5rem 0 0.75rem}
.cx-h-card p{color:var(--muted);margin:0}

/* abstract scene */
.cx-abstract{min-height:100vh;display:grid;place-items:center;padding:0;overflow:hidden}
.cx-abstract .cx-stage{position:absolute;inset:0;min-height:0}
.cx-abstract .cx-overlay{position:relative;z-index:1;text-align:center;pointer-events:none;padding:var(--section) var(--gutter)}
.cx-abstract .cx-overlay p{margin-inline:auto;color:var(--muted)}

/* specs */
.cx-specs dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:0;margin:0;border-top:1px solid var(--line)}
.cx-specs dl div{padding:1.5rem 1.5rem 1.5rem 0;border-bottom:1px solid var(--line)}
.cx-specs dt{font-size:0.8rem;letter-spacing:0.14em;text-transform:uppercase;color:var(--muted)}
.cx-specs dd{margin:0.5rem 0 0;font-family:var(--font-display);font-size:var(--step-2);line-height:1.1}

/* pricing */
.cx-plans{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr));gap:1.25rem}
.cx-plan{display:flex;flex-direction:column;gap:1.25rem;padding:2rem;border:1px solid var(--line);border-radius:var(--radius-lg);background:var(--surface);transition:transform .3s ease,border-color .3s ease}
.cx-plan:hover{border-color:var(--accent);transform:translateY(-4px)}
.cx-plan:nth-child(2){border-color:var(--accent)}
.cx-price{font-family:var(--font-display);font-size:var(--step-3);line-height:1}
.cx-plan ul{list-style:none;padding:0;margin:0;display:grid;gap:0.6rem;color:var(--muted);flex:1}
.cx-plan li::before{content:"";display:inline-block;width:0.45rem;height:0.45rem;border-radius:50%;background:var(--accent);margin-right:0.7rem;vertical-align:middle}

/* faq */
.cx-faq-list{border-top:1px solid var(--line);max-width:900px}
.cx-faq-list details{border-bottom:1px solid var(--line)}
.cx-faq-list summary{display:flex;justify-content:space-between;gap:1rem;padding:1.4rem 0;cursor:pointer;list-style:none;font-size:var(--step-1);font-family:var(--font-display)}
.cx-faq-list summary::-webkit-details-marker{display:none}
.cx-faq-list summary::after{content:"+";color:var(--accent);transition:transform .3s ease}
.cx-faq-list details[open] summary::after{transform:rotate(45deg)}
.cx-faq-list details p{color:var(--muted);padding-bottom:1.4rem}

/* cta + contact */
.cx-cta{text-align:center}
.cx-cta h2{font-size:var(--step-4);max-width:16ch;margin:0 auto}
.cx-cta p{margin:1.5rem auto 0;color:var(--muted)}
.cx-cta .cx-actions{justify-content:center}
.cx-contact-grid{display:grid;grid-template-columns:1fr 1fr;gap:3rem}
.cx-form{display:grid;gap:1rem}
.cx-form label{display:grid;gap:0.4rem;font-size:0.9rem;color:var(--muted)}
.cx-form input,.cx-form textarea{font:inherit;color:var(--text);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:0.85rem 1rem}
.cx-form textarea{min-height:140px;resize:vertical}
@media (max-width:767px){.cx-contact-grid{grid-template-columns:1fr}}

/* footer */
.cx-footer{border-top:1px solid var(--line);padding:3rem 0;color:var(--muted);font-size:0.9rem}
.cx-footer .cx-wrap{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem}

/* scroll film (pre-rendered video, scrubbed by scroll) */
.cx-film{position:relative;height:var(--cx-film-h,300vh);background:var(--bg)}
.cx-film-stage{position:sticky;top:0;height:100svh;overflow:hidden}
.cx-film-poster,.cx-film-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:center 45%}
.cx-film-video{z-index:1}
.cx-film.has-clip .cx-film-poster{opacity:0}
.cx-film-scrim{position:absolute;inset:0;z-index:2;background:linear-gradient(90deg,${p.background}e6 0%,${p.background}99 28%,${p.background}00 58%)}
.cx-film-copy{position:absolute;inset:0;z-index:3;display:flex;flex-direction:column;justify-content:center;pointer-events:none}
.cx-film-copy>*{max-width:min(40rem,46vw)}
.cx-film-copy h2{font-size:var(--step-3)}
.cx-film-copy p{margin-top:1rem}
.cx-film-steps{list-style:none;padding:0;margin:2rem 0 0;position:relative;min-height:9rem}
.cx-film-steps li{display:grid;gap:0.35rem;max-width:34ch}
.cx-film-steps strong{font-family:var(--font-display);font-weight:inherit;font-size:var(--step-1)}
.cx-film-steps span:last-child{color:var(--muted)}
html.cx-booted:not(.cx-static) .cx-film-steps li{position:absolute;top:0;left:0;opacity:0;transform:translateY(12px);transition:opacity .5s ease,transform .5s ease}
html.cx-booted:not(.cx-static) .cx-film-steps li.is-active{opacity:1;transform:none}
.cx-film-progress{position:absolute;left:var(--gutter);right:var(--gutter);bottom:1.5rem;z-index:3;height:2px;background:${p.text}22}
.cx-film-progress span{display:block;height:100%;transform-origin:left;transform:scaleX(0);background:var(--accent)}
html.cx-static .cx-film,html.cx-reduced .cx-film{height:auto}
html.cx-static .cx-film-stage,html.cx-reduced .cx-film-stage{position:relative;height:min(100svh,820px)}
@media (max-width:860px){
  .cx-film-scrim{background:linear-gradient(0deg,${p.background}f2 8%,${p.background}99 38%,${p.background}00 62%)}
  .cx-film-copy{justify-content:flex-end;padding-bottom:calc(3.5rem + env(safe-area-inset-bottom))}
  .cx-film-copy>*{max-width:none}
  .cx-film-steps{min-height:7rem}
}

/* depth gallery (WebGL layer added by the runtime; the grid stays as fallback) */
.cx-depth-stage{position:sticky;top:0;height:100svh;overflow:hidden}
.cx-depth-stage canvas{position:absolute;inset:0;width:100%;height:100%}
.cx-depth-label{position:absolute;right:var(--gutter);bottom:2rem;z-index:2;max-width:22rem;text-align:right}
.cx-depth-label strong{display:block;font-family:var(--font-display);font-weight:inherit;font-size:var(--step-1)}
.cx-depth-label span{color:var(--muted);font-size:0.9rem}
.cx-depth-head{position:absolute;left:var(--gutter);top:6rem;z-index:2;max-width:28rem}
.cx-depth.cx-depth--on>.cx-wrap{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.cx-depth.cx-depth--on{padding:0}

/* cursor */
.cx-cursor{opacity:0;position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border:1px solid var(--accent);border-radius:50%;pointer-events:none;z-index:200;transition:width .25s,height .25s,margin .25s,background-color .25s}
.cx-cursor.is-on{opacity:1}
.cx-cursor.is-link{width:56px;height:56px;margin:-28px 0 0 -28px;background:${p.accent}22}

/* pre-animation states (only while the runtime is active and motion is allowed) */
html.cx-js:not(.cx-static):not(.cx-reduced) [data-cx-stagger]>*{opacity:0}
html.cx-js:not(.cx-static):not(.cx-reduced) .cx-section[data-cx-transition]>.cx-inner{opacity:0}
html.cx-static [data-cx-stagger]>*,html.cx-static .cx-inner{opacity:1!important;transform:none!important}

@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:0.001ms!important;animation-iteration-count:1!important;transition-duration:0.001ms!important;scroll-behavior:auto!important}
  .cx-cursor{display:none}
}
`.trim();
}
