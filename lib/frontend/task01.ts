export type SessionUser = {
  id: string;
  email: string;
};

export type SessionResponse =
  | { authenticated: true; user: SessionUser }
  | { authenticated: false; user: null };

export type CourseSummary = {
  id: string;
  title: string;
  originalFilename: string | null;
  createdAt: string;
  updatedAt: string;
  videoCount: number;
  reviewedCount: number;
};

export type CourseDetail = {
  id: string;
  title: string;
  originalFilename: string | null;
  createdAt: string;
  updatedAt: string;
};

export type VideoReview = {
  note: string | null;
  wasPlayed: boolean;
  reviewedAt: string | null;
};

export type CourseVideo = {
  id: string;
  courseId: string;
  sourceRowNumber: number;
  sourceVideoId: string | null;
  title: string;
  bunnyUrl: string;
  playlistOrder: number;
  review: VideoReview | null;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string | null,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function requestJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: "no-store",
  });

  const contentType = response.headers.get("content-type") ?? "";
  let body: unknown = null;

  if (contentType.includes("application/json")) {
    body = await response.json().catch(() => null);
  }

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | null;
    const apiError = errorBody?.error;
    throw new ApiRequestError(
      response.status,
      typeof apiError?.code === "string" ? apiError.code : null,
      typeof apiError?.message === "string" ? apiError.message : "Request failed.",
      apiError?.details,
    );
  }

  return body as T;
}

export function isUnauthorized(error: unknown) {
  return error instanceof ApiRequestError && error.status === 401;
}

export function sessionDestination(authenticated: boolean) {
  return authenticated ? "/courses" : "/login";
}

export function validateCourseTitle(title: string) {
  const value = title.trim();
  if (!value) return "Course title is required.";
  if (value.length > 200) return "Course title must be 200 characters or fewer.";
  return null;
}

const MAX_XLSX_BYTES = 10 * 1024 * 1024;

export function validateXlsxFile(file: { name: string; size: number } | null) {
  if (!file) return "Choose an XLSX file to import.";
  if (!file.name.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
    return "Only .xlsx files are supported.";
  }
  if (file.size > MAX_XLSX_BYTES) {
    return "The XLSX file is larger than 10 MB.";
  }
  return null;
}

export function isCourseImported(course: Pick<CourseDetail, "originalFilename">) {
  return Boolean(course.originalFilename);
}

export function getProgress(reviewedCount: number, videoCount: number) {
  const total = Math.max(0, videoCount);
  const reviewed = Math.min(Math.max(0, reviewedCount), total);
  return {
    label: reviewed + " / " + total,
    percent: total === 0 ? 0 : Math.round((reviewed / total) * 100),
  };
}

export function isVideoReviewed(video: Pick<CourseVideo, "review">) {
  return Boolean(video.review?.reviewedAt);
}

export function toPlaylistRows(videos: CourseVideo[]) {
  return videos.map((video) => ({
    id: video.id,
    order: video.playlistOrder + 1,
    title: video.title,
    sourceVideoId: video.sourceVideoId,
    reviewed: isVideoReviewed(video),
  }));
}

export type ErrorContext = "login" | "session" | "courses" | "course" | "import";

export function friendlyError(error: unknown, context: ErrorContext) {
  if (!(error instanceof ApiRequestError)) {
    return "Unable to reach SIINE. Check your connection and try again.";
  }

  if (error.status === 401) {
    return context === "login"
      ? "Email or password is incorrect."
      : "Your session expired. Please sign in again.";
  }

  if (error.status === 404 && context === "course") {
    return "Course not found.";
  }

  if (context === "import") {
    if (error.status === 413) return "The XLSX file is larger than 10 MB.";
    if (error.status === 415) return "Only .xlsx files are supported.";
    if (error.status === 409) {
      return "This course already has an imported spreadsheet.";
    }
    if (error.status === 422) {
      if (error.code === "MISSING_REQUIRED_COLUMNS") {
        return "The spreadsheet must include Video Title and Bunny URL columns.";
      }
      if (error.code === "AMBIGUOUS_REQUIRED_COLUMNS") {
        return "The spreadsheet has ambiguous Video Title or Bunny URL columns.";
      }
      if (error.code === "INVALID_SOURCE_HEADERS") {
        return "The spreadsheet has invalid or duplicate source headers.";
      }
      if (error.code === "INVALID_IMPORT_ROWS") {
        return "Some video rows are invalid. Each video needs a title and a valid HTTPS Bunny URL.";
      }
      return "The spreadsheet could not be validated. Check the workbook and try again.";
    }
  }

  if (error.status >= 500) {
    return "SIINE could not complete the request. Please try again.";
  }

  return error.message || "The request could not be completed.";
}
