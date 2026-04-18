"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

interface SummaryPanelProps {
  summary: string;
  updatedAt?: string;
}

export function SummaryPanel({ summary, updatedAt }: SummaryPanelProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" /> AI Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto text-sm whitespace-pre-wrap">
        {summary || "No summary yet. Waiting for communications."}
      </CardContent>
      {updatedAt && (
        <p className="px-6 pb-3 text-[10px] text-muted-foreground">
          Updated {new Date(updatedAt).toLocaleTimeString()}
        </p>
      )}
    </Card>
  );
}
