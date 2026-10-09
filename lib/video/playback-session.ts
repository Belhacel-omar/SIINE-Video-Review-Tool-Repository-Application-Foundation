import { ApiError } from "@/lib/api/errors";
import { getVideo } from "@/lib/courses/service";
import {
  BUNNY_PLAYBACK_TTL_SECONDS,
  signBunnyUrl,
  validateBunnySourceUrl,
} from "@/lib/video/bunny-signing";

type PlaybackSessionOptions = {
  securityKey?: string;
  nowMs?: number;
};

function playbackUnavailable() {
  return new ApiError(
    503,
    "PLAYBACK_UNAVAILABLE",
    "Playback service is temporarily unavailable.",
  );
}

function invalidMediaConfiguration() {
  return new ApiError(
    500,
    "INTERNAL_ERROR",
    "An internal error occurred.",
  );
}

export async function createPlaybackSession(
  userId: string,
  videoId: string,
  options: PlaybackSessionOptions = {},
) {
  const video = await getVideo(userId, videoId);

  try {
    validateBunnySourceUrl(video.bunnyUrl);
  } catch {
    throw invalidMediaConfiguration();
  }

  const securityKey = (
    options.securityKey ?? process.env.BUNNY_TOKEN_AUTH_KEY ?? ""
  ).trim();

  if (!securityKey) throw playbackUnavailable();

  const nowMs = options.nowMs ?? Date.now();
  const expires = String(
    Math.floor(nowMs / 1000) + BUNNY_PLAYBACK_TTL_SECONDS,
  );

  return {
    streamUrl: signBunnyUrl(video.bunnyUrl, securityKey, expires),
    expiresIn: BUNNY_PLAYBACK_TTL_SECONDS,
    provider: "bunny-token-auth" as const,
  };
}
