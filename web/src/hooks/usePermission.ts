import { can, type Permission } from '@/config/permissions';
import { vocabulary } from '@/config/business';
import { useAuth } from './useAuth';

export function usePermission(p: Permission): boolean {
  const { profile } = useAuth();
  return can(profile?.role, p);
}

/** The signed-in org with non-null guarantees, for pages under the dashboard layout. */
export function useOrg() {
  const { org, profile } = useAuth();
  if (!org || !profile?.role) throw new Error('useOrg used outside the dashboard');
  return { org, role: profile.role, words: vocabulary(org.businessType, org.category) };
}
