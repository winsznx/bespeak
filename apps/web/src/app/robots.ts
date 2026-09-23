import type {MetadataRoute} from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bespeak.app";

/// Public surfaces are indexable. Anything scoped to a specific wallet, order or receipt is
/// not — those URLs contain a person's financial activity and have no business in a search
/// index even though the underlying chain data is public.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/markets", "/asset/", "/demand", "/automations", "/help", "/terms", "/privacy"],
        disallow: [
          "/api/",
          "/orders",
          "/vault",
          "/activity",
          "/receipt/",
          "/proof/",
          "/settings",
          "/more",
          "/preview",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
