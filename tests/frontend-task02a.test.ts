import { describe, expect, it } from "vitest";
import {
  failedPlaybackSource,
  loadedPlaybackSource,
  loadingPlaybackSource,
  playbackErrorMessage,
  playbackSessionPath,
} from "@/lib/frontend/playback-session";
import {
  createPlaybackVisit,
  createReviewRequest,
  playbackVisitReducer,
} from "@/lib/frontend/review-workspace";

describe("Frontend Task 02A signed Bunny playback", () => {
  it("requests the signed playback session for the exact current video ID", () => {
    expect(playbackSessionPath("31749ded-f2bd-461f-8bb0-32770544b472")).toBe(
      "/api/videos/31749ded-f2bd-461f-8bb0-32770544b472/playback-session",
    );
  });

  it("clears old playback source immediately while a fresh session loads", () => {
    expect(loadingPlaybackSource("video-b")).toEqual({
      videoId: "video-b",
      streamUrl: null,
      loading: true,
      error: null,
    });
  });

  it("accepts a successful signed URL only for the still-current video", () => {
    const streamUrl = "https://siine.b-cdn.net/L1/1.mp4?token=signed&expires=123";

    expect(loadedPlaybackSource("video-a", "video-a", streamUrl)).toEqual({
      videoId: "video-a",
      streamUrl,
      loading: false,
      error: null,
    });
    expect(loadedPlaybackSource("video-b", "video-a", streamUrl)).toBeNull();
  });

  it("changing videos requires a fresh endpoint path", () => {
    expect(playbackSessionPath("video-a")).not.toBe(
      playbackSessionPath("video-b"),
    );
  });

  it("maps 404, 503 and generic failures to safe retryable messages", () => {
    expect(playbackErrorMessage(404)).toBe("This video is no longer available.");
    expect(playbackErrorMessage(503)).toBe(
      "Playback is temporarily unavailable. Try again.",
    );
    expect(playbackErrorMessage(500)).toBe("Playback could not be loaded. Try again.");
    expect(playbackErrorMessage(null)).toBe("Playback could not be loaded. Try again.");

    expect(failedPlaybackSource("video-a", playbackErrorMessage(503))).toEqual({
      videoId: "video-a",
      streamUrl: null,
      loading: false,
      error: "Playback is temporarily unavailable. Try again.",
    });
  });

  it("playback-session success alone does not mark the visit as played", () => {
    const visit = createPlaybackVisit("video-a");
    loadedPlaybackSource(
      "video-a",
      "video-a",
      "https://siine.b-cdn.net/video.mp4?token=x&expires=1",
    );
    expect(visit.started).toBe(false);
  });

  it("real play still controls wasPlayed false before play and true after play", () => {
    const initial = createPlaybackVisit("video-a");
    expect(createReviewRequest("video-a", "note", initial).body.wasPlayed).toBe(false);

    const afterPlay = playbackVisitReducer(initial, { type: "play" });
    expect(createReviewRequest("video-a", "note", afterPlay).body.wasPlayed).toBe(true);
  });

  it("video-element errors do not mark playback started", () => {
    const afterError = playbackVisitReducer(createPlaybackVisit("video-a"), {
      type: "error",
    });
    expect(afterError.started).toBe(false);
  });

  it("signed playback state contains no raw Bunny source or signing secret fields", () => {
    const state = loadingPlaybackSource("video-a");
    expect(state).not.toHaveProperty("bunnyUrl");
    expect(state).not.toHaveProperty("token");
    expect(state).not.toHaveProperty("secret");
    expect(state).not.toHaveProperty("provider");
  });

  it("retry state changes do not carry review note data", () => {
    const note = "dirty reviewer note";
    const before = loadingPlaybackSource("video-a");
    const after = failedPlaybackSource("video-a", playbackErrorMessage(503));

    expect(note).toBe("dirty reviewer note");
    expect(before).not.toHaveProperty("note");
    expect(after).not.toHaveProperty("note");
  });
});
