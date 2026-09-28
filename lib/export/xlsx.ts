import { Buffer } from "node:buffer";
import ExcelJS from "@ayocore/exceljs";
import { sanitizeFilename } from "@/lib/import/xlsx";
import type { ReviewedExportData } from "@/lib/export/service";

const REVIEWER_NOTE_HEADER = "Reviewer Note";

type ExcelJsWriteOutput = Awaited<
  ReturnType<ExcelJS.Workbook["xlsx"]["writeBuffer"]>
>;

function toExcelCellValue(value: unknown): ExcelJS.CellValue {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  ) {
    return value;
  }

  throw new Error("Unsupported stored source value");
}

function toNodeBuffer(output: ExcelJsWriteOutput): Buffer {
  return Buffer.from(output as unknown as ArrayBuffer);
}

export function reviewedExportFilename(originalFilename: string | null) {
  if (!originalFilename) return "reviewed-course.xlsx";

  const sanitized = sanitizeFilename(originalFilename)
    .replace(/["]/g, "_")
    .replace(/[\\/]/g, "_");

  const withoutExtension = sanitized.replace(/\.xlsx$/i, "").trim();
  const base = withoutExtension || "course";

  return `${base}-reviewed.xlsx`;
}

export async function buildReviewedXlsx(
  data: ReviewedExportData,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(data.importMetadata.worksheetName);

  const headerRow = worksheet.getRow(
    data.importMetadata.headerRowNumber,
  );

  data.importMetadata.headers.forEach((header, index) => {
    headerRow.getCell(index + 1).value = header;
  });

  const reviewerNoteColumn = data.importMetadata.headers.length + 1;
  headerRow.getCell(reviewerNoteColumn).value = REVIEWER_NOTE_HEADER;

  for (const video of data.videos) {
    const row = worksheet.getRow(video.sourceRowNumber);

    data.importMetadata.headers.forEach((header, index) => {
      row.getCell(index + 1).value = toExcelCellValue(
        video.sourceData[header],
      );
    });

    row.getCell(reviewerNoteColumn).value =
      video.reviewReviewedAt && video.reviewNote
        ? video.reviewNote.trim() || null
        : null;
  }

  const output = await workbook.xlsx.writeBuffer();
  return toNodeBuffer(output);
}
