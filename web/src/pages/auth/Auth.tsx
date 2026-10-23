import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/lib/auth';
import { errMsg } from '@/lib/api';
import { Button, Field, Input, Notice } from '@/components/ui';
import { Logo } from '@/components/layouts';

const Shell = ({ title, sub, children }: any) => <div className="grid min-h-screen place-items-center bg-bg px-4 py-10"><main id="main" className="w-full max-w-md"><div className="mb-6 flex justify-center"><Logo /></div>
  <div className="card p-6 sm:p-8"><h1 className="text-xl font-semibold">{title}</h1><p className="mb-6 mt-1 text-sm text-muted">{sub}</p>{children}</div></main></div>;

const loginSchema = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') });
export function Login() {
  const { user, login, isAdmin, memberships } = useAuth(); const nav = useNavigate(); const loc: any = useLocation(); const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  if (user) return <Navigate to={loc.state?.from ?? (isAdmin ? '/admin' : memberships.length ? '/dashboard' : '/account')} replace />;
  return <Shell title="Welcome back" sub="Sign in to manage viewings, applications and your tenancy.">
    <form noValidate onSubmit={handleSubmit(async (v) => { setErr(''); try { await login(v.email, v.password); nav(loc.state?.from ?? '/account', { replace: true }); } catch (e) { setErr(errMsg(e)); } })} className="space-y-4">
      {err && <Notice tone="danger">{err}</Notice>}
      <Field label="Email" error={errors.email?.message}>{(a) => <Input {...a} type="email" autoComplete="email" {...register('email')} />}</Field>
      <Field label="Password" error={errors.password?.message}>{(a) => <Input {...a} type="password" autoComplete="current-password" {...register('password')} />}</Field>
      <Button type="submit" loading={isSubmitting} className="w-full">Sign in</Button>
    </form><p className="mt-5 text-center text-sm text-muted">New here? <Link to="/register" className="font-medium text-emerald-text hover:underline">Create an account</Link></p></Shell>;
}
const regSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name'), email: z.string().email('Enter a valid email'), phone: z.string().optional(),
  password: z.string().min(10, 'Use at least 10 characters').refine((p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p), 'Use upper and lower case letters and a number'),
});
export function Register() {
  const { user, register: signUp } = useAuth(); const nav = useNavigate(); const loc: any = useLocation(); const [err, setErr] = useState('');
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof regSchema>>({ resolver: zodResolver(regSchema) });
  if (user) return <Navigate to="/account" replace />;
  return <Shell title="Create your account" sub="Book viewings, apply for rentals and track everything in one place.">
    <form noValidate onSubmit={handleSubmit(async (v) => { setErr(''); try { await signUp({ ...v, phone: v.phone || undefined }); nav(loc.state?.from ?? '/account', { replace: true }); } catch (e) { setErr(errMsg(e)); } })} className="space-y-4">
      {err && <Notice tone="danger">{err}</Notice>}
      <Field label="Full name" error={errors.name?.message}>{(a) => <Input {...a} autoComplete="name" {...register('name')} />}</Field>
      <Field label="Email" error={errors.email?.message}>{(a) => <Input {...a} type="email" autoComplete="email" {...register('email')} />}</Field>
      <Field label="Phone (optional)">{(a) => <Input {...a} type="tel" autoComplete="tel" {...register('phone')} />}</Field>
      <Field label="Password" error={errors.password?.message} hint="At least 10 characters with upper case, lower case and a number.">{(a) => <Input {...a} type="password" autoComplete="new-password" {...register('password')} />}</Field>
      <Button type="submit" loading={isSubmitting} className="w-full">Create account</Button>
    </form><p className="mt-5 text-center text-sm text-muted">Already registered? <Link to="/login" className="font-medium text-emerald-text hover:underline">Sign in</Link></p></Shell>;
}
export function Legal({ kind }: { kind: 'privacy' | 'terms' | 'support' }) {
  const c = {
    privacy: ['Privacy', ['EstateFlow collects only the information needed for viewings, applications and tenancies: your name, contact details and what you submit in forms.', 'Application and tenancy data is visible only to the property company you applied to and your own account. Listings never show tenant or owner personal details.', 'You can view your personal data from your account (data export) and ask the company or platform to correct it.', 'This page is a template — replace it with your organisation’s legal text before launch.']],
    terms: ['Terms of use', ['A viewing request is not a reservation and a rental application is not a lease. A tenancy begins only when a lease is accepted by both parties and activated by the company.', 'All payments shown in this product are simulated. No real money is transferred and no receipt is a proof of real-world payment.', 'This page is a template — replace it with your organisation’s legal text before launch.']],
    support: ['Contact & support', ['For help with a listing, contact the listing company through a viewing request. For platform issues, contact your platform administrator.', 'Emergency maintenance reports in the tenant portal do not replace emergency services and do not guarantee an immediate human response. If anyone is in danger, call your local emergency number.', 'Replace this page with your real support contacts before launch.']],
  }[kind];
  return <div className="mx-auto max-w-2xl px-4 py-12"><h1 className="mb-4 text-3xl font-semibold">{c[0] as string}</h1><div className="space-y-3 text-sm leading-relaxed">{(c[1] as string[]).map((t) => <p key={t}>{t}</p>)}</div></div>;
}
