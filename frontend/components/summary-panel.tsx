"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles, FileText } from "lucide-react";

interface SummaryPanelProps {
  summary: string;
  initialSummary?: string | null;
  updatedAt?: string;
}

export function SummaryPanel({ summary, initialSummary, updatedAt }: SummaryPanelProps) {
  const hasLiveSummary = summary && summary !== "No summary available.";
  const showBoth = initialSummary && hasLiveSummary && initialSummary !== summary;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> AI Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto space-y-3">
        {initialSummary && (
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <FileText className="size-3" /> Initial Report
            </p>
            <p className="text-sm whitespace-pre-wrap">{initialSummary}</p>
          </div>
        )}

        {showBoth && <hr className="border-dashed" />}

        {showBoth && (
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              <Sparkles className="size-3" /> Live Update
            </p>
            <p className="text-sm whitespace-pre-wrap">{summary}</p>
          </div>
        )}

        {!initialSummary && !hasLiveSummary && (
          <p className="text-sm text-muted-foreground">No summary yet. Waiting for communications.</p>
        )}
      </CardContent>
      {updatedAt && (
        <p className="px-6 pb-3 text-[10px] text-muted-foreground">
          Updated {new Date(updatedAt).toLocaleTimeString()}
        </p>
      )}
    </Card>
  );
}
