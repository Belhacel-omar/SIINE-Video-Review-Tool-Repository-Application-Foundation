"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ApiRequestError,
  friendlyError,
  isUnauthorized,
  requestJson,
  type CourseDetail,
  type CourseVideo,
  type VideoReview,
} from "@/lib/frontend/task01";
import {
  failedPlaybackSource,
  loadedPlaybackSource,
  loadingPlaybackSource,
  playbackErrorMessage,
  playbackSessionPath,
  type PlaybackSessionResponse,
  type PlaybackSourceState,
} from "@/lib/frontend/playback-session";
import {
  MAX_REVIEW_NOTE_CHARS,
  applyPersistedReview,
  createPlaybackVisit,
  createReviewRequest,
  findInitialVideoId,
  findVideo,
  getAdjacentVideoId,
  isNoteDirty,
  isPersistedReviewed,
  persistedNote,
  playbackVisitReducer,
  reviewedProgress,
  shouldConfirmVideoSwitch,
  validateReviewNote,
} from "@/lib/frontend/review-workspace";

type SavedReview = VideoReview & {
  videoId: string;
};

const EMPTY_PLAYBACK_SOURCE: PlaybackSourceState = {
  videoId: null,
  streamUrl: null,
  loading: false,
  error: null,
};

async function fetchReviewWorkspace(courseId: string) {
  return Promise.all([
    requestJson<{ course: CourseDetail }>("/api/courses/" + courseId),
    requestJson<{ videos: CourseVideo[] }>("/api/courses/" + courseId + "/videos"),
  ]);
}

