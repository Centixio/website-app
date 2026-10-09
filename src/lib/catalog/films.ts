/**
 * Pre-rendered, scroll-scrubbed films (rendered offline by
 * scripts/render-films.mjs from films/src/*). Sites reference them by id only;
 * the assembler resolves paths, so specs can never point at arbitrary video.
 *
 * Scroll-controlled video ≠ real-time 3D: a film is a fixed camera move that
 * scroll scrubs through; the interactive 3D stage still runs live elsewhere.
 */
export interface FilmDef {
  id: string;
  name: string;
  seconds: number;
  /** Paths relative to the public root (served at /films/... ; copied to films/... in ZIP exports). */
  files: { desktop: string; mobile: string; poster: string; posterMobile: string };
  /** Approximate bytes, for single-file export budgeting. */
  approxBytes: number;
  description: string;
}

const film = (id: string, name: string, seconds: number, approxBytes: number, description: string): FilmDef => ({
  id,
  name,
  seconds,
  approxBytes,
  description,
  files: { desktop: `films/${id}/film.mp4`, mobile: `films/${id}/film-m.mp4`, poster: `films/${id}/film.webp`, posterMobile: `films/${id}/film-m.webp` },
});

export const FILMS: FilmDef[] = [
  film("nocturne", "Perfume macro sweep", 9, 7_000_000, "A slow descent around a glass flacon with amber liquid and drifting gold dust."),
  film("halcyon", "Headphones exploded view", 9, 6_000_000, "An orbit around over-ear headphones that separate into parts and reassemble."),
  film("shardfall", "Crystal field flight", 9, 7_000_000, "A low neon flight through a field of glowing crystal clusters."),
  film("arcos", "Pavilion at golden hour", 10, 6_000_000, "An architectural orbit as afternoon light turns to golden hour."),
];

export function getFilm(id: string | null | undefined): FilmDef | undefined {
  return FILMS.find((f) => f.id === id);
}
