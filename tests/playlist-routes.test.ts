import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";
const VIDEO_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  listCourseVideos: vi.fn(),
  getVideo: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/courses/service", () => ({
  listCourseVideos: mocks.listCourseVideos,
  getVideo: mocks.getVideo,
}));

import { GET as playlistRoute } from "@/app/api/courses/[courseId]/videos/route";
import { GET as videoDetailRoute } from "@/app/api/videos/[videoId]/route";

describe("playlist and video detail routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      user: { id: USER_ID, email: "admin@example.com" },
      response: null,
    });
  });

  it("requires authentication for the playlist", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Authentication required." },
        }),
        { status: 401 },
      ),
    });

    const response = await playlistRoute(
      new Request(`http://localhost/api/courses/${COURSE_ID}/videos`),
      { params: Promise.resolve({ courseId: COURSE_ID }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.listCourseVideos).not.toHaveBeenCalled();
  });

  it("enforces course ownership and returns ordered safe video projections", async () => {
    mocks.listCourseVideos.mockResolvedValue([
      {
        id: VIDEO_ID,
        courseId: COURSE_ID,
        sourceRowNumber: 4,
        sourceVideoId: null,
        title: "First",
        bunnyUrl: "https://video.example.com/first",
        playlistOrder: 0,
        review: null,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        courseId: COURSE_ID,
        sourceRowNumber: 5,
        sourceVideoId: "SRC-2",
        title: "Second",
        bunnyUrl: "https://video.example.com/second",
        playlistOrder: 1,
        review: {
          note: "ok",
          wasPlayed: true,
          reviewedAt: "2026-09-26T12:00:00.000Z",
        },
      },
    ]);

    const response = await playlistRoute(
      new Request(`http://localhost/api/courses/${COURSE_ID}/videos`),
      { params: Promise.resolve({ courseId: COURSE_ID }) },
    );
    const body = await response.json();

    expect(mocks.listCourseVideos).toHaveBeenCalledWith(USER_ID, COURSE_ID);
    expect(body.videos.map((video: { playlistOrder: number }) => video.playlistOrder)).toEqual([
      0,
      1,
    ]);
    expect(JSON.stringify(body)).not.toContain("sourceData");
    expect(JSON.stringify(body)).not.toContain("source_data");
  });

  it("returns a safe 404 for a non-owned playlist", async () => {
    mocks.listCourseVideos.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Resource not found."),
    );

    const response = await playlistRoute(
      new Request(`http://localhost/api/courses/${COURSE_ID}/videos`),
      { params: Promise.resolve({ courseId: COURSE_ID }) },
    );

    expect(response.status).toBe(404);
  });

  it("requires authentication for video detail", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Authentication required." },
        }),
        { status: 401 },
      ),
    });

    const response = await videoDetailRoute(
      new Request(`http://localhost/api/videos/${VIDEO_ID}`),
      { params: Promise.resolve({ videoId: VIDEO_ID }) },
    );

    expect(response.status).toBe(401);
    expect(mocks.getVideo).not.toHaveBeenCalled();
  });

  it("returns an owned video detail without source_data", async () => {
    mocks.getVideo.mockResolvedValue({
      id: VIDEO_ID,
      courseId: COURSE_ID,
      sourceRowNumber: 4,
      sourceVideoId: null,
      title: "First",
      bunnyUrl: "https://video.example.com/first",
      playlistOrder: 0,
      review: null,
    });

    const response = await videoDetailRoute(
      new Request(`http://localhost/api/videos/${VIDEO_ID}`),
      { params: Promise.resolve({ videoId: VIDEO_ID }) },
    );
    const body = await response.json();

    expect(mocks.getVideo).toHaveBeenCalledWith(USER_ID, VIDEO_ID);
    expect(body.video.id).toBe(VIDEO_ID);
    expect(JSON.stringify(body)).not.toContain("sourceData");
  });

  it("does not expose another user's video", async () => {
    mocks.getVideo.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Resource not found."),
    );

    const response = await videoDetailRoute(
      new Request(`http://localhost/api/videos/${VIDEO_ID}`),
      { params: Promise.resolve({ videoId: VIDEO_ID }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
  });
});
