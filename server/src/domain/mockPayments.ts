/**
 * MOCK payment provider. Nothing here talks to a bank, card network or mobile-money operator.
 * To integrate a real provider later, implement PaymentProvider and swap `paymentProvider` in payments/service.ts.
 */
export type MockScenario = 'success' | 'failure' | 'pending';
export type ProviderOutcome = 'succeeded' | 'failed' | 'pending';
export interface PaymentProvider {
  readonly environment: 'MOCK' | 'LIVE';
  newReference(): string;
  /** Resolves an attempt. Called by the BACKEND only; the client never supplies the outcome. */
  resolve(attempt: { scenario: MockScenario; status: string }): ProviderOutcome;
}
export const mockProvider: PaymentProvider = {
  environment: 'MOCK',
  newReference: () => `MOCK-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
  resolve(a) {
    if (a.scenario === 'failure') return 'failed';
    if (a.scenario === 'pending') return a.status === 'pending' ? 'succeeded' : 'pending'; // pending first, settles on the next completion call
    return 'succeeded';
  },
};
export const MOCK_NOTICE = 'Demo payment — no real money transferred';
