import Link from "next/link";
import type { ReactNode } from "react";
import {
  LayoutDashboard,
  ListChecks,
  Sparkles,
  Bookmark,
  Map,
  Building2,
  Database,
  CheckSquare,
  Bell,
  Inbox,
  Radar,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
};

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/listings", label: "Alle advertenties", icon: ListChecks },
  { href: "/listings/special", label: "Bijzondere objecten", icon: Sparkles },
  { href: "/listings/saved", label: "Bewaarde advertenties", icon: Bookmark },
  { href: "/map", label: "Kaartweergave", icon: Map },
  { href: "/agencies", label: "Makelaarbronnen", icon: Building2 },
  { href: "/sources", label: "Bronbeheer", icon: Database },
  { href: "/review", label: "Review wachtrij", icon: CheckSquare },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/notifications", label: "Meldingen", icon: Inbox },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto flex max-w-[1600px]">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <div className="px-6 py-8 md:px-10 md:py-10">{children}</div>
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  return (
    <aside
      className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-background md:flex"
      aria-label="Hoofdnavigatie"
    >
      <div className="flex items-center gap-2 border-b px-6 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Radar className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold leading-tight">Renovation Radar</p>
          <p className="text-xs text-muted-foreground">EU · 350 km Venlo</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {NAV.map((item) => (
            <li key={item.href}>
              <NavLink {...item} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t px-6 py-4 text-xs text-muted-foreground">
        <p>fase 3 — frontend dashboard</p>
        <p className="mt-1">≤ €200k · ≥ 1 ha · vrijstaand</p>
      </div>
    </aside>
  );
}

function NavLink({ href, label, icon: Icon }: NavItem) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
