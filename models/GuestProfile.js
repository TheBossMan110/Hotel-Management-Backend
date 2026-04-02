import mongoose from 'mongoose';

const guestProfileSchema = new mongoose.Schema({
  // Foreign key → users collection (1:1 relationship)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    unique: true
  },
  dateOfBirth: {
    type: Date
  },
  nationality: {
    type: String,
    trim: true
  },
  // Sensitive ID info — excluded from default queries
  passportNumber: {
    type: String,
    select: false,
    trim: true
  },
  idType: {
    type: String,
    enum: ['passport', 'national-id', 'driving-license', 'other'],
    default: 'passport'
  },
  address: {
    street: String,
    city: String,
    state: String,
    zipCode: String,
    country: String
  },
  // Loyalty programme
  loyaltyPoints: {
    type: Number,
    default: 0,
    min: 0
  },
  membershipTier: {
    type: String,
    enum: ['bronze', 'silver', 'gold', 'platinum'],
    default: 'bronze'
  },
  // Stay preferences
  preferences: {
    roomType: { type: String, enum: ['standard', 'deluxe', 'suite', 'penthouse', 'presidential', null], default: null },
    bedType: { type: String, enum: ['single', 'double', 'queen', 'king', 'twin', null], default: null },
    floorPreference: String,
    smokingRoom: { type: Boolean, default: false },
    dietaryRequirements: [String],
    specialRequests: String,
    newsletter: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false }
  },
  // Visit history — each entry refs a Booking document
  visitHistory: [{
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    checkIn: Date,
    checkOut: Date,
    roomType: String,
    roomNumber: String,
    totalSpent: Number
  }],
  // Computed stats (updated on each checkout)
  totalVisits: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  // VIP / blacklist flags
  vipStatus: { type: Boolean, default: false },
  blacklisted: { type: Boolean, default: false },
  blacklistReason: { type: String, select: false }
}, {
  timestamps: true
});

// Indexes
guestProfileSchema.index({ loyaltyPoints: -1 });
guestProfileSchema.index({ membershipTier: 1 });
guestProfileSchema.index({ vipStatus: 1 });

// Update membership tier based on loyalty points
guestProfileSchema.methods.updateMembershipTier = function() {
  if (this.loyaltyPoints >= 10000) {
    this.membershipTier = 'platinum';
  } else if (this.loyaltyPoints >= 5000) {
    this.membershipTier = 'gold';
  } else if (this.loyaltyPoints >= 2000) {
    this.membershipTier = 'silver';
  } else {
    this.membershipTier = 'bronze';
  }
};

// Add a visit record and update totals
guestProfileSchema.methods.recordVisit = async function(booking) {
  this.visitHistory.push({
    bookingId: booking._id,
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    roomType: booking.roomType,
    totalSpent: booking.pricing.total
  });
  this.totalVisits += 1;
  this.totalSpent += booking.pricing.total;
  // Award loyalty points: 1 point per dollar spent
  this.loyaltyPoints += Math.floor(booking.pricing.total);
  this.updateMembershipTier();
  await this.save();
};

guestProfileSchema.set('toJSON', { virtuals: true });

export default mongoose.model('GuestProfile', guestProfileSchema);
