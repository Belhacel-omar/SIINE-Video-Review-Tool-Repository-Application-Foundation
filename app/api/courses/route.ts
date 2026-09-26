import { NextResponse } from "next/server";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { createCourse, listCourses } from "@/lib/courses/service";
import { createCourseSchema } from "@/lib/courses/validation";

export async function GET() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const courses = await listCourses(auth.user!.id);
    return NextResponse.json({ courses });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid request.");
    }

    const parsed = createCourseSchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid course title.");
    }

    const course = await createCourse(auth.user!.id, parsed.data.title);
    return NextResponse.json({ course }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
