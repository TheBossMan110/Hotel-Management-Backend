import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Service name is required'],
    trim: true,
    maxlength: 100
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['room-service', 'laundry', 'spa', 'transportation', 'dining', 'recreation', 'business', 'concierge', 'other'],
    default: 'other'
  },
  description: {
    type: String,
    maxlength: 500
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: 0
  },
  currency: {
    type: String,
    default: 'PKR'
  },
  duration: {
    type: Number, // in minutes
    default: null
  },
  available: {
    type: Boolean,
    default: true
  },
  availableHours: {
    from: { type: String, default: '00:00' },
    to: { type: String, default: '23:59' }
  },
  image: {
    type: String,
    default: null
  },
  popularity: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

serviceSchema.index({ category: 1 });
serviceSchema.index({ available: 1 });
serviceSchema.index({ price: 1 });

serviceSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Service', serviceSchema);
