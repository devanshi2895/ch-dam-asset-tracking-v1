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

/**
 * Initializes the Sitecore Marketplace SDK client with the XMC module.
 *
 * - SDK is initialized at most once (singleton pattern).
 * - Fetches application.context immediately after init.
 * - Exposes both `client` and `xmcClient` (same instance) for use in context.
 *
 * Must only be called from a client component or context provider.
 */
export function useMarketplaceClient(): MarketplaceClientState {
  const isInitializingRef = useRef(false);

  const [state, setState] = useState<MarketplaceClientState>({
    client: null,
    xmcClient: null,
    appContext: null,
    error: null,
    isLoading: false,
    isInitialized: false,
  });

  const initialize = useCallback(async () => {
    if (isInitializingRef.current || state.isInitialized) return;
    isInitializingRef.current = true;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const client = await getOrCreateClient();

      let appContext: ApplicationContext | null = null;
      try {
        const res = await client.query('application.context');
        appContext = (res?.data as ApplicationContext) ?? null;
      } catch (ctxErr) {
        // appContext is optional — warn but don't fail init
        console.warn('[useMarketplaceClient] Could not fetch application.context:', ctxErr);
      }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initialize();
    return () => {
      isInitializingRef.current = false;
    };
  }, [initialize]);

  return state;
}
