"use client";

import Link from "next/link";
import {Wordmark} from "@/components/Wordmark";
import {ThemeToggle} from "@/components/app/ThemeToggle";

const LINKS = [
  {href: "/markets", label: "Markets"},
  {href: "/#how", label: "How it works"},
  {href: "/demand", label: "Demand"},
  {href: "/automations", label: "Developers"},
];

/// Compact floating navigation. Deliberately quiet: the hero is the page, and a full-width
/// SaaS navbar would compete with it.
export function SiteNav() {
  return (
    <div className="site-nav">
      <div className="site-inner">
        <nav className="site-nav-bar" aria-label="Site">
          <Link href="/" aria-label="Bespeak home">
            <Wordmark size={18} />
          </Link>
          <div className="site-nav-links">
            {LINKS.map((l) => (
              <Link key={l.href} href={l.href} className="site-nav-link">
                {l.label}
              </Link>
            ))}
          </div>
          <div className="row g2">
            <ThemeToggle />
            <Link href="/dashboard" className="btn btn-primary btn-pill" style={{height: 40}}>
              Open app
            </Link>
          </div>
        </nav>
      </div>
    </div>
  );
}
