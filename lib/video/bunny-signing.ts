import { createHmac } from "node:crypto";

export const BUNNY_DELIVERY_HOST = "siine.b-cdn.net";
export const BUNNY_PLAYBACK_TTL_SECONDS = 15 * 60;

function base64Url(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function validateBunnySourceUrl(sourceUrl: string) {
  let parsed: URL;

  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("Invalid Bunny source URL");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.host.toLowerCase() !== BUNNY_DELIVERY_HOST
  ) {
    throw new Error("Invalid Bunny source URL");
  }

  return parsed;
}

export function signBunnyUrl(
  sourceUrl: string,
  securityKey: string,
  expires: string,
) {
  const parsed = validateBunnySourceUrl(sourceUrl);
  const encodedPath = parsed.pathname;
  let decodedPath = encodedPath;

  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    // Preserve the encoded path as the signing input only for malformed escapes.
  }

  const digest = createHmac("sha256", securityKey)
    .update(decodedPath)
    .update(expires)
    .digest();

  const token = `HS256-${base64Url(digest)}`;

  return `${parsed.protocol}//${parsed.host}${encodedPath}?token=${token}&expires=${expires}`;
}
