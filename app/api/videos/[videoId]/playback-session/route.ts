import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { idSchema } from "@/lib/courses/validation";
import { createPlaybackSession } from "@/lib/video/playback-session";

type Context = {
  params: Promise<{ videoId: string }>;
};

function noStore<T extends Response>(response: T) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("X-Content-Type-Options", "nosniff");
  return response;
}

export async function GET(_request: Request, context: Context) {
  try {
    const auth = await requireUser();
    if (auth.response) return noStore(auth.response);

    const { videoId } = await context.params;
    if (!idSchema.safeParse(videoId).success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid video ID.");
    }

    const session = await createPlaybackSession(auth.user!.id, videoId);
    return noStore(NextResponse.json(session));
  } catch (error) {
    return noStore(apiErrorResponse(error));
  }
}
