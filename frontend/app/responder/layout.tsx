import type { ReactNode } from "react";

export default function ResponderLayout({ children }: { children: ReactNode }) {
  return (
    <section className="flex-1 flex flex-col w-full max-w-xl mx-auto min-h-dvh">
      {children}
    </section>
  );
}
