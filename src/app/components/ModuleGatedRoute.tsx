/**
 * ModuleGatedRoute Component
 * Protects routes that are only available for specific organization types/modules
 * 
 * Usage:
 *   <ModuleGatedRoute module="catalog" element={<Properties />} />
 */

import { Navigate } from 'react-router-dom';
import { useOrganization } from '../hooks/useOrganization';

interface ModuleGatedRouteProps {
  module: string;
  element: React.ReactNode;
  fallbackRoute?: string;
}

/**
 * Route wrapper that checks if a module is enabled before rendering
 * If module is not enabled, redirects to fallback route (default: /dashboard)
 */
export function ModuleGatedRoute({
  module,
  element,
  fallbackRoute = '/dashboard'
}: ModuleGatedRouteProps) {
  const { isModuleEnabled } = useOrganization();

  // If module is not enabled, redirect to dashboard or specified fallback
  if (!isModuleEnabled(module)) {
    return <Navigate to={fallbackRoute} replace />;
  }

  // Module is enabled, render the component
  return element as React.ReactElement;
}

export default ModuleGatedRoute;
