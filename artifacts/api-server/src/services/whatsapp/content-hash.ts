import { createHash } from "node:crypto";

/** Normalize edilmiş tam metin hash — agresif birleştirme yok. */
export function normalizeJobContent(text: string): string {
  return String(text ?? "")
    .toLocaleLowerCase("tr-TR")
    .replace(/https?:\/\/[^\s]+/gi, (url) => {
      try {
        const u = new URL(url);
        u.search = "";
        u.hash = "";
        return u.toString();
      } catch {
        return url.split("?")[0] ?? url;
      }
    })
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentHash(text: string): string {
  return createHash("sha256").update(normalizeJobContent(text), "utf8").digest("hex");
}
