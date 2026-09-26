import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  parseXlsxUpload: vi.fn(),
  sanitizeFilename: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("@/lib/import/xlsx", () => ({
  parseXlsxUpload: mocks.parseXlsxUpload,
  sanitizeFilename: mocks.sanitizeFilename,
}));

import { importCourseXlsx } from "@/lib/courses/service";

const upload = {
  name: " C:\\fakepath\\course.xlsx ",
  size: 10,
  arrayBuffer: vi.fn(),
};

function ownershipDb(rows: unknown[] = [
  {
    id: COURSE_ID,
    title: "Course",
    originalFilename: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
]) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return {
    select: vi.fn(() => ({ from })),
  };
}

function transactionHarness(options?: {
  existingVideo?: boolean;
  insertFailure?: Error;
}) {
  let selectCall = 0;
  let rolledBack = false;

  const lockedCourseLimit = vi.fn().mockResolvedValue([{ id: COURSE_ID }]);
  const existingVideoLimit = vi
    .fn()
    .mockResolvedValue(options?.existingVideo ? [{ id: "video-1" }] : []);

  const select = vi.fn(() => {
    selectCall += 1;

    if (selectCall === 1) {
      return {
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            for: vi.fn(() => ({ limit: lockedCourseLimit })),
          })),
        })),
      };
    }

    return {
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: existingVideoLimit })),
      })),
    };
  });

  const insertValues = options?.insertFailure
    ? vi.fn().mockRejectedValue(options.insertFailure)
    : vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values: insertValues }));

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  const tx = {
    select,
    insert,
    update,
  };

  const transaction = vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => {
    try {
      return await callback(tx);
    } catch (error) {
      rolledBack = true;
      throw error;
    }
  });

  return {
    db: { transaction },
    tx,
    insert,
    insertValues,
    update,
    updateSet,
    wasRolledBack: () => rolledBack,
  };
}

describe("course XLSX import service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sanitizeFilename.mockReturnValue("course.xlsx");
    mocks.parseXlsxUpload.mockResolvedValue({
      worksheetName: "Videos",
      headerRowNumber: 2,
      headers: ["Title", "URL", "Teacher"],
      rows: [
        {
          sourceRowNumber: 3,
          sourceVideoId: null,
          title: "A",
          bunnyUrl: "https://video.example.com/a",
          sourceData: {
            Title: "A",
            URL: "https://video.example.com/a",
            Teacher: "Teacher",
          },
          playlistOrder: 0,
        },
      ],
    });
  });

  it("rejects a non-owner before parsing the spreadsheet", async () => {
    mocks.getDb.mockReturnValue(ownershipDb([]));

    await expect(
      importCourseXlsx(USER_ID, COURSE_ID, upload),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    expect(mocks.parseXlsxUpload).not.toHaveBeenCalled();
  });

  it("persists rows and import metadata inside one transaction", async () => {
    const harness = transactionHarness();
    mocks.getDb
      .mockReturnValueOnce(ownershipDb())
      .mockReturnValueOnce(harness.db);

    const result = await importCourseXlsx(USER_ID, COURSE_ID, upload);

    expect(harness.db.transaction).toHaveBeenCalledTimes(1);
    expect(harness.insertValues).toHaveBeenCalledWith([
      {
        courseId: COURSE_ID,
        sourceRowNumber: 3,
        sourceVideoId: null,
        title: "A",
        bunnyUrl: "https://video.example.com/a",
        sourceData: {
          Title: "A",
          URL: "https://video.example.com/a",
          Teacher: "Teacher",
        },
        playlistOrder: 0,
      },
    ]);
    expect(harness.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        originalFilename: "course.xlsx",
        importMetadata: {
          headers: ["Title", "URL", "Teacher"],
          worksheetName: "Videos",
          headerRowNumber: 2,
        },
        updatedAt: expect.any(Date),
      }),
    );
    expect(result).toEqual({
      courseId: COURSE_ID,
      importedCount: 1,
      originalFilename: "course.xlsx",
    });
  });

  it("rejects a second import with COURSE_ALREADY_IMPORTED", async () => {
    const harness = transactionHarness({ existingVideo: true });
    mocks.getDb
      .mockReturnValueOnce(ownershipDb())
      .mockReturnValueOnce(harness.db);

    await expect(
      importCourseXlsx(USER_ID, COURSE_ID, upload),
    ).rejects.toMatchObject({
      code: "COURSE_ALREADY_IMPORTED",
      status: 409,
    });

    expect(harness.insert).not.toHaveBeenCalled();
    expect(harness.update).not.toHaveBeenCalled();
  });

  it("keeps DB writes atomic when a video insert fails", async () => {
    const failure = new Error("insert failed");
    const harness = transactionHarness({ insertFailure: failure });
    mocks.getDb
      .mockReturnValueOnce(ownershipDb())
      .mockReturnValueOnce(harness.db);

    await expect(
      importCourseXlsx(USER_ID, COURSE_ID, upload),
    ).rejects.toBe(failure);

    expect(harness.wasRolledBack()).toBe(true);
    expect(harness.update).not.toHaveBeenCalled();
  });

  it("propagates structured import errors without converting them into partial writes", async () => {
    const error = new ApiError(
      422,
      "INVALID_IMPORT_ROWS",
      "Spreadsheet contains invalid rows.",
    );
    mocks.parseXlsxUpload.mockRejectedValue(error);
    mocks.getDb.mockReturnValue(ownershipDb());

    await expect(
      importCourseXlsx(USER_ID, COURSE_ID, upload),
    ).rejects.toBe(error);

    expect(mocks.getDb).toHaveBeenCalledTimes(1);
  });
});
