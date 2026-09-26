import { z } from "zod"; import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
export const loginSchema=z.object({email:z.string().email().transform(v=>v.trim().toLowerCase()),password:z.string().min(1).max(256)});
export const changePasswordSchema=z.object({currentPassword:z.string().min(1).max(256),newPassword:z.string().min(MIN_PASSWORD_LENGTH).max(256).refine(v=>/[A-Za-z]/.test(v)&&/\d/.test(v),"Password must contain a letter and a number.")});
