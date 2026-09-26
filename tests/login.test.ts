import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/auth/password", () => ({
  verifyPassword: mocks.verifyPassword,
  MIN_PASSWORD_LENGTH: 12,
}));
vi.mock("@/lib/auth/session", () => ({ createSession: mocks.createSession }));

import { POST } from "@/app/api/auth/login/route";

function request(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function setRows(rows: Array<{ id: string; passwordHash: string }>) {
  const limit = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  mocks.getDb.mockReturnValue({ select });
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setRows([]);
  });

  it("rejects an invalid request", async () => {
    const response = await POST(request({ email: "not-an-email", password: "" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_REQUEST", message: "Invalid request." },
    });
  });

  it("returns generic INVALID_CREDENTIALS for an unknown email", async () => {
    const response = await POST(
      request({ email: "unknown@example.com", password: "ValidPassword123" }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." },
    });
  });

  it("returns generic INVALID_CREDENTIALS for an incorrect password", async () => {
    setRows([{ id: "user-1", passwordHash: "stored-hash" }]);
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST(
      request({ email: "admin@example.com", password: "WrongPassword123" }),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "INVALID_CREDENTIALS", message: "Invalid credentials." },
    });
  });

  it("creates a session for valid credentials", async () => {
    setRows([{ id: "user-1", passwordHash: "stored-hash" }]);
    mocks.verifyPassword.mockResolvedValue(true);

    const response = await POST(
      request({ email: "admin@example.com", password: "ValidPassword123" }),
    );

    expect(response.status).toBe(200);
    expect(mocks.createSession).toHaveBeenCalledWith("user-1");
  });

  it("never exposes the password hash in a successful response", async () => {
    setRows([{ id: "user-1", passwordHash: "stored-hash" }]);
    mocks.verifyPassword.mockResolvedValue(true);

    const response = await POST(
      request({ email: "admin@example.com", password: "ValidPassword123" }),
    );
    const body = await response.json();

    expect(body).toEqual({ authenticated: true });
    expect(body).not.toHaveProperty("passwordHash");
  });
});
