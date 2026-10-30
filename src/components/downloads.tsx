"use client";

import { Apple, Download, Globe, Smartphone, Terminal } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";

const RELEASES = "https://github.com/amanjhacodes55/convene/releases";
const DESKTOP = `${RELEASES}/download/desktop-v1.0.0`;
export const ANDROID_APK = `${RELEASES}/download/android-v1.0.0/convene-android-v1.0.0.apk`;

type Platform = "mac" | "windows" | "linux" | "android" | "other";

/** Windows' four panes; lucide has no brand marks. */
function WindowsMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M3 5.1 10.4 4v7.2H3zM11.4 3.9 21 2.5v8.7h-9.6zM3 12.2h7.4v7.2L3 18.4zM11.4 12.2H21v9.3l-9.6-1.4z" />
    </svg>
  );
}

function detect(): Platform {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "other";
  if (/Mac/i.test(ua)) return "mac";
  if (/Win/i.test(ua)) return "windows";
  if (/Linux|X11|CrOS/i.test(ua)) return "linux";
  return "other";
}

const never = () => () => {};

/** The visitor's platform, known after hydration ("other" on the server). */
function usePlatform(): Platform {
  return useSyncExternalStore(never, detect, () => "other");
}

type Option = { label: string; href: string; note: string };
type Card = { id: Exclude<Platform, "other">; name: string; icon: ReactNode; blurb: string; options: Option[] };

const CARDS: Card[] = [
  {
    id: "mac",
    name: "macOS",
    icon: <Apple size={24} />,
    blurb: "For macOS 12 Monterey or newer.",
    options: [
      { label: "Apple silicon", href: `${DESKTOP}/Convene-mac-arm64.dmg`, note: "M1 and later" },
      { label: "Intel", href: `${DESKTOP}/Convene-mac-x64.dmg`, note: "Older Macs" },
    ],
  },
  {
    id: "windows",
    name: "Windows",
    icon: <WindowsMark />,
    blurb: "For Windows 10 and 11, 64-bit.",
    options: [{ label: "Download installer", href: `${DESKTOP}/Convene-windows-setup.exe`, note: ".exe" }],
  },
  {
    id: "linux",
    name: "Linux",
    icon: <Terminal size={22} />,
    blurb: "An AppImage for any distribution, or a .deb package.",
    options: [
      { label: "AppImage", href: `${DESKTOP}/Convene-linux.AppImage`, note: "Any distribution" },
      { label: ".deb", href: `${DESKTOP}/Convene-linux.deb`, note: "Debian, Ubuntu" },
    ],
  },
  {
    id: "android",
    name: "Android",
    icon: <Smartphone size={22} />,
    blurb: "For Android 8.0 or newer. Meeting links open straight in the app.",
    options: [{ label: "Download APK", href: ANDROID_APK, note: "12 MB" }],
  },
];

const HERO: Record<Exclude<Platform, "other">, Option> = {
  mac: { label: "Download for Mac", href: `${DESKTOP}/Convene-mac-arm64.dmg`, note: "Apple silicon · on an Intel Mac, pick Intel below" },
  windows: { label: "Download for Windows", href: `${DESKTOP}/Convene-windows-setup.exe`, note: "Windows 10 and 11, 64-bit" },
  linux: { label: "Download for Linux", href: `${DESKTOP}/Convene-linux.AppImage`, note: "AppImage · a .deb is below" },
  android: { label: "Download for Android", href: ANDROID_APK, note: "APK · Android 8.0 or newer" },
};

export function Downloads() {
  const platform = usePlatform();
  const hero = platform === "other" ? null : HERO[platform];

  return (
    <>
      <section className="mx-auto max-w-3xl px-4 pb-12 pt-14 text-center sm:px-6 sm:pt-20">
        <h1 className="rise text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Convene, <span className="text-gradient">wherever you meet</span>
        </h1>
        <p className="rise mx-auto mt-4 max-w-xl text-lg text-ink-2" style={{ animationDelay: "70ms" }}>
          Apps for your computer and your phone, with the same meetings and account as the website. Or skip the download and meet in your browser.
        </p>
        <div className="rise mt-8 flex min-h-[4.5rem] flex-col items-center gap-2" style={{ animationDelay: "140ms" }}>
          {hero ? (
            <>
              <a href={hero.href} className="btn btn-primary fade-in h-12 px-6 text-base" id="download-recommended">
                <Download size={18} /> {hero.label}
              </a>
              <span className="text-xs text-muted">{hero.note}</span>
            </>
          ) : (
            <Link href="/" className="btn btn-primary h-12 px-6 text-base">
              <Globe size={18} /> Open Convene in your browser
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        {CARDS.map((c, n) => (
          <div
            key={c.id}
            id={`download-${c.id}`}
            className={`card card-hover rise flex flex-col p-5 ${platform === c.id ? "border-accent/60" : ""}`}
            style={{ "--i": n + 2, boxShadow: platform === c.id ? "0 0 0 3px var(--glow)" : undefined } as React.CSSProperties}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/15 text-accent-ink">{c.icon}</span>
              <div>
                <h2 className="font-semibold">{c.name}</h2>
                {platform === c.id && <span className="text-xs font-medium text-accent-ink">Your device</span>}
              </div>
            </div>
            <p className="mt-3 flex-1 text-sm text-ink-2">{c.blurb}</p>
            <div className="mt-4 grid gap-2">
              {c.options.map((o) => (
                <a key={o.href} href={o.href} className="btn h-auto justify-between py-2.5 text-left">
                  <span className="flex items-center gap-2">
                    <Download size={15} /> {o.label}
                  </span>
                  <span className="text-xs text-muted">{o.note}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <details className="card group p-5">
          <summary className="cursor-pointer list-none font-medium">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>
            Opening the app for the first time
          </summary>
          <div className="mt-3 space-y-2 text-sm text-ink-2">
            <p>The apps aren&apos;t signed with an Apple or Microsoft developer certificate yet, so your computer asks once before opening them:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <b className="text-ink">macOS:</b> open the app, then go to System Settings → Privacy &amp; Security and click <b className="text-ink">Open Anyway</b>.
              </li>
              <li>
                <b className="text-ink">Windows:</b> on the blue SmartScreen prompt, click <b className="text-ink">More info</b>, then <b className="text-ink">Run anyway</b>.
              </li>
              <li>
                <b className="text-ink">Linux:</b> make the AppImage executable (<code className="font-mono text-xs">chmod +x Convene-linux.AppImage</code>) and run it.
              </li>
              <li>
                <b className="text-ink">Android:</b> open the downloaded APK and allow installing apps from your browser when asked.
              </li>
            </ul>
            <p>
              Everything is open source: see the{" "}
              <a className="text-accent-ink hover:underline" href={RELEASES}>
                releases
              </a>{" "}
              and the code on GitHub.
            </p>
          </div>
        </details>
      </section>
    </>
  );
}
