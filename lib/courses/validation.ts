import { z } from "zod";

export const createCourseSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const idSchema = z.string().uuid();
