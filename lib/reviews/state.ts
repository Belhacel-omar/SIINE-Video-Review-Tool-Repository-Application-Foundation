export type ExistingReviewState = {
  wasPlayed: boolean;
  reviewedAt: Date | null;
} | null;

export function nextReviewState(
  existing: ExistingReviewState,
  incomingWasPlayed: boolean,
  now: Date,
) {
  return {
    wasPlayed: Boolean(existing?.wasPlayed || incomingWasPlayed),
    reviewedAt:
      existing?.reviewedAt ??
      (incomingWasPlayed ? now : null),
  };
}
