import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  postgres: vi.fn(),
  drizzle: vi.fn(),
}));

vi.mock("postgres", () => ({
  default: mocks.postgres,
}));

vi.mock("drizzle-orm/postgres-js", () => ({
  drizzle: mocks.drizzle,
}));

import { closeDb, getDb } from "@/lib/db";

describe("database client cleanup", () => {
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(async () => {
    vi.clearAllMocks();
    await closeDb();
    process.env.DATABASE_URL = "postgres://test.invalid/database";
    mocks.drizzle.mockReturnValue({ db: true });
  });

  afterEach(async () => {
    await closeDb();

    if (originalDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  });

  it("closes the cached client and allows a later getDb call to create a new one", async () => {
    const firstClient = {
      end: vi.fn().mockResolvedValue(undefined),
    };
    const secondClient = {
      end: vi.fn().mockResolvedValue(undefined),
    };

    mocks.postgres
      .mockReturnValueOnce(firstClient)
      .mockReturnValueOnce(secondClient);

    getDb();
    getDb();

    expect(mocks.postgres).toHaveBeenCalledTimes(1);

    await closeDb();

    expect(firstClient.end).toHaveBeenCalledWith({ timeout: 5 });

    getDb();

    expect(mocks.postgres).toHaveBeenCalledTimes(2);
  });

  it("is a safe no-op when no cached client exists", async () => {
    await expect(closeDb()).resolves.toBeUndefined();
    expect(mocks.postgres).not.toHaveBeenCalled();
  });
});
