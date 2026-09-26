import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashPassword, validatePassword } from "@/lib/auth/password";

export type ProvisioningEnv = {
  ADMIN_EMAIL?: string;
  ADMIN_INITIAL_PASSWORD?: string;
};

export async function provisionAdmin(env?: ProvisioningEnv) {
  const source: ProvisioningEnv = env ?? {
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_INITIAL_PASSWORD: process.env.ADMIN_INITIAL_PASSWORD,
  };
  const email = source.ADMIN_EMAIL?.trim().toLowerCase();
  const password = source.ADMIN_INITIAL_PASSWORD;

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD are required");
  }

  if (!validatePassword(password)) {
    throw new Error("Initial password does not meet policy");
  }

  const db = getDb();
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing[0]) {
    console.log("Administrator already provisioned; no password change performed.");
    return;
  }

  await db.insert(users).values({
    email,
    passwordHash: await hashPassword(password),
  });

  console.log("Administrator provisioned.");
}
