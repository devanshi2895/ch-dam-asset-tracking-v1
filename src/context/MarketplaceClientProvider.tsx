'use client';

import React, { createContext, useContext } from 'react';
import {
  useMarketplaceClient,
  type MarketplaceClientState,
} from '@/src/hooks/useMarketplaceClient';

const MarketplaceClientContext = createContext<MarketplaceClientState | null>(
  null
);

/**
 * Initializes the Sitecore Marketplace SDK once at the app boundary and
 * provides the client state to all child components via context.
 *
 * Best practice: wrap at layout level — never initialize per component.
 */
export function MarketplaceClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientState = useMarketplaceClient();

  return (
    <MarketplaceClientContext.Provider value={clientState}>
      {children}
    </MarketplaceClientContext.Provider>
  );
}

/**
 * Consumes the Marketplace SDK client context.
 * Must be rendered within a <MarketplaceClientProvider>.
 */
export function useMarketplaceClientContext(): MarketplaceClientState {
  const ctx = useContext(MarketplaceClientContext);
  if (!ctx) {
    throw new Error(
      'useMarketplaceClientContext must be used within <MarketplaceClientProvider>'
    );
  }
  return ctx;
}
