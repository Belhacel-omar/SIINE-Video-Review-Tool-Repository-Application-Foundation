import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "31749ded-f2bd-461f-8bb0-32770544b472";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createPlaybackSession: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/video/playback-session", () => ({
  createPlaybackSession: mocks.createPlaybackSession,
}));

import { GET } from "@/app/api/videos/[videoId]/playback-session/route";

async function get(videoId = VIDEO_ID) {
  return GET(
    new Request(
      `http://localhost/api/videos/${videoId}/playback-session`,
    ),
    { params: Promise.resolve({ videoId }) },
  );
}

describe("GET /api/videos/:videoId/playback-session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      user: { id: USER_ID, email: "admin@example.com" },
      response: null,
    });
    mocks.createPlaybackSession.mockResolvedValue({
      streamUrl:
        "https://siine.b-cdn.net/physics%20BEM/L1/1.mp4" +
        "?token=HS256-example&expires=1893456000",
      expiresIn: 900,
      provider: "bunny-token-auth",
    });
  });

  it("requires authentication and disables caching on the error response", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        }),
        { status: 401 },
      ),
    });

    const response = await get();

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, max-age=0",
    );
    expect(mocks.createPlaybackSession).not.toHaveBeenCalled();
  });

  it("rejects malformed video UUID", async () => {
    const response = await get("not-a-uuid");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid video ID.",
      },
    });
  });

  it.each(["unknown", "non-owner"])(
    "returns the same safe 404 for %s video",
    async () => {
      mocks.createPlaybackSession.mockRejectedValue(
        new ApiError(404, "NOT_FOUND", "Resource not found."),
      );

      const response = await get();

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Resource not found.",
        },
      });
    },
  );

  it("returns a safe 503 when Bunny signing is not configured", async () => {
    mocks.createPlaybackSession.mockRejectedValue(
      new ApiError(
        503,
        "PLAYBACK_UNAVAILABLE",
        "Playback service is temporarily unavailable.",
      ),
    );

    const response = await get();

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, max-age=0",
    );
    expect(await response.json()).toEqual({
      error: {
        code: "PLAYBACK_UNAVAILABLE",
        message: "Playback service is temporarily unavailable.",
      },
    });
  });

  it("returns the signed playback contract with no-store headers", async () => {
    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, max-age=0",
    );
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(mocks.createPlaybackSession).toHaveBeenCalledWith(
      USER_ID,
      VIDEO_ID,
    );
    expect(body).toEqual({
      streamUrl:
        "https://siine.b-cdn.net/physics%20BEM/L1/1.mp4" +
        "?token=HS256-example&expires=1893456000",
      expiresIn: 900,
      provider: "bunny-token-auth",
    });
    expect(JSON.stringify(body)).not.toContain("BUNNY_TOKEN_AUTH_KEY");
    expect(JSON.stringify(body)).not.toContain("test-secret-key");
  });

  it("converts unexpected failures to a generic no-store internal error", async () => {
    mocks.createPlaybackSession.mockRejectedValue(
      new Error("secret-key-or-raw-url-leak-marker"),
    );

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe(
      "no-store, max-age=0",
    );
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("leak-marker");
  });
});
