import mongoose from 'mongoose';
import { connectDb } from '../config/db';
import '../app';
(async () => {
  await connectDb();
  for (const m of Object.values(mongoose.models)) { await m.syncIndexes(); console.log('indexes synced:', m.modelName); }
  await mongoose.disconnect();
})();
