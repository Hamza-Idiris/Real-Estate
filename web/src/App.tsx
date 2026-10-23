import { lazy, Suspense } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import { AccountLayout, AdminLayout, DashboardLayout, PublicLayout, RequireAdmin, RequireAuth, RequireCompany, TenantLayout } from '@/components/layouts';
import { Spinner } from '@/components/ui';
import Home from '@/pages/public/Home';
import { Login, Register, Legal } from '@/pages/auth/Auth';

// Route-level code splitting: marketplace/auth load eagerly; workspaces load on demand.
const Search = lazy(() => import('@/pages/public/Search'));
const PropertyDetail = lazy(() => import('@/pages/public/PropertyDetail'));
const Account = lazy(() => import('@/pages/account/Account'));
const Notifications = lazy(() => import('@/pages/account/Notifications'));
const tenant = (k: string) => lazy(() => import('@/pages/tenant/Tenant').then((m: any) => ({ default: m[k] })));
const TenantHome = tenant('TenantHome'), TenantInvoices = tenant('TenantInvoices'), TenantInvoiceDetail = tenant('TenantInvoiceDetail'), TenantLease = tenant('TenantLease'), TenantMaintenance = tenant('TenantMaintenance'), TenantMaintenanceDetail = tenant('TenantMaintenanceDetail');
const Overview = lazy(() => import('@/pages/dashboard/Overview'));
const Properties = lazy(() => import('@/pages/dashboard/Properties'));
const PropertyDetailPage = lazy(() => import('@/pages/dashboard/Properties').then((m) => ({ default: m.PropertyDetailPage })));
const Bookings = lazy(() => import('@/pages/dashboard/Bookings'));
const Applications = lazy(() => import('@/pages/dashboard/Applications'));
const Tenancies = lazy(() => import('@/pages/dashboard/Tenancies'));
const Invoices = lazy(() => import('@/pages/dashboard/Invoices'));
const Maintenance = lazy(() => import('@/pages/dashboard/Maintenance'));
const fin = (k: string) => lazy(() => import('@/pages/dashboard/Finance').then((m: any) => ({ default: m[k] })));
const Expenses = fin('Expenses'), Reports = fin('Reports');
const adm = (k: string) => lazy(() => import('@/pages/dashboard/Admin').then((m: any) => ({ default: m[k] })));
const Staff = adm('Staff'), Activity = adm('Activity'), Settings = adm('Settings'), NewCompany = adm('NewCompany'), AcceptInvite = adm('AcceptInvite');
const Platform = lazy(() => import('@/pages/dashboard/Admin').then((m) => ({ default: (p: any) => <m.PlatformAdmin {...p} /> })));

export default function App() {
  return <Suspense fallback={<div className="grid min-h-[50vh] place-items-center"><Spinner /></div>}><Routes>
    <Route path="/login" element={<Login />} /><Route path="/register" element={<Register />} />
    <Route element={<PublicLayout />}>
      <Route index element={<Home />} /><Route path="properties" element={<Search />} /><Route path="properties/:ref" element={<PropertyDetail />} />
      <Route path="legal/privacy" element={<Legal kind="privacy" />} /><Route path="legal/terms" element={<Legal kind="terms" />} /><Route path="legal/support" element={<Legal kind="support" />} />
      <Route element={<RequireAuth />}><Route element={<AccountLayout />}><Route path="account" element={<Account />} /><Route path="notifications" element={<Notifications />} /></Route></Route>
    </Route>
    <Route element={<RequireAuth />}>
      <Route path="tenant" element={<TenantLayout />}><Route index element={<TenantHome />} /><Route path="invoices" element={<TenantInvoices />} /><Route path="invoices/:id" element={<TenantInvoiceDetail />} /><Route path="lease" element={<TenantLease />} /><Route path="leases/:id" element={<TenantLease />} /><Route path="maintenance" element={<TenantMaintenance />} /><Route path="maintenance/:id" element={<TenantMaintenanceDetail />} /></Route>
      <Route path="dashboard/new" element={<NewCompany />} />
      <Route path="dashboard" element={<DashboardLayout />}><Route path="join" element={<AcceptInvite />} />
        <Route element={<RequireCompany />}>
          <Route index element={<Overview />} /><Route path="properties" element={<Properties />} /><Route path="properties/:id" element={<PropertyDetailPage />} /><Route path="bookings" element={<Bookings />} /><Route path="bookings/:id" element={<Bookings />} />
          <Route path="applications" element={<Applications />} /><Route path="applications/:id" element={<Applications />} /><Route path="tenancies" element={<Tenancies />} /><Route path="tenancies/:id" element={<Tenancies />} /><Route path="invoices" element={<Invoices />} /><Route path="invoices/:id" element={<Invoices />} />
          <Route path="expenses" element={<Expenses />} /><Route path="maintenance" element={<Maintenance />} /><Route path="maintenance/:id" element={<Maintenance />} /><Route path="reports" element={<Reports />} /><Route path="staff" element={<Staff />} /><Route path="activity" element={<Activity />} /><Route path="settings" element={<Settings />} />
        </Route></Route>
      <Route element={<RequireAdmin />}><Route path="admin" element={<AdminLayout />}><Route index element={<Platform page="stats" />} /><Route path="companies" element={<Platform page="companies" />} /><Route path="users" element={<Platform page="users" />} /></Route></Route>
    </Route>
    <Route path="*" element={<div className="grid min-h-screen place-items-center px-4 text-center"><div><h1 className="text-3xl font-semibold">Page not found</h1><p className="mt-2 text-muted">The page you are looking for does not exist.</p><a href="/" className="btn-primary mt-4">Go home</a></div></div>} />
  </Routes></Suspense>;
}
