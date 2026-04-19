"use client";

import { use, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, publicMediaUrl } from "@/lib/api";
import { useIncidentSocket } from "@/lib/ws";
import type { PublicHelpType, PublicPost, WSMessage } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  Check,
  Eye,
  Home,
  Package,
  Send,
} from "lucide-react";

const HELP_CHIPS: Array<{
  type: PublicHelpType;
  label: string;
  icon: typeof Car;
}> = [
  { type: "ride", label: "Offer ride", icon: Car },
  { type: "shelter", label: "Offer shelter", icon: Home },
  { type: "supplies", label: "Have supplies", icon: Package },
  { type: "safe", label: "I'm safe", icon: Check },
  { type: "check", label: "Check neighbor", icon: Eye },
];

const LANGS = [
  { code: "en", label: "EN" },
  { code: "es", label: "ES" },
];

export default function PublicIncidentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: incidentId } = use(params);
  const qc = useQueryClient();
  const [lang, setLang] = useState<string>("en");

  const incident = useQuery({
    queryKey: ["public-incident", incidentId, lang],
    queryFn: () => api.getPublicIncident(incidentId, lang),
    refetchInterval: 15_000,
  });

  const thread = useQuery({
    queryKey: ["public-thread", incidentId],
    queryFn: () => api.getPublicThread(incidentId),
    refetchInterval: 6_000,
  });

  useIncidentSocket({
    incidentId,
    unitId: "public-viewer",
    onMessage: (msg: WSMessage) => {
      if (msg.type === "public_post") {
        qc.invalidateQueries({ queryKey: ["public-thread", incidentId] });
        qc.invalidateQueries({ queryKey: ["public-incident", incidentId] });
      }
    },
  });

  const [authorName, setAuthorName] = useState("Neighbor");
  const [comment, setComment] = useState("");
  const [media, setMedia] = useState<File | null>(null);

  const postMutation = useMutation({
    mutationFn: api.createPublicPost,
    onSuccess: () => {
      setComment("");
      setMedia(null);
      qc.invalidateQueries({ queryKey: ["public-thread", incidentId] });
      qc.invalidateQueries({ queryKey: ["public-incident", incidentId] });
    },
  });

  const helpCounts = incident.data?.help_counts ?? {};
  const totalHelp = useMemo(
    () =>
      Object.values(helpCounts).reduce(
        (sum, n) => sum + (typeof n === "number" ? n : 0),
        0,
      ),
    [helpCounts],
  );

  const sendHelp = (helpType: PublicHelpType) =>
    postMutation.mutate({
      incidentId,
      kind: "help",
      authorName,
      helpType,
    });

  const sendComment = () => {
    if (!comment.trim() && !media) return;
    postMutation.mutate({
      incidentId,
      kind: "comment",
      authorName,
      body: comment.trim() || undefined,
      media: media ?? undefined,
    });
  };

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-4 py-6 space-y-5">
        <header className="flex items-start justify-between gap-3">
          <Link
            href="/public"
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            <ArrowLeft className="size-3.5" /> Back
          </Link>
          <div className="flex items-center gap-1">
            {LANGS.map((l) => (
              <button
                key={l.code}
                type="button"
                onClick={() => setLang(l.code)}
                className={`text-xs rounded-md px-2 py-1 border ${
                  lang === l.code
                    ? "bg-foreground text-background"
                    : "bg-background text-muted-foreground"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </header>

        {incident.isLoading && (
          <p className="text-sm text-muted-foreground">Loading…</p>
        )}

        {incident.data && (
          <Card>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="text-lg">{incident.data.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {incident.data.location_name || incident.data.incident_type}
                </p>
              </div>
              <Badge variant="secondary" className="uppercase text-[10px]">
                Official
              </Badge>
            </CardHeader>
            <CardContent className="text-sm whitespace-pre-wrap">
              {incident.data.summary ||
                "Dispatcher summary not available yet."}
            </CardContent>
          </Card>
        )}

        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs flex items-center gap-2">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span>
            Community posts below are unofficial. For emergencies call 911.
          </span>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">How can you help?</h2>
            <span className="text-xs text-muted-foreground">
              {totalHelp} {totalHelp === 1 ? "neighbor" : "neighbors"} offered help
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {HELP_CHIPS.map(({ type, label, icon: Icon }) => {
              const n = helpCounts[type] ?? 0;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => sendHelp(type)}
                  disabled={postMutation.isPending}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs hover:bg-accent transition disabled:opacity-50"
                >
                  <Icon className="size-3.5" />
                  <span>{label}</span>
                  {n > 0 && (
                    <span className="ml-1 rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] font-medium">
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-medium">Community thread</h2>

          <Card>
            <CardContent className="p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-2">
                <Input
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  placeholder="Your name"
                />
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Share what you see or know. Be kind and factual."
                  className="w-full min-h-16 rounded-md bg-background border border-input px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center justify-between gap-2">
                <Input
                  type="file"
                  accept="image/*,video/*"
                  onChange={(e) => setMedia(e.target.files?.[0] ?? null)}
                  className="text-xs max-w-xs"
                />
                <Button
                  size="sm"
                  onClick={sendComment}
                  disabled={postMutation.isPending || (!comment.trim() && !media)}
                >
                  <Send className="size-3.5" />
                  Post
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {thread.data?.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No posts yet. Be the first to share.
              </p>
            )}
            {thread.data?.map((p) => (
              <ThreadPost key={p.id} post={p} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function ThreadPost({ post }: { post: PublicPost }) {
  const helpLabel =
    post.kind === "help" && post.help_type
      ? HELP_CHIPS.find((c) => c.type === post.help_type)?.label
      : null;

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">{post.author_name}</span>
          <span className="text-muted-foreground">
            {new Date(post.created_at).toLocaleString()}
          </span>
        </div>
        {helpLabel && (
          <Badge variant="secondary" className="text-[10px]">
            {helpLabel}
          </Badge>
        )}
        {post.body && <p className="text-sm whitespace-pre-wrap">{post.body}</p>}
        {post.media_url && (
          <img
            src={publicMediaUrl(post.media_url)}
            alt="post media"
            className="rounded-md max-h-80 object-cover w-full"
          />
        )}
      </CardContent>
    </Card>
  );
}
