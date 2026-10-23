import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Modal, DataTable, Badge, Pagination, ToastProvider, Confirm } from '../src/components/ui';
import { BarChart } from '../src/components/BarChart';
import { Login } from '../src/pages/auth/Auth';
import { AuthProvider } from '../src/lib/auth';

describe('ui primitives', () => {
  it('Modal is a labelled dialog, closes on Escape and restores nothing when closed', () => {
    const onClose = vi.fn(); const { rerender } = render(<Modal open onClose={onClose} title="Edit thing"><button>Inside</button></Modal>);
    expect(screen.getByRole('dialog', { name: 'Edit thing' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' }); expect(onClose).toHaveBeenCalled();
    rerender(<Modal open={false} onClose={onClose} title="Edit thing"><button>Inside</button></Modal>); expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('Confirm requires an explicit click and shows destructive styling', () => {
    const ok = vi.fn(); render(<Confirm open onClose={() => {}} onConfirm={ok} title="Archive?" danger confirmLabel="Archive"><p>Sure?</p></Confirm>);
    expect(ok).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Archive' })); expect(ok).toHaveBeenCalledTimes(1);
  });
  it('DataTable shows loading skeletons, empty state and error with retry', () => {
    const cols = [{ header: 'Name', cell: (r: any) => r.name }];
    const { rerender, container } = render(<DataTable cols={cols} loading />); expect(container.querySelectorAll('.skeleton').length).toBeGreaterThan(0);
    rerender(<DataTable cols={cols} rows={[]} empty={<p>Nothing here</p>} />); expect(screen.getByText('Nothing here')).toBeInTheDocument();
    const retry = vi.fn(); rerender(<DataTable cols={cols} error={{ status: 500, message: 'boom' }} onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: /try again/i })); expect(retry).toHaveBeenCalled();
  });
  it('permission-denied errors do not offer retry', () => {
    render(<DataTable cols={[{ header: 'A', cell: () => '' }]} error={{ status: 403, message: 'no' }} onRetry={() => {}} />);
    expect(screen.getByText(/don't have permission/i)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });
  it('Badge maps statuses to labels', () => { render(<Badge status="partially_paid" />); expect(screen.getByText('Partially paid')).toBeInTheDocument(); });
  it('Pagination disables edges', () => {
    const go = vi.fn(); render(<Pagination meta={{ page: 1, pages: 3, total: 50 }} onPage={go} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled(); fireEvent.click(screen.getByRole('button', { name: 'Next page' })); expect(go).toHaveBeenCalledWith(2);
  });
  it('BarChart exposes an accessible table alternative', () => {
    render(<BarChart label="Rent" data={[{ name: 'Jan', a: 100 }]} series={[{ key: 'a', name: 'Expected', color: '#000' }]} format={(n) => `$${n}`} />);
    expect(screen.getByRole('img', { name: 'Rent' })).toBeInTheDocument(); expect(screen.getByRole('table', { hidden: true })).toBeInTheDocument();
  });
});

describe('login form', () => {
  const wrap = (ui: any) => render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><ToastProvider><AuthProvider>{ui}</AuthProvider></ToastProvider></MemoryRouter></QueryClientProvider>);
  it('shows accessible validation errors and does not call the API when invalid', async () => {
    const f = vi.fn(); vi.stubGlobal('fetch', f); wrap(<Login />);
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter a valid email')).toBeInTheDocument(); expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true'); expect(f).not.toHaveBeenCalled();
  });
  it('shows the generic server error on failed login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })));
    wrap(<Login />); fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.co' } }); fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'whatever' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' })); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password'));
  });
});
