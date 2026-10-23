import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { passwordSchema } from '../src/modules/auth/routes';
import { objectId } from '../src/utils/http';
import { minorSchema, positiveMinorSchema } from '../src/utils/money';

describe('input validation', () => {
  it('password policy', () => {
    expect(passwordSchema.safeParse('short1A').success).toBe(false);
    expect(passwordSchema.safeParse('alllowercase123').success).toBe(false);
    expect(passwordSchema.safeParse('GoodPassw0rdHere').success).toBe(true);
  });
  it('object ids reject NoSQL operator payloads and junk', () => {
    expect(objectId.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(objectId.safeParse({ $ne: null } as any).success).toBe(false);
    expect(objectId.safeParse('abc').success).toBe(false);
  });
  it('strings reject operator objects (NoSQL injection)', () => {
    const email = z.string().email();
    expect(email.safeParse({ $gt: '' } as any).success).toBe(false);
  });
  it('money is integer minor units only', () => {
    expect(minorSchema.safeParse(10.5).success).toBe(false);
    expect(minorSchema.safeParse(-1).success).toBe(false);
    expect(positiveMinorSchema.safeParse(0).success).toBe(false);
    expect(positiveMinorSchema.safeParse(2500).success).toBe(true);
  });
  it('strict schemas block mass assignment', () => {
    const s = z.object({ name: z.string() }).strict();
    expect(s.safeParse({ name: 'x', role: 'owner', companyId: 'abc' }).success).toBe(false);
  });
});
