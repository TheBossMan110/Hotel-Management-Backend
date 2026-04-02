import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel_management';

const logFile = 'test_mongo_log.txt';
fs.writeFileSync(logFile, `🔗 Testing connection to: ${MONGODB_URI}\n`);

mongoose.connect(MONGODB_URI)
  .then(() => {
    fs.appendFileSync(logFile, '✅ Connection Successful!\n');
    console.log('✅ Connection Sucessful!');
    process.exit(0);
  })
  .catch((err) => {
    fs.appendFileSync(logFile, `❌ Connection Failed: ${err.message}\n`);
    console.error('❌ Connection Failed:', err.message);
    process.exit(1);
  });

setTimeout(() => {
  fs.appendFileSync(logFile, '⏳ Timeout: Connection took too long (15s)\n');
  console.log('⏳ Timeout: Connection took too long (15s)');
  process.exit(1);
}, 15000);
