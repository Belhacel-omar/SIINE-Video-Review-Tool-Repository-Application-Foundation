import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { getVideo } from "@/lib/courses/service";
import { idSchema } from "@/lib/courses/validation";

type Context = {
  params: Promise<{ videoId: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const { videoId } = await context.params;
    if (!idSchema.safeParse(videoId).success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid video ID.");
    }

    const video = await getVideo(auth.user!.id, videoId);
    return NextResponse.json({ video });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
