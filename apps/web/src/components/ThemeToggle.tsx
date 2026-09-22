"use client";

import {useTheme, type ThemeChoice} from "./theme";
import {Icon} from "./ui/Icon";

const ORDER: ThemeChoice[] = ["light", "dark", "system"];
const LABEL: Record<ThemeChoice, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

/// Cycles light → dark → system. A three-way control earns a menu at larger sizes, but in
/// a utility bar the cycle is faster and the current value is announced either way.
export function ThemeToggle({compact = false}: {compact?: boolean}) {
  const {choice, setChoice} = useTheme();
  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length]!;

  return (
    <button
      type="button"
      className={compact ? "icon-btn" : "btn btn-sm"}
      onClick={() => setChoice(next)}
      aria-label={`Theme: ${LABEL[choice]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[choice]}`}
    >
      <Icon name="theme" size={16} />
      {!compact && <span>{LABEL[choice]}</span>}
    </button>
  );
}
