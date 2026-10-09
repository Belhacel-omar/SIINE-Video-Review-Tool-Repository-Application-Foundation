import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CHANGE_PASSWORD_PATH,
  MAX_PASSWORD_LENGTH,
  PASSWORD_CHANGED_LOGIN_PATH,
  PASSWORD_CHANGED_NOTICE,
  PasswordChangeRequestError,
  canSubmitPasswordChange,
  hasPasswordValidationErrors,
  passwordChangeFailure,
  passwordChangedNoticeFromSearch,
  submitPasswordChange,
  validateChangePassword,
} from "@/lib/frontend/change-password";

describe("Frontend Task 04 change password helpers", () => {
  it("requires a current password and enforces its maximum length", () => {
    expect(
      validateChangePassword({
        currentPassword: "",
        newPassword: "ValidPassword123",
        confirmPassword: "ValidPassword123",
      }).currentPassword,
    ).toBe("Current password is required.");

    expect(
      validateChangePassword({
        currentPassword: "x".repeat(MAX_PASSWORD_LENGTH + 1),
        newPassword: "ValidPassword123",
        confirmPassword: "ValidPassword123",
      }).currentPassword,
    ).toBe("Current password must be 256 characters or fewer.");
  });

  it("enforces the new password minimum and maximum lengths", () => {
    expect(
      validateChangePassword({
        currentPassword: "Current123456",
        newPassword: "Short123",
        confirmPassword: "Short123",
      }).newPassword,
    ).toBe("New password must be at least 12 characters.");

    const tooLong = "A1" + "x".repeat(MAX_PASSWORD_LENGTH - 1);
    expect(
      validateChangePassword({
        currentPassword: "Current123456",
        newPassword: tooLong,
        confirmPassword: tooLong,
      }).newPassword,
    ).toBe("New password must be 256 characters or fewer.");
  });

  it("requires at least one ASCII letter and one number", () => {
    expect(
      validateChangePassword({
        currentPassword: "Current123456",
        newPassword: "123456789012",
        confirmPassword: "123456789012",
      }).newPassword,
    ).toBe("New password must contain at least one letter.");

    expect(
      validateChangePassword({
        currentPassword: "Current123456",
        newPassword: "OnlyLettersHere",
        confirmPassword: "OnlyLettersHere",
      }).newPassword,
    ).toBe("New password must contain at least one number.");
  });

  it("requires confirmation and an exact match", () => {
    expect(
      validateChangePassword({
        currentPassword: "Current123456",
        newPassword: "ValidPassword123",
        confirmPassword: "",
      }).confirmPassword,
    ).toBe("Confirm your new password.");

    expect(
      validateChangePassword({
        currentPassword: "Current123456",
        newPassword: "ValidPassword123",
        confirmPassword: "ValidPassword124",
      }).confirmPassword,
    ).toBe("Passwords do not match.");
  });

  it("accepts valid input and does not require transformed values", () => {
    const errors = validateChangePassword({
      currentPassword: " Current123456 ",
      newPassword: " ValidPassword123 ",
      confirmPassword: " ValidPassword123 ",
    });

    expect(hasPasswordValidationErrors(errors)).toBe(false);
  });

  it("uses the exact PATCH endpoint, same-origin session, JSON body, and raw password values", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, reauthenticationRequired: true }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const currentPassword = " CurrentPassword123 ";
    const newPassword = " NewPassword456 ";
    const result = await submitPasswordChange(
      currentPassword,
      newPassword,
      fetcher as typeof fetch,
    );

    expect(CHANGE_PASSWORD_PATH).toBe("/api/account/password");
    expect(fetcher).toHaveBeenCalledWith("/api/account/password", {
      method: "PATCH",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({
      currentPassword,
      newPassword,
    });
    expect(Object.keys(JSON.parse(fetcher.mock.calls[0][1].body))).toEqual([
      "currentPassword",
      "newPassword",
    ]);
    expect(result).toEqual({ success: true, reauthenticationRequired: true });
  });

  it("blocks duplicate submit while pending", () => {
    expect(canSubmitPasswordChange(false)).toBe(true);
    expect(canSubmitPasswordChange(true)).toBe(false);
  });

  it("keeps 401 INVALID_CREDENTIALS on the form with the approved message", () => {
    expect(
      passwordChangeFailure(
        new PasswordChangeRequestError(401, "INVALID_CREDENTIALS"),
      ),
    ).toEqual({
      message: "Current password is incorrect.",
      redirectTo: null,
    });
  });

  it("redirects a normal auth 401 to login instead of treating it as a wrong current password", () => {
    expect(
      passwordChangeFailure(new PasswordChangeRequestError(401, "UNAUTHORIZED")),
    ).toEqual({ message: null, redirectTo: "/login" });
  });

  it("maps INVALID_PASSWORD and unexpected failures to safe copy", () => {
    expect(
      passwordChangeFailure(
        new PasswordChangeRequestError(400, "INVALID_PASSWORD"),
      ),
    ).toEqual({
      message: "New password does not meet the password requirements.",
      redirectTo: null,
    });

    expect(passwordChangeFailure(new Error("/secret/db/path"))).toEqual({
      message: "The password could not be changed. Try again.",
      redirectTo: null,
    });
    expect(
      passwordChangeFailure(new PasswordChangeRequestError(500, "INTERNAL_ERROR")),
    ).toEqual({
      message: "The password could not be changed. Try again.",
      redirectTo: null,
    });
  });

  it("parses backend errors only for status/code and never exposes the raw backend message", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: "INVALID_CREDENTIALS",
            message: "password=/secret sql=users",
          },
        }),
        { status: 401, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      submitPasswordChange("wrong", "ValidPassword123", fetcher as typeof fetch),
    ).rejects.toMatchObject({ status: 401, code: "INVALID_CREDENTIALS" });
  });

  it("uses the required reauthentication destination and login notice", () => {
    expect(PASSWORD_CHANGED_LOGIN_PATH).toBe("/login?passwordChanged=1");
    expect(PASSWORD_CHANGED_NOTICE).toBe(
      "Password changed successfully. Sign in again.",
    );
    expect(passwordChangedNoticeFromSearch("?passwordChanged=1")).toBe(
      PASSWORD_CHANGED_NOTICE,
    );
    expect(passwordChangedNoticeFromSearch("?passwordChanged=0")).toBeNull();
    expect(passwordChangedNoticeFromSearch("?other=1")).toBeNull();
  });
});

