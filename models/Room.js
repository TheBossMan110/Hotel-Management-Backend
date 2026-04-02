import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  roomNumber: {
    type: String,
    required: [true, 'Room number is required'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true
  },

  type: {
    type: String,
    required: [true, 'Room type is required'],
    enum: ['standard', 'deluxe', 'suite', 'penthouse', 'presidential'],
    default: 'standard'
  },
  floor: {
    type: Number,
    required: [true, 'Floor number is required'],
    min: 1
  },
  capacity: {
    adults: { type: Number, default: 2, min: 1 },
    children: { type: Number, default: 1, min: 0 }
  },
  beds: {
    type: String,
    enum: ['single', 'double', 'queen', 'king', 'twin'],
    default: 'queen'
  },
  size: {
    type: Number, // in square feet
    required: true
  },
  price: {
    basePrice: { type: Number, required: true },
    weekendPrice: { type: Number },
    seasonalMultiplier: { type: Number, default: 1 }
  },
  amenities: [{
    type: String,
    enum: [
      'wifi', 'tv', 'minibar', 'safe', 'airConditioning', 
      'balcony', 'oceanView', 'cityView', 'jacuzzi', 'kitchen',
      'workspace', 'roomService', 'laundry', 'parking', 'gym',
      'spa', 'pool', 'breakfast', 'concierge', 'petFriendly'
    ]
  }],
  images: [{
    url: String,
    caption: String,
    isPrimary: { type: Boolean, default: false }
  }],
  description: {
    short: { type: String, maxlength: 200 },
    full: { type: String }
  },
  status: {
    type: String,
    enum: ['available', 'occupied', 'maintenance', 'cleaning', 'reserved'],
    default: 'available'
  },
  cleaningStatus: {
    type: String,
    enum: ['clean', 'dirty', 'in-progress', 'inspected'],
    default: 'clean'
  },
  lastCleaned: {
    type: Date
  },
  lastMaintenance: {
    type: Date
  },
  maintenanceNotes: [{
    note: String,
    date: { type: Date, default: Date.now },
    resolvedDate: Date,
    status: { type: String, enum: ['pending', 'in-progress', 'resolved'], default: 'pending' }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  rating: {
    average: { type: Number, default: 0, min: 0, max: 5 },
    count: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

// Indexes (roomNumber index is already created by unique: true in schema)
roomSchema.index({ type: 1 });
roomSchema.index({ status: 1 });
roomSchema.index({ floor: 1 });
roomSchema.index({ 'price.basePrice': 1 });

// Virtual for current price (considering day of week)
roomSchema.virtual('currentPrice').get(function() {
  const today = new Date();
  const isWeekend = today.getDay() === 0 || today.getDay() === 6;
  const basePrice = this.price.basePrice;
  const weekendPrice = this.price.weekendPrice || basePrice * 1.2;
  
  return (isWeekend ? weekendPrice : basePrice) * this.price.seasonalMultiplier;
});

// Method to check availability for date range
roomSchema.methods.isAvailableForDates = async function(checkIn, checkOut) {
  const Booking = mongoose.model('Booking');
  const conflictingBookings = await Booking.countDocuments({
    room: this._id,
    status: { $in: ['confirmed', 'checked-in'] },
    $or: [
      { checkIn: { $lt: checkOut }, checkOut: { $gt: checkIn } }
    ]
  });
  return conflictingBookings === 0 && this.status !== 'maintenance';
};

roomSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Room', roomSchema);
