import bcrypt from "bcryptjs";
export const MIN_PASSWORD_LENGTH=12;
export function validatePassword(password:string){ return password.length>=MIN_PASSWORD_LENGTH && /[A-Za-z]/.test(password) && /\d/.test(password); }
export function hashPassword(password:string){ return bcrypt.hash(password,12); }
export function verifyPassword(password:string,hash:string){ return bcrypt.compare(password,hash); }
