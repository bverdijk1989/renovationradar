"use client";
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PaginationBar({
  page,
  pageCount,
  total,
}: {
  page: number;
  pageCount: number;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const go = useCallback(
    (next: number) => {
      const sp = new URLSearchParams(params.toString());
      if (next <= 1) sp.delete("page");
      else sp.set("page", String(next));
      router.replace(`?${sp.toString()}`, { scroll: false });
    },
    [params, router],
  );

  if (pageCount <= 1) {
    return (
      <p className="text-xs text-muted-foreground">
        {total} resultaten
      </p>
    );
  }

  return (
    <nav
      className="flex items-center justify-between gap-3"
      aria-label="Paginering"
    >
      <p className="text-xs text-muted-foreground">
        Pagina <span className="font-medium text-foreground">{page}</span> van{" "}
        <span className="font-medium text-foreground">{pageCount}</span> ·{" "}
        {total} resultaten
      </p>
      <div className="flex gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(page - 1)}
          disabled={page <= 1}
          aria-label="Vorige pagina"
        >
          <ChevronLeft className="h-4 w-4" />
          Vorige
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => go(page + 1)}
          disabled={page >= pageCount}
          aria-label="Volgende pagina"
        >
          Volgende
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
