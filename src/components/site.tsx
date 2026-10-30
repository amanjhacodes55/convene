"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import { useMe } from "@/client/fetch";
import { ThemeToggle } from "./theme";
import { Avatar, Logo } from "./ui";

/** The header on public pages: product links, and the account if someone is signed in. */
export function SiteHeader({ active }: { active?: "home" | "developers" | "docs" | "download" }) {
  const me = useMe();
  const link = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-raise ${on ? "text-ink" : "text-ink-2"}`}>
      {label}
    </Link>
  );
  return (
    <header className="glass sticky top-0 z-30 w-full border-b border-line/60">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3 sm:px-6">
        <Link href="/" className="group mr-3 flex items-center gap-2.5 text-lg font-semibold">
          <span className="transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
            <Logo />
          </span>
          Convene
        </Link>
        <nav className="hidden items-center gap-1 sm:flex">
          {link("/download", "Download", active === "download")}
          {link("/developers", "Developers", active === "developers")}
          {link("/developers/docs", "API docs", active === "docs")}
          <a className="rounded-lg px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-raise" href="https://github.com/amanjhacodes55/convene">
            GitHub
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/download" className="grid h-9 w-9 place-items-center rounded-xl text-ink-2 transition-colors hover:bg-raise hover:text-ink sm:hidden" aria-label="Download the apps">
            <Download size={18} />
          </Link>
          <ThemeToggle />
          {me === undefined ? null : me ? (
            <Link href="/app" className="fade-in flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm transition-colors hover:bg-raise" id="my-meetings">
              <Avatar name={me.name} size={28} /> My meetings
            </Link>
          ) : (
            <>
              <Link href="/signin" className="btn fade-in border-transparent bg-transparent max-sm:hidden">
                Sign in
              </Link>
              <Link href="/signin?mode=signup" className="btn btn-primary fade-in">
                Sign up free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
