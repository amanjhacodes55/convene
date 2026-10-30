"use client";

import { AppWindow, BookOpen, CalendarDays, LogOut, PlugZap, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, type ReactNode } from "react";
import { call, useMe, type Me } from "@/client/fetch";
import { ThemeToggle } from "./theme";
import { Avatar, Logo } from "./ui";

const MeContext = createContext<Me | null>(null);
/** The signed-in account, inside a PortalShell (which only renders once there is one). */
export const usePortalUser = () => useContext(MeContext)!;

const NAV = [
  { group: "Personal", items: [
    { href: "/app", label: "Meetings", icon: CalendarDays },
    { href: "/app/connected", label: "Connected apps", icon: PlugZap },
    { href: "/app/profile", label: "Profile", icon: UserRound },
  ] },
  { group: "Developer", items: [
    { href: "/developers/apps", label: "Your apps", icon: AppWindow },
    { href: "/developers/docs", label: "API reference", icon: BookOpen },
  ] },
];

/** The signed-in area: a top bar and a side nav, like a meetings web portal. Sends guests to sign in. */
export function PortalShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const me = useMe();
  const path = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (me === null) router.replace(`/signin?next=${encodeURIComponent(location.pathname + location.search)}`);
  }, [me, router]);

  if (!me) {
    return (
      <main className="grid min-h-dvh place-items-center">
        <span className="animate-pulse">
          <Logo size={40} />
        </span>
      </main>
    );
  }

  const active = (href: string) => (href === "/app" ? path === "/app" || path.startsWith("/app/meetings") : path.startsWith(href));

  return (
    <MeContext.Provider value={me}>
      <div className="flex min-h-dvh w-full flex-col">
        <header className="glass sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line/70 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <Logo size={26} /> Convene
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {actions}
            <ThemeToggle />
            <span className="ml-2 hidden items-center gap-2 text-sm text-ink-2 md:flex">
              <Avatar name={me.name} size={28} />
              {me.name}
            </span>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-7xl flex-1">
          <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col border-r border-line px-3 py-5 md:flex">
            {NAV.map((g) => (
              <div key={g.group} className="mb-5">
                <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">{g.group}</div>
                {g.items.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${active(i.href) ? "bg-accent/15 text-ink" : "text-ink-2 hover:bg-raise hover:text-ink"}`}
                  >
                    <i.icon size={16} className={active(i.href) ? "text-accent-ink" : ""} />
                    {i.label}
                  </Link>
                ))}
              </div>
            ))}
            <button
              className="mt-auto flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-raise hover:text-ink"
              onClick={async () => {
                await call("/api/auth/signout", "POST");
                router.push("/");
                router.refresh();
              }}
            >
              <LogOut size={16} /> Sign out
            </button>
          </aside>
          <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-8">
            <nav className="scroll-thin -mx-1 mb-5 flex gap-1 overflow-x-auto md:hidden">
              {NAV.flatMap((g) => g.items).map((i) => (
                <Link key={i.href} href={i.href} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${active(i.href) ? "bg-accent/20 text-ink" : "bg-raise text-ink-2"}`}>
                  {i.label}
                </Link>
              ))}
            </nav>
            {children}
          </main>
        </div>
      </div>
    </MeContext.Provider>
  );
}

export function PageTitle({ title, sub, children }: { title: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
