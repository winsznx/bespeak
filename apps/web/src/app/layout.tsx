import type {Metadata, Viewport} from "next";
import {Geist, Geist_Mono} from "next/font/google";
import "./globals.css";
import {Nav} from "@/components/Nav";
import {Providers} from "@/components/Providers";
import {Footer} from "@/components/Footer";
import {ThemeScript} from "@/components/ThemeScript";

/// A modern grotesk with genuinely good numerals, because in this product the numbers
/// are the content. Monospace is loaded only for addresses and hashes.
const sans = Geist({subsets: ["latin"], variable: "--font-sans", display: "swap"});
const mono = Geist_Mono({subsets: ["latin"], variable: "--font-mono", display: "swap"});

export const metadata: Metadata = {
  title: "Bespeak — set the market moment",
  description:
    "Buy tokenized stocks now, at the next regular session, when they become available, " +
    "or on a recurring schedule. Reserve once and come back to an outcome.",
};

export const viewport: Viewport = {
  themeColor: [
    {media: "(prefers-color-scheme: light)", color: "#faf9f7"},
    {media: "(prefers-color-scheme: dark)", color: "#0c0c0e"},
  ],
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body>
        <Providers>
          <Nav />
          <main className="page">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
