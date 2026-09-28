"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  friendlyError,
  isUnauthorized,
  requestJson,
  type SessionResponse,
  type SessionUser,
} from "@/lib/frontend/task01";

export default function CoursesLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const session = await requestJson<SessionResponse>("/api/auth/session");
      if (!session.authenticated) {
        router.replace("/login");
        return;
      }
      setError("");\n      setUser(session.user);
    } catch (caught) {
      if (isUnauthorized(caught)) {
        router.replace("/login");
        return;
      }
      setError(friendlyError(caught, "session"));
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setError("");

    try {
      await requestJson<{ authenticated: false }>("/api/auth/logout", {
        method: "POST",
      });
      router.replace("/login");
      router.refresh();
    } catch (caught) {
      if (isUnauthorized(caught)) {
        router.replace("/login");
        return;
      }
      setError(friendlyError(caught, "session"));
      setLoggingOut(false);
    }
  }

  if (loading) {
    return (
      <main className="centered-shell">
        <section className="status-card" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <h1>Loading SIINE</h1>
          <p>Checking your session...</p>
        </section>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="centered-shell">
        <section className="status-card">
          <h1>Session unavailable</h1>
          <p>{error || "Please sign in again."}</p>
          <button className="button primary" type="button" onClick={() => void loadSession()}>
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="brand-mark compact">SIINE</div>
          <span className="header-product">Video Review</span>
        </div>
        <div className="header-actions">
          <span className="user-email">{user.email}</span>
          <button className="button secondary" type="button" onClick={logout} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Logout"}
          </button>
        </div>
      </header>
      {error ? <div className="global-alert alert error">{error}</div> : null}
      {children}
    </div>
  );
}
