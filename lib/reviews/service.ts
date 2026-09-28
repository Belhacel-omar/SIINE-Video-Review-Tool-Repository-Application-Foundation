import { and, eq } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { courses, reviews, videos } from "@/lib/db/schema";
import { nextReviewState } from "@/lib/reviews/state";

type SaveReviewInput = {
  note: string | null;
  wasPlayed: boolean;
};

const REVIEW_PROJECTION = {
  videoId: reviews.videoId,
  note: reviews.note,
  wasPlayed: reviews.wasPlayed,
  reviewedAt: reviews.reviewedAt,
};

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found.");
}

export async function saveReview(
  userId: string,
  videoId: string,
  input: SaveReviewInput,
) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const [ownedVideo] = await tx
      .select({ id: videos.id })
      .from(videos)
      .innerJoin(courses, eq(courses.id, videos.courseId))
      .where(
        and(
          eq(videos.id, videoId),
          eq(courses.createdBy, userId),
        ),
      )
      .for("update")
      .limit(1);

    if (!ownedVideo) throw notFound();

    const [existing] = await tx
      .select({
        id: reviews.id,
        wasPlayed: reviews.wasPlayed,
        reviewedAt: reviews.reviewedAt,
      })
      .from(reviews)
      .where(
        and(
          eq(reviews.videoId, videoId),
          eq(reviews.reviewerId, userId),
        ),
      )
      .limit(1);

    const now = new Date();
    const nextState = nextReviewState(existing ?? null, input.wasPlayed, now);

    const [saved] = existing
      ? await tx
          .update(reviews)
          .set({
            note: input.note,
            wasPlayed: nextState.wasPlayed,
            reviewedAt: nextState.reviewedAt,
            updatedAt: now,
          })
          .where(eq(reviews.id, existing.id))
          .returning(REVIEW_PROJECTION)
      : await tx
          .insert(reviews)
          .values({
            videoId,
            reviewerId: userId,
            note: input.note,
            wasPlayed: nextState.wasPlayed,
            reviewedAt: nextState.reviewedAt,
          })
          .returning(REVIEW_PROJECTION);

    if (!saved) {
      throw new Error("Review save did not return a row");
    }

    return saved;
  });
}
