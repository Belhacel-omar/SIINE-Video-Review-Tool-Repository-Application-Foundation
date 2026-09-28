import type { CourseVideo, VideoReview } from "@/lib/frontend/task01";

export const MAX_REVIEW_NOTE_CHARS = 10_000;

export type PlaybackVisitState = {
  videoId: string | null;
  started: boolean;
};

export type PlaybackVisitEvent =
  | { type: "select"; videoId: string }
  | { type: "play" }
  | { type: "pause" }
  | { type: "loadedmetadata" }
  | { type: "error" };

export function createPlaybackVisit(videoId: string | null): PlaybackVisitState {
  return { videoId, started: false };
}

export function playbackVisitReducer(
  state: PlaybackVisitState,
  event: PlaybackVisitEvent,
): PlaybackVisitState {
  if (event.type === "select") {
    return createPlaybackVisit(event.videoId);
  }

  if (event.type === "play") {
    return { ...state, started: true };
  }

  return state;
}

export function persistedNote(video: Pick<CourseVideo, "review">) {
  return video.review?.note ?? "";
}

export function normalizeReviewNote(note: string) {
  const trimmed = note.trim();
  return trimmed ? trimmed : null;
}

export function validateReviewNote(note: string) {
  if (note.length > MAX_REVIEW_NOTE_CHARS) {
    return "Review note must be 10,000 characters or fewer.";
  }
  return null;
}

export function isPersistedReviewed(
  review: Pick<VideoReview, "reviewedAt"> | null | undefined,
) {
  return Boolean(review?.reviewedAt);
}

export function findInitialVideoId(videos: CourseVideo[]) {
  return (
    videos.find((video) => !isPersistedReviewed(video.review))?.id ??
    videos[0]?.id ??
    null
  );
}

export function findVideo(videos: CourseVideo[], videoId: string | null) {
  if (!videoId) return null;
  return videos.find((video) => video.id === videoId) ?? null;
}

export function getAdjacentVideoId(
  videos: CourseVideo[],
  currentVideoId: string,
  direction: "next" | "previous",
) {
  const index = videos.findIndex((video) => video.id === currentVideoId);
  if (index < 0) return null;

  const targetIndex = direction === "next" ? index + 1 : index - 1;
  return videos[targetIndex]?.id ?? null;
}

export function isNoteDirty(note: string, lastPersistedNote: string) {
  return note !== lastPersistedNote;
}

export function shouldConfirmVideoSwitch(
  currentVideoId: string | null,
  targetVideoId: string,
  dirty: boolean,
) {
  return Boolean(dirty && currentVideoId && currentVideoId !== targetVideoId);
}

export function resolveVideoSwitch(
  currentVideoId: string | null,
  targetVideoId: string,
  dirty: boolean,
  confirmed: boolean,
) {
  if (!shouldConfirmVideoSwitch(currentVideoId, targetVideoId, dirty)) {
    return targetVideoId;
  }
  return confirmed ? targetVideoId : currentVideoId;
}

export function createReviewRequest(
  videoId: string,
  note: string,
  playback: PlaybackVisitState,
) {
  return {
    videoId,
    body: {
      note: normalizeReviewNote(note),
      wasPlayed: playback.videoId === videoId && playback.started,
    },
  };
}

export function applyPersistedReview(
  videos: CourseVideo[],
  videoId: string,
  review: VideoReview,
) {
  return videos.map((video) =>
    video.id === videoId ? { ...video, review } : video,
  );
}

export function reviewedProgress(videos: CourseVideo[]) {
  const reviewed = videos.filter((video) =>
    isPersistedReviewed(video.review),
  ).length;
  return {
    reviewed,
    total: videos.length,
    percent:
      videos.length === 0 ? 0 : Math.round((reviewed / videos.length) * 100),
  };
}

export function selectionAfterSave(
  videos: CourseVideo[],
  currentVideoId: string,
  advance: boolean,
  saveSucceeded: boolean,
) {
  if (!saveSucceeded || !advance) return currentVideoId;
  return getAdjacentVideoId(videos, currentVideoId, "next") ?? currentVideoId;
}
