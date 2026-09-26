import { closeDb } from "@/lib/db";
import { provisionAdmin } from "@/lib/auth/provision-admin";

export async function runProvisionAdminCli() {
  try {
    await provisionAdmin();
  } finally {
    await closeDb();
  }
}
