import type {ReactNode} from "react";
import {SiteNav} from "@/components/site/SiteNav";
import {SiteFooter} from "@/components/site/SiteFooter";

export default function SiteLayout({children}: {children: ReactNode}) {
  return (
    <div className="site">
      <SiteNav />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
