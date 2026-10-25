"use client";

import Link from "next/link";
import { useMe } from "@/client/fetch";
import { Avatar, Logo } from "./ui";

/** The header on public pages: product links, and the account if someone is signed in. */
export function SiteHeader({ active }: { active?: "home" | "developers" | "docs" }) {
  const me = useMe();
  const link = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`rounded-lg px-3 py-1.5 text-sm transition-colors hover:bg-raise ${on ? "text-ink" : "text-ink-2"}`}>
      {label}
    </Link>
  );
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-5 sm:px-6">
      <Link href="/" className="mr-3 flex items-center gap-2.5 text-lg font-semibold">
        <Logo /> Convene
      </Link>
      <nav className="hidden items-center gap-1 sm:flex">
        {link("/developers", "Developers", active === "developers")}
        {link("/developers/docs", "API docs", active === "docs")}
        <a className="rounded-lg px-3 py-1.5 text-sm text-ink-2 transition-colors hover:bg-raise" href="https://github.com/amanjhacodes55/convene">
          GitHub
        </a>
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {me === undefined ? null : me ? (
          <Link href="/app" className="flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm hover:bg-raise" id="my-meetings">
            <Avatar name={me.name} size={28} /> My meetings
          </Link>
        ) : (
          <>
            <Link href="/signin" className="btn border-transparent bg-transparent">
              Sign in
            </Link>
            <Link href="/signin?mode=signup" className="btn btn-primary">
              Sign up free
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
