import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Convene — video meetings in your browser", template: "%s · Convene" },
  description: "Open-source video meetings: HD video, screen sharing, chat, reactions, waiting rooms and local recording. No downloads, no accounts.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
  ],
};

/** Sets the saved or system theme on <html> before the first paint (see src/client/theme.ts), so there is no flash. */
const THEME_SCRIPT = `(()=>{try{var t=localStorage.getItem("convene:theme"),d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches),r=document.documentElement;r.dataset.theme=d?"dark":"light";r.style.colorScheme=d?"dark":"light";if(t)document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){m.setAttribute("content",d?"#0b0d12":"#f6f7fb")})}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        {/* Netlify injects a "Powered by Netlify" badge that sits over the call controls: remove it,
            and keep removing it if it is injected again. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(()=>{const k=()=>document.querySelectorAll('#nl-badge-frame,#nl-badge,[id^="nl-badge"]').forEach(e=>e.remove());k();new MutationObserver(k).observe(document.documentElement,{childList:true,subtree:true})})()`,
          }}
        />
      </body>
    </html>
  );
}
