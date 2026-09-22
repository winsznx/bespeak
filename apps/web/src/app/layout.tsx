import type {Metadata} from "next";
import "./globals.css";
import {Nav} from "@/components/Nav";
import {Providers} from "@/components/Providers";

export const metadata: Metadata = {
  title: "Bespeak — set the market moment",
  description:
    "Schedule tokenized stock purchases for the market conditions you actually want. " +
    "Reserve stablecoins in your own vault; Bespeak waits, executes on X Layer, and " +
    "independently verifies delivery.",
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Nav />
          <main className="wrap">{children}</main>
          <footer className="wrap section">
            <p className="tiny muted" style={{maxWidth: "70ch"}}>
              Bespeak is execution infrastructure. It does not give investment advice,
              recommend any security, or promise that waiting produces a better price. It
              carries out the instruction you authorize and reports what actually happened.
            </p>
          </footer>
        </Providers>
      </body>
    </html>
  );
}
