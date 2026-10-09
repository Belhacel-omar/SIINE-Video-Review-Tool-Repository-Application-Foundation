import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Frontend Task 04 source contract", () => {
  it("keeps the account route narrow and protected", () => {
    const layout = readFileSync("app/account/layout.tsx", "utf8");
    const page = readFileSync("app/account/password/page.tsx", "utf8");

    expect(layout).toContain("getAuthenticatedUser");
    expect(layout).toContain('redirect("/login")');
    expect(page).toContain('type="password"');
    expect(page).toContain('autoComplete="current-password"');
    expect(page.match(/autoComplete="new-password"/g)?.length).toBe(2);
  });

  it("does not add logout or login API calls to the password-change page", () => {
    const page = readFileSync("app/account/password/page.tsx", "utf8");
    expect(page).not.toContain("/api/auth/logout");
    expect(page).not.toContain("/api/auth/login");
  });

  it("does not persist or log password form values", () => {
    const page = readFileSync("app/account/password/page.tsx", "utf8");
    const helper = readFileSync("lib/frontend/change-password.ts", "utf8");
    const combined = page + helper;

    expect(combined).not.toContain("localStorage");
    expect(combined).not.toContain("sessionStorage");
    expect(combined).not.toContain("console.log");
  });
});
