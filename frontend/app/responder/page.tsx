"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useSession } from "@/lib/session";
import { Radio, ListChecks, ChevronLeft, UserCog } from "lucide-react";

export default function ResponderHome() {
  const { callsign, unitId } = useSession();

  return (
    <div className="flex flex-col gap-5 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">Responder</h1>
          <p className="text-xs text-muted-foreground">Field unit console</p>
        </div>
        {callsign ? (
          <Badge variant="secondary" className="text-xs px-2.5 py-1">
            {callsign}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs px-2.5 py-1">
            Not registered
          </Badge>
        )}
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="size-4" /> Register your unit
          </CardTitle>
          <CardDescription>
            {unitId ? "You're registered. Update if your assignment changed." : "Pick your unit type and number to get a callsign."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/responder/register"
            className={buttonVariants({
              variant: unitId ? "outline" : "default",
              className: "w-full h-11 text-base",
            })}
          >
            {unitId ? "Re-register" : "Register unit"}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="size-4" /> Active incidents
          </CardTitle>
          <CardDescription>
            Browse and join an active incident to start communicating.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/responder/incidents"
            className={buttonVariants({
              variant: unitId ? "default" : "secondary",
              className: "w-full h-11 text-base",
            })}
          >
            <Radio className="size-4" /> Browse incidents
          </Link>
        </CardContent>
      </Card>

      <Link href="/" className="self-start">
        <Button variant="ghost" size="sm" className="text-muted-foreground">
          <ChevronLeft className="size-4" /> Back to roles
        </Button>
      </Link>
    </div>
  );
}
