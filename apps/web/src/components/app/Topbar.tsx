"use client";

import {useEffect, useRef, useState} from "react";
import Link from "next/link";
import {Wordmark} from "@/components/Wordmark";
import {ConnectButton, NetworkButton} from "@/components/ConnectButton";
import {ThemeToggle} from "./ThemeToggle";
import {CommandSearch} from "./CommandSearch";

/// Top utility region. Function translated from the reference rather than its icon set: a
/// real search over markets and orders, the network Bespeak actually requires, theme, and
/// wallet identity. Nothing decorative.
export function Topbar() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="topbar">
      <Link href="/" className="mobile-brand" aria-label="Bespeak home">
        <Wordmark size={18} />
      </Link>

      <button
        ref={triggerRef}
        type="button"
        className="searchfield"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <SearchGlyph />
        <span className="grow" style={{textAlign: "left"}}>
          Search markets or orders
        </span>
        <kbd className="kbd">⌘K</kbd>
      </button>

      <div className="row g2" style={{marginLeft: "auto"}}>
        <NetworkButton />
        <ThemeToggle />
        <ConnectButton compact />
      </div>

      <CommandSearch open={open} onClose={() => setOpen(false)} />
    </header>
  );
}

function SearchGlyph() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
      style={{flex: "none"}}
    >
      <circle cx="8.2" cy="8.2" r="4.7" />
      <path d="M11.8 11.8l3 3" />
    </svg>
  );
}
