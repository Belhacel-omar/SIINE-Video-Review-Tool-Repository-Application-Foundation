import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { getCourse } from "@/lib/courses/service";
import { idSchema } from "@/lib/courses/validation";

type Context = {
  params: Promise<{ courseId: string }>;
};

export async function GET(_request: Request, context: Context) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const { courseId } = await context.params;
    if (!idSchema.safeParse(courseId).success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid course ID.");
    }

    const course = await getCourse(auth.user!.id, courseId);
    return NextResponse.json({ course });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
