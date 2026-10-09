import { describe, expect, it } from "vitest";
import { inspectModel, sniffImage, UploadError } from "@/lib/assets/validate";

function glb(json: object, bin = new Uint8Array(4)): Uint8Array {
  let jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (jsonBytes.length % 4)) % 4;
  jsonBytes = new Uint8Array([...jsonBytes, ...new Array(pad).fill(0x20)]);
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, total, true);
  v.setUint32(12, jsonBytes.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  out.set(jsonBytes, 20);
  v.setUint32(20 + jsonBytes.length, bin.length, true);
  v.setUint32(24 + jsonBytes.length, 0x004e4942, true);
  out.set(bin, 28 + jsonBytes.length);
  return out;
}

describe("upload validation", () => {
  it("detects separable GLB models", () => {
    const sep = inspectModel(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], meshes: [{}, {}], nodes: [{ children: [1, 2] }, { mesh: 0 }, { mesh: 1 }], scenes: [{ nodes: [0] }] }), "a.glb");
    expect(sep.meta).toEqual({ meshCount: 2, separable: true });
    const single = inspectModel(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], meshes: [{}], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }] }), "b.glb");
    expect(single.meta.separable).toBe(false);
  });

  it("rejects external resources, wrong versions and truncated files", () => {
    expect(() => inspectModel(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }, { uri: "https://evil.example/x.bin", byteLength: 4 }], meshes: [{}], nodes: [{ mesh: 0 }] }), "c.glb")).toThrow(UploadError);
    expect(() => inspectModel(glb({ asset: { version: "1.0" }, meshes: [{}], nodes: [{ mesh: 0 }] }), "d.glb")).toThrow(/2.0/);
    expect(() => inspectModel(glb({ asset: { version: "2.0" }, buffers: [{ byteLength: 4 }], meshes: [{}], nodes: [{ mesh: 0 }] }).slice(0, 30), "e.glb")).toThrow(/truncated/);
    expect(() => inspectModel(new TextEncoder().encode("<html>"), "f.glb")).toThrow(UploadError);
  });

  it("sniffs images by content, not extension", () => {
    expect(sniffImage(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImage(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });
});
