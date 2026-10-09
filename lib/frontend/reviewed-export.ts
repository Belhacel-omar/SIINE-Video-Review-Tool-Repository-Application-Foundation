export const REVIEWED_EXPORT_FALLBACK_FILENAME = "reviewed-course.xlsx";

export type ReviewedExportResult = {
  blob: Blob;
  filename: string;
};

type ExportErrorBody = {
  error?: {
    code?: string;
  };
};

export class ReviewedExportError extends Error {
  constructor(
    public readonly status: number | null,
    public readonly code: string | null,
  ) {
    super("Reviewed XLSX download failed.");
    this.name = "ReviewedExportError";
  }
}

export function reviewedExportPath(courseId: string) {
  return "/api/courses/" + courseId + "/export";
}

export function canStartReviewedExport(imported: boolean, pending: boolean) {
  return imported && !pending;
}

function safeExportFilename(candidate: string | null) {
  if (!candidate) return REVIEWED_EXPORT_FALLBACK_FILENAME;

  const trimmed = candidate.trim();
  if (!trimmed) return REVIEWED_EXPORT_FALLBACK_FILENAME;
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    return REVIEWED_EXPORT_FALLBACK_FILENAME;
  }
  if (/^[.]{1,2}$/.test(trimmed) || /[\u0000-\u001f\u007f]/.test(trimmed)) {
    return REVIEWED_EXPORT_FALLBACK_FILENAME;
  }
  if (!trimmed.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
    return REVIEWED_EXPORT_FALLBACK_FILENAME;
  }

  return trimmed;
}

function parseExtendedFilename(value: string) {
  const match = value.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
  if (!match) return null;

  const encoded = match[1].trim().replace(/^"|"$/g, "");
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function parseBasicFilename(value: string) {
  const quoted = value.match(/filename\s*=\s*"([^"]+)"/i);
  if (quoted) return quoted[1];

  const unquoted = value.match(/filename\s*=\s*([^;]+)/i);
  return unquoted?.[1]?.trim() ?? null;
}

export function filenameFromContentDisposition(header: string | null) {
  if (!header) return REVIEWED_EXPORT_FALLBACK_FILENAME;

  const candidate = parseExtendedFilename(header) ?? parseBasicFilename(header);
  return safeExportFilename(candidate);
}

export async function fetchReviewedExport(
  courseId: string,
  fetcher: typeof fetch = fetch,
): Promise<ReviewedExportResult> {
  const response = await fetcher(reviewedExportPath(courseId), {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    let code: string | null = null;
    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await response.json().catch(() => null)) as ExportErrorBody | null;
      code = typeof body?.error?.code === "string" ? body.error.code : null;
    }

    throw new ReviewedExportError(response.status, code);
  }

  return {
    blob: await response.blob(),
    filename: filenameFromContentDisposition(
      response.headers.get("content-disposition"),
    ),
  };
}

export function reviewedExportErrorMessage(error: unknown) {
  if (!(error instanceof ReviewedExportError)) {
    return "The reviewed XLSX could not be downloaded. Try again.";
  }

  if (error.status === 404) {
    return "This course is no longer available.";
  }

  if (error.status === 409 && error.code === "COURSE_NOT_IMPORTED") {
    return "This course has not been imported yet.";
  }

  return "The reviewed XLSX could not be downloaded. Try again.";
}

type DownloadRuntime = {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  clickDownload: (url: string, filename: string) => void;
};

function browserDownloadRuntime(): DownloadRuntime {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    clickDownload: (url, filename) => {
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    },
  };
}

export function triggerReviewedExportDownload(
  blob: Blob,
  filename: string,
  runtime: DownloadRuntime = browserDownloadRuntime(),
) {
  const objectUrl = runtime.createObjectURL(blob);

  try {
    runtime.clickDownload(objectUrl, filename);
  } finally {
    runtime.revokeObjectURL(objectUrl);
  }
}