describe("Frontend Task 04 source integration", () => {
  it("exposes Change password in the authenticated header and preserves Logout/email", () => {
    const source = readFileSync("app/components/app-header.tsx", "utf8");
    expect(source).toContain('href="/account/password"');
    expect(source).toContain("Change password");
    expect(source).toContain("{email}");
    expect(source).toContain("Logout");
  });

  it("protects /account/password with the existing authenticated-user session check", () => {
    const layout = readFileSync("app/account/layout.tsx", "utf8");
    expect(layout).toContain("getAuthenticatedUser");
    expect(layout).toContain('redirect("/login")');
    expect(layout).toContain("<AppHeader email={user.email} />");
  });

  it("renders the required password inputs and autocomplete attributes", () => {
    const source = readFileSync("app/account/password/page.tsx", "utf8");
    expect(source).toContain("Current password");
    expect(source).toContain("New password");
    expect(source).toContain("Confirm new password");
    expect(source).toContain('autoComplete="current-password"');
    expect(source.match(/autoComplete="new-password"/g)?.length).toBe(2);
    expect(source).toContain("Changing your password will sign you out of all sessions.");
  });

  it("clears password state and redirects after success without logout or auto-login", () => {
    const source = readFileSync("app/account/password/page.tsx", "utf8");
    expect(source).toContain('setCurrentPassword("")');
    expect(source).toContain('setNewPassword("")');
    expect(source).toContain('setConfirmPassword("")');
    expect(source).toContain("router.replace(PASSWORD_CHANGED_LOGIN_PATH)");
    expect(source).not.toContain("/api/auth/logout");
    expect(source).not.toContain("/api/auth/login");
  });

  it("shows the accessible login reauthentication notice without password persistence/logging", () => {
    const login = readFileSync("app/login/page.tsx", "utf8");
    const page = readFileSync("app/account/password/page.tsx", "utf8");
    const helper = readFileSync("lib/frontend/change-password.ts", "utf8");
    const combined = login + page + helper;

    expect(login).toContain("passwordChangedNoticeFromSearch");
    expect(login).toContain('role="status"');
    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("console.log");
  });
});
