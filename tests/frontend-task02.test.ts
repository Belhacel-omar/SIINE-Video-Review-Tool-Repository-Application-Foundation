import { describe, expect, it } from "vitest";
import type { CourseVideo, VideoReview } from "@/lib/frontend/task01";
import {
  MAX_REVIEW_NOTE_CHARS,
  applyPersistedReview,
  createPlaybackVisit,
  createReviewRequest,
  findInitialVideoId,
  getAdjacentVideoId,
  isNoteDirty,
  isPersistedReviewed,
  persistedNote,
  playbackVisitReducer,
  resolveVideoSwitch,
  reviewedProgress,
  selectionAfterSave,
  shouldConfirmVideoSwitch,
  validateReviewNote,
} from "@/lib/frontend/review-workspace";

function video(
  id: string,
  title: string,
  review: VideoReview | null = null,
): CourseVideo {
  return {
    id,
    courseId: "course-1",
    sourceRowNumber: 2,
    sourceVideoId: "SRC-" + id,
    title,
    bunnyUrl: "https://siine.b-cdn.net/" + id + ".mp4",
    playlistOrder: id === "a" ? 0 : id === "b" ? 1 : 2,
    review,
  };
}

describe("Frontend Task 02 review workspace helpers", () => {
  it("does not mark playback on selection or metadata load", () => {
    const selected = createPlaybackVisit("a");
    expect(selected).toEqual({ videoId: "a", started: false });

    const afterMetadata = playbackVisitReducer(selected, {
      type: "loadedmetadata",
    });
    expect(afterMetadata.started).toBe(false);
  });

  it("marks a real play event and pause does not reset it", () => {
    const selected = createPlaybackVisit("a");
    const afterPlay = playbackVisitReducer(selected, { type: "play" });
    const afterPause = playbackVisitReducer(afterPlay, { type: "pause" });

    expect(afterPlay.started).toBe(true);
    expect(afterPause.started).toBe(true);
  });

  it("resets playback-start state when a different video is selected", () => {
    const afterPlay = playbackVisitReducer(createPlaybackVisit("a"), {
      type: "play",
    });
    const switched = playbackVisitReducer(afterPlay, {
      type: "select",
      videoId: "b",
    });

    expect(switched).toEqual({ videoId: "b", started: false });
  });

  it("loads persisted notes independently even for duplicate titles", () => {
    const videos = [
      video("a", "Same title", {
        note: "Note A",
        wasPlayed: true,
        reviewedAt: "2026-09-28T00:00:00.000Z",
      }),
      video("b", "Same title", {
        note: "Note B",
        wasPlayed: false,
        reviewedAt: null,
      }),
    ];

    expect(persistedNote(videos[0])).toBe("Note A");
    expect(persistedNote(videos[1])).toBe("Note B");
    expect(videos[0].id).not.toBe(videos[1].id);
  });

  it("normalizes whitespace notes to null and sends the exact video ID", () => {
    const request = createReviewRequest(
      "video-123",
      "   ",
      createPlaybackVisit("video-123"),
    );

    expect(request).toEqual({
      videoId: "video-123",
      body: { note: null, wasPlayed: false },
    });
  });

  it("sends wasPlayed true only after a real play event", () => {
    const visit = playbackVisitReducer(createPlaybackVisit("video-123"), {
      type: "play",
    });
    const request = createReviewRequest("video-123", " useful note ", visit);

    expect(request.body).toEqual({
      note: "useful note",
      wasPlayed: true,
    });
  });

  it("enforces the backend 10,000-character note guard without truncation", () => {
    expect(validateReviewNote("x".repeat(MAX_REVIEW_NOTE_CHARS))).toBeNull();
    expect(validateReviewNote("x".repeat(MAX_REVIEW_NOTE_CHARS + 1))).toBe(
      "Review note must be 10,000 characters or fewer.",
    );
  });

  it("selects the first unreviewed video, otherwise the first video", () => {
    const reviewed: VideoReview = {
      note: null,
      wasPlayed: true,
      reviewedAt: "2026-09-28T00:00:00.000Z",
    };

    expect(
      findInitialVideoId([
        video("a", "A", reviewed),
        video("b", "B"),
        video("c", "C"),
      ]),
    ).toBe("b");

    expect(
      findInitialVideoId([
        video("a", "A", reviewed),
        video("b", "B", reviewed),
      ]),
    ).toBe("a");

    expect(findInitialVideoId([])).toBeNull();
  });

  it("updates only the saved video's authoritative review state", () => {
    const videos = [video("a", "Same"), video("b", "Same")];
    const saved: VideoReview = {
      note: "saved",
      wasPlayed: true,
      reviewedAt: "2026-09-28T00:00:00.000Z",
    };

    const updated = applyPersistedReview(videos, "b", saved);

    expect(updated[0].review).toBeNull();
    expect(updated[1].review).toEqual(saved);
    expect(isPersistedReviewed(updated[1].review)).toBe(true);
  });

  it("keeps a saved draft Not reviewed when reviewedAt is null", () => {
    const draft: VideoReview = {
      note: "draft",
      wasPlayed: false,
      reviewedAt: null,
    };
    expect(isPersistedReviewed(draft)).toBe(false);
  });

  it("updates persisted review progress only from reviewedAt", () => {
    const videos = [
      video("a", "A", {
        note: "draft",
        wasPlayed: false,
        reviewedAt: null,
      }),
      video("b", "B", {
        note: null,
        wasPlayed: true,
        reviewedAt: "2026-09-28T00:00:00.000Z",
      }),
    ];

    expect(reviewedProgress(videos)).toEqual({
      reviewed: 1,
      total: 2,
      percent: 50,
    });
  });

  it("protects dirty playlist switching and preserves selection on cancel", () => {
    expect(isNoteDirty("changed", "saved")).toBe(true);
    expect(shouldConfirmVideoSwitch("a", "b", true)).toBe(true);
    expect(resolveVideoSwitch("a", "b", true, false)).toBe("a");
    expect(resolveVideoSwitch("a", "b", true, true)).toBe("b");
    expect(resolveVideoSwitch("a", "b", false, false)).toBe("b");
  });

  it("advances only after successful Save & Next and remains safe on final video", () => {
    const videos = [video("a", "A"), video("b", "B")];

    expect(selectionAfterSave(videos, "a", true, false)).toBe("a");
    expect(selectionAfterSave(videos, "a", true, true)).toBe("b");
    expect(selectionAfterSave(videos, "b", true, true)).toBe("b");
    expect(selectionAfterSave(videos, "a", false, true)).toBe("a");
    expect(getAdjacentVideoId(videos, "b", "previous")).toBe("a");
  });

  it("a video error does not fake playback or reviewed state", () => {
    const selected = createPlaybackVisit("a");
    const afterError = playbackVisitReducer(selected, { type: "error" });

    expect(afterError.started).toBe(false);
    expect(isPersistedReviewed(null)).toBe(false);
  });
});
