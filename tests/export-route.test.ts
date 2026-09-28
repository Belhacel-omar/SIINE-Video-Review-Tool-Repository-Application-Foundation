import ExcelJS from "@ayocore/exceljs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getReviewedExportData: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/export/service", () => ({
  getReviewedExportData: mocks.getReviewedExportData,
}));

import { GET } from "@/app/api/courses/[courseId]/export/route";

type ExcelJsLoadInput = Parameters<
  ExcelJS.Workbook["xlsx"]["load"]
>[0];

async function get(courseId = COURSE_ID) {
  return GET(
    new Request(`http://localhost/api/courses/${courseId}/export`),
    { params: Promise.resolve({ courseId }) },
  );
}

describe("GET /api/courses/:courseId/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      user: { id: USER_ID, email: "admin@example.com" },
      response: null,
    });
    mocks.getReviewedExportData.mockResolvedValue({
      originalFilename: "Teacher Batch 01.xlsx",
      importMetadata: {
        headers: ["Video Title", "Bunny URL"],
        worksheetName: "Videos",
        headerRowNumber: 1,
      },
      videos: [
        {
          sourceRowNumber: 2,
          sourceData: {
            "Video Title": "Lesson",
            "Bunny URL": "https://example.b-cdn.net/video",
          },
          reviewNote: "done",
          reviewReviewedAt: new Date("2026-09-28T04:00:00.000Z"),
        },
      ],
    });
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response(
        JSON.stringify({
          error: {
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          },
        }),
        { status: 401 },
      ),
    });

    const response = await get();

    expect(response.status).toBe(401);
    expect(mocks.getReviewedExportData).not.toHaveBeenCalled();
  });

  it("rejects a malformed course UUID", async () => {
    const response = await get("not-a-uuid");

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Invalid course ID.",
      },
    });
  });

  it.each(["unknown", "non-owner"])(
    "returns the same safe 404 for %s course",
    async () => {
      mocks.getReviewedExportData.mockRejectedValue(
        new ApiError(404, "NOT_FOUND", "Resource not found."),
      );

      const response = await get();

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Resource not found.",
        },
      });
    },
  );

  it("returns COURSE_NOT_IMPORTED when the owned course has no import", async () => {
    mocks.getReviewedExportData.mockRejectedValue(
      new ApiError(
        409,
        "COURSE_NOT_IMPORTED",
        "Course has not imported a spreadsheet.",
      ),
    );

    const response = await get();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: {
        code: "COURSE_NOT_IMPORTED",
        message: "Course has not imported a spreadsheet.",
      },
    });
  });

  it("returns a real downloadable XLSX without a JSON success wrapper", async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="Teacher Batch 01-reviewed.xlsx"',
    );
    expect(mocks.getReviewedExportData).toHaveBeenCalledWith(
      USER_ID,
      COURSE_ID,
    );

    const arrayBuffer = await response.arrayBuffer();
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      arrayBuffer as unknown as ExcelJsLoadInput,
    );

    const worksheet = workbook.getWorksheet("Videos");
    expect(worksheet).toBeDefined();
    expect(worksheet!.getRow(1).getCell(3).value).toBe("Reviewer Note");
    expect(worksheet!.getRow(2).getCell(3).value).toBe("done");
  });

  it("returns a generic internal error for unexpected failures", async () => {
    mocks.getReviewedExportData.mockRejectedValue(
      new Error("/secret/db/path postgres details"),
    );

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("/secret/db/path");
  });
});
