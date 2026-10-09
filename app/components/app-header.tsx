"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  friendlyError,
  isUnauthorized,
  requestJson,
} from "@/lib/frontend/task01";

export default function AppHeader({ email }: { email: string }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");

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

  return (
    <>
      <header className="app-header">
        <div>
          <div className="brand-mark compact">SIINE</div>
          <span className="header-product">Video Review</span>
        </div>
        <div className="header-actions">
          <span className="user-email">{email}</span>
          <Link className="button secondary" href="/account/password">
            Change password
          </Link>
          <button className="button secondary" type="button" onClick={logout} disabled={loggingOut}>
            {loggingOut ? "Signing out..." : "Logout"}
          </button>
        </div>
      </header>
      {error ? <div className="global-alert alert error">{error}</div> : null}
    </>
  );
}
