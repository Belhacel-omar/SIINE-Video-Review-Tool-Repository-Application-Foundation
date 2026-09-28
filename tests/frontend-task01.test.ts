import { describe, expect, it } from "vitest";
import {
  ApiRequestError,
  friendlyError,
  getProgress,
  isCourseImported,
  sessionDestination,
  toPlaylistRows,
  validateCourseTitle,
  validateXlsxFile,
  type CourseVideo,
} from "@/lib/frontend/task01";

describe("Frontend Task 01 helpers", () => {
  it("maps session state to the required root destinations", () => {
    expect(sessionDestination(true)).toBe("/courses");
    expect(sessionDestination(false)).toBe("/login");
  });

  it("validates course titles without changing backend rules", () => {
    expect(validateCourseTitle("   ")).toBe("Course title is required.");
    expect(validateCourseTitle("Math Review")).toBeNull();
    expect(validateCourseTitle("x".repeat(201))).toBe(
      "Course title must be 200 characters or fewer.",
    );
  });

  it("accepts XLSX files and rejects wrong type or oversize files", () => {
    expect(validateXlsxFile({ name: "course.xlsx", size: 1024 })).toBeNull();
    expect(validateXlsxFile({ name: "course.xls", size: 1024 })).toBe(
      "Only .xlsx files are supported.",
    );
    expect(
      validateXlsxFile({ name: "course.xlsx", size: 10 * 1024 * 1024 + 1 }),
    ).toBe("The XLSX file is larger than 10 MB.");
  });

  it("derives imported state and stable progress", () => {
    expect(isCourseImported({ originalFilename: null })).toBe(false);
    expect(isCourseImported({ originalFilename: "videos.xlsx" })).toBe(true);
    expect(getProgress(2, 5)).toEqual({ label: "2 / 5", percent: 40 });
    expect(getProgress(0, 0)).toEqual({ label: "0 / 0", percent: 0 });
  });

  it("keeps backend playlist order and duplicate titles independent", () => {
    const videos: CourseVideo[] = [
      {
        id: "video-a",
        courseId: "course",
        sourceRowNumber: 2,
        sourceVideoId: "SRC-001",
        title: "Same title",
        bunnyUrl: "https://example.com/a",
        playlistOrder: 0,
        review: { note: null, wasPlayed: true, reviewedAt: "2026-09-28T00:00:00Z" },
      },
      {
        id: "video-b",
        courseId: "course",
        sourceRowNumber: 3,
        sourceVideoId: "SRC-002",
        title: "Same title",
        bunnyUrl: "https://example.com/b",
        playlistOrder: 1,
        review: { note: "draft", wasPlayed: true, reviewedAt: null },
      },
    ];

    const rows = toPlaylistRows(videos);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.id)).toEqual(["video-a", "video-b"]);
    expect(rows.map((row) => row.order)).toEqual([1, 2]);
    expect(rows.map((row) => row.reviewed)).toEqual([true, false]);
    expect(rows[0]).not.toHaveProperty("sourceData");
  });

  it("turns API failures into safe task-specific UI errors", () => {
    expect(
      friendlyError(
        new ApiRequestError(401, "INVALID_CREDENTIALS", "Invalid credentials."),
        "login",
      ),
    ).toBe("Email or password is incorrect.");

    expect(
      friendlyError(
        new ApiRequestError(
          422,
          "INVALID_IMPORT_ROWS",
          "Spreadsheet contains invalid rows.",
        ),
        "import",
      ),
    ).toContain("Some video rows are invalid");

    expect(
      friendlyError(
        new ApiRequestError(
          409,
          "COURSE_ALREADY_IMPORTED",
          "Course already has an imported spreadsheet.",
        ),
        "import",
      ),
    ).toBe("This course already has an imported spreadsheet.");
  });
});
