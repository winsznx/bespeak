"use client";

import {useEffect, useRef, useState} from "react";
import {useRouter} from "next/navigation";
import Link from "next/link";
import {useAccount} from "wagmi";
import {X_LAYER_CHAIN_ID} from "@bespeak/shared";
import {Icon} from "@/components/ui/Icon";
import {Wordmark} from "@/components/Wordmark";
import {shortAddress} from "@/lib/format";
import {ThemeToggle} from "./ThemeToggle";
import {ConnectButton} from "@/components/ConnectButton";

/// Top utility region. Function translated from the reference rather than its icon set:
/// a real search over markets and orders, the network Bespeak actually requires, theme,
/// and wallet identity. Nothing decorative.
export function Topbar({search}: {search?: string}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(search ?? "");
  const {address, isConnected, chainId} = useAccount();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const wrongNetwork = isConnected && chainId !== X_LAYER_CHAIN_ID;

  return (
    <header className="topbar">
      <Link href="/" className="mobile-brand" aria-label="Bespeak home">
        <Wordmark size={18} />
      </Link>

      <form
        className="searchfield"
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) router.push(`/markets?q=${encodeURIComponent(q.trim())}`);
        }}
        role="search"
      >
        <Icon name="search" size={17} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search markets or orders"
          aria-label="Search markets or orders"
        />
        <kbd className="kbd">⌘K</kbd>
      </form>

      <div className="row g2" style={{marginLeft: "auto"}}>
        <span
          className={wrongNetwork ? "chip chip-waiting network-chip" : "chip chip-outline network-chip"}
          title={wrongNetwork ? "Connected to the wrong network" : "X Layer mainnet, chain 196"}
        >
          <span
            className="dot"
            style={{background: wrongNetwork ? "var(--waiting)" : "var(--success)"}}
          />
          {wrongNetwork ? "Wrong network" : "X Layer"}
        </span>

        <ThemeToggle />

        {isConnected && address ? (
          <Link href="/vault" className="wallet-pill" title={address}>
            <span className="wallet-avatar" aria-hidden="true" />
            <span className="mono">{shortAddress(address)}</span>
          </Link>
        ) : (
          <ConnectButton />
        )}
      </div>
    </header>
  );
}
