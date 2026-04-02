import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  bookingNumber: {
    type: String,
    unique: true,
    required: true
  },
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Guest is required']
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'Room is required']
  },
  checkIn: {
    type: Date,
    required: [true, 'Check-in date is required']
  },
  checkOut: {
    type: Date,
    required: [true, 'Check-out date is required']
  },
  actualCheckIn: {
    type: Date
  },
  actualCheckOut: {
    type: Date
  },
  guests: {
    adults: { type: Number, default: 1, min: 1 },
    children: { type: Number, default: 0, min: 0 }
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'checked-in', 'checked-out', 'cancelled', 'no-show'],
    default: 'pending'
  },
  pricing: {
    roomRate: { type: Number, required: true },
    nights: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    taxes: { type: Number, default: 0 },
    fees: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    discountCode: String,
    total: { type: Number, required: true }
  },
  payment: {
    method: {
      type: String,
      enum: ['credit-card', 'debit-card', 'cash', 'bank-transfer', 'paypal'],
      default: 'credit-card'
    },
    status: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'refunded'],
      default: 'pending'
    },
    paidAmount: { type: Number, default: 0 },
    transactions: [{
      amount: Number,
      method: String,
      date: { type: Date, default: Date.now },
      reference: String,
      type: { type: String, enum: ['payment', 'refund'] }
    }]
  },
  specialRequests: {
    type: String,
    maxlength: 500
  },
  addOns: [{
    name: String,
    price: Number,
    quantity: { type: Number, default: 1 }
  }],
  notes: [{
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  cancellation: {
    date: Date,
    reason: String,
    refundAmount: Number,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  source: {
    type: String,
    enum: ['direct', 'website', 'phone', 'walk-in', 'booking.com', 'expedia', 'airbnb', 'other'],
    default: 'website'
  }
}, {
  timestamps: true
});

// Indexes (bookingNumber index is already created by unique: true in schema)
bookingSchema.index({ guest: 1 });
bookingSchema.index({ room: 1 });
bookingSchema.index({ status: 1 });
bookingSchema.index({ checkIn: 1, checkOut: 1 });
bookingSchema.index({ createdAt: -1 });

// Generate booking number before saving
bookingSchema.pre('save', async function(next) {
  if (!this.bookingNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.bookingNumber = `BK${year}${month}${random}`;
  }
  next();
});

// Calculate nights and total
bookingSchema.pre('save', function(next) {
  if (this.checkIn && this.checkOut) {
    const oneDay = 24 * 60 * 60 * 1000;
    this.pricing.nights = Math.round(Math.abs((this.checkOut - this.checkIn) / oneDay));
    this.pricing.subtotal = this.pricing.roomRate * this.pricing.nights;
    
    // Calculate add-ons
    const addOnsTotal = this.addOns.reduce((sum, addon) => sum + (addon.price * addon.quantity), 0);
    
    this.pricing.total = this.pricing.subtotal + this.pricing.taxes + this.pricing.fees + addOnsTotal - this.pricing.discount;
  }
  next();
});

// Virtual for duration
bookingSchema.virtual('duration').get(function() {
  return this.pricing.nights;
});

// Check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function() {
  const now = new Date();
  const checkInDate = new Date(this.checkIn);
  const hoursUntilCheckIn = (checkInDate - now) / (1000 * 60 * 60);
  
  return this.status === 'confirmed' && hoursUntilCheckIn > 24;
};

bookingSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Booking', bookingSchema);
