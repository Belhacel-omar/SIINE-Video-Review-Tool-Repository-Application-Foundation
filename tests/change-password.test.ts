import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  getDb: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  destroyUserSessions: vi.fn(),
}));

vi.mock("@/lib/auth/guard", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
  MIN_PASSWORD_LENGTH: 12,
}));
vi.mock("@/lib/auth/session", () => ({
  destroyUserSessions: mocks.destroyUserSessions,
}));

import { PATCH } from "@/app/api/account/password/route";

function request(currentPassword: string, newPassword: string) {
  return new Request("http://localhost/api/account/password", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

function configureDb(rows: Array<{ passwordHash: string }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const selectWhere = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));

  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));

  mocks.getDb.mockReturnValue({ select, update });

  return { set, updateWhere };
}

describe("PATCH /api/account/password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUser.mockResolvedValue({
      user: { id: "user-1", email: "admin@example.com" },
      response: null,
    });
    configureDb([{ passwordHash: "stored-hash" }]);
  });

  it("requires authentication", async () => {
    mocks.requireUser.mockResolvedValue({
      user: null,
      response: new Response(
        JSON.stringify({
          error: { code: "UNAUTHORIZED", message: "Authentication required." },
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
    });

    const response = await PATCH(
      request("CurrentPassword123", "NewPassword123"),
    );

    expect(response.status).toBe(401);
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects an invalid new-password policy", async () => {
    const response = await PATCH(request("CurrentPassword123", "short1"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        code: "INVALID_PASSWORD",
        message: "New password does not meet requirements.",
      },
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects an incorrect current password generically", async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await PATCH(
      request("WrongPassword123", "NewPassword123"),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." },
    });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("hashes the new password, updates timestamps, invalidates sessions, and requires reauthentication", async () => {
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.hashPassword.mockResolvedValue("hashed-new-password");
    const { set } = configureDb([{ passwordHash: "stored-hash" }]);

    const response = await PATCH(
      request("CurrentPassword123", "NewPassword123"),
    );
    const update = set.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(mocks.hashPassword).toHaveBeenCalledWith("NewPassword123");
    expect(update.passwordHash).toBe("hashed-new-password");
    expect(update.passwordChangedAt).toBeInstanceOf(Date);
    expect(update.updatedAt).toBeInstanceOf(Date);
    expect(mocks.destroyUserSessions).toHaveBeenCalledWith("user-1");
    expect(await response.json()).toEqual({
      success: true,
      reauthenticationRequired: true,
    });
  });
});
