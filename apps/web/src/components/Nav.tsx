"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {ConnectButton} from "./ConnectButton";

const LINKS = [
  {href: "/", label: "Home"},
  {href: "/markets", label: "Markets"},
  {href: "/orders", label: "Orders"},
  {href: "/vault", label: "Vault"},
  {href: "/demand", label: "Demand"},
  {href: "/activity", label: "Activity"},
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      <div className="wrap nav-inner">
        <Link href="/" className="brand">
          Bespeak
        </Link>
        <div className="nav-links">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="nav-link"
              data-active={l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)}
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
