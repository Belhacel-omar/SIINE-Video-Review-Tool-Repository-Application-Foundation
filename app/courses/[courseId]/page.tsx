"use client";

import Link from "next/link";
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  friendlyError,
  getProgress,
  isCourseImported,
  isUnauthorized,
  requestJson,
  toPlaylistRows,
  validateXlsxFile,
  type CourseDetail,
  type CourseVideo,
} from "@/lib/frontend/task01";

async function fetchCourseBundle(courseId: string) {
  return Promise.all([
    requestJson<{ course: CourseDetail }>("/api/courses/" + courseId),
    requestJson<{ videos: CourseVideo[] }>("/api/courses/" + courseId + "/videos"),
  ]);
}

export default function CoursePage() {
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;
  const router = useRouter();

  const [course, setCourse] = useState<CourseDetail | null>(null);
  const [videos, setVideos] = useState<CourseVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState("");

  useEffect(() => {
    let active = true;

    void fetchCourseBundle(courseId)
      .then(([courseData, videoData]) => {
        if (!active) return;
        setLoadError("");
        setNotFound(false);
        setCourse(courseData.course);
        setVideos(videoData.videos);
      })
      .catch((caught) => {
        if (!active) return;
        if (isUnauthorized(caught)) {
          router.replace("/login");
          return;
        }
        if (
          typeof caught === "object" &&
          caught !== null &&
          "status" in caught &&
          caught.status === 404
        ) {
          setNotFound(true);
        } else {
          setLoadError(friendlyError(caught, "course"));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [courseId, router]);

  async function refreshCourse() {
    setLoading(true);
    setLoadError("");
    setNotFound(false);

    try {
      const [courseData, videoData] = await fetchCourseBundle(courseId);
      setCourse(courseData.course);
      setVideos(videoData.videos);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        router.replace("/login");
        return;
      }
      if (
        typeof caught === "object" &&
        caught !== null &&
        "status" in caught &&
        caught.status === 404
      ) {
        setNotFound(true);
      } else {
        setLoadError(friendlyError(caught, "course"));
      }
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => toPlaylistRows(videos), [videos]);
  const reviewedCount = rows.filter((row) => row.reviewed).length;
  const progress = getProgress(reviewedCount, rows.length);
  const imported = course ? isCourseImported(course) : false;

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setFile(nextFile);
    setFileError(validateXlsxFile(nextFile) ?? "");
    setImportMessage("");
  }

  async function importXlsx(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (importing) return;

    const validation = validateXlsxFile(file);
    if (validation) {
      setFileError(validation);
      return;
    }

    setImporting(true);
    setFileError("");
    setImportMessage("");

    try {
      const formData = new FormData();
      formData.append("file", file as File);
      const result = await requestJson<{
        courseId: string;
        importedCount: number;
        originalFilename: string;
      }>("/api/courses/" + courseId + "/import", {
        method: "POST",
        body: formData,
      });
      setImportMessage(
        "Imported " + result.importedCount + " videos from " + result.originalFilename + ".",
      );
      setFile(null);
      await refreshCourse();
    } catch (caught) {
      if (isUnauthorized(caught)) {
        router.replace("/login");
        return;
      }
      setFileError(friendlyError(caught, "import"));
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return (
      <main className="page-shell">
        <section className="panel empty-state" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p>Loading course...</p>
        </section>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="page-shell">
        <section className="panel empty-state">
          <h1>Course not found</h1>
          <p>This course does not exist or is not available to your account.</p>
          <Link className="button secondary" href="/courses">Back to courses</Link>
        </section>
      </main>
    );
  }

  if (!course || loadError) {
    return (
      <main className="page-shell">
        <section className="panel empty-state">
          <h1>Could not load course</h1>
          <p>{loadError || "The course could not be loaded."}</p>
          <button className="button secondary" type="button" onClick={() => void refreshCourse()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <Link className="back-link" href="/courses">← Back to courses</Link>

      <div className="page-heading course-heading">
        <div>
          <p className="eyebrow">Course</p>
          <h1>{course.title}</h1>
          <p className="muted">
            {imported
              ? "Playlist imported and ready for review."
              : "Import the course XLSX playlist to continue."}
          </p>
        </div>
        <div className="course-heading-actions">
          <span className={"status-badge " + (imported ? "success" : "neutral")}>
            {imported ? "Imported" : "Not imported"}
          </span>
          {imported && rows.length > 0 ? (
            <Link className="button primary" href={"/courses/" + course.id + "/review"}>
              {reviewedCount > 0 ? "Continue Review" : "Start Review"}
            </Link>
          ) : null}
        </div>
      </div>

      {!imported ? (
        <section className="panel">
          <div className="section-heading">
            <div>
              <h2>Upload XLSX</h2>
              <p>Use a .xlsx workbook with Video Title and Bunny URL columns. Maximum size: 10 MB.</p>
            </div>
          </div>

          <form className="upload-form" onSubmit={importXlsx}>
            <label className="upload-area">
              <span className="upload-title">{file ? file.name : "Choose an XLSX file"}</span>
              <span className="muted small">Only .xlsx files are accepted.</span>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={selectFile}
                disabled={importing}
              />
            </label>

            {fileError ? <p className="alert error" role="alert">{fileError}</p> : null}
            {importMessage ? <p className="alert success-alert" role="status">{importMessage}</p> : null}

            <button className="button primary" type="submit" disabled={importing || !file}>
              {importing ? "Importing..." : "Upload / Import"}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="summary-grid">
            <article className="summary-card">
              <span>Videos</span>
              <strong>{rows.length}</strong>
            </article>
            <article className="summary-card">
              <span>Reviewed</span>
              <strong>{progress.label}</strong>
            </article>
            <article className="summary-card wide">
              <span>Imported file</span>
              <strong className="filename">{course.originalFilename}</strong>
            </article>
          </section>

          <section className="panel">
            <div className="section-heading">
              <div>
                <h2>Playlist preview</h2>
                <p>Open the review workspace to watch videos and save review notes.</p>
              </div>
              <span className="count">{progress.percent}% reviewed</span>
            </div>

            <div className="progress-track large" aria-hidden="true">
              <span style={{ width: progress.percent + "%" }} />
            </div>

            {rows.length === 0 ? (
              <div className="empty-inline">
                <p>No videos are available in this playlist.</p>
              </div>
            ) : (
              <div className="playlist-list">
                {rows.map((row) => (
                  <article className="playlist-row" key={row.id}>
                    <span className="playlist-order">{row.order}</span>
                    <div className="playlist-main">
                      <h3>{row.title}</h3>
                      {row.sourceVideoId ? (
                        <p>Source ID: <code>{row.sourceVideoId}</code></p>
                      ) : (
                        <p className="muted">No source video ID</p>
                      )}
                    </div>
                    <span className={"status-badge " + (row.reviewed ? "success" : "neutral")}>
                      {row.reviewed ? "Reviewed" : "Not reviewed"}
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
