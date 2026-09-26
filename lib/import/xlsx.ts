import ExcelJS from "@ayocore/exceljs";
import { ApiError } from "@/lib/api/errors";

export const MAX_XLSX_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_ROWS = 10_000;
const MAX_WORKSHEETS_TO_SEARCH = 10;
const MAX_HEADER_ROWS_TO_SEARCH = 10;
const MAX_ROW_ERROR_DETAILS = 100;

export type UploadedXlsx = {
  name: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ParsedVideoRow = {
  sourceRowNumber: number;
  sourceVideoId: string | null;
  title: string;
  bunnyUrl: string;
  sourceData: Record<string, unknown>;
  playlistOrder: number;
};

export type ParsedCourseImport = {
  worksheetName: string;
  headerRowNumber: number;
  headers: string[];
  rows: ParsedVideoRow[];
};

const TITLE_ALIASES = new Set(
  [
    "title",
    "video title",
    "video_title",
    "video-title",
    "titre",
    "video titre",
    "titre video",
    "عنوان",
    "عنوان الفيديو",
  ].map(normalizeHeader),
);

const URL_ALIASES = new Set(
  [
    "bunny url",
    "bunny_url",
    "bunny-url",
    "video url",
    "video_url",
    "video-url",
    "video link",
    "video_link",
    "link",
    "url",
    "lien",
    "lien video",
    "رابط",
    "رابط الفيديو",
  ].map(normalizeHeader),
);

const SOURCE_VIDEO_ID_ALIASES = new Set(
  ["source video id", "source_video_id", "video id", "video_id"].map(
    normalizeHeader,
  ),
);

type HeaderMatch = {
  worksheet: ExcelJS.Worksheet;
  headerRowNumber: number;
  titleColumn: number;
  urlColumn: number;
};

type SourceColumn = {
  index: number;
  name: string;
  normalizedName: string;
};

export function normalizeHeader(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s_-]+/g, " ");
}

export function sanitizeFilename(filename: string) {
  const leaf = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = leaf
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .replace(/\s+/g, " ");

  return (cleaned || "upload.xlsx").slice(0, 255);
}

function safeCellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;

  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();

  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) {
      const result = "result" in value ? value.result : undefined;
      if (result === null || result === undefined) {
        const text = cell.text.trim();
        return text || null;
      }
      return serializeValue(result);
    }

    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText
        .map((part) =>
          typeof part === "object" &&
          part !== null &&
          "text" in part &&
          typeof part.text === "string"
            ? part.text
            : "",
        )
        .join("");
    }

    if (
      "text" in value &&
      typeof value.text === "string" &&
      "hyperlink" in value &&
      typeof value.hyperlink === "string"
    ) {
      return value.text;
    }

    if ("error" in value && typeof value.error === "string") {
      return value.error;
    }
  }

  const text = cell.text.trim();
  return text || null;
}

function serializeValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

function cellText(cell: ExcelJS.Cell) {
  const value = safeCellValue(cell);
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function requiredUrlText(cell: ExcelJS.Cell) {
  const value = cell.value;
  if (
    value &&
    typeof value === "object" &&
    "hyperlink" in value &&
    typeof value.hyperlink === "string"
  ) {
    return value.hyperlink.trim();
  }
  return cellText(cell);
}

function isBlank(value: unknown) {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function isValidHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function findHeader(workbook: ExcelJS.Workbook): HeaderMatch {
  for (const worksheet of workbook.worksheets.slice(0, MAX_WORKSHEETS_TO_SEARCH)) {
    const lastRow = Math.min(worksheet.rowCount, MAX_HEADER_ROWS_TO_SEARCH);

    for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
      const row = worksheet.getRow(rowNumber);
      const titleMatches: number[] = [];
      const urlMatches: number[] = [];

      row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
        const normalized = normalizeHeader(cellText(cell));
        if (TITLE_ALIASES.has(normalized)) titleMatches.push(columnNumber);
        if (URL_ALIASES.has(normalized)) urlMatches.push(columnNumber);
      });

      if (titleMatches.length > 0 && urlMatches.length > 0) {
        if (titleMatches.length !== 1 || urlMatches.length !== 1) {
          throw new ApiError(
            422,
            "AMBIGUOUS_REQUIRED_COLUMNS",
            "Spreadsheet contains ambiguous required columns.",
          );
        }

        return {
          worksheet,
          headerRowNumber: rowNumber,
          titleColumn: titleMatches[0],
          urlColumn: urlMatches[0],
        };
      }
    }
  }

  throw new ApiError(
    422,
    "MISSING_REQUIRED_COLUMNS",
    "Spreadsheet must contain Video Title and Bunny URL columns.",
  );
}

