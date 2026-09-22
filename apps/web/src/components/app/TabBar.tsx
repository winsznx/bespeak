"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {Icon, type IconName} from "@/components/ui/Icon";

/// Mobile navigation: five destinations, no more. "More" carries the rest so the primary
/// four stay reachable with a thumb.
const TABS: Array<{href: string; label: string; icon: IconName}> = [
  {href: "/dashboard", label: "Home", icon: "home"},
  {href: "/markets", label: "Markets", icon: "markets"},
  {href: "/orders", label: "Orders", icon: "orders"},
  {href: "/vault", label: "Vault", icon: "vault"},
  {href: "/more", label: "More", icon: "more"},
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="tabbar" aria-label="Primary">
      {TABS.map((t) => {
        const active =
          t.href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} className="tab" data-active={active}>
            <Icon name={t.icon} size={19} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
