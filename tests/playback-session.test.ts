import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "31749ded-f2bd-461f-8bb0-32770544b472";
const SOURCE_URL =
  "https://siine.b-cdn.net/physics%20BEM/L1/1.mp4";

const mocks = vi.hoisted(() => ({
  getVideo: vi.fn(),
}));

vi.mock("@/lib/courses/service", () => ({
  getVideo: mocks.getVideo,
}));

import { createPlaybackSession } from "@/lib/video/playback-session";

describe("playback-session service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getVideo.mockResolvedValue({
      id: VIDEO_ID,
      bunnyUrl: SOURCE_URL,
    });
  });

  it("uses the owner-scoped video lookup", async () => {
    await createPlaybackSession(USER_ID, VIDEO_ID, {
      securityKey: "test-secret-key",
      nowMs: 1893455100000,
    });

    expect(mocks.getVideo).toHaveBeenCalledWith(USER_ID, VIDEO_ID);
  });

  it.each(["unknown", "non-owner"])(
    "propagates the same safe 404 for %s video",
    async () => {
      mocks.getVideo.mockRejectedValue(
        new ApiError(404, "NOT_FOUND", "Resource not found."),
      );

      await expect(
        createPlaybackSession(USER_ID, VIDEO_ID, {
          securityKey: "test-secret-key",
        }),
      ).rejects.toMatchObject({
        status: 404,
        code: "NOT_FOUND",
        message: "Resource not found.",
      });
    },
  );

  it("returns a safe 503 when the signing key is missing", async () => {
    await expect(
      createPlaybackSession(USER_ID, VIDEO_ID, {
        securityKey: "   ",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "PLAYBACK_UNAVAILABLE",
      message: "Playback service is temporarily unavailable.",
    });
  });

  it.each([
    "http://siine.b-cdn.net/physics%20BEM/L1/1.mp4",
    "https://evil.example/physics%20BEM/L1/1.mp4",
    "not-a-url",
  ])("rejects unexpected stored media configuration safely: %s", async (bunnyUrl) => {
    mocks.getVideo.mockResolvedValue({
      id: VIDEO_ID,
      bunnyUrl,
    });

    await expect(
      createPlaybackSession(USER_ID, VIDEO_ID, {
        securityKey: "test-secret-key",
      }),
    ).rejects.toMatchObject({
      status: 500,
      code: "INTERNAL_ERROR",
      message: "An internal error occurred.",
    });
  });

  it("returns a 15-minute signed session with encoded public path", async () => {
    const session = await createPlaybackSession(USER_ID, VIDEO_ID, {
      securityKey: "test-secret-key",
      nowMs: 1893455100000,
    });

    expect(session).toEqual({
      streamUrl:
        "https://siine.b-cdn.net/physics%20BEM/L1/1.mp4" +
        "?token=HS256-fmadDYnmU85UZhpesgcC78kaN3i6JPGC2f8hII2l4pk" +
        "&expires=1893456000",
      expiresIn: 900,
      provider: "bunny-token-auth",
    });

    const signed = new URL(session.streamUrl);
    expect(signed.hostname).toBe("siine.b-cdn.net");
    expect(signed.pathname).toBe("/physics%20BEM/L1/1.mp4");
    expect(Number(signed.searchParams.get("expires"))).toBe(1893456000);
    expect(session.streamUrl).not.toContain("test-secret-key");
  });
});
