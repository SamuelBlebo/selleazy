import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { trackPageView } from '@/utils/analyticsTracking';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import { OnboardingRoute, ProtectedRoute, PublicOnlyRoute, RequirePlatformAdmin } from '@/components/routing/ProtectedRoute';
import { FullPageSpinner } from '@/components/ui';
import { AuthLayout } from '@/layouts/AuthLayout';
import { DashboardLayout, MorePage } from '@/layouts/DashboardLayout';
import { MarketingLayout } from '@/layouts/MarketingLayout';
import { LoginPage } from '@/pages/auth/LoginPage';
import { OnboardingPage } from '@/pages/auth/OnboardingPage';
import { SignupPage } from '@/pages/auth/SignupPage';
import { CatalogPage } from '@/pages/CatalogPage';
import { ChatsPage } from '@/pages/ChatsPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { KitchenPage } from '@/pages/KitchenPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { OrdersPage } from '@/pages/OrdersPage';
import { PaymentsPage } from '@/pages/PaymentsPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { TodayPage } from '@/pages/TodayPage';
import { FaqPage } from '@/pages/marketing/FaqPage';
import { HelpCenterPage } from '@/pages/marketing/HelpCenterPage';
import { LandingPage } from '@/pages/marketing/LandingPage';
import { PricingPage } from '@/pages/marketing/PricingPage';
import { PrivacyPolicyPage } from '@/pages/marketing/PrivacyPolicyPage';
import { TermsOfServicePage } from '@/pages/marketing/TermsOfServicePage';

// Platform admin is a separate, low-traffic tool for SellEazy staff; keep it out of merchants' bundle.
const AdminLayout = lazy(() => import('@/layouts/AdminLayout').then((m) => ({ default: m.AdminLayout })));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminMerchantsPage = lazy(() => import('@/pages/admin/AdminMerchantsPage').then((m) => ({ default: m.AdminMerchantsPage })));
const AdminLogsPage = lazy(() => import('@/pages/admin/AdminLogsPage').then((m) => ({ default: m.AdminLogsPage })));
const AdminFeatureFlagsPage = lazy(() => import('@/pages/admin/AdminFeatureFlagsPage').then((m) => ({ default: m.AdminFeatureFlagsPage })));

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    void trackPageView(location.pathname);
  }, [location.pathname]);
  return null;
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <RouteTracker />
          <Routes>
            <Route element={<MarketingLayout />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/help" element={<HelpCenterPage />} />
              <Route path="/privacy" element={<PrivacyPolicyPage />} />
              <Route path="/terms" element={<TermsOfServicePage />} />
            </Route>

            <Route element={<PublicOnlyRoute />}>
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
              </Route>
            </Route>

            <Route element={<OnboardingRoute />}>
              <Route element={<AuthLayout />}>
                <Route path="/onboarding" element={<OnboardingPage />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<DashboardLayout />}>
                <Route path="/today" element={<TodayPage />} />
                <Route path="/chats" element={<ChatsPage />} />
                <Route path="/chats/:waId" element={<ChatsPage />} />
                <Route path="/orders" element={<OrdersPage />} />
                <Route path="/payments" element={<PaymentsPage />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/customers" element={<CustomersPage />} />
                <Route path="/kitchen" element={<KitchenPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/:tab" element={<SettingsPage />} />
                <Route path="/more" element={<MorePage />} />
                <Route path="/dashboard" element={<Navigate to="/today" replace />} />
              </Route>
            </Route>

            <Route element={<RequirePlatformAdmin />}>
              <Route element={<Suspense fallback={<FullPageSpinner />}><AdminLayout /></Suspense>}>
                <Route path="/admin" element={<AdminDashboardPage />} />
                <Route path="/admin/merchants" element={<AdminMerchantsPage />} />
                <Route path="/admin/logs" element={<AdminLogsPage />} />
                <Route path="/admin/flags" element={<AdminFeatureFlagsPage />} />
              </Route>
            </Route>

            <Route path="/404" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/404" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ToastProvider>
  );
}
