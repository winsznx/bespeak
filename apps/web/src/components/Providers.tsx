"use client";

import {useState} from "react";
import {WagmiProvider, cookieToInitialState} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {RainbowKitProvider, lightTheme, darkTheme} from "@rainbow-me/rainbowkit";
import {wagmiConfig} from "@/lib/chain";
import {ThemeProvider, useResolvedTheme} from "./theme";

/// Provider order is load-bearing: Wagmi, then React Query, then RainbowKit.
/// `initialState` comes from the cookie the server read, which is what keeps the connect
/// button from flashing between disconnected and connected during hydration.
export function Providers({
  children,
  cookie,
}: {
  children: React.ReactNode;
  cookie: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [initialState] = useState(() => cookieToInitialState(wagmiConfig, cookie));

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <RainbowKitSkin>{children}</RainbowKitSkin>
        </ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

/// The wallet modal follows Bespeak rather than announcing RainbowKit: our brand blue as
/// the accent, our control radius, and the system font stack so it does not switch
/// typefaces mid-flow. It tracks the app's own theme choice, not the OS.
function RainbowKitSkin({children}: {children: React.ReactNode}) {
  const resolved = useResolvedTheme();

  const shared = {
    accentColor: "#1f6fe5",
    accentColorForeground: "#ffffff",
    borderRadius: "medium",
    fontStack: "system",
    overlayBlur: "small",
  } as const;

  return (
    <RainbowKitProvider
      theme={resolved === "dark" ? darkTheme(shared) : lightTheme(shared)}
      modalSize="compact"
      appInfo={{appName: "Bespeak"}}
    >
      {children}
    </RainbowKitProvider>
  );
}
