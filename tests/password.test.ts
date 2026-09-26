import { describe, expect, it } from "vitest";
import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from "@/lib/auth/password";

describe("password policy and hashing", () => {
  it("accepts a valid password", () => {
    expect(validatePassword("ValidPassword123")).toBe(true);
  });

  it("rejects a short password", () => {
    expect(validatePassword("Short1")).toBe(false);
  });

  it("requires at least one letter", () => {
    expect(validatePassword("123456789012")).toBe(false);
  });

  it("requires at least one number", () => {
    expect(validatePassword("PasswordOnly")).toBe(false);
  });

  it("stores a hash rather than plaintext", async () => {
    const password = "ValidPassword123";
    const hash = await hashPassword(password);
    expect(hash).not.toBe(password);
  });

  it("verifies a valid password", async () => {
    const password = "ValidPassword123";
    const hash = await hashPassword(password);
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("ValidPassword123");
    await expect(verifyPassword("WrongPassword123", hash)).resolves.toBe(false);
  });
});
