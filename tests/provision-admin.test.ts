import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  hashPassword: vi.fn(),
  validatePassword: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ getDb: mocks.getDb }));
vi.mock("@/lib/auth/password", () => ({
  hashPassword: mocks.hashPassword,
  validatePassword: mocks.validatePassword,
}));

import { provisionAdmin } from "@/lib/auth/provision-admin";

function configureDb(existingRows: Array<{ id: string }> = []) {
  const limit = vi.fn().mockResolvedValue(existingRows);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  const values = vi.fn().mockResolvedValue(undefined);
  const insert = vi.fn(() => ({ values }));

  mocks.getDb.mockReturnValue({ select, insert });

  return { limit, insert, values };
}

describe("administrator provisioning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    mocks.validatePassword.mockReturnValue(true);
    mocks.hashPassword.mockResolvedValue("hashed-initial-password");
  });

  it("rejects missing required environment values", async () => {
    await expect(provisionAdmin({})).rejects.toThrow(
      "ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are required",
    );
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("rejects an invalid initial password", async () => {
    mocks.validatePassword.mockReturnValue(false);

    await expect(
      provisionAdmin({
        ADMIN_EMAIL: "admin@example.com",
        ADMIN_INITIAL_PASSWORD: "weak",
      }),
    ).rejects.toThrow("Initial password does not meet policy");

    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("stores a hashed password for a new administrator", async () => {
    const { values } = configureDb();

    await provisionAdmin({
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_INITIAL_PASSWORD: "ValidPassword123",
    });

    expect(mocks.hashPassword).toHaveBeenCalledWith("ValidPassword123");
    expect(values).toHaveBeenCalledWith({
      email: "admin@example.com",
      passwordHash: "hashed-initial-password",
    });
    expect(values.mock.calls[0]?.[0].passwordHash).not.toBe("ValidPassword123");
  });

  it("normalizes the administrator email", async () => {
    const { values } = configureDb();

    await provisionAdmin({
      ADMIN_EMAIL: "  ADMIN@EXAMPLE.COM  ",
      ADMIN_INITIAL_PASSWORD: "ValidPassword123",
    });

    expect(values.mock.calls[0]?.[0].email).toBe("admin@example.com");
  });

  it("safely no-ops when the administrator already exists", async () => {
    const { insert } = configureDb([{ id: "existing-admin" }]);

    await provisionAdmin({
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_INITIAL_PASSWORD: "ValidPassword123",
    });

    expect(insert).not.toHaveBeenCalled();
    expect(mocks.hashPassword).not.toHaveBeenCalled();
  });

  it("does not overwrite or reset the password on a second provisioning", async () => {
    const { limit, values } = configureDb();
    limit
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "existing-admin" }]);

    const env = {
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_INITIAL_PASSWORD: "ValidPassword123",
    };

    await provisionAdmin(env);
    await provisionAdmin(env);

    expect(values).toHaveBeenCalledTimes(1);
    expect(mocks.hashPassword).toHaveBeenCalledTimes(1);
  });
});
