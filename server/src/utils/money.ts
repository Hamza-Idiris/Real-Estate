import { z } from 'zod';
/**
 * Money is stored as INTEGER MINOR UNITS (cents) + an explicit ISO-4217 currency code.
 * All supported currencies below use 2 decimal places. Zero-decimal currencies (e.g. JPY) are not supported.
 */
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'KES', 'ETB', 'AED', 'SOS'] as const;
export type Currency = (typeof CURRENCIES)[number];
export const currencySchema = z.enum(CURRENCIES);
export const minorSchema = z.number().int().min(0).max(100_000_000_00);
export const positiveMinorSchema = minorSchema.refine((n) => n > 0, 'Must be greater than zero');
export const toMinor = (major: number) => Math.round(major * 100);
export const formatMinor = (minor: number, currency: string) =>
  `${currency} ${(minor / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
