import type {NextConfig} from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The workspace packages ship as TypeScript source, so Next compiles them itself rather
  // than each package maintaining its own build step.
  transpilePackages: [
    "@bespeak/shared",
    "@bespeak/assets",
    "@bespeak/conditions",
    "@bespeak/sdk",
    "@bespeak/okx",
  ],
  webpack(cfg) {
    // Those packages use explicit `.js` specifiers so they run as native ESM under Node for
    // the keeper and verifier. Webpack resolves from source, so map the specifier back to
    // the TypeScript file instead of stripping the extension and breaking the Node path.
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return cfg;
  },
};

export default config;
