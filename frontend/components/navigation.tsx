"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Navigation() {
  const pathname = usePathname();

  const tabs = [
    { label: "Call Taker", href: "/dashboard/dispatch" },
    { label: "Dashboard", href: "/dashboard" },
    { label: "Responders", href: "/responder" },
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard" && pathname === "/dashboard") return true;
    if (href === "/dashboard/dispatch" && pathname.startsWith("/dashboard/dispatch"))
      return true;
    if (href === "/responder" && pathname.startsWith("/responder")) return true;
    return false;
  };

  return (
    <nav className="border-b border-border bg-background sticky top-0 z-50">
      <div className="flex items-center h-14 px-4 gap-1">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive(tab.href)
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
