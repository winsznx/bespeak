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
    background_color: "#EEEFEA",
    theme_color: "#1F6FE5",
    icons: [
      {src: "/brand/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any"},
      {src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any"},
      {src: "/brand/icons/icon-1024.png", sizes: "1024x1024", type: "image/png", purpose: "any"},
      {src: "/brand/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable"},
    ],
  };
}
