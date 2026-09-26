import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";
const COOKIE="siine_session"; const MAX_AGE=60*60*24*7;
const digest=(v:string)=>createHash("sha256").update(v).digest("hex");
export async function createSession(userId:string){ const token=randomBytes(32).toString("base64url"); await getDb().insert(sessions).values({userId,tokenHash:digest(token),expiresAt:new Date(Date.now()+MAX_AGE*1000)}); (await cookies()).set(COOKIE,token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:MAX_AGE}); }
export async function getAuthenticatedUser(){ const token=(await cookies()).get(COOKIE)?.value; if(!token)return null; const rows=await getDb().select({id:users.id,email:users.email}).from(sessions).innerJoin(users,eq(sessions.userId,users.id)).where(and(eq(sessions.tokenHash,digest(token)),gt(sessions.expiresAt,new Date()))).limit(1); return rows[0]??null; }
export async function destroySession(){ const store=await cookies(); const token=store.get(COOKIE)?.value; if(token) await getDb().delete(sessions).where(eq(sessions.tokenHash,digest(token))); store.set(COOKIE,"",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:0}); }
export async function destroyUserSessions(userId:string){ await getDb().delete(sessions).where(eq(sessions.userId,userId)); }
