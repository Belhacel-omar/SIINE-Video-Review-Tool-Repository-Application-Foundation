import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api/errors";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const COURSE_ID = "22222222-2222-4222-8222-222222222222";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createCourse: vi.fn(),
  listCourses: vi.fn(),
  getCourse: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({
  requireUser: mocks.requireUser,
}));

vi.mock("@/lib/courses/service", () => ({
  createCourse: mocks.createCourse,
  listCourses: mocks.listCourses,
  getCourse: mocks.getCourse,
}));

import {
  GET as listCoursesRoute,
  POST as createCourseRoute,
} from "@/app/api/courses/route";
import { GET as courseDetailRoute } from "@/app/api/courses/[courseId]/route";

function authenticated() {
  mocks.requireUser.mockResolvedValue({
    user: { id: USER_ID, email: "admin@example.com" },
    response: null,
  });
}

function unauthenticated() {
  mocks.requireUser.mockResolvedValue({
    user: null,
    response: new Response(
      JSON.stringify({
        error: { code: "UNAUTHORIZED", message: "Authentication required." },
      }),
      {
        status: 401,
        headers: { "content-type": "application/json" },
      },
    ),
  });
}

describe("course routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticated();
  });

  it("requires authentication to list courses", async () => {
    unauthenticated();

    const response = await listCoursesRoute();

    expect(response.status).toBe(401);
    expect(mocks.listCourses).not.toHaveBeenCalled();
  });

  it("requires authentication to create a course", async () => {
    unauthenticated();

    const response = await createCourseRoute(
      new Request("http://localhost/api/courses", {
        method: "POST",
        body: JSON.stringify({ title: "Course" }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it("creates a course and trims its title", async () => {
    mocks.createCourse.mockResolvedValue({
      id: COURSE_ID,
      title: "Course A",
      originalFilename: null,
      createdAt: "2026-09-26T12:00:00.000Z",
      updatedAt: "2026-09-26T12:00:00.000Z",
    });

    const response = await createCourseRoute(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "  Course A  " }),
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.createCourse).toHaveBeenCalledWith(USER_ID, "Course A");
    expect(await response.json()).toMatchObject({
      course: {
        id: COURSE_ID,
        title: "Course A",
        originalFilename: null,
      },
    });
  });

  it("rejects an empty course title", async () => {
    const response = await createCourseRoute(
      new Request("http://localhost/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "   " }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Invalid course title." },
    });
    expect(mocks.createCourse).not.toHaveBeenCalled();
  });

  it("lists courses only through the authenticated user's ownership scope", async () => {
    mocks.listCourses.mockResolvedValue([
      {
        id: COURSE_ID,
        title: "Mine",
        originalFilename: "videos.xlsx",
        videoCount: 2,
        reviewedCount: 0,
        createdAt: "2026-09-26T12:00:00.000Z",
        updatedAt: "2026-09-26T12:00:00.000Z",
      },
    ]);

    const response = await listCoursesRoute();

    expect(mocks.listCourses).toHaveBeenCalledWith(USER_ID);
    expect(await response.json()).toEqual({
      courses: [
        expect.objectContaining({
          id: COURSE_ID,
          videoCount: 2,
          reviewedCount: 0,
        }),
      ],
    });
  });

  it("surfaces reviewed progress from the course service contract", async () => {
    mocks.listCourses.mockResolvedValue([
      {
        id: COURSE_ID,
        title: "Mine",
        originalFilename: "videos.xlsx",
        videoCount: 3,
        reviewedCount: 1,
        createdAt: "2026-09-26T12:00:00.000Z",
        updatedAt: "2026-09-28T03:00:00.000Z",
      },
    ]);

    const first = await listCoursesRoute();
    const second = await listCoursesRoute();

    expect((await first.json()).courses[0].reviewedCount).toBe(1);
    expect((await second.json()).courses[0].reviewedCount).toBe(1);
    expect(mocks.listCourses).toHaveBeenNthCalledWith(1, USER_ID);
    expect(mocks.listCourses).toHaveBeenNthCalledWith(2, USER_ID);
  });

  it("loads course detail through the authenticated user's ownership scope", async () => {
    mocks.getCourse.mockResolvedValue({
      id: COURSE_ID,
      title: "Mine",
      originalFilename: null,
      createdAt: "2026-09-26T12:00:00.000Z",
      updatedAt: "2026-09-26T12:00:00.000Z",
    });

    const response = await courseDetailRoute(
      new Request(`http://localhost/api/courses/${COURSE_ID}`),
      { params: Promise.resolve({ courseId: COURSE_ID }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.getCourse).toHaveBeenCalledWith(USER_ID, COURSE_ID);
  });

  it("returns a safe 404 for an unknown or non-owned course", async () => {
    mocks.getCourse.mockRejectedValue(
      new ApiError(404, "NOT_FOUND", "Resource not found."),
    );

    const response = await courseDetailRoute(
      new Request(`http://localhost/api/courses/${COURSE_ID}`),
      { params: Promise.resolve({ courseId: COURSE_ID }) },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Resource not found." },
    });
  });
});
