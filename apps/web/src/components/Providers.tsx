"use client";

import {WagmiProvider} from "wagmi";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {useState} from "react";
import {wagmiConfig} from "@/lib/chain";
import {ThemeProvider} from "./theme";

export function Providers({children}: {children: React.ReactNode}) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>{children}</ThemeProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
