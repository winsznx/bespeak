"use client";

import {useState} from "react";
import {explorerTx, explorerAddress} from "@bespeak/shared";
import {ExternalGlyph} from "./ExternalLink";

/// Every address, transaction hash and on-chain identifier the product shows.
///
/// Two rules this exists to enforce, because both were being broken per call site:
///
/// 1. An on-chain identifier is always a link to the explorer. Evidence the reader cannot
///    open is not evidence, and the product rests on the claim that they can check it.
/// 2. It can never widen its container. A 66-character hash is wider than a phone, so the
///    value is elided in the middle. The middle is what goes: the leading and trailing
///    characters are what a person compares against an explorer, so a plain tail ellipsis
///    would defeat the point of showing it at all.
///
/// The elision is done by layout rather than by breakpoints or JS measurement. The value is
/// split once into head and tail; the head is allowed to shrink and clip, the tail never is.
/// So the text is in the DOM exactly once, adapts to any container at any viewport, and
/// needs no media query. If the stylesheet never arrives the value wraps — ugly, but whole,
/// and never duplicated.
type Kind = "tx" | "address" | "hash";

/// Characters kept at the end. Enough to make a spot-check meaningful without crowding the
/// head out of a narrow container.
const TAIL = 6;

export function OnChainRef({
  value,
  kind = "address",
  label,
  copyable = true,
  className,
}: {
  value: string;
  kind?: Kind;
  /// Replaces the elided value, for rows where surrounding copy already names the thing.
  label?: string;
  copyable?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  // `hash` covers identifiers with no explorer page of their own — a manifest revision, a
  // quote hash. They still need the same overflow and copy behaviour.
  const href =
    kind === "tx" ? explorerTx(value) : kind === "address" ? explorerAddress(value) : null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Clipboard is unavailable over plain http and inside some in-app browsers. The value
      // stays selectable and the link still works, so there is nothing to recover from.
    }
  }

  const splitAt = Math.max(0, value.length - TAIL);
  const head = label ?? value.slice(0, splitAt);
  const tail = label ? "" : value.slice(splitAt);

  const body = (
    <span className="ref-value mono">
      <span className="ref-head">{head}</span>
      {tail && <span className="ref-tail">{tail}</span>}
    </span>
  );

  return (
    <span className={className ? `ref ${className}` : "ref"}>
      {href ? (
        <a className="ref-link" href={href} target="_blank" rel="noreferrer noopener" title={value}>
          {body}
          <ExternalGlyph />
        </a>
      ) : (
        <span className="ref-link ref-plain" title={value}>
          {body}
        </span>
      )}
      {copyable && (
        <button
          type="button"
          className="ref-copy"
          onClick={copy}
          aria-label={copied ? "Copied" : `Copy ${kind === "tx" ? "transaction hash" : kind}`}
        >
          {copied ? <CheckGlyph /> : <CopyGlyph />}
        </button>
      )}
    </span>
  );
}

function CopyGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      aria-hidden="true"
    >
      <rect x="4.6" y="4.6" width="7.4" height="7.4" rx="1.6" />
      <path d="M9.6 2.2H3.6A1.4 1.4 0 0 0 2.2 3.6v6" strokeLinecap="round" />
    </svg>
  );
}

function CheckGlyph() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.8 7.4l2.8 2.8 5.6-6" />
    </svg>
  );
}
