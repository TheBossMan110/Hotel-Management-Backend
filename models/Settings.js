import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    unique: true,
    required: true
  },
  hotelInfo: {
    name: { type: String, default: 'Grand Luxe Hotel' },
    tagline: String,
    description: String,
    address: {
      street: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    },
    contact: {
      phone: String,
      email: String,
      fax: String,
      website: String
    },
    socialMedia: {
      facebook: String,
      instagram: String,
      twitter: String,
      linkedin: String
    },
    logo: String,
    images: [String]
  },
  booking: {
    checkInTime: { type: String, default: '15:00' },
    checkOutTime: { type: String, default: '11:00' },
    minAdvanceBooking: { type: Number, default: 0 }, // hours
    maxAdvanceBooking: { type: Number, default: 365 }, // days
    cancellationPolicy: {
      freeCancellationHours: { type: Number, default: 24 },
      cancellationFeePercent: { type: Number, default: 50 }
    },
    requireDeposit: { type: Boolean, default: true },
    depositPercentage: { type: Number, default: 20 },
    allowOnlineBooking: { type: Boolean, default: true }
  },
  pricing: {
    currency: { type: String, default: 'USD' },
    currencySymbol: { type: String, default: '$' },
    taxRate: { type: Number, default: 0.1 },
    taxName: { type: String, default: 'VAT' },
    serviceChargeRate: { type: Number, default: 0.05 },
    weekendMultiplier: { type: Number, default: 1.2 },
    seasonalPricing: [{
      name: String,
      startDate: Date,
      endDate: Date,
      multiplier: Number
    }]
  },
  notifications: {
    emailEnabled: { type: Boolean, default: true },
    smsEnabled: { type: Boolean, default: false },
    bookingConfirmation: { type: Boolean, default: true },
    checkInReminder: { type: Boolean, default: true },
    checkOutReminder: { type: Boolean, default: true },
    paymentReceipt: { type: Boolean, default: true },
    promotionalEmails: { type: Boolean, default: true },
    // Admin alerts
    emailNewBooking: { type: Boolean, default: true },
    emailCancellation: { type: Boolean, default: true },
    emailCheckIn: { type: Boolean, default: true },
    emailCheckOut: { type: Boolean, default: false },
    emailFeedback: { type: Boolean, default: true },
    smsNewBooking: { type: Boolean, default: false },
    smsCancellation: { type: Boolean, default: true }
  },
  security: {
    maxLoginAttempts: { type: Number, default: 5 },
    lockoutDuration: { type: Number, default: 30 }, // minutes
    passwordMinLength: { type: Number, default: 6 },
    requirePasswordChange: { type: Boolean, default: false },
    sessionTimeout: { type: Number, default: 60 }, // minutes
    twoFactorEnabled: { type: Boolean, default: false }
  },
  integrations: {
    paymentGateway: {
      provider: String,
      enabled: { type: Boolean, default: false }
    },
    emailService: {
      provider: String,
      enabled: { type: Boolean, default: false }
    },
    smsService: {
      provider: String,
      enabled: { type: Boolean, default: false }
    }
  },
  maintenance: {
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: String
  }
}, {
  timestamps: true
});

// Ensure only one settings document
settingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne({ key: 'main' });
  if (!settings) {
    settings = await this.create({ key: 'main' });
  }
  return settings;
};

export default mongoose.model('Settings', settingsSchema);
