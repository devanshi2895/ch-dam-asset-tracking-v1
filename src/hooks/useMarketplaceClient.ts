import { ClientSDK } from '@sitecore-marketplace-sdk/client';
import { XMC } from '@sitecore-marketplace-sdk/xmc';
import { useEffect, useState, useCallback, useRef } from 'react';
import type { ApplicationContext } from '@sitecore-marketplace-sdk/client';

export interface MarketplaceClientState {
  client: ClientSDK | null;
  /** Same ClientSDK instance — typed alias for XMC-specific operations */
  xmcClient: ClientSDK | null;
  appContext: ApplicationContext | null;
  error: Error | null;
  isLoading: boolean;
  isInitialized: boolean;
}

/** Singleton client — initialized once per browser session */
let _client: ClientSDK | undefined;

async function getOrCreateClient(): Promise<ClientSDK> {
  if (_client) return _client;
  _client = await ClientSDK.init({
    target: window.parent,
    modules: [XMC],
  });
  return _client;
}

export function useMarketplaceClient(): MarketplaceClientState {
  const isInitializingRef = useRef(false);
  const isInitializedRef = useRef(false);

  const [state, setState] = useState<MarketplaceClientState>({
    client: null,
    xmcClient: null,
    appContext: null,
    error: null,
    isLoading: false,
    isInitialized: false,
  });

  const initialize = useCallback(async () => {
    if (isInitializingRef.current || isInitializedRef.current) return;
    isInitializingRef.current = true;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const client = await getOrCreateClient();

      let appContext: ApplicationContext | null = null;
      try {
        const res = await client.query('application.context');
        appContext = (res?.data as ApplicationContext) ?? null;
      } catch (ctxErr) {
        console.warn('[useMarketplaceClient] Could not fetch application.context:', ctxErr);
      }

      isInitializedRef.current = true;
      setState({
        client,
        xmcClient: client,
        appContext,
        error: null,
        isLoading: false,
        isInitialized: true,
      });
    } catch (err) {
      setState({
        client: null,
        xmcClient: null,
        appContext: null,
        error: err instanceof Error ? err : new Error('Marketplace SDK init failed'),
        isLoading: false,
        isInitialized: false,
      });
    } finally {
      isInitializingRef.current = false;
    }
  }, []);

  useEffect(() => {
    initialize();
    return () => {
      isInitializingRef.current = false;
    };
  }, [initialize]);

  return state;
}
