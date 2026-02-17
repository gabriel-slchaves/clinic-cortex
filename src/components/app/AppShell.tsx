import AppSidebar from "@/components/app/AppSidebar";
import type { ReactNode } from "react";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppSidebar className="hidden lg:flex" />
      <div className="min-h-screen lg:pl-80">{children}</div>
    </div>
  );
}
