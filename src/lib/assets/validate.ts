import { LIMITS } from "@/config/limits";

export type AssetKind = "image" | "logo" | "model" | "reference" | "favicon" | "social";

export interface ValidatedUpload {
  mimeType: string;
  meta: { separable?: boolean; meshCount?: number; width?: number; height?: number; dominantColor?: string };
}

export class UploadError extends Error {}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0) {
  return sig.every((b, i) => bytes[offset + i] === b);
}

/** Identify an image by its magic bytes (never trust the declared type or extension). */
export function sniffImage(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
  return null;
}

interface GltfJson {
  asset?: { version?: string };
  buffers?: { uri?: string; byteLength: number }[];
  images?: { uri?: string; bufferView?: number }[];
  meshes?: unknown[];
  nodes?: { mesh?: number; children?: number[] }[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
}

function inspectGltf(json: GltfJson, isGlb: boolean): ValidatedUpload["meta"] {
  if (!json.asset?.version?.startsWith("2")) throw new UploadError("Only glTF 2.0 models are supported.");
  // Every resource must be embedded: no external files and no remote URLs.
  for (const [i, b] of (json.buffers ?? []).entries()) {
    if (b.uri && !b.uri.startsWith("data:")) throw new UploadError("The model references an external .bin file. Export as a single .glb, or embed resources.");
    if (!b.uri && !(isGlb && i === 0)) throw new UploadError("The model has a buffer without data.");
  }
  for (const img of json.images ?? []) {
    if (img.uri && !img.uri.startsWith("data:")) throw new UploadError("The model references external textures. Export as a single .glb with embedded textures.");
  }
  const nodes = json.nodes ?? [];
  const meshCount = nodes.filter((n) => typeof n.mesh === "number").length;
  // Separable = the visible root has 2+ child branches containing meshes (what the runtime can move apart).
  const sceneRoots = json.scenes?.[json.scene ?? 0]?.nodes ?? [];
  const hasMesh = (idx: number, depth = 0): boolean => {
    const n = nodes[idx];
    if (!n || depth > 32) return false;
    return typeof n.mesh === "number" || (n.children ?? []).some((c) => hasMesh(c, depth + 1));
  };
  let branches = sceneRoots.filter((r) => hasMesh(r)).length;
  if (branches === 1) {
    const root = nodes[sceneRoots.find((r) => hasMesh(r))!];
    branches = (root.children ?? []).filter((c) => hasMesh(c)).length;
  }
  if (meshCount === 0) throw new UploadError("The model contains no meshes.");
  return { meshCount, separable: branches >= 2 };
}

export function inspectModel(bytes: Uint8Array, filename: string): ValidatedUpload {
  if (startsWith(bytes, [0x67, 0x6c, 0x54, 0x46])) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const version = view.getUint32(4, true);
    const length = view.getUint32(8, true);
    if (version !== 2) throw new UploadError("Only GLB version 2 is supported.");
    if (length !== bytes.byteLength) throw new UploadError("The GLB file is truncated or corrupted.");
    const chunkLen = view.getUint32(12, true);
    const chunkType = view.getUint32(16, true);
    if (chunkType !== 0x4e4f534a || 20 + chunkLen > bytes.byteLength) throw new UploadError("The GLB file has no valid JSON chunk.");
    const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + chunkLen))) as GltfJson;
    return { mimeType: "model/gltf-binary", meta: inspectGltf(json, true) };
  }
  if (/\.gltf$/i.test(filename)) {
    let json: GltfJson;
    try {
      json = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new UploadError("The .gltf file is not valid JSON.");
    }
    return { mimeType: "model/gltf+json", meta: inspectGltf(json, false) };
  }
  throw new UploadError("Upload a .glb or self-contained .gltf model.");
}

export async function validateUpload(kind: AssetKind, bytes: Uint8Array, filename: string): Promise<ValidatedUpload> {
  if (bytes.byteLength === 0) throw new UploadError("The file is empty.");
  if (kind === "model") {
    if (bytes.byteLength > LIMITS.upload.modelMaxBytes) throw new UploadError(`Models must be under ${LIMITS.upload.modelMaxBytes / 1048576} MB.`);
    return inspectModel(bytes, filename);
  }
  const max = kind === "reference" ? LIMITS.upload.referenceMaxBytes : LIMITS.upload.imageMaxBytes;
  if (bytes.byteLength > max) throw new UploadError(`Images must be under ${max / 1048576} MB.`);
  const mime = sniffImage(bytes);
  if (!mime) throw new UploadError("Unsupported image. Use PNG, JPEG, WebP or GIF.");
  if (mime === "image/x-icon" && kind !== "favicon") throw new UploadError("ICO files are only accepted as a favicon.");
  const meta: ValidatedUpload["meta"] = {};
  if (mime !== "image/x-icon") {
    try {
      const sharp = (await import("sharp")).default;
      const img = sharp(bytes, { failOn: "error", limitInputPixels: 64_000_000 });
      const md = await img.metadata();
      meta.width = md.width;
      meta.height = md.height;
      if (kind === "logo") {
        const stats = await img.stats();
        const d = stats.dominant;
        meta.dominantColor = `#${[d.r, d.g, d.b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
      }
    } catch {
      throw new UploadError("The image could not be decoded.");
    }
  }
  return { mimeType: mime, meta };
}
