import type {MetadataRoute} from "next";

/// Complete identity for an installed shortcut without overbuilding a PWA: no service
/// worker, no offline strategy, just correct metadata so a saved shortcut looks intentional.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bespeak",
    short_name: "Bespeak",
    description: "Condition-aware standing orders for tokenized equities on X Layer.",
    start_url: "/",
    display: "standalone",
    background_color: "#ecedeb",
    theme_color: "#1769e0",
    icons: [
      {src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any"},
      {src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any"},
      {src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable"},
    ],
  };
}
