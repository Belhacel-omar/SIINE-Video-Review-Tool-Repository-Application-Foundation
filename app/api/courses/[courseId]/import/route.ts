import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { importCourseXlsx } from "@/lib/courses/service";
import { idSchema } from "@/lib/courses/validation";

type Context = {
  params: Promise<{ courseId: string }>;
};

export async function POST(request: Request, context: Context) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const { courseId } = await context.params;
    if (!idSchema.safeParse(courseId).success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid course ID.");
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid multipart request.");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "INVALID_REQUEST", "XLSX file is required.");
    }

    const result = await importCourseXlsx(auth.user!.id, courseId, file);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
