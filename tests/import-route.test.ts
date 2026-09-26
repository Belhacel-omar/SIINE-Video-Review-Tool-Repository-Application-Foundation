import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  importCourseXlsx: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/courses/service", () => ({
  importCourseXlsx: mocks.importCourseXlsx,
}));

import { POST } from "@/app/api/courses/[courseId]/import/route";

function requestWithFile() {
  const formData = new FormData();
  formData.set(
    "file",
    new File([new Uint8Array([1, 2, 3])], "course.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );

  return new Request(`http://localhost/api/courses/${COURSE_ID}/import`, {
    method: "POST",
    body: formData,
  });
}

describe("course import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      user: { id: USER_ID, email: "admin@example.com" },
      response: null,
    });
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Authentication required." },
        }),
        { status: 401 },
      ),
    });

    const response = await POST(requestWithFile(), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });

    expect(response.status).toBe(401);
    expect(mocks.importCourseXlsx).not.toHaveBeenCalled();
  });

  it("rejects a non-owner without exposing the course", async () => {
    mocks.importCourseXlsx.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Resource not found."),
    );

    const response = await POST(requestWithFile(), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
  });

  it("returns the import result for an owned valid upload", async () => {
    mocks.importCourseXlsx.mockResolvedValue({
      courseId: COURSE_ID,
      importedCount: 2,
      originalFilename: "course.xlsx",
    });

    const response = await POST(requestWithFile(), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });

    expect(response.status).toBe(201);
    expect(mocks.importCourseXlsx).toHaveBeenCalledWith(
      USER_ID,
      COURSE_ID,
      expect.objectContaining({ name: "course.xlsx" }),
    );
    expect(await response.json()).toEqual({
      courseId: COURSE_ID,
      importedCount: 2,
      originalFilename: "course.xlsx",
    });
  });

  it("returns a safe internal error without stack traces", async () => {
    mocks.importCourseXlsx.mockRejectedValue(
      new Error("database-secret-stack-marker"),
    );

    const response = await POST(requestWithFile(), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
      },
    });
    expect(JSON.stringify(body)).not.toContain("database-secret-stack-marker");
    expect(JSON.stringify(body)).not.toContain("stack");
  });
});
