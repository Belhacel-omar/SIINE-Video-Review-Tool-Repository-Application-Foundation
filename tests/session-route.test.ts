import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getAuthenticatedUser: mocks.getAuthenticatedUser,
}));

import { GET } from "@/app/api/auth/session/route";

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an unauthenticated state when there is no session", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      authenticated: false,
      user: null,
    });
  });

  it("returns only safe authenticated-user fields", async () => {
    mocks.getAuthenticatedUser.mockResolvedValue({
      id: "user-1",
      email: "admin@example.com",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      authenticated: true,
      user: { id: "user-1", email: "admin@example.com" },
    });
    expect(body.user).not.toHaveProperty("passwordHash");
  });
});
