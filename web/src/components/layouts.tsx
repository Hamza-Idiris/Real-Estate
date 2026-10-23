import { ReactNode, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { Bell, Building2, CalendarClock, ClipboardList, FileText, Home, KeyRound, LayoutDashboard, LogOut, Menu, Receipt, Settings, ShieldCheck, Users, Wallet, Wrench, X, BarChart3, History, UserCircle, Search, ScrollText } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '@/lib/auth';
import { useApi } from '@/lib/hooks';
import { Spinner, Select } from './ui';

export const Logo = ({ light }: { light?: boolean }) => (
  <Link to="/" className={clsx('flex items-center gap-2 text-lg font-semibold tracking-tight', light ? 'text-white' : 'text-navy')} aria-label="EstateFlow home">
    <span className="grid h-8 w-8 place-items-center rounded-lg bg-emerald text-white"><Building2 className="h-4 w-4" aria-hidden /></span>EstateFlow
  </Link>
);
export function Bell_({ to }: { to: string }) {
  const { data } = useApi('/notifications/unread-count', undefined, { refetchInterval: 60_000 });
  const n = data?.data?.unread ?? 0;
  return <Link to={to} className="relative rounded-ctl p-2 text-navy hover:bg-mutedbg" aria-label={`Notifications${n ? `, ${n} unread` : ''}`}>
    <Bell className="h-5 w-5" aria-hidden />{n > 0 && <span className="num absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">{n > 9 ? '9+' : n}</span>}
  </Link>;
}
const skip = <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-ctl focus:bg-white focus:px-3 focus:py-2">Skip to content</a>;

/* ---------- guards ---------- */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { user, loading } = useAuth(); const loc = useLocation();
  if (loading) return <div className="grid min-h-screen place-items-center"><Spinner /></div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  return <>{children ?? <Outlet />}</>;
}
export function RequireCompany({ children }: { children?: ReactNode }) {
  const { active } = useAuth();
  if (!active) return <Navigate to="/dashboard/new" replace />;
  return <>{children ?? <Outlet />}</>;
}
export function RequireAdmin() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
export function Can({ perm, children }: { perm: string | string[]; children: ReactNode }) {
  const { can } = useAuth(); const ps = Array.isArray(perm) ? perm : [perm];
  return ps.every(can) ? <>{children}</> : null;
}

