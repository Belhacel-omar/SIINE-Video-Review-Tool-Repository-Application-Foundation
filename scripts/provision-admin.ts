import { provisionAdmin } from "../lib/auth/provision-admin";

provisionAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : "Provisioning failed");
  process.exit(1);
});
