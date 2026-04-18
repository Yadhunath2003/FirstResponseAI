import type { ReactNode } from "react";

export default function ResponderLayout({ children }: { children: ReactNode }) {
  return (
    <section className="flex-1 flex flex-col max-w-xl w-full mx-auto">
      {children}
    </section>
  );
}
