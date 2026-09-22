import Link from "next/link";
import {Icon, type IconName} from "@/components/ui/Icon";

const LINKS: Array<{href: string; label: string; icon: IconName; sub: string}> = [
  {href: "/demand", label: "Demand", icon: "demand", sub: "Capital committed to unavailable assets"},
  {href: "/activity", label: "Activity", icon: "activity", sub: "Your full history"},
  {href: "/automations", label: "Automations", icon: "automations", sub: "API for agents and integrators"},
  {href: "/settings", label: "Settings", icon: "settings", sub: "Appearance and preferences"},
  {href: "/help", label: "Help", icon: "help", sub: "How Bespeak works"},
];

/// Mobile overflow destination. Exists so the bottom bar can stay at five items without
/// hiding anything from a phone user.
export default function MorePage() {
  return (
    <>
      <div className="page-head">
        <h1 className="t-h2">More</h1>
      </div>
      <div className="module" style={{padding: "2px 20px"}}>
        {LINKS.map((l, i) => (
          <Link
            href={l.href}
            key={l.href}
            className="row g3"
            style={{
              padding: "16px 0",
              borderBottom: i === LINKS.length - 1 ? "none" : "1px solid var(--line)",
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 11,
                background: "var(--surface-2)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-2)",
                flex: "none",
              }}
            >
              <Icon name={l.icon} />
            </span>
            <span className="grow" style={{minWidth: 0}}>
              <span className="t-h4" style={{display: "block"}}>
                {l.label}
              </span>
              <span className="t-xs faint truncate" style={{display: "block"}}>
                {l.sub}
              </span>
            </span>
            <Icon name="chevron" size={16} />
          </Link>
        ))}
      </div>
    </>
  );
}
