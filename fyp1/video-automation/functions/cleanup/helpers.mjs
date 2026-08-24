import { createHash } from "node:crypto";
import { extname, posix } from "node:path";

export function normaliseKey(rawKey) {
  try {
    return decodeURIComponent(String(rawKey || "").replace(/\+/g, " "));
  } catch {
    return String(rawKey || "");
  }
}

export function videoIdentity(key) {
  const extension = extname(key);
  const sourceStem = posix.basename(key, extension);
  const slug = sourceStem
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "video";
  const suffix = createHash("sha256").update(key).digest("hex").slice(0, 8);
  return { sourceStem, videoId: `${slug}-${suffix}` };
}