/* ---------- Public ---------- */
export function PublicLayout() {
  const { user, logout, memberships, isAdmin } = useAuth(); const [open, setOpen] = useState(false);
  const { data: ten } = useApi(user ? '/me/tenancies' : null);
  const isTenant = (ten?.data ?? []).some((t: any) => ['active', 'pending'].includes(t.status));
  const links = [{ to: '/properties', label: 'Browse properties' }, { to: '/properties?transaction=rent', label: 'Rent' }, { to: '/properties?transaction=sale', label: 'Buy' }];
  return <div className="flex min-h-screen flex-col">{skip}
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">{links.map((l) => <Link key={l.to} to={l.to} className="rounded-ctl px-3 py-2 text-sm text-navy hover:bg-mutedbg">{l.label}</Link>)}</nav>
        <div className="hidden items-center gap-1 md:flex">
          {user ? <>
            <Bell_ to="/notifications" />
            {isAdmin && <Link className="btn-ghost" to="/admin">Platform</Link>}
            {memberships.length > 0 && <Link className="btn-ghost" to="/dashboard">Dashboard</Link>}
            {isTenant && <Link className="btn-ghost" to="/tenant">Tenant portal</Link>}
            <Link className="btn-ghost" to="/account"><UserCircle className="h-4 w-4" aria-hidden />{user.name.split(' ')[0]}</Link>
            <button className="btn-ghost" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" aria-hidden /></button>
          </> : <><Link className="btn-ghost" to="/login">Sign in</Link><Link className="btn-primary" to="/register">Create account</Link></>}
        </div>
        <button className="rounded-ctl p-2 md:hidden" aria-expanded={open} aria-controls="mobile-menu" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</button>
      </div>
      {open && <nav id="mobile-menu" aria-label="Mobile" className="fade-in border-t border-line bg-bg px-4 py-3 md:hidden" onClick={() => setOpen(false)}>
        <div className="flex flex-col gap-1">{links.map((l) => <Link key={l.to} to={l.to} className="rounded-ctl px-3 py-3 text-navy hover:bg-mutedbg">{l.label}</Link>)}
          {user ? <>
            <Link to="/account" className="rounded-ctl px-3 py-3 hover:bg-mutedbg">My account</Link><Link to="/notifications" className="rounded-ctl px-3 py-3 hover:bg-mutedbg">Notifications</Link>
            {memberships.length > 0 && <Link to="/dashboard" className="rounded-ctl px-3 py-3 hover:bg-mutedbg">Dashboard</Link>}{isTenant && <Link to="/tenant" className="rounded-ctl px-3 py-3 hover:bg-mutedbg">Tenant portal</Link>}
            {isAdmin && <Link to="/admin" className="rounded-ctl px-3 py-3 hover:bg-mutedbg">Platform admin</Link>}
            <button className="rounded-ctl px-3 py-3 text-left hover:bg-mutedbg" onClick={logout}>Sign out</button></>
            : <><Link to="/login" className="rounded-ctl px-3 py-3 hover:bg-mutedbg">Sign in</Link><Link to="/register" className="btn-primary mt-1">Create account</Link></>}
        </div></nav>}
    </header>
    <main id="main" className="flex-1"><Outlet /></main>
    <footer className="mt-16 bg-navy text-white/80"><div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 md:grid-cols-4">
      <div><Logo light /><p className="mt-3 text-sm">Property search, viewings and rental management in one place.</p></div>
      <div><p className="mb-2 text-sm font-semibold text-white">Explore</p><ul className="space-y-1.5 text-sm"><li><Link to="/properties?transaction=rent">Properties to rent</Link></li><li><Link to="/properties?transaction=sale">Properties for sale</Link></li></ul></div>
      <div><p className="mb-2 text-sm font-semibold text-white">For owners</p><ul className="space-y-1.5 text-sm"><li><Link to="/register">List your properties</Link></li><li><Link to="/dashboard/new">Register a company</Link></li></ul></div>
      <div><p className="mb-2 text-sm font-semibold text-white">Support</p><ul className="space-y-1.5 text-sm"><li><Link to="/legal/privacy">Privacy</Link></li><li><Link to="/legal/terms">Terms</Link></li><li><Link to="/legal/support">Contact &amp; support</Link></li></ul></div>
    </div><div className="border-t border-white/10 py-4 text-center text-xs">© {new Date().getFullYear()} EstateFlow · Payments shown in this product are simulated.</div></footer>
  </div>;
}

