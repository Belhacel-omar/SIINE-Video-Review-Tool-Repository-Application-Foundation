"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  friendlyError,
  getProgress,
  isUnauthorized,
  requestJson,
  validateCourseTitle,
  type CourseDetail,
  type CourseSummary,
} from "@/lib/frontend/task01";

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [formError, setFormError] = useState("");
  const [creating, setCreating] = useState(false);

  const loadCourses = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const data = await requestJson<{ courses: CourseSummary[] }>("/api/courses");
      setLoadError("");\n      setCourses(data.courses);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        router.replace("/login");
        return;
      }
      setLoadError(friendlyError(caught, "courses"));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    const validation = validateCourseTitle(title);
    if (validation) {
      setFormError(validation);
      return;
    }

    setCreating(true);
    setFormError("");

    try {
      const data = await requestJson<{ course: CourseDetail }>("/api/courses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      router.push("/courses/" + data.course.id);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        router.replace("/login");
        return;
      }
      setFormError(friendlyError(caught, "courses"));
      setCreating(false);
    }
  }

  return (
    <main className="page-shell">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Workspace</p>
          <h1>My Courses</h1>
          <p className="muted">Create a course, import its XLSX playlist, then open it for review.</p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={() => {
            setShowCreate((current) => !current);
            setFormError("");
          }}
        >
          {showCreate ? "Cancel" : "Create Course"}
        </button>
      </div>

      {showCreate ? (
        <section className="panel create-panel">
          <form className="inline-form" onSubmit={createCourse}>
            <label className="field grow">
              <span>Course title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. BEM Mathematics"
                maxLength={200}
                disabled={creating}
                autoFocus
              />
            </label>
            <button className="button primary align-end" type="submit" disabled={creating}>
              {creating ? "Creating..." : "Create and continue"}
            </button>
          </form>
          {formError ? <p className="alert error" role="alert">{formError}</p> : null}
        </section>
      ) : null}

      {loading ? (
        <section className="panel empty-state" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>Loading courses...</p>
        </section>
      ) : loadError ? (
        <section className="panel empty-state">
          <h2>Could not load courses</h2>
          <p>{loadError}</p>
          <button className="button secondary" type="button" onClick={() => void loadCourses()}>
            Retry
          </button>
        </section>
      ) : courses.length === 0 ? (
        <section className="panel empty-state">
          <h2>No courses yet</h2>
          <p>Create your first course to import an XLSX playlist.</p>
          {!showCreate ? (
            <button className="button primary" type="button" onClick={() => setShowCreate(true)}>
              Create Course
            </button>
          ) : null}
        </section>
      ) : (
        <section className="course-grid" aria-label="Courses">
          {courses.map((course) => {
            const progress = getProgress(course.reviewedCount, course.videoCount);
            const imported = Boolean(course.originalFilename);
            return (
              <article className="course-card" key={course.id}>
                <div className="course-card-top">
                  <div>
                    <span className={"status-badge " + (imported ? "success" : "neutral")}>
                      {imported ? "Imported" : "Not imported"}
                    </span>
                    <h2>{course.title}</h2>
                  </div>
                  <span className="count">{progress.label}</span>
                </div>

                <div>
                  <div className="progress-meta">
                    <span>{course.videoCount === 0 ? "No videos imported yet" : "Reviewed progress"}</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress.percent}
                    aria-label={course.title + " review progress"}
                  >
                    <span style={{ width: progress.percent + "%" }} />
                  </div>
                </div>

                <Link className="button secondary full" href={"/courses/" + course.id}>
                  {imported ? "Open Course" : "Open / Upload XLSX"}
                </Link>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
