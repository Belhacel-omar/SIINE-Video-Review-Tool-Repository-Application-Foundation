import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));

import { getAuthenticatedUser } from "@/lib/auth/session";

function cookieStore(value?: string) {
  return {
    get: vi.fn(() => (value ? { value } : undefined)),
    set: vi.fn(),
  };
}

describe("server-side session lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no session cookie exists", async () => {
    mocks.cookies.mockResolvedValue(cookieStore());
    await expect(getAuthenticatedUser()).resolves.toBeNull();
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("selects and returns only safe user fields for an authenticated session", async () => {
    const store = cookieStore("opaque-session-token");
    mocks.cookies.mockResolvedValue(store);

    const limit = vi.fn().mockResolvedValue([
      { id: "user-1", email: "admin@example.com" },
    ]);
    const where = vi.fn(() => ({ limit }));
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ innerJoin }));
    const select = vi.fn(() => ({ from }));
    mocks.getDb.mockReturnValue({ select });

    const user = await getAuthenticatedUser();

    expect(user).toEqual({ id: "user-1", email: "admin@example.com" });
    const projection = select.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(Object.keys(projection)).toEqual(["id", "email"]);
    expect(projection).not.toHaveProperty("passwordHash");
  });
});
