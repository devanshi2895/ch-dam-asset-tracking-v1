'use client';

import React, { createContext, useContext, useState } from 'react';
import type { Tenant } from '@/src/lib/types';

interface TenantContextValue {
  tenants: Tenant[];
  selectedTenant: Tenant | null;
  setTenants: (tenants: Tenant[]) => void;
  setSelectedTenant: (tenant: Tenant | null) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Provides tenant selection state across the full extension.
 * selectedTenant.context.preview is used as sitecoreContextId in all queries.
 */
export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);

  return (
    <TenantContext.Provider
      value={{ tenants, selectedTenant, setTenants, setSelectedTenant }}
    >
      {children}
    </TenantContext.Provider>
  );
}

/**
 * Consumes tenant selection context.
 * Must be rendered within a <TenantProvider>.
 */
export function useTenantContext(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenantContext must be used within <TenantProvider>');
  }
  return ctx;
}
