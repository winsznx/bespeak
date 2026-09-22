"use client";

import {useTheme, type ThemeChoice} from "@/components/theme";

const ORDER: ThemeChoice[] = ["light", "dark", "system"];
const LABEL: Record<ThemeChoice, string> = {light: "Light", dark: "Dark", system: "System"};

/// Three-way theme control. Cycles rather than opening a menu, because it is a preference
/// toggled rarely and a dropdown would cost more chrome than the setting is worth.
export function ThemeToggle() {
  const {choice, setChoice} = useTheme();
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;

  return (
    <button
      className="icon-btn"
      onClick={() => setChoice(next)}
      title={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}.`}
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}.`}
    >
      {choice === "system" ? <SystemGlyph /> : choice === "dark" ? <MoonGlyph /> : <SunGlyph />}
    </button>
  );
}

function SunGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="9" cy="9" r="3.4" />
      <path d="M9 1.8v1.6M9 14.6v1.6M16.2 9h-1.6M3.4 9H1.8M14.1 3.9l-1.1 1.1M5 13l-1.1 1.1M14.1 14.1L13 13M5 5L3.9 3.9" opacity="0.75" />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <path d="M14.6 10.8A6.2 6.2 0 0 1 7.2 3.4a6.2 6.2 0 1 0 7.4 7.4z" />
    </svg>
  );
}

function SystemGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
      <rect x="2.4" y="3.6" width="13.2" height="9" rx="2" />
      <path d="M6.6 15h4.8" strokeLinecap="round" />
    </svg>
  );
}
