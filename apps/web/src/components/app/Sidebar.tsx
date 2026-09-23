"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useAccount} from "wagmi";
import {BespeakLogo, BespeakMark} from "@/components/brand/BespeakLogo";
import {Icon, type IconName} from "@/components/ui/Icon";
import {WalletModule} from "./WalletModule";

const MENU: Array<{href: string; label: string; icon: IconName}> = [
  {href: "/dashboard", label: "Home", icon: "home"},
  {href: "/markets", label: "Markets", icon: "markets"},
  {href: "/orders", label: "Orders", icon: "orders"},
  {href: "/vault", label: "Vault", icon: "vault"},
  {href: "/demand", label: "Demand", icon: "demand"},
  {href: "/activity", label: "Activity", icon: "activity"},
];

const GENERAL: Array<{href: string; label: string; icon: IconName}> = [
  {href: "/automations", label: "Automations", icon: "automations"},
  {href: "/settings", label: "Settings", icon: "settings"},
  {href: "/help", label: "Help", icon: "help"},
];

export function Sidebar({activeOrders}: {activeOrders?: number}) {
  const pathname = usePathname();
  const {isConnected} = useAccount();

  return (
    <aside className="side">
      <div className="side-brand">
        <Link href="/" aria-label="Bespeak home">
          <BespeakLogo height={34} className="side-lockup" />
          <BespeakMark size={26} className="side-mark" />
        </Link>
      </div>

      <nav aria-label="Main">
        <div className="side-group">
          <div className="t-label side-label">Menu</div>
          {MENU.map((l) => (
            <SideLink
              key={l.href}
              {...l}
              active={isActive(pathname, l.href)}
              count={l.href === "/orders" && isConnected ? activeOrders : undefined}
            />
          ))}
        </div>

        <div className="side-group">
          <div className="t-label side-label">General</div>
          {GENERAL.map((l) => (
            <SideLink key={l.href} {...l} active={isActive(pathname, l.href)} />
          ))}
        </div>
      </nav>

      <div className="side-foot">
        <WalletModule />
      </div>
    </aside>
  );
}

function SideLink({
  href,
  label,
  icon,
  active,
  count,
}: {
  href: string;
  label: string;
  icon: IconName;
  active: boolean;
  count?: number | undefined;
}) {
  return (
    <Link href={href} className="side-link" data-active={active} title={label}>
      <Icon name={icon} />
      <span className="label">{label}</span>
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname.startsWith(href);
}
