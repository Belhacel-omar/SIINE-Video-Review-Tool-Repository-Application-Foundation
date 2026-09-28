import { Buffer } from "node:buffer";
import ExcelJS from "@ayocore/exceljs";
import { describe, expect, it } from "vitest";
import {
  buildReviewedXlsx,
  reviewedExportFilename,
} from "@/lib/export/xlsx";
import type { ReviewedExportData } from "@/lib/export/service";

type ExcelJsLoadInput = Parameters<
  ExcelJS.Workbook["xlsx"]["load"]
>[0];

async function readWorkbook(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(
    buffer as unknown as ExcelJsLoadInput,
  );
  return workbook;
}

function exportData(): ReviewedExportData {
  return {
    originalFilename: "Teacher Batch 01.xlsx",
    importMetadata: {
      worksheetName: "Videos",
      headerRowNumber: 3,
      headers: [
        "Video Title",
        "Bunny URL",
        "Source Video ID",
        "Teacher",
        "Chapter",
      ],
    },
    videos: [
      {
        sourceRowNumber: 4,
        sourceData: {
          "Video Title": "Intro Lesson",
          "Bunny URL": "https://example.b-cdn.net/video-001",
          "Source Video ID": "SRC-001",
          Teacher: "QA Teacher",
          Chapter: "Chapter 1",
        },
        reviewNote: "  reviewed note  ",
        reviewReviewedAt: new Date("2026-09-28T04:34:57.520Z"),
      },
      {
        sourceRowNumber: 6,
        sourceData: {
          "Video Title": "Duplicate Title",
          "Bunny URL": "https://example.b-cdn.net/video-002",
          "Source Video ID": "SRC-002",
          Teacher: "QA Teacher",
          Chapter: "Chapter 1",
        },
        reviewNote: null,
        reviewReviewedAt: new Date("2026-09-28T04:35:57.520Z"),
      },
      {
        sourceRowNumber: 7,
        sourceData: {
          "Video Title": "Duplicate Title",
          "Bunny URL": "https://example.b-cdn.net/video-003",
          "Source Video ID": "SRC-003",
          Teacher: "QA Teacher",
          Chapter: "Chapter 2",
        },
        reviewNote: "draft note must stay hidden",
        reviewReviewedAt: null,
      },
      {
        sourceRowNumber: 8,
        sourceData: {
          "Video Title": "No Review",
          "Bunny URL": "https://example.b-cdn.net/video-004",
          "Source Video ID": null,
          Teacher: "QA Teacher",
          Chapter: "Chapter 2",
        },
        reviewNote: null,
        reviewReviewedAt: null,
      },
    ],
  };
}

describe("reviewed XLSX export", () => {
  it("reconstructs stored rows/headers and appends only Reviewer Note", async () => {
    const output = await buildReviewedXlsx(exportData());

    expect(Buffer.isBuffer(output)).toBe(true);
    expect(output.subarray(0, 4).toString("binary")).toBe("PK\u0003\u0004");

    const workbook = await readWorkbook(output);
    const worksheet = workbook.getWorksheet("Videos");

    expect(worksheet).toBeDefined();
    expect(worksheet!.getRow(1).cellCount).toBe(0);
    expect(worksheet!.getRow(2).cellCount).toBe(0);
    expect(worksheet!.getRow(5).cellCount).toBe(0);

    expect(
      Array.from({ length: 6 }, (_, index) =>
        worksheet!.getRow(3).getCell(index + 1).value,
      ),
    ).toEqual([
      "Video Title",
      "Bunny URL",
      "Source Video ID",
      "Teacher",
      "Chapter",
      "Reviewer Note",
    ]);

    expect(worksheet!.columnCount).toBe(6);

    expect(worksheet!.getRow(4).getCell(1).value).toBe("Intro Lesson");
    expect(worksheet!.getRow(4).getCell(3).value).toBe("SRC-001");
    expect(worksheet!.getRow(4).getCell(4).value).toBe("QA Teacher");
    expect(worksheet!.getRow(4).getCell(5).value).toBe("Chapter 1");
    expect(worksheet!.getRow(4).getCell(6).value).toBe("reviewed note");

    expect(worksheet!.getRow(6).getCell(1).value).toBe("Duplicate Title");
    expect(worksheet!.getRow(6).getCell(3).value).toBe("SRC-002");
    expect(worksheet!.getRow(6).getCell(6).value).toBeNull();

    expect(worksheet!.getRow(7).getCell(1).value).toBe("Duplicate Title");
    expect(worksheet!.getRow(7).getCell(3).value).toBe("SRC-003");
    expect(worksheet!.getRow(7).getCell(6).value).toBeNull();

    expect(worksheet!.getRow(8).getCell(6).value).toBeNull();
    expect(worksheet!.getRow(4).getCell(7).value).toBeNull();
  });

  it("uses a safe reviewed filename", () => {
    expect(reviewedExportFilename("course.xlsx")).toBe(
      "course-reviewed.xlsx",
    );
    expect(reviewedExportFilename("Teacher Batch 01.xlsx")).toBe(
      "Teacher Batch 01-reviewed.xlsx",
    );
    expect(reviewedExportFilename(null)).toBe("reviewed-course.xlsx");
    expect(reviewedExportFilename("../../bad\r\nname.xlsx")).toBe(
      "badname-reviewed.xlsx",
    );
  });
});
