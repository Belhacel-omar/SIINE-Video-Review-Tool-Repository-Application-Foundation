"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { passwordChangedNoticeFromSearch } from "@/lib/frontend/change-password";
import {
  friendlyError,
  requestJson,
  type SessionResponse,
} from "@/lib/frontend/task01";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    setSuccessNotice(passwordChangedNoticeFromSearch(window.location.search));

    let active = true;

    void requestJson<SessionResponse>("/api/auth/session")
      .then((session) => {
        if (active && session.authenticated) {
          router.replace("/courses");
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setError("");
    setSubmitting(true);

    try {
      await requestJson<{ authenticated: true }>("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      router.replace("/courses");
      router.refresh();
    } catch (caught) {
      setError(friendlyError(caught, "login"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="centered-shell">
      <section className="auth-card" aria-busy={checkingSession || submitting}>
        <div className="brand-mark">SIINE</div>
        <div>
          <p className="eyebrow">Internal review tool</p>
          <h1>Sign in</h1>
          <p className="muted">Access your video review courses and imports.</p>
        </div>

        {successNotice ? (
          <p className="alert success-alert" role="status">
            {successNotice}
          </p>
        ) : null}

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={submitting}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={submitting}
            />
          </label>

          {error ? (
            <p className="alert error" role="alert">
              {error}
            </p>
          ) : null}

          <button className="button primary" type="submit" disabled={submitting || checkingSession}>
            {submitting ? "Signing in..." : checkingSession ? "Checking session..." : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
