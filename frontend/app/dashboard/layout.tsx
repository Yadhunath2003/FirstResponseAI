import type { ReactNode } from "react";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <section className="flex-1 flex flex-col">{children}</section>;
}
