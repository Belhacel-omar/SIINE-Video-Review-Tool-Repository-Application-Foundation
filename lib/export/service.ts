import { and, asc, eq } from "drizzle-orm";
import { ApiError } from "@/lib/api/errors";
import { getDb } from "@/lib/db";
import { courses, reviews, videos } from "@/lib/db/schema";

export type ReviewedExportVideo = {
  sourceRowNumber: number;
  sourceData: Record<string, unknown>;
  reviewNote: string | null;
  reviewReviewedAt: Date | null;
};

export type ReviewedExportData = {
  originalFilename: string | null;
  importMetadata: {
    headers: string[];
    worksheetName: string;
    headerRowNumber: number;
  };
  videos: ReviewedExportVideo[];
};

function notFound() {
  return new ApiError(404, "NOT_FOUND", "Resource not found.");
}

function courseNotImported() {
  return new ApiError(
    409,
    "COURSE_NOT_IMPORTED",
    "Course has not imported a spreadsheet.",
  );
}

function isValidImportMetadata(
  value: unknown,
): value is ReviewedExportData["importMetadata"] {
  if (!value || typeof value !== "object") return false;

  const metadata = value as {
    headers?: unknown;
    worksheetName?: unknown;
    headerRowNumber?: unknown;
  };

  return (
    Array.isArray(metadata.headers) &&
    metadata.headers.length > 0 &&
    metadata.headers.every(
      (header) => typeof header === "string" && header.length > 0,
    ) &&
    typeof metadata.worksheetName === "string" &&
    metadata.worksheetName.length > 0 &&
    Number.isInteger(metadata.headerRowNumber) &&
    Number(metadata.headerRowNumber) >= 1
  );
}

export async function getReviewedExportData(
  userId: string,
  courseId: string,
): Promise<ReviewedExportData> {
  const db = getDb();

  const [course] = await db
    .select({
      id: courses.id,
      originalFilename: courses.originalFilename,
      importMetadata: courses.importMetadata,
    })
    .from(courses)
    .where(
      and(
        eq(courses.id, courseId),
        eq(courses.createdBy, userId),
      ),
    )
    .limit(1);

  if (!course) throw notFound();

  if (!isValidImportMetadata(course.importMetadata)) {
    throw courseNotImported();
  }

  const rows = await db
    .select({
      sourceRowNumber: videos.sourceRowNumber,
      sourceData: videos.sourceData,
      reviewNote: reviews.note,
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
    .orderBy(asc(videos.sourceRowNumber));

  return {
    originalFilename: course.originalFilename,
    importMetadata: course.importMetadata,
    videos: rows,
  };
}
