import { runProvisionAdminCli } from "../lib/auth/provision-admin-cli";

runProvisionAdminCli().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provisioning failed");
  process.exitCode = 1;
});
