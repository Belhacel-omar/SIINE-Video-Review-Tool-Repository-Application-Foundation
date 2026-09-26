import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "./session";
export async function requireUser(){ const user=await getAuthenticatedUser(); if(!user) return {user:null,response:NextResponse.json({error:{code:"UNAUTHORIZED",message:"Authentication required."}},{status:401})}; return {user,response:null}; }
