import {
  and,
  asc,
  count,
  desc,
  eq,
  sql,
} from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import {
  courses,
  reviews,
  videos,
  type CourseImportMetadata,
} from "@/lib/db/schema";
import {
  parseXlsxUpload,
  sanitizeFilename,
  type UploadedXlsx,
} from "@/lib/import/xlsx";

const COURSE_PROJECTION = {
  id: courses.id,
  title: courses.title,
  originalFilename: courses.originalFilename,
  createdAt: courses.createdAt,
  updatedAt: courses.updatedAt,
};

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found.");
}

export async function createCourse(userId: string, title: string) {
  const [course] = await getDb()
    .insert(courses)
    .values({
      title,
      createdBy: userId,
    })
    .returning(COURSE_PROJECTION);

  if (!course) {
    throw new Error("Course insert did not return a row");
  }

  return course;
}

export async function listCourses(userId: string) {
  return getDb()
    .select({
      ...COURSE_PROJECTION,
      videoCount: sql<number>`count(distinct ${videos.id})::int`,
      reviewedCount: sql<number>`count(distinct ${reviews.videoId})::int`,
    })
    .from(courses)
    .leftJoin(videos, eq(videos.courseId, courses.id))
    .leftJoin(
      reviews,
      and(
        eq(reviews.videoId, videos.id),
        eq(reviews.reviewerId, userId),
      ),
    )
    .where(eq(courses.createdBy, userId))
    .groupBy(
      courses.id,
      courses.title,
      courses.originalFilename,
      courses.createdAt,
      courses.updatedAt,
    )
    .orderBy(desc(courses.createdAt));
}

export async function getCourse(userId: string, courseId: string) {
  const [course] = await getDb()
    .select(COURSE_PROJECTION)
    .from(courses)
    .where(
      and(
        eq(courses.id, courseId),
        eq(courses.createdBy, userId),
      ),
    )
    .limit(1);

  if (!course) throw notFound();
  return course;
}

function projectReview(row: {
  reviewId: string | null;
  reviewNote: string | null;
  reviewWasPlayed: boolean | null;
  reviewReviewedAt: Date | null;
}) {
  if (!row.reviewId) return null;
  return {
    note: row.reviewNote,
    wasPlayed: row.reviewWasPlayed ?? false,
    reviewedAt: row.reviewReviewedAt,
  };
}

export async function listCourseVideos(userId: string, courseId: string) {
  await getCourse(userId, courseId);

  const rows = await getDb()
    .select({
      id: videos.id,
      courseId: videos.courseId,
      sourceRowNumber: videos.sourceRowNumber,
      sourceVideoId: videos.sourceVideoId,
      title: videos.title,
      bunnyUrl: videos.bunnyUrl,
      playlistOrder: videos.playlistOrder,
      reviewId: reviews.id,
      reviewNote: reviews.note,
      reviewWasPlayed: reviews.wasPlayed,
      reviewReviewedAt: reviews.reviewedAt,
    })
    .from(videos)
    .innerJoin(courses, eq(courses.id, videos.courseId))
    .leftJoin(
      reviews,
      and(
        eq(reviews.videoId, videos.id),
        eq(reviews.reviewerId, userId),
      ),
    )
    .where(
      and(
        eq(videos.courseId, courseId),
        eq(courses.createdBy, userId),
      ),
    )
    .orderBy(asc(videos.playlistOrder));

  return rows.map((row) => ({
    id: row.id,
    courseId: row.courseId,
    sourceRowNumber: row.sourceRowNumber,
    sourceVideoId: row.sourceVideoId,
    title: row.title,
    bunnyUrl: row.bunnyUrl,
    playlistOrder: row.playlistOrder,
    review: projectReview(row),
  }));
}

export async function getVideo(userId: string, videoId: string) {
  const [row] = await getDb()
    .select({
      id: videos.id,
      courseId: videos.courseId,
      sourceRowNumber: videos.sourceRowNumber,
      sourceVideoId: videos.sourceVideoId,
      title: videos.title,
      bunnyUrl: videos.bunnyUrl,
      playlistOrder: videos.playlistOrder,
      reviewId: reviews.id,
      reviewNote: reviews.note,
      reviewWasPlayed: reviews.wasPlayed,
      reviewReviewedAt: reviews.reviewedAt,
    })
    .from(videos)
    .innerJoin(courses, eq(courses.id, videos.courseId))
    .leftJoin(
      reviews,
      and(
        eq(reviews.videoId, videos.id),
        eq(reviews.reviewerId, userId),
      ),
    )
    .where(
      and(
        eq(videos.id, videoId),
        eq(courses.createdBy, userId),
      ),
    )
    .limit(1);

  if (!row) throw notFound();

  return {
    id: row.id,
    courseId: row.courseId,
    sourceRowNumber: row.sourceRowNumber,
    sourceVideoId: row.sourceVideoId,
    title: row.title,
    bunnyUrl: row.bunnyUrl,
    playlistOrder: row.playlistOrder,
    review: projectReview(row),
  };
}

export async function importCourseXlsx(
  userId: string,
  courseId: string,
  file: UploadedXlsx,
) {
  await getCourse(userId, courseId);

  const parsed = await parseXlsxUpload(file);
  const originalFilename = sanitizeFilename(file.name);
  const importMetadata: CourseImportMetadata = {
    headers: parsed.headers,
    worksheetName: parsed.worksheetName,
    headerRowNumber: parsed.headerRowNumber,
  };

  const db = getDb();

  await db.transaction(async (tx) => {
    const [lockedCourse] = await tx
      .select({ id: courses.id })
      .from(courses)
      .where(
        and(
          eq(courses.id, courseId),
          eq(courses.createdBy, userId),
        ),
      )
      .for("update")
      .limit(1);

    if (!lockedCourse) throw notFound();

    const [existingVideo] = await tx
      .select({ id: videos.id })
      .from(videos)
      .where(eq(videos.courseId, courseId))
      .limit(1);

    if (existingVideo) {
      throw new ApiError(
        409,
        "COURSE_ALREADY_IMPORTED",
        "Course already has an imported spreadsheet.",
      );
    }

    const values = parsed.rows.map((row) => ({
      courseId,
      sourceRowNumber: row.sourceRowNumber,
      sourceVideoId: row.sourceVideoId,
      title: row.title,
      bunnyUrl: row.bunnyUrl,
      sourceData: row.sourceData,
      playlistOrder: row.playlistOrder,
    }));

    const batchSize = 1_000;
    for (let offset = 0; offset < values.length; offset += batchSize) {
      await tx.insert(videos).values(values.slice(offset, offset + batchSize));
    }

    await tx
      .update(courses)
      .set({
        originalFilename,
        importMetadata,
        updatedAt: new Date(),
      })
      .where(eq(courses.id, courseId));
  });

  return {
    courseId,
    importedCount: parsed.rows.length,
    originalFilename,
  };
}
