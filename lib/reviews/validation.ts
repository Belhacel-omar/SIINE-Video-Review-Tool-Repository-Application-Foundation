import { z } from "zod";

export const saveReviewSchema = z
  .object({
    note: z.union([z.string().max(10_000), z.null()]).optional(),
    wasPlayed: z.boolean(),
  })
  .transform(({ note, wasPlayed }) => {
    const normalizedNote =
      typeof note === "string" ? note.trim() || null : null;

    return {
      note: normalizedNote,
      wasPlayed,
    };
  });
