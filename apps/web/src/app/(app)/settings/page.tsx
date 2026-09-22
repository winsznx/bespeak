"use client";

import {useTheme, type ThemeChoice} from "@/components/theme";

const OPTIONS: Array<{key: ThemeChoice; label: string; sub: string}> = [
  {key: "light", label: "Light", sub: "Canonical Bespeak appearance"},
  {key: "dark", label: "Dark", sub: "Same system, dark surfaces"},
  {key: "system", label: "System", sub: "Follow your operating system"},
];

export default function SettingsPage() {
  const {choice, setChoice} = useTheme();

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="t-h2">Settings</h1>
          <p className="t-sm muted prose" style={{margin: 0}}>
            Preferences stored in this browser.
          </p>
        </div>
      </div>

      <section className="module module-pad" style={{maxWidth: 560}}>
        <h2 className="t-h3" style={{marginBottom: 4}}>
          Appearance
        </h2>
        <p className="t-sm muted prose" style={{margin: "0 0 18px"}}>
          Bespeak uses one design system with two themes. Only colour changes.
        </p>

        <div className="col g2" role="radiogroup" aria-label="Theme">
          {OPTIONS.map((o) => (
            <button
              key={o.key}
              role="radio"
              aria-checked={choice === o.key}
              className="row g3"
              onClick={() => setChoice(o.key)}
              style={{
                width: "100%",
                textAlign: "left",
                padding: "14px 16px",
                borderRadius: "var(--r-control)",
                border: `1px solid ${choice === o.key ? "var(--brand)" : "var(--line)"}`,
                boxShadow: choice === o.key ? "0 0 0 1px var(--brand)" : "none",
                background: "var(--surface)",
                cursor: "pointer",
                color: "inherit",
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 17,
                  height: 17,
                  flex: "none",
                  borderRadius: 999,
                  border: `1.5px solid ${choice === o.key ? "var(--brand)" : "var(--line-2)"}`,
                  background: choice === o.key ? "var(--brand)" : "transparent",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {choice === o.key && (
                  <span style={{width: 5, height: 5, borderRadius: 999, background: "#fff"}} />
                )}
              </span>
              <span>
                <span className="t-h4" style={{display: "block"}}>
                  {o.label}
                </span>
                <span className="t-xs faint">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
