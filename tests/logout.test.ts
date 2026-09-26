import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  destroySession: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  destroySession: mocks.destroySession,
}));

import { POST } from "@/app/api/auth/logout/route";

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("invokes session destruction", async () => {
    await POST();
    expect(mocks.destroySession).toHaveBeenCalledTimes(1);
  });

  it("returns an unauthenticated state", async () => {
    const response = await POST();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ authenticated: false });
  });
});
