import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './components/ui';
import { ApiError } from './lib/api';

const qc = new QueryClient({ defaultOptions: { queries: {
  staleTime: 15_000, refetchOnWindowFocus: true,
  retry: (n, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && n < 2, // retry only network/5xx
} } });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={qc}><BrowserRouter><ToastProvider><AuthProvider><App /></AuthProvider></ToastProvider></BrowserRouter></QueryClientProvider></React.StrictMode>);
