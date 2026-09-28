import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
}));

import { getReviewedExportData } from "@/lib/export/service";

function dbFor(
  courseRows: unknown[],
  videoRows: unknown[] = [],
) {
  let selectCall = 0;

  return {
    select: vi.fn(() => {
      selectCall += 1;

      if (selectCall === 1) {
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn().mockResolvedValue(courseRows),
            })),
          })),
        };
      }

      return {
        from: vi.fn(() => ({
          innerJoin: vi.fn(() => ({
            leftJoin: vi.fn(() => ({
              where: vi.fn(() => ({
                orderBy: vi.fn().mockResolvedValue(videoRows),
              })),
            })),
          })),
        })),
      };
    }),
  };
}

describe("reviewed export data access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns safe NOT_FOUND when the owned course lookup returns no row", async () => {
    mocks.getDb.mockReturnValue(dbFor([]));

    await expect(
      getReviewedExportData(USER_ID, COURSE_ID),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });
  });

  it("returns COURSE_NOT_IMPORTED when import metadata is absent", async () => {
    mocks.getDb.mockReturnValue(
      dbFor([
        {
          id: COURSE_ID,
          originalFilename: null,
          importMetadata: null,
        },
      ]),
    );

    await expect(
      getReviewedExportData(USER_ID, COURSE_ID),
    ).rejects.toMatchObject({
      code: "COURSE_NOT_IMPORTED",
      status: 409,
    });
  });

  it("returns imported source rows even when the course is only partially reviewed", async () => {
    const videos = [
      {
        sourceRowNumber: 2,
        sourceData: { Title: "A" },
        reviewNote: "done",
        reviewReviewedAt: new Date("2026-09-28T04:00:00.000Z"),
      },
      {
        sourceRowNumber: 4,
        sourceData: { Title: "B" },
        reviewNote: "draft",
        reviewReviewedAt: null,
      },
    ];

    mocks.getDb.mockReturnValue(
      dbFor(
        [
          {
            id: COURSE_ID,
            originalFilename: "course.xlsx",
            importMetadata: {
              headers: ["Title"],
              worksheetName: "Videos",
              headerRowNumber: 1,
            },
          },
        ],
        videos,
      ),
    );

    const result = await getReviewedExportData(USER_ID, COURSE_ID);

    expect(result.originalFilename).toBe("course.xlsx");
    expect(result.videos).toEqual(videos);
    expect(result.videos).toHaveLength(2);
  });
});
