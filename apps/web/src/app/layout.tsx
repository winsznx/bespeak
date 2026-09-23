import type {Metadata, Viewport} from "next";
import {Instrument_Sans, Newsreader, IBM_Plex_Mono} from "next/font/google";
import "@rainbow-me/rainbowkit/styles.css";
import "./globals.css";
import {headers} from "next/headers";
import {Providers} from "@/components/Providers";
import {THEME_BOOTSTRAP} from "@/components/theme";

/// A refined grotesk for the interface, a restrained serif italic for editorial moments
/// only, and a mono used solely for addresses and hashes.
const sans = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});
const serif = Newsreader({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["300", "400"],
  variable: "--font-serif",
  display: "swap",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bespeak.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Bespeak — Set the market moment",
    template: "%s · Bespeak",
  },
  description:
    "Condition-aware standing orders for tokenized equities on X Layer.",
  applicationName: "Bespeak",
  alternates: {canonical: "/"},
  openGraph: {
    type: "website",
    siteName: "Bespeak",
    url: SITE_URL,
    title: "Bespeak — Set the market moment",
    description:
      "Condition-aware standing orders for tokenized equities on X Layer.",
    images: [
      {
        url: "/brand/social/og.png",
        width: 1200,
        height: 630,
        alt: "Bespeak — set the market moment. Condition-aware standing orders for tokenized equities on X Layer.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bespeak — Set the market moment",
    description:
      "Condition-aware standing orders for tokenized equities on X Layer.",
    images: ["/brand/social/og.png"],
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {index: true, follow: true},
  },
};

export const viewport: Viewport = {
  themeColor: [
    {media: "(prefers-color-scheme: light)", color: "#EEEFEA"},
    {media: "(prefers-color-scheme: dark)", color: "#0d0f11"},
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({children}: {children: React.ReactNode}) {
  // Forward the raw cookie to the client boundary. wagmi's config is built by
  // RainbowKit's getDefaultConfig, which is a client-only function, so the initial state
  // has to be derived on the client side of the boundary rather than here.
  const cookie = (await headers()).get("cookie");

  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{__html: THEME_BOOTSTRAP}} />
      </head>
      <body>
        <Providers cookie={cookie}>{children}</Providers>
      </body>
    </html>
  );
}
