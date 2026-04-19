"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, publicMediaUrl } from "@/lib/api";
import { PublicMap } from "@/components/public-map";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertTriangle, Megaphone, MapPin, Users } from "lucide-react";

export default function PublicPage() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ["public-incidents"],
    queryFn: api.listPublicIncidents,
    refetchInterval: 8_000,
  });

  const { data: awareness = [] } = useQuery({
    queryKey: ["public-awareness"],
    queryFn: api.listAwarenessPosts,
    refetchInterval: 10_000,
  });

  const [shareOpen, setShareOpen] = useState(false);
  const [authorName, setAuthorName] = useState("Neighbor");
  const [body, setBody] = useState("");
  const [media, setMedia] = useState<File | null>(null);

  const shareMutation = useMutation({
    mutationFn: api.createAwarenessPost,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public-awareness"] });
      setShareOpen(false);
      setBody("");
      setMedia(null);
    },
  });

  const open = (id: string) => router.push(`/public/${id}`);

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold">Community Watch</h1>
              <Badge variant="secondary" className="uppercase tracking-wide">
                Unofficial — community reports
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm max-w-2xl">
              See active incidents in your area, share ground-truth with neighbors,
              and offer help. For emergencies, always call 911.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={shareOpen} onOpenChange={setShareOpen}>
              <DialogTrigger
                render={
                  <Button size="sm">
                    <Megaphone className="size-3.5" /> Share awareness
                  </Button>
                }
              />
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Share neighborhood awareness</DialogTitle>
                  <DialogDescription>
                    Heads-up posts for your community — not tied to any incident.
                    This is NOT 911. Call 911 for emergencies.
                  </DialogDescription>
                </DialogHeader>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!body.trim()) return;
                    shareMutation.mutate({
                      authorName: authorName || "Neighbor",
                      body: body.trim(),
                      media: media ?? undefined,
                    });
                  }}
                >
                  <div className="space-y-1.5">
                    <Label htmlFor="author">Your name (or alias)</Label>
                    <Input
                      id="author"
                      value={authorName}
                      onChange={(e) => setAuthorName(e.target.value)}
                      placeholder="Neighbor"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="body">What do you want to share?</Label>
                    <textarea
                      id="body"
                      className="w-full min-h-24 rounded-md bg-background border border-input px-3 py-2 text-sm"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder="e.g. Smoke visible over 5th Ave — avoid the area."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="media">Photo or video (optional)</Label>
                    <Input
                      id="media"
                      type="file"
                      accept="image/*,video/*"
                      onChange={(e) => setMedia(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={shareMutation.isPending || !body.trim()}
                    >
                      {shareMutation.isPending ? "Posting…" : "Post"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Link
              href="/"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              ← Back
            </Link>
          </div>
        </header>

        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground flex items-center gap-2">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>
            This feed is for community awareness. For emergencies, call 911.
            Reports here do NOT reach first responders automatically.
          </span>
        </div>

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
          <div className="h-[520px] rounded-md overflow-hidden border">
            <PublicMap incidents={incidents} onSelect={open} />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">Active in your area</h2>
              <span className="text-xs text-muted-foreground">
                {incidents.length} open
              </span>
            </div>
            {isLoading && (
              <p className="text-xs text-muted-foreground">Loading…</p>
            )}
            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
              {incidents.map((inc) => {
                const closed = inc.status === "closed";
                return (
                  <Card
                    key={inc.id}
                    className={`cursor-pointer hover:border-foreground/30 transition ${closed ? "opacity-80" : ""}`}
                    onClick={() => open(inc.id)}
                  >
                    <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                      <CardTitle className="text-sm truncate">{inc.name}</CardTitle>
                      <Badge
                        variant={closed ? "secondary" : "default"}
                        className="text-[10px] uppercase shrink-0"
                      >
                        {closed ? "Resolved" : "Active"}
                      </Badge>
                    </CardHeader>
                    <CardContent className="pt-0 text-xs text-muted-foreground space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="size-3" />
                          {inc.location_name || "—"}
                        </span>
                        <span className="uppercase tracking-wide shrink-0">
                          {inc.incident_type}
                        </span>
                      </div>
                      {closed && inc.public_summary && (
                        <p className="line-clamp-2 text-xs text-foreground/80">
                          {inc.public_summary}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              {incidents.length === 0 && !isLoading && (
                <p className="text-xs text-muted-foreground">
                  No active incidents nearby.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="size-4" />
            <h2 className="text-sm font-medium">Neighborhood awareness feed</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {awareness.map((p) => (
              <Card key={p.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>{p.author_name}</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      {new Date(p.created_at).toLocaleString()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {p.body && <p className="text-sm">{p.body}</p>}
                  {p.media_url && (
                    <img
                      src={publicMediaUrl(p.media_url)}
                      alt="community post"
                      className="rounded-md max-h-64 object-cover w-full"
                    />
                  )}
                </CardContent>
              </Card>
            ))}
            {awareness.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No community posts yet. Be the first to share.
              </p>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
