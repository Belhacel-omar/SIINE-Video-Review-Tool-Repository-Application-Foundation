import { Buffer } from "node:buffer";
import { apiErrorResponse, ApiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { idSchema } from "@/lib/courses/validation";
import { getReviewedExportData } from "@/lib/export/service";
import {
  buildReviewedXlsx,
  reviewedExportFilename,
} from "@/lib/export/xlsx";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

type Context = {
  params: Promise<{ courseId: string }>;
};

function toResponseBody(buffer: Buffer): BodyInit {
  return buffer as unknown as BodyInit;
}

export async function GET(_request: Request, context: Context) {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const { courseId } = await context.params;
    if (!idSchema.safeParse(courseId).success) {
      throw new ApiError(400, "INVALID_REQUEST", "Invalid course ID.");
    }

    const data = await getReviewedExportData(
      auth.user!.id,
      courseId,
    );
    const filename = reviewedExportFilename(data.originalFilename);
    const workbook = await buildReviewedXlsx(data);

    return new Response(toResponseBody(workbook), {
      status: 200,
      headers: {
        "Content-Type": XLSX_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