export default function ReviewWorkspacePage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [videos, setVideos] = useState<CourseVideo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [lastPersistedNote, setLastPersistedNote] = useState("");
  const [playback, setPlayback] = useState(() => createPlaybackVisit(null));
  const [playbackSource, setPlaybackSource] = useState<PlaybackSourceState>(
    EMPTY_PLAYBACK_SOURCE,
  );
  const [playbackRequestKey, setPlaybackRequestKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");

  useEffect(() => {
    let active = true;

    void fetchReviewWorkspace(courseId)
      .then(([courseData, videoData]) => {
        if (!active) return;

        const initialVideoId = findInitialVideoId(videoData.videos);
        const initialVideo = findVideo(videoData.videos, initialVideoId);
        const initialNote = initialVideo ? persistedNote(initialVideo) : "";

        setCourse(courseData.course);
        setVideos(videoData.videos);
        setSelectedVideoId(initialVideoId);
        setNote(initialNote);
        setLastPersistedNote(initialNote);
        setPlayback(createPlaybackVisit(initialVideoId));
        setPlaybackSource(
          initialVideoId
            ? loadingPlaybackSource(initialVideoId)
            : EMPTY_PLAYBACK_SOURCE,
        );
        setLoadError("");
        setNotFound(false);
      })
      .catch((caught) => {
        if (!active) return;

        if (isUnauthorized(caught)) {
          router.replace("/login");
          return;
        }

        if (caught instanceof ApiRequestError && caught.status === 404) {
          setNotFound(true);
          return;
        }

        setLoadError(friendlyError(caught, "course"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseId, router]);

  useEffect(() => {
    if (!selectedVideoId) return;

    const requestedVideoId = selectedVideoId;
    const controller = new AbortController();

    void requestJson<PlaybackSessionResponse>(
      playbackSessionPath(requestedVideoId),
      { signal: controller.signal },
    )
      .then((session) => {
        if (controller.signal.aborted) return;

        setPlaybackSource((current) => {
          if (current.videoId !== requestedVideoId) return current;
          return (
            loadedPlaybackSource(
              current.videoId,
              requestedVideoId,
              session.streamUrl,
            ) ?? current
          );
        });
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;

        if (isUnauthorized(caught)) {
          router.replace("/login");
          return;
        }

        const status = caught instanceof ApiRequestError ? caught.status : null;
        const message = playbackErrorMessage(status);

        setPlaybackSource((current) => {
          if (current.videoId !== requestedVideoId) return current;
          return failedPlaybackSource(requestedVideoId, message);
        });
      });

    return () => {
      controller.abort();
    };
  }, [selectedVideoId, playbackRequestKey, router]);

  const currentVideo = useMemo(
    () => findVideo(videos, selectedVideoId),
    [videos, selectedVideoId],
  );
  const progress = useMemo(() => reviewedProgress(videos), [videos]);
  const dirty = isNoteDirty(note, lastPersistedNote);
  const noteError = validateReviewNote(note);
  const previousVideoId = currentVideo
    ? getAdjacentVideoId(videos, currentVideo.id, "previous")
    : null;
  const nextVideoId = currentVideo
    ? getAdjacentVideoId(videos, currentVideo.id, "next")
    : null;

  useEffect(() => {
    if (!dirty) return;

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
    };
  }, [dirty]);

  function selectVideo(targetVideoId: string, sourceVideos = videos) {
    const target = findVideo(sourceVideos, targetVideoId);
    if (!target) {
      setSaveError("This video is no longer available.");
      return;
    }

    const targetNote = persistedNote(target);
    setSelectedVideoId(target.id);
    setNote(targetNote);
    setLastPersistedNote(targetNote);
    setPlayback(createPlaybackVisit(target.id));
    setPlaybackSource(loadingPlaybackSource(target.id));
    setSaveError("");
    setSaveStatus("");
  }

  function requestVideoSwitch(targetVideoId: string) {
    if (!currentVideo || targetVideoId === currentVideo.id || saving) return;

    if (shouldConfirmVideoSwitch(currentVideo.id, targetVideoId, dirty)) {
      const confirmed = window.confirm(
        "Discard unsaved changes and switch video?",
      );
      if (!confirmed) return;
    }

    selectVideo(targetVideoId);
  }

  function retryPlayback() {
    if (!currentVideo) return;

    setPlaybackSource(loadingPlaybackSource(currentVideo.id));
    setPlaybackRequestKey((current) => current + 1);
  }

  function handleVideoError() {
    if (!currentVideo) return;

    setPlayback((current) =>
      playbackVisitReducer(current, { type: "error" }),
    );
    setPlaybackSource((current) => {
      if (current.videoId !== currentVideo.id) return current;
      return failedPlaybackSource(
        currentVideo.id,
        "This video could not be loaded.",
      );
    });
  }

  function leaveWorkspace() {
    if (dirty) {
      const confirmed = window.confirm(
        "Discard unsaved changes and leave the review workspace?",
      );
      if (!confirmed) return;
    }

    router.push("/courses/" + courseId);
  }

  async function saveCurrentReview(advance: boolean) {
    if (!currentVideo || saving) return;

    const validation = validateReviewNote(note);
    if (validation) {
      setSaveError(validation);
      return;
    }

    const request = createReviewRequest(currentVideo.id, note, playback);

    setSaving(true);
    setSaveError("");
    setSaveStatus("");

    try {
      const result = await requestJson<{ review: SavedReview }>(
        "/api/videos/" + request.videoId + "/review",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request.body),
        },
      );

      const persistedReview: VideoReview = {
        note: result.review.note,
        wasPlayed: result.review.wasPlayed,
        reviewedAt: result.review.reviewedAt,
      };
      const updatedVideos = applyPersistedReview(
        videos,
        currentVideo.id,
        persistedReview,
      );
      const savedNote = persistedReview.note ?? "";

      setVideos(updatedVideos);
      setNote(savedNote);
      setLastPersistedNote(savedNote);

      if (advance) {
        const targetVideoId = getAdjacentVideoId(
          updatedVideos,
          currentVideo.id,
          "next",
        );

        if (targetVideoId) {
          const target = findVideo(updatedVideos, targetVideoId);
          if (target) {
            const targetNote = persistedNote(target);
            setSelectedVideoId(target.id);
            setNote(targetNote);
            setLastPersistedNote(targetNote);
            setPlayback(createPlaybackVisit(target.id));
            setPlaybackSource(loadingPlaybackSource(target.id));
            setSaveStatus("Saved. Moved to the next video.");
          }
        } else {
          setSaveStatus("Saved. End of playlist.");
        }
      } else {
        setSaveStatus("Saved.");
      }
    } catch (caught) {
      if (isUnauthorized(caught)) {
        router.replace("/login");
        return;
      }

      setSaveError(friendlyError(caught, "review"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="page-shell review-page-shell">
        <section className="panel empty-state" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>Loading review workspace...</p>
        </section>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="page-shell review-page-shell">
        <section className="panel empty-state">
          <h1>Review workspace unavailable</h1>
          <p>This course does not exist or is not available to your account.</p>
          <button className="button secondary" type="button" onClick={() => router.push("/courses")}>
            Back to courses
          </button>
        </section>
      </main>
    );
  }

  if (!course || loadError) {
    return (
      <main className="page-shell review-page-shell">
        <section className="panel empty-state">
          <h1>Could not load review workspace</h1>
          <p>{loadError || "The review workspace could not be opened."}</p>
          <button className="button secondary" type="button" onClick={() => router.push("/courses/" + courseId)}>
            Back to course
          </button>
        </section>
      </main>
    );
  }

  if (videos.length === 0) {
    return (
      <main className="page-shell review-page-shell">
        <button className="back-link button-link" type="button" onClick={() => router.push("/courses/" + courseId)}>
          ← Back to course
        </button>
        <section className="panel empty-state">
          <h1>No videos to review</h1>
          <p>This course does not currently contain a video playlist.</p>
          <button className="button secondary" type="button" onClick={() => router.push("/courses/" + courseId)}>
            Back to course
          </button>
        </section>
      </main>
    );
  }

  if (!currentVideo) {
    return (
      <main className="page-shell review-page-shell">
        <section className="panel empty-state">
          <h1>Current video unavailable</h1>
          <p>The selected video is no longer present in this playlist.</p>
          <button className="button secondary" type="button" onClick={() => router.push("/courses/" + courseId)}>
            Back to course
          </button>
        </section>
      </main>
    );
  }

  const reviewed = isPersistedReviewed(currentVideo.review);
  const currentPlaybackReady =
    playbackSource.videoId === currentVideo.id && playbackSource.streamUrl;
  const currentPlaybackLoading =
    playbackSource.videoId === currentVideo.id && playbackSource.loading;
  const currentPlaybackError =
    playbackSource.videoId === currentVideo.id ? playbackSource.error : null;

  return (
    <main className="page-shell review-page-shell">
      <div className="review-topbar">
        <button className="back-link button-link" type="button" onClick={leaveWorkspace}>
          ← Back to course
        </button>
        <div className="review-progress" aria-label={"Review progress " + progress.reviewed + " of " + progress.total}>
          <span>{progress.reviewed} / {progress.total} reviewed</span>
          <div className="progress-track" aria-hidden="true">
            <span style={{ width: progress.percent + "%" }} />
          </div>
        </div>
      </div>

      <div className="review-title-row">
        <div>
          <p className="eyebrow">Video review</p>
          <h1>{course.title}</h1>
        </div>
        <span className="count">{progress.percent}% complete</span>
      </div>

      <div className="review-workspace-grid">
        <section className="review-main-column">
          <article className="panel video-panel">
            <div className="video-heading">
              <div>
                <p className="eyebrow">Video {currentVideo.playlistOrder + 1} of {videos.length}</p>
                <h2>{currentVideo.title}</h2>
                {currentVideo.sourceVideoId ? (
                  <p className="muted">Source ID: <code>{currentVideo.sourceVideoId}</code></p>
                ) : null}
              </div>
              <span className={"status-badge " + (reviewed ? "success" : "neutral")}>
                {reviewed ? "Reviewed" : "Not reviewed"}
              </span>
            </div>

            <div className="video-frame">
              {currentPlaybackLoading ? (
                <div className="video-frame-state" role="status" aria-live="polite">
                  <div className="spinner" aria-hidden="true" />
                  <strong>Preparing secure playback...</strong>
                  <span>Requesting a fresh video session.</span>
                </div>
              ) : currentPlaybackReady ? (
                <>
                  {/* Captions are not part of the existing backend/video contract for Task 02. */}
                  {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                  <video
                    key={currentVideo.id + ":" + currentPlaybackReady}
                    className="review-video"
                    controls
                    playsInline
                    preload="metadata"
                    src={currentPlaybackReady}
                    aria-label={"Video: " + currentVideo.title}
                    onPlay={() => {
                      setPlayback((current) =>
                        playbackVisitReducer(current, { type: "play" }),
                      );
                    }}
                    onLoadedMetadata={() => {
                      setPlayback((current) =>
                        playbackVisitReducer(current, { type: "loadedmetadata" }),
                      );
                    }}
                    onPause={() => {
                      setPlayback((current) =>
                        playbackVisitReducer(current, { type: "pause" }),
                      );
                    }}
                    onError={handleVideoError}
                  />
                </>
              ) : (
                <div className="video-frame-state error-state" role="alert">
                  <strong>{currentPlaybackError || "Playback could not be loaded."}</strong>
                  <button className="button secondary" type="button" onClick={retryPlayback}>
                    Retry video
                  </button>
                </div>
              )}
            </div>

            {currentPlaybackError ? (
              <p className="alert error" role="alert">
                {currentPlaybackError} Your current note is preserved. Playback must actually start before a save can mark this video Reviewed.
              </p>
            ) : playback.started ? (
              <p className="playback-status" role="status">
                Playback started this visit. Saving can mark this video Reviewed.
              </p>
            ) : (
              <p className="playback-status muted">
                Start playback, then save, to mark this video Reviewed.
              </p>
            )}

            <div className="review-nav-buttons">
              <button
                className="button secondary"
                type="button"
                disabled={!previousVideoId || saving}
                onClick={() => {
                  if (previousVideoId) requestVideoSwitch(previousVideoId);
                }}
              >
                Previous
              </button>
              <button
                className="button secondary"
                type="button"
                disabled={!nextVideoId || saving}
                onClick={() => {
                  if (nextVideoId) requestVideoSwitch(nextVideoId);
                }}
              >
                Next
              </button>
            </div>
          </article>

          <section className="panel review-playlist-panel">
            <div className="section-heading">
              <div>
                <h2>Playlist</h2>
                <p>Select a video to review it.</p>
              </div>
              <span className="count">{videos.length} videos</span>
            </div>

            <div className="review-playlist" role="list" aria-label="Course playlist">
              {videos.map((video) => {
                const active = video.id === currentVideo.id;
                const videoReviewed = isPersistedReviewed(video.review);

                return (
                  <button
                    key={video.id}
                    className={"review-playlist-item" + (active ? " active" : "")}
                    type="button"
                    role="listitem"
                    aria-current={active ? "true" : undefined}
                    disabled={saving}
                    onClick={() => requestVideoSwitch(video.id)}
                  >
                    <span className="playlist-order">{video.playlistOrder + 1}</span>
                    <span className="review-playlist-copy">
                      <strong>{video.title}</strong>
                      {video.sourceVideoId ? <small>{video.sourceVideoId}</small> : null}
                    </span>
                    <span className={"status-badge " + (videoReviewed ? "success" : "neutral")}>
                      {videoReviewed ? "Reviewed" : "Not reviewed"}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </section>

        <aside className="panel review-editor">
          <div>
            <p className="eyebrow">Reviewer note</p>
            <h2>Comment on this video</h2>
            <p className="muted small">Optional. Saved independently for this exact video.</p>
          </div>

          <label className="field review-note-field">
            <span>Review note</span>
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setSaveError("");
                setSaveStatus("");
              }}
              disabled={saving}
              aria-invalid={Boolean(noteError)}
              aria-describedby="review-note-help"
              placeholder="Write an optional review note..."
            />
          </label>

          <div id="review-note-help" className={"note-count" + (noteError ? " over-limit" : "")}>
            <span>{dirty ? "Unsaved changes" : "All changes saved"}</span>
            <span>{note.length.toLocaleString()} / {MAX_REVIEW_NOTE_CHARS.toLocaleString()}</span>
          </div>

          {noteError ? <p className="alert error" role="alert">{noteError}</p> : null}
          {saveError ? <p className="alert error" role="alert">{saveError}</p> : null}
          {saveStatus ? <p className="alert success-alert" role="status" aria-live="polite">{saveStatus}</p> : null}

          <div className="review-save-actions">
            <button
              className="button secondary"
              type="button"
              disabled={saving || Boolean(noteError)}
              onClick={() => void saveCurrentReview(false)}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="button primary"
              type="button"
              disabled={saving || Boolean(noteError)}
              onClick={() => void saveCurrentReview(true)}
            >
              {saving ? "Saving..." : nextVideoId ? "Save & Next" : "Save & Finish"}
            </button>
          </div>

          <div className="review-state-summary">
            <span>Persisted state</span>
            <strong>{reviewed ? "Reviewed" : "Not reviewed"}</strong>
          </div>
        </aside>
      </div>
    </main>
  );
}
