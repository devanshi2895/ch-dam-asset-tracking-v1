import { MarketplaceClientProvider } from '@/src/context/MarketplaceClientProvider';
import { TenantProvider } from '@/src/context/TenantContext';

/**
 * Layout for the standalone extension.
 * Wraps the page with SDK and tenant context providers so both are available
 * to every component in this route without re-initialization.
 */
export default function StandaloneExtensionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MarketplaceClientProvider>
      <TenantProvider>{children}</TenantProvider>
    </MarketplaceClientProvider>
  );
}
