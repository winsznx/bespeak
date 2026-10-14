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
          {/* A real landmark, and focusable. As a plain div with no tabindex the skip link
          moved scroll but not focus in Safari and Firefox, so keyboard users landed back
          at the top of the nav on the next tab. */}
          <main className="app-body" id="main" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
      <TabBar />
    </div>
  );
}
