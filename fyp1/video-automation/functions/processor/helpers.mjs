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

export function safeText(value, fallback, maximumLength) {
  const text = String(value || fallback || "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, maximumLength) || String(fallback || "").slice(0, maximumLength);
}

export function titleFromStem(sourceStem) {
  return safeText(
    sourceStem.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
    "Untitled Video",
    120
  );
}
