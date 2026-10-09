"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import {
  PASSWORD_CHANGED_LOGIN_PATH,
  canSubmitPasswordChange,
  hasPasswordValidationErrors,
  passwordChangeFailure,
  submitPasswordChange,
  validateChangePassword,
  type ChangePasswordErrors,
} from "@/lib/frontend/change-password";

export default function ChangePasswordPage() {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ChangePasswordErrors>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmitPasswordChange(submitting)) return;

    const errors = validateChangePassword({
      currentPassword,
      newPassword,
      confirmPassword,
    });

    setFieldErrors(errors);
    setSubmitError("");

    if (hasPasswordValidationErrors(errors)) return;

    setSubmitting(true);

    try {
      await submitPasswordChange(currentPassword, newPassword);

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setFieldErrors({});
      setSubmitError("");

      router.replace(PASSWORD_CHANGED_LOGIN_PATH);
    } catch (caught) {
      const failure = passwordChangeFailure(caught);

      if (failure.redirectTo) {
        router.replace(failure.redirectTo);
        return;
      }

      setSubmitError(failure.message ?? "The password could not be changed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <Link className="back-link" href="/courses">← Back to courses</Link>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Account security</p>
          <h1>Change password</h1>
          <p className="muted">Changing your password will sign you out of all sessions.</p>
        </div>
      </div>

      <section className="auth-card">
        <form className="stack" onSubmit={handleSubmit} noValidate>
          <label className="field" htmlFor="current-password">
            <span>Current password</span>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.currentPassword)}
              aria-describedby={fieldErrors.currentPassword ? "current-password-error" : undefined}
              maxLength={256}
            />
          </label>
          {fieldErrors.currentPassword ? (
            <p className="alert error" id="current-password-error" role="alert">
              {fieldErrors.currentPassword}
            </p>
          ) : null}

          <label className="field" htmlFor="new-password">
            <span>New password</span>
            <input
              id="new-password"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.newPassword)}
              aria-describedby={fieldErrors.newPassword ? "new-password-error new-password-help" : "new-password-help"}
              maxLength={256}
            />
          </label>
          <p className="muted small" id="new-password-help">
            Use 12–256 characters with at least one letter and one number.
          </p>
          {fieldErrors.newPassword ? (
            <p className="alert error" id="new-password-error" role="alert">
              {fieldErrors.newPassword}
            </p>
          ) : null}

          <label className="field" htmlFor="confirm-password">
            <span>Confirm new password</span>
            <input
              id="confirm-password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              aria-invalid={Boolean(fieldErrors.confirmPassword)}
              aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : undefined}
              maxLength={256}
            />
          </label>
          {fieldErrors.confirmPassword ? (
            <p className="alert error" id="confirm-password-error" role="alert">
              {fieldErrors.confirmPassword}
            </p>
          ) : null}

          {submitError ? (
            <p className="alert error" role="alert">
              {submitError}
            </p>
          ) : null}

          <button className="button primary" type="submit" disabled={submitting}>
            {submitting ? "Changing password..." : "Change password"}
          </button>
        </form>
      </section>
    </main>
  );
}
