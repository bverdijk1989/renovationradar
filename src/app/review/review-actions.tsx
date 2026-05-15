"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveSourceReview, rejectSourceReview } from "@/hooks/use-sources";

export function ReviewActions({ sourceId }: { sourceId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function decide(action: "approve" | "reject") {
    setError(null);
    try {
      if (action === "approve") await approveSourceReview(sourceId);
      else await rejectSourceReview(sourceId);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mislukt");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => decide("approve")} disabled={pending}>
        <Check className="h-4 w-4" />
        Goedkeuren (groen)
      </Button>
      <Button
        variant="destructive"
        onClick={() => decide("reject")}
        disabled={pending}
      >
        <X className="h-4 w-4" />
        Afwijzen (rood)
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
