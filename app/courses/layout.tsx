import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import AppHeader from "@/app/components/app-header";
import { getAuthenticatedUser } from "@/lib/auth/session";

export default async function CoursesLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="app-shell">
      <AppHeader email={user.email} />
      {children}
    </div>
  );
}
