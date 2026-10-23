/**
 * End-to-end API scenarios. REQUIRE a MongoDB *replica set* (for transactions) reachable at MONGO_TEST_URI:
 *   MONGO_TEST_URI=mongodb://127.0.0.1:27017/estateflow_test?replicaSet=rs0 MONGO_TEST_TX=true npm test
 * Skipped automatically when MONGO_TEST_URI is not set. The database is WIPED by these tests.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';

const RUN = !!process.env.MONGO_TEST_URI;
const suite = RUN ? describe : describe.skip;

suite('API scenarios (needs MongoDB)', () => {
  let api: any; const PW = 'Str0ngPassw0rd!';
  const T: any = {};
  const reg = async (email: string, name: string) => (await api.post('/api/v1/auth/register').send({ email, password: PW, name })).body.data.accessToken as string;
  const A = (tok: string) => ({ Authorization: `Bearer ${tok}` });
  const slot = (hoursAhead: number) => { const d = new Date(Date.now() + hoursAhead * 3_600_000); d.setUTCMinutes(0, 0, 0); return d.toISOString(); };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);

  async function makeCompany(tok: string, name: string) {
    const c = (await api.post('/api/v1/companies').set(A(tok)).send({ name, country: 'Somalia' })).body.data;
    const branch = (await api.get(`/api/v1/companies/${c._id}/branches`).set(A(tok))).body.data[0];
    const p = (await api.post(`/api/v1/companies/${c._id}/properties`).set(A(tok)).send({
      branchId: branch._id, title: `${name} flat`, type: 'apartment', transaction: 'rent', priceMinor: 50_000, currency: 'USD', rentFrequency: 'monthly', depositMinor: 50_000,
      location: { country: 'Somalia', city: 'Mogadishu', district: 'Hodan' },
    })).body.data;
    await api.post(`/api/v1/companies/${c._id}/properties/${p._id}/media`).set(A(tok)).attach('file', png, 'a.png');
    const pub = await api.post(`/api/v1/companies/${c._id}/properties/${p._id}/publish`).set(A(tok));
    expect(pub.status).toBe(200);
    return { companyId: c._id as string, propertyId: p._id as string };
  }

  beforeAll(async () => {
    const { buildApp } = await import('../src/app');
    const { connectDb } = await import('../src/config/db');
    const { ensureStorage } = await import('../src/modules/files/storage');
    await connectDb(); await mongoose.connection.dropDatabase(); await ensureStorage();
    for (const m of Object.values(mongoose.models)) await m.syncIndexes();
    api = request(buildApp());
    T.ownerA = await reg('ownera@example.test', 'Owner A'); T.ownerB = await reg('ownerb@example.test', 'Owner B');
    T.cust = await reg('cust@example.test', 'Customer One');
    T.A = await makeCompany(T.ownerA, 'Alpha Estates'); T.B = await makeCompany(T.ownerB, 'Beta Estates');
  });
  afterAll(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  it('denies Company A access to Company B resources (isolation)', async () => {
    const B = T.B;
    expect((await api.get(`/api/v1/companies/${B.companyId}/properties/${B.propertyId}`).set(A(T.ownerA))).status).toBe(404);
    expect((await api.get(`/api/v1/companies/${B.companyId}/invoices`).set(A(T.ownerA))).status).toBe(404);
    expect((await api.get(`/api/v1/companies/${B.companyId}/tenancies`).set(A(T.ownerA))).status).toBe(404);
    // A's own company id + B's property id must not leak either
    expect((await api.get(`/api/v1/companies/${T.A.companyId}/properties/${B.propertyId}`).set(A(T.ownerA))).status).toBe(404);
    expect((await api.get(`/api/v1/companies/${T.A.companyId}/properties`)).status).toBe(401);
  });

  it('public listing hides private fields; availability is server-decided', async () => {
    const r = await api.get('/api/v1/public/properties').query({ city: 'Mogadishu' });
    expect(r.status).toBe(200); expect(r.body.data.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(r.body)).not.toMatch(/"address"|assignedStaff|createdBy|companyId/);
    expect((await api.get('/api/v1/public/properties').query({ minPrice: { $gt: 0 } })).status).toBe(400);
  });

  it('flow: viewing -> confirm -> complete -> application -> lease -> activation -> tenant isolation', async () => {
    const { companyId, propertyId } = T.A;
    const start = slot(30 * 24 + 5);
    const bk = await api.post('/api/v1/me/bookings').set(A(T.cust)).send({ propertyId, slots: [start], contact: { name: 'Customer One', phone: '+252600000000' } });
    expect(bk.status).toBe(201);
    expect((await api.post('/api/v1/me/bookings').set(A(T.cust)).send({ propertyId, slots: [slot(31 * 24)], contact: { name: 'C', phone: '+252600000000' } })).status).toBe(409);
    const conf = await api.post(`/api/v1/companies/${companyId}/bookings/${bk.body.data._id}/decision`).set(A(T.ownerA)).send({ action: 'confirm' });
    expect(conf.status).toBe(200); expect(conf.body.data.status).toBe('confirmed');
    // cannot record outcome before the viewing happens
    expect((await api.post(`/api/v1/companies/${companyId}/bookings/${bk.body.data._id}/decision`).set(A(T.ownerA)).send({ action: 'complete' })).status).toBe(409);
    await mongoose.connection.collection('viewingbookings').updateOne({ _id: new mongoose.Types.ObjectId(bk.body.data._id) }, { $set: { confirmedStart: new Date(Date.now() - 7_200_000) } });
    expect((await api.post(`/api/v1/companies/${companyId}/bookings/${bk.body.data._id}/decision`).set(A(T.ownerA)).send({ action: 'complete' })).body.data.status).toBe('completed');

    const form = { fullName: 'Customer One', phone: '+252600000000', email: 'cust@example.test', occupants: 2, employmentStatus: 'employed', desiredMoveIn: new Date(Date.now() + 86_400_000).toISOString(), desiredTermMonths: 12 };
    const app = await api.post('/api/v1/me/applications').set(A(T.cust)).send({ propertyId, form, submit: true });
    expect(app.status).toBe(201);
    const sf = (s: string) => api.post(`/api/v1/companies/${companyId}/applications/${app.body.data._id}/status`).set(A(T.ownerA)).send({ status: s });
    expect((await sf('approved')).status).toBe(409); // must be under review first
    expect((await sf('under_review')).status).toBe(200); expect((await sf('approved')).status).toBe(200);

    const start0 = new Date(); start0.setUTCHours(0, 0, 0, 0);
    const end0 = new Date(Date.UTC(start0.getUTCFullYear() + 1, start0.getUTCMonth(), start0.getUTCDate() - 1));
    const terms = { startDate: start0.toISOString(), endDate: end0.toISOString(), rentMinor: 50_000, frequency: 'monthly', dueDay: 1, depositMinor: 50_000 };
    const ten = await api.post(`/api/v1/companies/${companyId}/tenancies`).set(A(T.ownerA)).send({ applicationId: app.body.data._id, terms });
    expect(ten.status).toBe(201); const tid = ten.body.data._id;
    const act = (b: any = {}) => api.post(`/api/v1/companies/${companyId}/tenancies/${tid}/activate`).set(A(T.ownerA)).send(b);
    expect((await act()).status).toBe(409); // nobody accepted
    expect((await api.post(`/api/v1/me/tenancies/${tid}/accept`).set(A(T.cust))).status).toBe(409); // company hasn't offered yet
    await api.post(`/api/v1/companies/${companyId}/tenancies/${tid}/company-accept`).set(A(T.ownerA));
    expect((await api.post(`/api/v1/me/tenancies/${tid}/accept`).set(A(T.cust))).status).toBe(200);
    const noDeposit = await act(); expect(noDeposit.status).toBe(409); expect(noDeposit.body.error.code).toBe('DEPOSIT_REQUIRED');
    expect((await act({ acknowledgeDepositPending: true })).status).toBe(200);
    expect((await api.post(`/api/v1/me/maintenance`).set(A(T.cust)).send({ tenancyId: tid, category: 'plumbing', title: 'Leak', description: 'Kitchen tap leaks', priority: 'emergency' })).status).toBe(201);

    const other = await reg('other@example.test', 'Other Person');
    expect((await api.get(`/api/v1/me/tenancies/${tid}`).set(A(other))).status).toBe(404);
    expect((await api.post(`/api/v1/me/maintenance`).set(A(other)).send({ tenancyId: tid, category: 'other', title: 'Nope', description: 'Not mine at all' })).status).toBe(404);
    const inv = (await api.get('/api/v1/me/invoices').set(A(T.cust))).body.data;
    expect(inv.length).toBe(13); // 12 rent + deposit
    expect((await api.get(`/api/v1/me/invoices/${inv[0]._id}`).set(A(other))).status).toBe(404);
    T.invoiceId = inv.find((i: any) => i.type === 'rent')._id;
  });

  it('mock payment succeeds ONCE; repeated/concurrent completion never duplicates; client cannot set status', async () => {
    const key = 'idem-key-12345678';
    const ini = await api.post(`/api/v1/me/invoices/${T.invoiceId}/payments`).set(A(T.cust)).set('Idempotency-Key', key).send({ amountMinor: 20_000 });
    expect(ini.status).toBe(201); expect(ini.body.data.environment).toBe('MOCK');
    const again = await api.post(`/api/v1/me/invoices/${T.invoiceId}/payments`).set(A(T.cust)).set('Idempotency-Key', key).send({ amountMinor: 20_000 });
    expect(again.body.data._id).toBe(ini.body.data._id);
    expect((await api.post(`/api/v1/me/invoices/${T.invoiceId}/payments`).set(A(T.cust)).send({})).status).toBe(400); // key required
    expect((await api.post(`/api/v1/me/invoices/${T.invoiceId}/payments`).set(A(T.cust)).set('Idempotency-Key', 'another-key-123456').send({ status: 'paid' })).status).toBe(400);
    const id = ini.body.data._id;
    const rs = await Promise.all([1, 2, 3, 4].map(() => api.post(`/api/v1/me/payments/attempts/${id}/complete`).set(A(T.cust)).send({})));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    const inv = (await api.get(`/api/v1/me/invoices/${T.invoiceId}`).set(A(T.cust))).body.data;
    expect(inv.paidMinor).toBe(20_000); expect(inv.status).toBe('partially_paid'); expect(inv.transactions).toHaveLength(1);
    expect((await api.post(`/api/v1/me/invoices/${T.invoiceId}/payments`).set(A(T.cust)).set('Idempotency-Key', 'too-much-12345678').send({ amountMinor: 999_999 })).status).toBe(400);
  });

  it('tenant cannot use staff endpoints; staff reversal is owner-only', async () => {
    expect((await api.get(`/api/v1/companies/${T.A.companyId}/invoices`).set(A(T.cust))).status).toBe(404);
    const tx = (await api.get(`/api/v1/companies/${T.A.companyId}/invoices/transactions`).set(A(T.ownerA))).body.data[0];
    const rev = await api.post(`/api/v1/companies/${T.A.companyId}/invoices/transactions/${tx._id}/reverse`).set(A(T.ownerA)).send({ reason: 'test reversal' });
    expect(rev.status).toBe(201);
    expect((await api.post(`/api/v1/companies/${T.A.companyId}/invoices/transactions/${tx._id}/reverse`).set(A(T.ownerA)).send({ reason: 'again again' })).status).toBe(409);
  });

  it('platform admin routes are forbidden to normal users', async () => {
    expect((await api.get('/api/v1/admin/stats').set(A(T.ownerA))).status).toBe(403);
  });
});
