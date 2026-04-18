"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/lib/session";

export default function ResponderHome() {
  const { callsign, unitId } = useSession();

  return (
    <div className="p-4 space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Responder</h1>
        <p className="text-xs text-muted-foreground">
          {callsign ? `Signed in as ${callsign}` : "Not registered"}
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Next steps</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!unitId && (
            <Link
              href="/responder/register"
              className={buttonVariants({ className: "w-full" })}
            >
              Register unit
            </Link>
          )}
          <Link
            href="/responder/incidents"
            className={buttonVariants({ variant: "secondary", className: "w-full" })}
          >
            Browse incidents
          </Link>
          <Link href="/" className={buttonVariants({ variant: "outline", className: "w-full" })}>
            Back
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
