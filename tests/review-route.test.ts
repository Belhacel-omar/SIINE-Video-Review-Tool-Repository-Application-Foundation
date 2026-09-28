import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  saveReview: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/reviews/service", () => ({
  saveReview: mocks.saveReview,
}));

import { PUT } from "@/app/api/videos/[videoId]/review/route";

function request(body: unknown) {
  return new Request(`http://localhost/api/videos/${VIDEO_ID}/review`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function put(body: unknown, videoId = VIDEO_ID) {
  return PUT(request(body), {
    params: Promise.resolve({ videoId }),
  });
}

describe("PUT /api/videos/:videoId/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      user: { id: USER_ID, email: "admin@example.com" },
      response: null,
    });
    mocks.saveReview.mockResolvedValue({
      videoId: VIDEO_ID,
      note: null,
      wasPlayed: false,
      reviewedAt: null,
    });
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Authentication required." },
        }),
        { status: 401 },
      ),
    });

    const response = await put({ note: null, wasPlayed: false });

    expect(response.status).toBe(401);
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });

  it("rejects malformed video UUID", async () => {
    const response = await put(
      { note: null, wasPlayed: false },
      "not-a-uuid",
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Invalid video ID." },
    });
  });

  it("rejects malformed JSON", async () => {
    const response = await PUT(
      new Request(`http://localhost/api/videos/${VIDEO_ID}/review`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: "{not-json",
      }),
      { params: Promise.resolve({ videoId: VIDEO_ID }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });

  it.each([
    [{ note: null }, "missing wasPlayed"],
    [{ note: null, wasPlayed: "true" }, "string wasPlayed"],
    [{ note: null, wasPlayed: 1 }, "numeric wasPlayed"],
    [{ note: { value: "note" }, wasPlayed: false }, "object note"],
    [{ note: ["note"], wasPlayed: false }, "array note"],
    [{ note: "x".repeat(10_001), wasPlayed: false }, "overlong note"],
  ])("rejects invalid input: %s", async (body) => {
    const response = await put(body);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Invalid review." },
    });
    expect(mocks.saveReview).not.toHaveBeenCalled();
  });

  it("normalizes whitespace-only note to null", async () => {
    const response = await put({
      note: "   \n\t ",
      wasPlayed: false,
    });

    expect(response.status).toBe(200);
    expect(mocks.saveReview).toHaveBeenCalledWith(
      USER_ID,
      VIDEO_ID,
      { note: null, wasPlayed: false },
    );
  });

  it("trims a note before persistence", async () => {
    await put({
      note: "  keep this note  ",
      wasPlayed: false,
    });

    expect(mocks.saveReview).toHaveBeenCalledWith(
      USER_ID,
      VIDEO_ID,
      { note: "keep this note", wasPlayed: false },
    );
  });

  it("uses reviewer identity only from the authenticated session", async () => {
    await put({
      note: "note",
      wasPlayed: true,
      reviewerId: "99999999-9999-4999-8999-999999999999",
      userId: "99999999-9999-4999-8999-999999999999",
    });

    expect(mocks.saveReview).toHaveBeenCalledWith(
      USER_ID,
      VIDEO_ID,
      { note: "note", wasPlayed: true },
    );
  });

  it("returns a safe 404 for an unknown video", async () => {
    mocks.saveReview.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Resource not found."),
    );

    const response = await put({ note: null, wasPlayed: false });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
  });

  it("returns the same safe 404 for a non-owned video", async () => {
    mocks.saveReview.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Resource not found."),
    );

    const response = await put({ note: "private", wasPlayed: true });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
  });

  it("returns only the safe review response", async () => {
    const reviewedAt = "2026-09-28T03:00:00.000Z";
    mocks.saveReview.mockResolvedValue({
      videoId: VIDEO_ID,
      note: "saved",
      wasPlayed: true,
      reviewedAt,
    });

    const response = await put({ note: "saved", wasPlayed: true });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      review: {
        videoId: VIDEO_ID,
        note: "saved",
        wasPlayed: true,
        reviewedAt,
      },
    });
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("session");
    expect(JSON.stringify(body)).not.toContain("sourceData");
  });

  it("converts unexpected failures to generic INTERNAL_ERROR", async () => {
    mocks.saveReview.mockRejectedValue(
      new Error("database-secret-stack-marker"),
    );

    const response = await put({ note: null, wasPlayed: false });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("database-secret-stack-marker");
  });
});
