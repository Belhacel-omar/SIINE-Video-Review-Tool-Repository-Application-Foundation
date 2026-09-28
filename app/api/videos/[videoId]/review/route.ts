import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { idSchema } from "@/lib/courses/validation";
import { saveReview } from "@/lib/reviews/service";
import { saveReviewSchema } from "@/lib/reviews/validation";

type Context = {
  params: Promise<{ videoId: string }>;
};

export async function PUT(request: Request, context: Context) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const { videoId } = await context.params;
    if (!idSchema.safeParse(videoId).success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid video ID.");
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid request.");
    }

    const parsed = saveReviewSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid review.");
    }

    const review = await saveReview(
      auth.user!.id,
      videoId,
      parsed.data,
    );

    return NextResponse.json({ review });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
