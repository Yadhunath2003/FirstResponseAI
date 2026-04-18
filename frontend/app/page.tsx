import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio, MapPinned, Phone } from "lucide-react";

export default function Landing() {
  return (
    <main className="flex-1 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight">FirstResponse AI</h1>
          <p className="text-muted-foreground text-sm">
            Select your role to get started.
          </p>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="size-4" /> Call Taker
              </CardTitle>
              <CardDescription>
                911 intake — enter incident details and create a new incident.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/dashboard/dispatch"
                className={buttonVariants({ variant: "destructive", className: "w-full" })}
              >
                Open call taker
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPinned className="size-4" /> Dispatcher
              </CardTitle>
              <CardDescription>
                Operator — map, summary, timeline, dispatch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/dashboard"
                className={buttonVariants({ variant: "secondary", className: "w-full" })}
              >
                Open dashboard
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Radio className="size-4" /> Responder
              </CardTitle>
              <CardDescription>
                Field unit — register, join an incident, push-to-talk.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/responder" className={buttonVariants({ className: "w-full" })}>
                Open responder
              </Link>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          API: <code>{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}</code>
        </p>
      </div>
    </main>
  );
}