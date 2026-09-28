import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Academic AI Challenge Tracker",
    template: "%s — Academic AI Challenge Tracker",
  },
  description:
    "Track deadlines and official links for academic AI/ML challenges, competitions, and shared tasks across major research venues.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-black focus:px-3 focus:py-2 focus:text-white">
          Skip to content
        </a>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Academic AI Challenge Tracker
            </Link>
            <nav className="flex gap-4 text-sm text-stone-600 dark:text-stone-300">
              <Link href="/" className="hover:text-inherit">
                Challenges
              </Link>
              <Link href="/calendar" className="hover:text-inherit">
                Calendar
              </Link>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
          {children}
        </main>
        <footer className="border-t border-border py-6 text-center text-xs text-stone-500">
          Every listed date links back to an official source. See each challenge page for provenance and last-verified time.
        </footer>
      </body>
    </html>
  );
}