function collectSourceColumns(
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
): SourceColumn[] {
  const usedColumns = new Set<number>();

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber < headerRowNumber) return;
    row.eachCell({ includeEmpty: false }, (_cell, columnNumber) => {
      usedColumns.add(columnNumber);
    });
  });

  const headerRow = worksheet.getRow(headerRowNumber);
  const sourceColumns: SourceColumn[] = [];
  const seen = new Set<string>();

  for (const columnNumber of [...usedColumns].sort((a, b) => a - b)) {
    const name = cellText(headerRow.getCell(columnNumber));
    if (!name) {
      throw new ApiError(
        422,
        "INVALID_SOURCE_HEADERS",
        "Spreadsheet contains an empty header for a populated source column.",
      );
    }

    const normalizedName = normalizeHeader(name);
    if (seen.has(normalizedName)) {
      throw new ApiError(
        422,
        "INVALID_SOURCE_HEADERS",
        "Spreadsheet contains duplicate source column names.",
      );
    }

    seen.add(normalizedName);
    sourceColumns.push({
      index: columnNumber,
      name,
      normalizedName,
    });
  }

  return sourceColumns;
}

function findOptionalSourceVideoIdColumn(columns: SourceColumn[]) {
  const matches = columns.filter((column) =>
    SOURCE_VIDEO_ID_ALIASES.has(column.normalizedName),
  );

  if (matches.length > 1) {
    throw new ApiError(
      422,
      "INVALID_SOURCE_HEADERS",
      "Spreadsheet contains multiple source video ID columns.",
    );
  }

  return matches[0]?.index ?? null;
}

function buildRows(
  worksheet: ExcelJS.Worksheet,
  headerRowNumber: number,
  columns: SourceColumn[],
  titleColumn: number,
  urlColumn: number,
  sourceVideoIdColumn: number | null,
): ParsedVideoRow[] {
  const rows: ParsedVideoRow[] = [];
  const errors: Array<{ row: number; field: string; message: string }> = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const sourceData: Record<string, unknown> = {};
    let hasSourceValue = false;

    for (const column of columns) {
      const value = safeCellValue(row.getCell(column.index));
      sourceData[column.name] = value;
      if (!isBlank(value)) hasSourceValue = true;
    }

    if (!hasSourceValue) return;

    if (rows.length >= MAX_VIDEO_ROWS) {
      throw new ApiError(
        422,
        "INVALID_IMPORT_ROWS",
        `Spreadsheet exceeds the maximum of ${MAX_VIDEO_ROWS} video rows.`,
      );
    }

    const title = cellText(row.getCell(titleColumn));
    const bunnyUrl = requiredUrlText(row.getCell(urlColumn));

    if (!title && errors.length < MAX_ROW_ERROR_DETAILS) {
      errors.push({
        row: rowNumber,
        field: "title",
        message: "Non-empty video title required.",
      });
    }

    if (!bunnyUrl || !isValidHttpsUrl(bunnyUrl)) {
      if (errors.length < MAX_ROW_ERROR_DETAILS) {
        errors.push({
          row: rowNumber,
          field: "bunnyUrl",
          message: "Valid HTTPS video URL required.",
        });
      }
    }

    const sourceVideoIdValue =
      sourceVideoIdColumn === null
        ? null
        : safeCellValue(row.getCell(sourceVideoIdColumn));

    rows.push({
      sourceRowNumber: rowNumber,
      sourceVideoId:
        sourceVideoIdColumn === null || isBlank(sourceVideoIdValue)
          ? null
          : String(sourceVideoIdValue).trim(),
      title,
      bunnyUrl,
      sourceData,
      playlistOrder: rows.length,
    });
  });

  if (rows.length === 0) {
    throw new ApiError(
      422,
      "INVALID_IMPORT_ROWS",
      "Spreadsheet contains no video rows.",
    );
  }

  if (errors.length > 0) {
    throw new ApiError(
      422,
      "INVALID_IMPORT_ROWS",
      "Spreadsheet contains invalid rows.",
      errors,
    );
  }

  return rows;
}

export async function parseXlsxUpload(file: UploadedXlsx): Promise<ParsedCourseImport> {
  const sanitizedName = sanitizeFilename(file.name);
  if (!sanitizedName.toLocaleLowerCase("en-US").endsWith(".xlsx")) {
    throw new ApiError(
      415,
      "INVALID_FILE_TYPE",
      "Only .xlsx files are supported.",
    );
  }

  if (file.size > MAX_XLSX_BYTES) {
    throw new ApiError(
      413,
      "FILE_TOO_LARGE",
      "XLSX file exceeds the 10 MB limit.",
    );
  }

  let workbook: ExcelJS.Workbook;
  try {
    workbook = new ExcelJS.Workbook();
    const buffer = await file.arrayBuffer();
    await workbook.xlsx.load(buffer);
  } catch {
    throw new ApiError(
      422,
      "INVALID_REQUEST",
      "Invalid XLSX workbook.",
    );
  }

  const header = findHeader(workbook);
  const columns = collectSourceColumns(header.worksheet, header.headerRowNumber);
  const sourceVideoIdColumn = findOptionalSourceVideoIdColumn(columns);
  const rows = buildRows(
    header.worksheet,
    header.headerRowNumber,
    columns,
    header.titleColumn,
    header.urlColumn,
    sourceVideoIdColumn,
  );

  return {
    worksheetName: header.worksheet.name,
    headerRowNumber: header.headerRowNumber,
    headers: columns.map((column) => column.name),
    rows,
  };
}
