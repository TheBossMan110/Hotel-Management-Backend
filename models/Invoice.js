import mongoose from 'mongoose';

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    unique: true,
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true
  },
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [{
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ['room', 'food', 'service', 'minibar', 'laundry', 'spa', 'parking', 'other'],
      default: 'other'
    },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, required: true },
    total: { type: Number, required: true },
    date: { type: Date, default: Date.now }
  }],
  summary: {
    subtotal: { type: Number, required: true },
    taxes: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0.1 }, // 10% default
    serviceCharge: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true }
  },
  payment: {
    status: {
      type: String,
      enum: ['pending', 'partial', 'paid', 'overdue', 'refunded'],
      default: 'pending'
    },
    method: String,
    paidAmount: { type: Number, default: 0 },
    paidDate: Date,
    dueDate: Date
  },
  notes: String,
  issuedDate: {
    type: Date,
    default: Date.now
  },
  issuedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes
invoiceSchema.index({ guest: 1 });
invoiceSchema.index({ booking: 1 });
invoiceSchema.index({ 'payment.status': 1 });
invoiceSchema.index({ issuedDate: -1 });

// Generate invoice number
invoiceSchema.pre('save', async function(next) {
  if (!this.invoiceNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const count = await mongoose.model('Invoice').countDocuments({
      createdAt: {
        $gte: new Date(date.getFullYear(), date.getMonth(), 1),
        $lt: new Date(date.getFullYear(), date.getMonth() + 1, 1)
      }
    });
    this.invoiceNumber = `INV-${year}${month}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// Calculate totals
invoiceSchema.pre('save', function(next) {
  // Calculate subtotal from items
  this.summary.subtotal = this.items.reduce((sum, item) => sum + item.total, 0);
  
  // Calculate taxes
  this.summary.taxes = this.summary.subtotal * this.summary.taxRate;
  
  // Calculate total
  this.summary.total = this.summary.subtotal + this.summary.taxes + this.summary.serviceCharge - this.summary.discount;
  
  // Update payment status
  if (this.payment.paidAmount >= this.summary.total) {
    this.payment.status = 'paid';
  } else if (this.payment.paidAmount > 0) {
    this.payment.status = 'partial';
  }
  
  next();
});

// Virtual for balance due
invoiceSchema.virtual('balanceDue').get(function() {
  return Math.max(0, this.summary.total - this.payment.paidAmount);
});

invoiceSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Invoice', invoiceSchema);
