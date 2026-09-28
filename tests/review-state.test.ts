import { describe, expect, it } from "vitest";
import { nextReviewState } from "@/lib/reviews/state";

describe("monotonic review state", () => {
  const now = new Date("2026-09-28T03:00:00.000Z");
  const firstReviewedAt = new Date("2026-09-27T12:00:00.000Z");

  it("creates not-reviewed state when playback never started", () => {
    expect(nextReviewState(null, false, now)).toEqual({
      wasPlayed: false,
      reviewedAt: null,
    });
  });

  it("creates reviewed state on first save after playback started", () => {
    expect(nextReviewState(null, true, now)).toEqual({
      wasPlayed: true,
      reviewedAt: now,
    });
  });

  it("false to false remains not reviewed", () => {
    expect(
      nextReviewState(
        { wasPlayed: false, reviewedAt: null },
        false,
        now,
      ),
    ).toEqual({
      wasPlayed: false,
      reviewedAt: null,
    });
  });

  it("false to true becomes reviewed at the transition timestamp", () => {
    expect(
      nextReviewState(
        { wasPlayed: false, reviewedAt: null },
        true,
        now,
      ),
    ).toEqual({
      wasPlayed: true,
      reviewedAt: now,
    });
  });

  it("true to false cannot downgrade and preserves reviewedAt", () => {
    expect(
      nextReviewState(
        { wasPlayed: true, reviewedAt: firstReviewedAt },
        false,
        now,
      ),
    ).toEqual({
      wasPlayed: true,
      reviewedAt: firstReviewedAt,
    });
  });

  it("true to true preserves the original reviewedAt", () => {
    expect(
      nextReviewState(
        { wasPlayed: true, reviewedAt: firstReviewedAt },
        true,
        now,
      ),
    ).toEqual({
      wasPlayed: true,
      reviewedAt: firstReviewedAt,
    });
  });
});
