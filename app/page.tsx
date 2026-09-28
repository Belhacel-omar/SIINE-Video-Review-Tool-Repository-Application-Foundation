"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  requestJson,
  sessionDestination,
  type SessionResponse,
} from "@/lib/frontend/task01";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let active = true;

    void requestJson<SessionResponse>("/api/auth/session")
      .then((session) => {
        if (active) router.replace(sessionDestination(session.authenticated));
      })
      .catch(() => {
        if (active) router.replace("/login");
      });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className="centered-shell">
      <section className="status-card" aria-live="polite">
        <div className="spinner" aria-hidden="true" />
        <h1>SIINE Video Review</h1>
        <p>Checking your session...</p>
      </section>
    </main>
  );
}
