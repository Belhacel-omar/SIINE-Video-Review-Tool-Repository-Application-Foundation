import { describe, expect, it } from "vitest";
import {
  BUNNY_PLAYBACK_TTL_SECONDS,
  signBunnyUrl,
  validateBunnySourceUrl,
} from "@/lib/video/bunny-signing";

describe("Bunny token signing", () => {
  it("matches the verified decoded-path HS256 signing contract", () => {
    const signed = signBunnyUrl(
      "https://siine.b-cdn.net/physics%20BEM/L1/1.mp4?ignored=yes",
      "test-secret-key",
      "1893456000",
    );

    expect(signed).toBe(
      "https://siine.b-cdn.net/physics%20BEM/L1/1.mp4" +
        "?token=HS256-fmadDYnmU85UZhpesgcC78kaN3i6JPGC2f8hII2l4pk" +
        "&expires=1893456000",
    );
  });

  it("keeps the public pathname encoded and drops arbitrary source query parameters", () => {
    const signed = signBunnyUrl(
      "https://siine.b-cdn.net/folder%20name/video.mp4?foo=bar#fragment",
      "secret",
      "2000000000",
    );
    const url = new URL(signed);

    expect(url.hostname).toBe("siine.b-cdn.net");
    expect(url.pathname).toBe("/folder%20name/video.mp4");
    expect(url.searchParams.has("foo")).toBe(false);
    expect(url.hash).toBe("");
    expect(url.searchParams.get("token")).toMatch(
      /^HS256-[A-Za-z0-9_-]+$/,
    );
    expect(url.searchParams.get("expires")).toBe("2000000000");
  });

  it("accepts only the expected HTTPS Bunny delivery host", () => {
    expect(() =>
      validateBunnySourceUrl(
        "https://siine.b-cdn.net/physics%20BEM/L1/1.mp4",
      ),
    ).not.toThrow();

    expect(() =>
      validateBunnySourceUrl(
        "http://siine.b-cdn.net/physics%20BEM/L1/1.mp4",
      ),
    ).toThrow();
    expect(() =>
      validateBunnySourceUrl(
        "https://evil.example/physics%20BEM/L1/1.mp4",
      ),
    ).toThrow();
  });

  it("keeps the approved playback TTL at 15 minutes", () => {
    expect(BUNNY_PLAYBACK_TTL_SECONDS).toBe(900);
  });
});
