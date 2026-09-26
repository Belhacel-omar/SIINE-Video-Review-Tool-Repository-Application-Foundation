import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  provisionAdmin: vi.fn(),
  closeDb: vi.fn(),
}));

vi.mock("@/lib/auth/provision-admin", () => ({
  provisionAdmin: mocks.provisionAdmin,
}));

vi.mock("@/lib/db", () => ({
  closeDb: mocks.closeDb,
}));

import { runProvisionAdminCli } from "@/lib/auth/provision-admin-cli";

describe("administrator provisioning CLI lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.closeDb.mockResolvedValue(undefined);
  });

  it("cleans up the database after successful provisioning", async () => {
    mocks.provisionAdmin.mockResolvedValue(undefined);

    await runProvisionAdminCli();

    expect(mocks.provisionAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.closeDb).toHaveBeenCalledTimes(1);
    expect(mocks.provisionAdmin.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.closeDb.mock.invocationCallOrder[0],
    );
  });

  it("cleans up the database after an existing-administrator safe no-op", async () => {
    mocks.provisionAdmin.mockResolvedValue(undefined);

    await runProvisionAdminCli();

    expect(mocks.provisionAdmin).toHaveBeenCalledTimes(1);
    expect(mocks.closeDb).toHaveBeenCalledTimes(1);
  });

  it("cleans up the database when provisioning throws", async () => {
    const failure = new Error("provisioning failed");
    mocks.provisionAdmin.mockRejectedValue(failure);

    await expect(runProvisionAdminCli()).rejects.toBe(failure);
    expect(mocks.closeDb).toHaveBeenCalledTimes(1);
  });
});
