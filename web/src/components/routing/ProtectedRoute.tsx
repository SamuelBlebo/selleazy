import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { FullPageSpinner } from '@/components/ui';

/** Requires a signed-in user with a tenant. Everything below it can assume org exists. */
export function ProtectedRoute() {
  const { user, profile, org, isPlatformAdmin, initialising } = useAuth();
  const location = useLocation();

  if (initialising) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!profile) {
    // Platform admins have no /users profile at all — they were never a
    // merchant signup, so onboarding (which assumes one) is the wrong place.
    return <Navigate to={isPlatformAdmin ? '/admin' : '/onboarding'} replace />;
  }
  if (!org) return <FullPageSpinner />;

  return <Outlet />;
}

/** Keeps signed-in merchants (and admins) out of the login and signup screens. */
export function PublicOnlyRoute() {
  const { user, profile, isPlatformAdmin, initialising } = useAuth();
  if (initialising) return <FullPageSpinner />;
  if (user && isPlatformAdmin) return <Navigate to="/admin" replace />;
  if (user && !profile?.orgId) return <Navigate to="/onboarding" replace />;
  if (user) return <Navigate to="/today" replace />;
  return <Outlet />;
}

/** Signed in but hasn't finished tenant setup yet (mid-Google-onboarding). */
export function OnboardingRoute() {
  const { user, profile, isPlatformAdmin, initialising } = useAuth();
  if (initialising) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (isPlatformAdmin) return <Navigate to="/admin" replace />;
  // A new business goes on to the setup wizard (staff are sent on to /today from there).
  if (profile?.orgId) return <Navigate to="/setup" replace />;
  return <Outlet />;
}

/**
 * OrderFlow staff, not a merchant — a completely separate grant from org
 * membership (see firestore.rules' isPlatformAdmin()). A platform admin may
 * have no organization at all, so this never touches `profile`/`org`.
 */
export function RequirePlatformAdmin() {
  const { user, isPlatformAdmin, initialising } = useAuth();
  const location = useLocation();
  if (initialising) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isPlatformAdmin) return <Navigate to="/today" replace />;
  return <Outlet />;
}
