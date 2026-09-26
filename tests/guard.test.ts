import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { requireUser } from "@/lib/auth/guard";

describe("requireUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unauthenticated request", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const result = await requireUser();

    expect(result.user).toBeNull();
    expect(result.response?.status).toBe(401);
    expect(await result.response?.json()).toEqual({
      error: { code: "UNAUTHORIZED", message: "Authentication required." },
    });
  });

  it("accepts an authenticated request", async () => {
    const user = { id: "user-1", email: "admin@example.com" };
    mocks.getAuthenticatedUser.mockResolvedValue(user);

    const result = await requireUser();

    expect(result).toEqual({ user, response: null });
  });
});
