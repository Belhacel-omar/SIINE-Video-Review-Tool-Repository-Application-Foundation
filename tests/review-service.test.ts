import { beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const VIDEO_ID = "33333333-3333-4333-8333-333333333333";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getDb: mocks.getDb,
}));

import { saveReview } from "@/lib/reviews/service";

type StoredReview = {
  id: string;
  videoId: string;
  reviewerId: string;
  note: string | null;
  wasPlayed: boolean;
  reviewedAt: Date | null;
  updatedAt: Date;
};

function makeStatefulDb(options?: { owned?: boolean }) {
  let stored: StoredReview | null = null;
  let insertCount = 0;
  let updateCount = 0;
  let lockCount = 0;

  const db = {
    transaction: vi.fn(async (callback: (tx: object) => Promise<unknown>) => {
      let selectCall = 0;

      const tx = {
        select: vi.fn(() => {
          selectCall += 1;

          if (selectCall === 1) {
            return {
              from: vi.fn(() => ({
                innerJoin: vi.fn(() => ({
                  where: vi.fn(() => ({
                    for: vi.fn((mode: string) => {
                      expect(mode).toBe("update");
                      lockCount += 1;
                      return {
                        limit: vi
                          .fn()
                          .mockResolvedValue(
                            options?.owned === false
                              ? []
                              : [{ id: VIDEO_ID }],
                          ),
                      };
                    }),
                  })),
                })),
              })),
            };
          }

          return {
            from: vi.fn(() => ({
              where: vi.fn(() => ({
                limit: vi.fn().mockImplementation(async () =>
                  stored
                    ? [
                        {
                          id: stored.id,
                          wasPlayed: stored.wasPlayed,
                          reviewedAt: stored.reviewedAt,
                        },
                      ]
                    : [],
                ),
              })),
            })),
          };
        }),
        insert: vi.fn(() => ({
          values: vi.fn((values: {
            videoId: string;
            reviewerId: string;
            note: string | null;
            wasPlayed: boolean;
            reviewedAt: Date | null;
          }) => ({
            returning: vi.fn(async () => {
              insertCount += 1;
              stored = {
                id: "review-1",
                ...values,
                updatedAt: new Date(),
              };
              return [
                {
                  videoId: stored.videoId,
                  note: stored.note,
                  wasPlayed: stored.wasPlayed,
                  reviewedAt: stored.reviewedAt,
                },
              ];
            }),
          })),
        })),
        update: vi.fn(() => ({
          set: vi.fn((values: {
            note: string | null;
            wasPlayed: boolean;
            reviewedAt: Date | null;
            updatedAt: Date;
          }) => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => {
                updateCount += 1;
                if (!stored) throw new Error("missing stored review");
                stored = {
                  ...stored,
                  ...values,
                };
                return [
                  {
                    videoId: stored.videoId,
                    note: stored.note,
                    wasPlayed: stored.wasPlayed,
                    reviewedAt: stored.reviewedAt,
                  },
                ];
              }),
            })),
          })),
        })),
      };

      return callback(tx);
    }),
  };

  return {
    db,
    getStored: () => stored,
    getInsertCount: () => insertCount,
    getUpdateCount: () => updateCount,
    getLockCount: () => lockCount,
  };
}

describe("review persistence service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns safe NOT_FOUND for a non-owned video before any review write", async () => {
    const harness = makeStatefulDb({ owned: false });
    mocks.getDb.mockReturnValue(harness.db);

    await expect(
      saveReview(USER_ID, VIDEO_ID, {
        note: "private",
        wasPlayed: true,
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      status: 404,
    });

    expect(harness.getInsertCount()).toBe(0);
    expect(harness.getUpdateCount()).toBe(0);
  });

  it("creates, edits, clears, and monotonically upgrades one review row", async () => {
    const harness = makeStatefulDb();
    mocks.getDb.mockReturnValue(harness.db);

    const first = await saveReview(USER_ID, VIDEO_ID, {
      note: "first",
      wasPlayed: false,
    });

    expect(first).toMatchObject({
      videoId: VIDEO_ID,
      note: "first",
      wasPlayed: false,
      reviewedAt: null,
    });
    expect(harness.getInsertCount()).toBe(1);

    const noteOnly = await saveReview(USER_ID, VIDEO_ID, {
      note: "changed",
      wasPlayed: false,
    });

    expect(noteOnly).toMatchObject({
      note: "changed",
      wasPlayed: false,
      reviewedAt: null,
    });

    const reviewed = await saveReview(USER_ID, VIDEO_ID, {
      note: "reviewed",
      wasPlayed: true,
    });

    expect(reviewed.wasPlayed).toBe(true);
    expect(reviewed.reviewedAt).toBeInstanceOf(Date);
    const firstReviewedAt = reviewed.reviewedAt;

    const downgradeAttempt = await saveReview(USER_ID, VIDEO_ID, {
      note: null,
      wasPlayed: false,
    });

    expect(downgradeAttempt).toEqual({
      videoId: VIDEO_ID,
      note: null,
      wasPlayed: true,
      reviewedAt: firstReviewedAt,
    });

    const repeatedReviewedSave = await saveReview(USER_ID, VIDEO_ID, {
      note: "again",
      wasPlayed: true,
    });

    expect(repeatedReviewedSave).toEqual({
      videoId: VIDEO_ID,
      note: "again",
      wasPlayed: true,
      reviewedAt: firstReviewedAt,
    });

    expect(harness.getInsertCount()).toBe(1);
    expect(harness.getUpdateCount()).toBe(4);
    expect(harness.getLockCount()).toBe(5);
    expect(harness.getStored()).toMatchObject({
      videoId: VIDEO_ID,
      reviewerId: USER_ID,
      note: "again",
      wasPlayed: true,
      reviewedAt: firstReviewedAt,
    });
  });

  it("locks the owned video before each check/insert-or-update sequence", async () => {
    const harness = makeStatefulDb();
    mocks.getDb.mockReturnValue(harness.db);

    await saveReview(USER_ID, VIDEO_ID, {
      note: null,
      wasPlayed: true,
    });
    await saveReview(USER_ID, VIDEO_ID, {
      note: null,
      wasPlayed: false,
    });

    expect(harness.getLockCount()).toBe(2);
    expect(harness.getInsertCount()).toBe(1);
    expect(harness.getUpdateCount()).toBe(1);
  });
});
