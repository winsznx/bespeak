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

export const metadata: Metadata = {
  title: "Bespeak — set the market moment",
  description:
    "Choose the condition. Bespeak waits, executes on X Layer and delivers the xStock " +
    "when your instruction becomes eligible.",
};

export const viewport: Viewport = {
  themeColor: [
    {media: "(prefers-color-scheme: light)", color: "#ecedeb"},
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
