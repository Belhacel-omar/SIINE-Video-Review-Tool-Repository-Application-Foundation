import { describe, expect, it, vi } from "vitest";
import {
  REVIEWED_EXPORT_FALLBACK_FILENAME,
  ReviewedExportError,
  canStartReviewedExport,
  fetchReviewedExport,
  filenameFromContentDisposition,
  reviewedExportErrorMessage,
  reviewedExportPath,
  triggerReviewedExportDownload,
} from "@/lib/frontend/reviewed-export";

describe("Frontend Task 03 reviewed XLSX download helpers", () => {
  it("shows export only for imported courses and blocks duplicate pending clicks", () => {
    expect(canStartReviewedExport(true, false)).toBe(true);
    expect(canStartReviewedExport(false, false)).toBe(false);
    expect(canStartReviewedExport(true, true)).toBe(false);
  });

  it("builds the exact reviewed export endpoint", () => {
    expect(reviewedExportPath("course-123")).toBe(
      "/api/courses/course-123/export",
    );
  });

  it("respects a safe backend Content-Disposition filename", () => {
    expect(
      filenameFromContentDisposition(
        'attachment; filename="SIINE_Upload_Test_Template (1)-reviewed.xlsx"',
      ),
    ).toBe("SIINE_Upload_Test_Template (1)-reviewed.xlsx");
  });

  it("supports UTF-8 filename* values", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename*=UTF-8''Cours%20Math%C3%A9matiques-reviewed.xlsx",
      ),
    ).toBe("Cours Mathématiques-reviewed.xlsx");
  });

  it("falls back for missing, malformed, non-XLSX, or path-like filenames", () => {
    expect(filenameFromContentDisposition(null)).toBe(
      REVIEWED_EXPORT_FALLBACK_FILENAME,
    );
    expect(filenameFromContentDisposition("attachment")).toBe(
      REVIEWED_EXPORT_FALLBACK_FILENAME,
    );
    expect(
      filenameFromContentDisposition('attachment; filename="report.csv"'),
    ).toBe(REVIEWED_EXPORT_FALLBACK_FILENAME);
    expect(
      filenameFromContentDisposition('attachment; filename="../../evil.xlsx"'),
    ).toBe(REVIEWED_EXPORT_FALLBACK_FILENAME);
    expect(
      filenameFromContentDisposition('attachment; filename="..\\evil.xlsx"'),
    ).toBe(REVIEWED_EXPORT_FALLBACK_FILENAME);
  });

  it("fetches the binary export with the authenticated same-origin endpoint", async () => {
    const payload = new Blob(["xlsx-binary"], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const fetcher = vi.fn().mockResolvedValue(
      new Response(payload, {
        status: 200,
        headers: {
          "Content-Disposition": 'attachment; filename="Math-reviewed.xlsx"',
        },
      }),
    );

    const result = await fetchReviewedExport(
      "course-123",
      fetcher as typeof fetch,
    );

    expect(fetcher).toHaveBeenCalledWith("/api/courses/course-123/export", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });
    expect(result.filename).toBe("Math-reviewed.xlsx");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(await result.blob.text()).toBe("xlsx-binary");
  });

  it("creates one Blob download and always revokes the temporary object URL", () => {
    const createObjectURL = vi.fn().mockReturnValue("blob:reviewed-xlsx");
    const revokeObjectURL = vi.fn();
    const clickDownload = vi.fn();
    const blob = new Blob(["xlsx"]);

    triggerReviewedExportDownload(blob, "Math-reviewed.xlsx", {
      createObjectURL,
      revokeObjectURL,
      clickDownload,
    });

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickDownload).toHaveBeenCalledWith(
      "blob:reviewed-xlsx",
      "Math-reviewed.xlsx",
    );
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:reviewed-xlsx");
  });

  it("revokes the temporary object URL even if the browser click throws", () => {
    const revokeObjectURL = vi.fn();

    expect(() =>
      triggerReviewedExportDownload(new Blob(["xlsx"]), "report.xlsx", {
        createObjectURL: () => "blob:temp",
        revokeObjectURL,
        clickDownload: () => {
          throw new Error("browser blocked click");
        },
      }),
    ).toThrow("browser blocked click");

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:temp");
  });

  it("returns structured 401/404/409/500 errors without exposing server bodies", async () => {
    const cases = [
      [401, "UNAUTHORIZED"],
      [404, "NOT_FOUND"],
      [409, "COURSE_NOT_IMPORTED"],
      [500, "INTERNAL_ERROR"],
    ] as const;

    for (const [status, code] of cases) {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code,
              message: "/secret/db/path should not reach the UI",
            },
          }),
          {
            status,
            headers: { "content-type": "application/json" },
          },
        ),
      );

      await expect(
        fetchReviewedExport("course", fetcher as typeof fetch),
      ).rejects.toMatchObject({ status, code });
    }
  });

  it("maps safe export errors to the required user-facing copy", () => {
    expect(
      reviewedExportErrorMessage(new ReviewedExportError(404, "NOT_FOUND")),
    ).toBe("This course is no longer available.");
    expect(
      reviewedExportErrorMessage(
        new ReviewedExportError(409, "COURSE_NOT_IMPORTED"),
      ),
    ).toBe("This course has not been imported yet.");
    expect(
      reviewedExportErrorMessage(
        new ReviewedExportError(500, "INTERNAL_ERROR"),
      ),
    ).toBe("The reviewed XLSX could not be downloaded. Try again.");
    expect(reviewedExportErrorMessage(new Error("network"))).toBe(
      "The reviewed XLSX could not be downloaded. Try again.",
    );
  });

  it("contains no browser storage persistence or XLSX reconstruction logic", async () => {
    const source = await import("@/lib/frontend/reviewed-export");
    const text = Object.keys(source).join(" ");

    expect(text).not.toContain("localStorage");
    expect(text).not.toContain("sessionStorage");
    expect(text).not.toContain("ExcelJS");
  });
});
