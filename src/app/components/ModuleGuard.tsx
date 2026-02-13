/**
 * ModuleGuard Component
 * Protects routes that are only available for specific organization types/modules
 * Redirects to /dashboard if module is not enabled
 * 
 * Usage:
 *   <Route path="properties" element={
 *     <ModuleGuard module="catalog">
 *       <Properties />
 *     </ModuleGuard>
 *   } />
 */

import { Navigate } from 'react-router-dom';
import { useTenantConfig } from '../context/TenantConfigContext';

interface ModuleGuardProps {
  module: string;
  children: React.ReactNode;
  fallbackRoute?: string;
}

/**
 * Component that checks if a module is enabled before rendering
 * If module is not enabled, redirects to fallback route (default: /dashboard)
 */
export function ModuleGuard({
  module,
  children,
  fallbackRoute = '/dashboard'
}: ModuleGuardProps) {
  const { isModuleEnabled } = useTenantConfig();

  // If module is not enabled, redirect to dashboard or specified fallback
  if (!isModuleEnabled(module)) {
    return <Navigate to={fallbackRoute} replace />;
  }

  // Module is enabled, render the children
  return <>{children}</>;
}

export default ModuleGuard;
