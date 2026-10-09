export type PlaybackSessionResponse = {
  streamUrl: string;
  expiresIn: number;
  provider: "bunny-token-auth";
};

export type PlaybackSourceState = {
  videoId: string | null;
  streamUrl: string | null;
  loading: boolean;
  error: string | null;
};

export function playbackSessionPath(videoId: string) {
  return "/api/videos/" + videoId + "/playback-session";
}

export function loadingPlaybackSource(videoId: string): PlaybackSourceState {
  return {
    videoId,
    streamUrl: null,
    loading: true,
    error: null,
  };
}

export function loadedPlaybackSource(
  currentVideoId: string,
  responseVideoId: string,
  streamUrl: string,
): PlaybackSourceState | null {
  if (currentVideoId !== responseVideoId) return null;
  return {
    videoId: currentVideoId,
    streamUrl,
    loading: false,
    error: null,
  };
}

export function failedPlaybackSource(
  videoId: string,
  message: string,
): PlaybackSourceState {
  return {
    videoId,
    streamUrl: null,
    loading: false,
    error: message,
  };
}

export function playbackErrorMessage(status: number | null) {
  if (status === 404) return "This video is no longer available.";
  if (status === 503) return "Playback is temporarily unavailable. Try again.";
  return "Playback could not be loaded. Try again.";
}
