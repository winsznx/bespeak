/// Resolves the theme before first paint.
///
/// Order of precedence: an explicit `?theme=` in the URL, then a previously chosen theme,
/// then the system preference. Runs inline in <head> so the page never paints one theme and
/// then flips, and it is wrapped in try/catch because storage can throw in a private window.
const SCRIPT = `
(function () {
  try {
    var url = new URL(window.location.href);
    var q = url.searchParams.get("theme");
    if (q === "light" || q === "dark") {
      document.documentElement.setAttribute("data-theme", q);
      try { localStorage.setItem("bespeak-theme", q); } catch (e) {}
      return;
    }
    var saved = null;
    try { saved = localStorage.getItem("bespeak-theme"); } catch (e) {}
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (e) {}
})();
`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{__html: SCRIPT}} />;
}
