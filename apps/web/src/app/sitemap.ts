import type {MetadataRoute} from "next";
import {REGISTRY} from "@/lib/server";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://bespeak.app";

/// Only genuinely public pages, plus one entry per supported asset. Twelve real asset pages
/// with real content — not a generated long tail of thin pages.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core: MetadataRoute.Sitemap = [
    {url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1},
    // The address given to reviewers, and often the first page anyone opens.
    {url: `${SITE_URL}/demo`, lastModified: now, changeFrequency: "monthly", priority: 0.9},
    {url: `${SITE_URL}/markets`, lastModified: now, changeFrequency: "hourly", priority: 0.9},
    {url: `${SITE_URL}/demand`, lastModified: now, changeFrequency: "daily", priority: 0.6},
    {url: `${SITE_URL}/automations`, lastModified: now, changeFrequency: "monthly", priority: 0.5},
    {url: `${SITE_URL}/help`, lastModified: now, changeFrequency: "monthly", priority: 0.4},
    {url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3},
    {url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3},
  ];

  const assets: MetadataRoute.Sitemap = REGISTRY.assets.map((a) => ({
    url: `${SITE_URL}/asset/${a.symbol}`,
    lastModified: now,
    changeFrequency: "hourly" as const,
    priority: 0.8,
  }));

  return [...core, ...assets];
}