/* ---------- Sidebar shell used by dashboard / tenant / admin ---------- */
type NavItem = { to: string; label: string; icon: any; end?: boolean; show?: boolean };
function Shell({ title, items, bell, header }: { title: string; items: NavItem[]; bell: string; header?: ReactNode }) {
  const { user, logout } = useAuth(); const [open, setOpen] = useState(false);
  const nav = <nav aria-label={`${title} navigation`} className="flex flex-col gap-0.5 p-3" onClick={() => setOpen(false)}>
    {items.filter((i) => i.show !== false).map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => clsx('flex items-center gap-3 rounded-ctl px-3 py-2 text-sm font-medium', isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white')}><i.icon className="h-4 w-4" aria-hidden />{i.label}</NavLink>)}</nav>;
  return <div className="min-h-screen lg:grid lg:grid-cols-[240px_1fr]">{skip}
    <aside className="hidden bg-navy lg:block"><div className="sticky top-0 flex h-screen flex-col"><div className="p-4"><Logo light /></div><div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="border-t border-white/10 p-3 text-xs text-white/60"><p className="truncate">{user?.name}</p><Link to="/" className="mt-1 block hover:text-white">← Public site</Link></div></div></aside>
    {open && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} /><aside className="fade-in absolute inset-y-0 left-0 w-64 overflow-y-auto bg-navy"><div className="flex items-center justify-between p-4"><Logo light /><button aria-label="Close menu" onClick={() => setOpen(false)} className="text-white"><X className="h-5 w-5" /></button></div>{nav}</aside></div>}
    <div className="min-w-0">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-bg/90 px-4 backdrop-blur">
        <button className="rounded-ctl p-2 lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}><Menu className="h-5 w-5" /></button>
        <div className="flex-1">{header}</div>
        <div className="flex items-center gap-1"><Bell_ to={bell} /><button className="btn-ghost" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" aria-hidden /></button></div>
      </header>
      <main id="main" className="mx-auto max-w-7xl p-4 sm:p-6"><Outlet /></main>
    </div></div>;
}
export function DashboardLayout() {
  const { can, memberships, active, setActive } = useAuth();
  const items: NavItem[] = [
    { to: '/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
    { to: '/dashboard/properties', label: 'Properties', icon: Building2, show: can('property.read') },
    { to: '/dashboard/bookings', label: 'Viewings', icon: CalendarClock, show: can('booking.manage') },
    { to: '/dashboard/applications', label: 'Applications', icon: ClipboardList, show: can('application.review') },
    { to: '/dashboard/tenancies', label: 'Leases & tenants', icon: KeyRound, show: can('tenant.read') },
    { to: '/dashboard/invoices', label: 'Invoices & payments', icon: Receipt, show: can('invoice.read') },
    { to: '/dashboard/expenses', label: 'Expenses', icon: Wallet, show: can('expense.read') },
    { to: '/dashboard/maintenance', label: 'Maintenance', icon: Wrench, show: can('maintenance.read') },
    { to: '/dashboard/reports', label: 'Reports', icon: BarChart3, show: can('report.read') },
    { to: '/dashboard/staff', label: 'Staff & access', icon: Users, show: can('staff.manage') },
    { to: '/dashboard/activity', label: 'Audit log', icon: History, show: can('audit.read') },
    { to: '/dashboard/settings', label: 'Company settings', icon: Settings, show: can('company.update') },
  ];
  return <Shell title="Dashboard" items={items} bell="/notifications" header={memberships.length > 1
    ? <Select aria-label="Active company" className="h-9 max-w-[16rem]" value={active?.companyId} onChange={(e) => setActive(e.target.value)}>{memberships.map((m) => <option key={m.companyId} value={m.companyId}>{m.company.name}</option>)}</Select>
    : <span className="text-sm font-medium text-navy">{active?.company.name}</span>} />;
}
export const TenantLayout = () => <Shell title="Tenant" bell="/notifications" header={<span className="text-sm font-medium text-navy">Tenant portal</span>} items={[
  { to: '/tenant', label: 'Home', icon: Home, end: true }, { to: '/tenant/invoices', label: 'Rent & invoices', icon: Receipt }, { to: '/tenant/lease', label: 'My lease', icon: FileText },
  { to: '/tenant/maintenance', label: 'Maintenance', icon: Wrench }, { to: '/notifications', label: 'Notifications', icon: Bell },
]} />;
export const AdminLayout = () => <Shell title="Platform" bell="/notifications" header={<span className="text-sm font-medium text-navy">Platform administration</span>} items={[
  { to: '/admin', label: 'Overview', icon: ShieldCheck, end: true }, { to: '/admin/companies', label: 'Companies', icon: Building2 }, { to: '/admin/users', label: 'Users', icon: Users },
]} />;
export const AccountLayout = () => <div className="mx-auto max-w-5xl px-4 py-8"><Outlet /></div>;
export const Icons = { Search, ScrollText };
