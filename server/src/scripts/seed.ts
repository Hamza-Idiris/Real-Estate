/** Seeds FICTIONAL demo data. Refuses to run in production. Demo password for all accounts: Demo#12345678 */
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { connectDb } from '../config/db';
import { ensureStorage } from '../modules/files/storage';
import { User } from '../modules/auth/model';
import { Branch, Company, Membership } from '../modules/companies/model';
import { Property } from '../modules/properties/model';
import { ROLE_DEFAULTS } from '../domain/permissions';
import '../app';

const PW = 'Demo#12345678';
(async () => {
  if (env.NODE_ENV === 'production') throw new Error('Refusing to seed production');
  await connectDb(); await ensureStorage();
  for (const m of Object.values(mongoose.models)) await m.syncIndexes();
  const hash = await bcrypt.hash(PW, 12);
  const mk = async (email: string, name: string, extra: any = {}) =>
    (await User.findOneAndUpdate({ email }, { $setOnInsert: { email, name, passwordHash: hash, ...extra } }, { upsert: true, new: true }))!;
  const admin = await mk('admin@estateflow.demo', 'Demo Platform Admin', { platformRole: 'super_admin' });
  const owner = await mk('owner@estateflow.demo', 'Demo Owner');
  const agent = await mk('agent@estateflow.demo', 'Demo Agent');
  const acct = await mk('accountant@estateflow.demo', 'Demo Accountant');
  await mk('customer@estateflow.demo', 'Demo Customer');

  let company: any = await Company.findOne({ slug: 'demo-estates' });
  if (!company) {
    company = await Company.create({ name: 'Demo Estates (fictional)', slug: 'demo-estates', ownerId: owner._id, country: 'Somalia', currency: 'USD', contact: { email: 'owner@estateflow.demo' } });
    const branch: any = await Branch.create({ companyId: company._id, name: 'Main branch', city: 'Mogadishu', country: 'Somalia' });
    await Membership.create({ companyId: company._id, userId: owner._id, email: 'owner@estateflow.demo', role: 'owner', scope: 'all', status: 'active', permissions: [...ROLE_DEFAULTS.owner] });
    await Membership.create({ companyId: company._id, userId: agent._id, email: 'agent@estateflow.demo', role: 'agent', scope: 'all', status: 'active', permissions: [...ROLE_DEFAULTS.agent] });
    await Membership.create({ companyId: company._id, userId: acct._id, email: 'accountant@estateflow.demo', role: 'accountant', scope: 'all', status: 'active', permissions: [...ROLE_DEFAULTS.accountant] });
    const base = { companyId: company._id, branchId: branch._id, currency: 'USD', createdBy: owner._id, listingStatus: 'draft' };
    const demo = [
      ['Bright 2-bed apartment (demo)', 'apartment', 2, 1, 45000, 'Hodan'], ['Family villa with garden (demo)', 'villa', 4, 3, 120000, 'Wadajir'],
      ['Compact office suite (demo)', 'office', 0, 1, 60000, 'Hamar Weyne'],
    ] as const;
    for (const [i, [title, type, bd, ba, price, district]] of demo.entries())
      await Property.create({ ...base, reference: `EF-DEMO${i + 1}XX`, title, type, bedrooms: bd, bathrooms: ba, transaction: 'rent', rentFrequency: 'monthly', priceMinor: price, depositMinor: price,
        location: { country: 'Somalia', city: 'Mogadishu', district }, description: 'Fictional demo listing. Add images and publish from the dashboard.', amenities: ['water', 'security'] });
  }
  console.log('Seed complete. Accounts (password: ' + PW + '):\n admin@estateflow.demo (platform admin)\n owner@estateflow.demo\n agent@estateflow.demo\n accountant@estateflow.demo\n customer@estateflow.demo');
  console.log('Properties are seeded as DRAFT (publishing requires an image upload).');
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
