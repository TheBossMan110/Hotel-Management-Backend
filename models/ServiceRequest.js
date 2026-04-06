import mongoose from 'mongoose';

const serviceRequestSchema = new mongoose.Schema({
  requestNumber: {
    type: String,
    unique: true
  },
  // Foreign keys
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Guest reference is required']
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: [true, 'Booking reference is required']
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'Room reference is required']
  },
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Request details
  type: {
    type: String,
    required: [true, 'Service type is required'],
    enum: [
      'room-service',
      'laundry',
      'wake-up-call',
      'transportation',
      'extra-amenities',
      'spa',
      'housekeeping',
      'concierge',
      'other'
    ]
  },
  status: {
    type: String,
    enum: ['pending', 'acknowledged', 'in-progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: 1000
  },
  // For room-service orders — array of ordered items
  items: [{
    name: { type: String, required: true },
    quantity: { type: Number, default: 1, min: 1 },
    unitPrice: { type: Number, default: 0 },
    notes: String
  }],
  scheduledTime: {
    type: Date   // for wake-up calls / scheduled deliveries
  },
  completedAt: {
    type: Date
  },
  totalCost: {
    type: Number,
    default: 0
  },
  notes: {
    type: String,
    maxlength: 500
  },
  // Guest rates the service after completion
  guestRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
serviceRequestSchema.index({ guest: 1 });
serviceRequestSchema.index({ booking: 1 });
serviceRequestSchema.index({ room: 1 });
serviceRequestSchema.index({ handledBy: 1 });
serviceRequestSchema.index({ status: 1 });
serviceRequestSchema.index({ type: 1 });
serviceRequestSchema.index({ createdAt: -1 });

// Auto-generate request number before validation
serviceRequestSchema.pre('validate', async function(next) {
  if (!this.requestNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const count = await mongoose.model('ServiceRequest').countDocuments();
    this.requestNumber = `SR-${year}${month}${day}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Auto-calculate total cost from items
serviceRequestSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    this.totalCost = this.items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  }
  next();
});

serviceRequestSchema.set('toJSON', { virtuals: true });

export default mongoose.model('ServiceRequest', serviceRequestSchema);
