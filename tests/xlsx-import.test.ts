import { readFile } from "node:fs/promises";
import ExcelJS from "@ayocore/exceljs";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";
import {
  MAX_XLSX_BYTES,
  parseXlsxUpload,
  type UploadedXlsx,
} from "@/lib/import/xlsx";

type SheetInput = {
  name: string;
  rows: unknown[][];
};

async function makeUpload(
  sheets: SheetInput[],
  filename = "course.xlsx",
): Promise<UploadedXlsx> {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) worksheet.addRow(row);
  }

  const bytes = Buffer.from(await workbook.xlsx.writeBuffer());

  return {
    name: filename,
    size: bytes.byteLength,
    arrayBuffer: async () =>
      bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer,
  };
}

async function expectApiError(
  promise: Promise<unknown>,
  code: string,
  status?: number,
) {
  try {
    await promise;
    throw new Error("Expected ApiError");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe(code);
    if (status !== undefined) expect((error as ApiError).status).toBe(status);
    return error as ApiError;
  }
}

describe("XLSX import parsing", () => {
  it("parses an independently produced XLSX fixture through the production binary adapter", async () => {
    const bytes = await readFile(
      new URL("./fixtures/runtime-valid.xlsx", import.meta.url),
    );
    const fixture: UploadedXlsx = {
      name: "runtime-valid.xlsx",
      size: bytes.byteLength,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
    };

    const parsed = await parseXlsxUpload(fixture);

    expect(parsed.worksheetName).toBe("Videos");
    expect(parsed.headerRowNumber).toBe(1);
    expect(parsed.headers).toEqual([
      "Video Title",
      "Bunny URL",
      "Source Video ID",
      "Teacher",
      "Chapter",
    ]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows.map((row) => row.sourceVideoId)).toEqual([
      "SRC-001",
      "SRC-002",
      "SRC-003",
    ]);
    expect(parsed.rows.map((row) => row.playlistOrder)).toEqual([0, 1, 2]);
    expect(parsed.rows.map((row) => row.title)).toEqual([
      "Intro Lesson",
      "Duplicate Title",
      "Duplicate Title",
    ]);
  });

  it("imports valid rows, preserves source row numbers/data, and uses zero-based playlist order", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Video Title", "Bunny URL", "Teacher", "source_video_id"],
          ["Lesson 1", "https://video.example.com/1", "A", "SRC-1"],
          ["Lesson 1", "https://video.example.com/2", "B", "SRC-2"],
        ],
      },
    ]);

    const parsed = await parseXlsxUpload(file);

    expect(parsed.worksheetName).toBe("Videos");
    expect(parsed.headerRowNumber).toBe(1);
    expect(parsed.headers).toEqual([
      "Video Title",
      "Bunny URL",
      "Teacher",
      "source_video_id",
    ]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]).toMatchObject({
      sourceRowNumber: 2,
      sourceVideoId: "SRC-1",
      title: "Lesson 1",
      bunnyUrl: "https://video.example.com/1",
      playlistOrder: 0,
      sourceData: {
        "Video Title": "Lesson 1",
        "Bunny URL": "https://video.example.com/1",
        Teacher: "A",
        source_video_id: "SRC-1",
      },
    });
    expect(parsed.rows[1].playlistOrder).toBe(1);
    expect(parsed.rows[1].title).toBe("Lesson 1");
  });

  it("uses the first worksheet/header pair found within the configured search window", async () => {
    const file = await makeUpload([
      {
        name: "Cover",
        rows: [["Course export"], ["No video columns here"]],
      },
      {
        name: "Data",
        rows: [
          ["Generated file"],
          ["Titre", "Lien video"],
          ["Leçon", "https://cdn.example.com/video"],
        ],
      },
    ]);

    const parsed = await parseXlsxUpload(file);

    expect(parsed.worksheetName).toBe("Data");
    expect(parsed.headerRowNumber).toBe(2);
    expect(parsed.rows[0].sourceRowNumber).toBe(3);
  });

  it("keeps sourceVideoId null when no explicit source-video-ID column exists", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL", "id"],
          ["Lesson", "https://video.example.com/1", "generic-id"],
        ],
      },
    ]);

    const parsed = await parseXlsxUpload(file);

    expect(parsed.rows[0].sourceVideoId).toBeNull();
    expect(parsed.rows[0].sourceData.id).toBe("generic-id");
  });

  it("ignores completely empty rows while preserving actual worksheet row numbers", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL"],
          ["First", "https://video.example.com/1"],
          [],
          ["Second", "https://video.example.com/2"],
        ],
      },
    ]);

    const parsed = await parseXlsxUpload(file);

    expect(parsed.rows.map((row) => row.sourceRowNumber)).toEqual([2, 4]);
    expect(parsed.rows.map((row) => row.playlistOrder)).toEqual([0, 1]);
  });

  it("rejects a non-empty row with an empty title and fails the whole import", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL"],
          ["Good", "https://video.example.com/1"],
          ["", "https://video.example.com/2"],
        ],
      },
    ]);

    const error = await expectApiError(
      parseXlsxUpload(file),
      "INVALID_IMPORT_ROWS",
      422,
    );

    expect(error.details).toEqual(
      expect.arrayContaining([
        {
          row: 3,
          field: "title",
          message: "Non-empty video title required.",
        },
      ]),
    );
  });

  it("rejects an invalid URL row and fails the whole import", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL"],
          ["Good", "https://video.example.com/1"],
          ["Bad", "not-a-url"],
        ],
      },
    ]);

    const error = await expectApiError(
      parseXlsxUpload(file),
      "INVALID_IMPORT_ROWS",
      422,
    );

    expect(error.details).toEqual(
      expect.arrayContaining([
        {
          row: 3,
          field: "bunnyUrl",
          message: "Valid HTTPS video URL required.",
        },
      ]),
    );
  });

  it("rejects a non-HTTPS URL", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL"],
          ["Lesson", "http://video.example.com/1"],
        ],
      },
    ]);

    await expectApiError(parseXlsxUpload(file), "INVALID_IMPORT_ROWS", 422);
  });

  it("rejects missing required columns", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [["Title", "Teacher"], ["Lesson", "A"]],
      },
    ]);

    await expectApiError(
      parseXlsxUpload(file),
      "MISSING_REQUIRED_COLUMNS",
      422,
    );
  });

  it("rejects ambiguous title columns", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "Video Title", "URL"],
          ["A", "B", "https://video.example.com/1"],
        ],
      },
    ]);

    await expectApiError(
      parseXlsxUpload(file),
      "AMBIGUOUS_REQUIRED_COLUMNS",
      422,
    );
  });

  it("rejects ambiguous URL columns", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL", "Video URL"],
          ["A", "https://video.example.com/1", "https://video.example.com/2"],
        ],
      },
    ]);

    await expectApiError(
      parseXlsxUpload(file),
      "AMBIGUOUS_REQUIRED_COLUMNS",
      422,
    );
  });

  it("rejects duplicate source headers after normalization", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL", "Teacher Name", "teacher_name"],
          ["A", "https://video.example.com/1", "X", "Y"],
        ],
      },
    ]);

    await expectApiError(
      parseXlsxUpload(file),
      "INVALID_SOURCE_HEADERS",
      422,
    );
  });

  it("rejects an empty header when its source column contains data", async () => {
    const file = await makeUpload([
      {
        name: "Videos",
        rows: [
          ["Title", "URL", ""],
          ["A", "https://video.example.com/1", "unlabelled"],
        ],
      },
    ]);

    await expectApiError(
      parseXlsxUpload(file),
      "INVALID_SOURCE_HEADERS",
      422,
    );
  });

  it.each(["course.xls", "course.xlsm", "course.csv", "course.txt"])(
    "rejects unsupported file type %s",
    async (filename) => {
      const fake: UploadedXlsx = {
        name: filename,
        size: 1,
        arrayBuffer: vi.fn(),
      };

      await expectApiError(parseXlsxUpload(fake), "INVALID_FILE_TYPE", 415);
      expect(fake.arrayBuffer).not.toHaveBeenCalled();
    },
  );

  it("rejects files larger than 10 MB before parsing", async () => {
    const fake: UploadedXlsx = {
      name: "course.xlsx",
      size: MAX_XLSX_BYTES + 1,
      arrayBuffer: vi.fn(),
    };

    await expectApiError(parseXlsxUpload(fake), "FILE_TOO_LARGE", 413);
    expect(fake.arrayBuffer).not.toHaveBeenCalled();
  });

  it("rejects more than 10,000 non-empty video rows", async () => {
    const rows: unknown[][] = [["Title", "URL"]];
    for (let index = 0; index < 10_001; index += 1) {
      rows.push([
        `Video ${index}`,
        `https://video.example.com/${index}`,
      ]);
    }

    const file = await makeUpload([{ name: "Videos", rows }]);

    await expectApiError(parseXlsxUpload(file), "INVALID_IMPORT_ROWS", 422);
  });

  it("returns a safe validation error for a malformed workbook", async () => {
    const bytes = Buffer.from("not an xlsx");
    const fake: UploadedXlsx = {
      name: "course.xlsx",
      size: bytes.length,
      arrayBuffer: async () =>
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ) as ArrayBuffer,
    };

    const error = await expectApiError(
      parseXlsxUpload(fake),
      "INVALID_REQUEST",
      422,
    );

    expect(error.message).toBe("Invalid XLSX workbook.");
    expect(error.message).not.toContain("stack");
  });
});
