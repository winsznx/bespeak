import type {Metadata, Viewport} from "next";
import {Instrument_Sans, Newsreader, IBM_Plex_Mono} from "next/font/google";
import "./globals.css";
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

export default function RootLayout({children}: {children: React.ReactNode}) {
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
