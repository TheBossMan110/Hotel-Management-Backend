import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Room from './models/Room.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel_management';

const checkData = async () => {
  try {
    await mongoose.connect(MONGODB_URI);
    const count = await Room.countDocuments();
    console.log(`DEBUG: Found ${count} rooms in database.`);
    process.exit(0);
  } catch (error) {
    console.error('DEBUG error:', error);
    process.exit(1);
  }
};

checkData();
