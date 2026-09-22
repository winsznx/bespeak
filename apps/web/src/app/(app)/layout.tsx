import type {ReactNode} from "react";
import {Sidebar} from "@/components/app/Sidebar";
import {Topbar} from "@/components/app/Topbar";
import {TabBar} from "@/components/app/TabBar";

/// The application shell: an inset surface floating on the page canvas, with a fixed
/// sidebar, a top utility region and the content canvas. Every authenticated route
/// inherits it, so nothing is beautifully designed in one place and generic elsewhere.
export default function AppLayout({children}: {children: ReactNode}) {
  return (
    <div className="app-canvas">
      <a href="#main" className="skip">
        Skip to content
      </a>
      <div className="app-shell">
        <Sidebar />
        <div className="app-main">
          <Topbar />
          <div className="app-body" id="main">
            {children}
          </div>
        </div>
      </div>
      <TabBar />
    </div>
  );
}
