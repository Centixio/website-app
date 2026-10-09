// Browser entry for the offline film renderer (driven by scripts/render-films.mjs).
import { Studio } from "./studio.js";
import { buildWorld } from "./world.js";
import { buildProductFilm, PRODUCT_FILMS } from "./products.js";

let studio = null;
let film = null;

window.FILM = {
  list() {
    return ["world", ...Object.keys(PRODUCT_FILMS)];
  },
  setup({ id, width, height, portrait = false, supersample = 2 }) {
    const opts = id === "world" ? { background: "#0B0B0D", bloom: 0.32, aperture: 0.0011 } : PRODUCT_FILMS[id].studio;
    studio = new Studio({ width, height, supersample, ...opts });
    film = id === "world" ? buildWorld(studio, { portrait }) : buildProductFilm(id, studio, { portrait });
    return film.segments.map((s) => ({ name: s.name, seconds: s.seconds, kind: s.kind ?? "clip" }));
  },
  frame(segIndex, frameIndex, frameCount) {
    const seg = film.segments[segIndex];
    const u = frameCount <= 1 ? 0 : frameIndex / (frameCount - 1);
    film.frame(seg, u);
    return studio.render();
  },
};
