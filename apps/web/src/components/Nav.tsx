"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ConnectButton} from "./ConnectButton";
import {Wordmark} from "./Wordmark";

const LINKS = [
  {href: "/markets", label: "Markets"},
  {href: "/orders", label: "Orders"},
  {href: "/vault", label: "Vault"},
  {href: "/demand", label: "Demand"},
  {href: "/activity", label: "Activity"},
];

/// Chrome recedes. The navigation is quiet enough that the page content is visibly the
/// thing on screen, which is the whole point of a product about not watching the market.
export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <div className="page nav-inner">
        <Link href="/" aria-label="Bespeak home">
          <Wordmark />
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="nav-link"
              data-active={pathname.startsWith(l.href)}
            >
              {l.label}
            </Link>
          ))}
        </div>
        <ConnectButton />
      </div>
    </nav>
  );
}
