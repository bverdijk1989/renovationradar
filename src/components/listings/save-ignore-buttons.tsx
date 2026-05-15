"use client";
import { useState } from "react";
import { Bookmark, BookmarkCheck, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient, ApiError } from "@/lib/api-client";

export function SaveIgnoreButtons({
  listingId,
  initialKind = null,
}: {
  listingId: string;
  initialKind?: "saved" | "ignored" | null;
}) {
  const [kind, setKind] = useState<"saved" | "ignored" | null>(initialKind);
  const [pending, setPending] = useState<"save" | "ignore" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: "save" | "ignore") {
    setPending(action);
    setError(null);
    try {
      await apiClient.post(`/api/listings/${listingId}/${action}`, {});
      setKind(action === "save" ? "saved" : "ignored");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setError("Log eerst in om te bewaren");
      } else {
        setError("Mislukt");
      }
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant={kind === "saved" ? "default" : "outline"}
        onClick={() => handle("save")}
        disabled={pending !== null}
        aria-pressed={kind === "saved"}
      >
        {kind === "saved" ? (
          <BookmarkCheck className="h-4 w-4" />
        ) : (
          <Bookmark className="h-4 w-4" />
        )}
        Bewaar
      </Button>
      <Button
        size="sm"
        variant={kind === "ignored" ? "destructive" : "ghost"}
        onClick={() => handle("ignore")}
        disabled={pending !== null}
        aria-pressed={kind === "ignored"}
      >
        <EyeOff className="h-4 w-4" />
        Negeer
      </Button>
      {error ? (
        <span role="status" className="ml-1 text-xs text-destructive">
          {error}
        </span>
      ) : null}
    </div>
  );
}
