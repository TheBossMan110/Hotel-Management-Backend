import mongoose from 'mongoose';

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    unique: true,
    trim: true,
    enum: ['housekeeping', 'maintenance', 'frontdesk', 'management', 'restaurant', 'security', 'concierge', 'spa']
  },
  displayName: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  manager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  icon: {
    type: String,
    default: 'building'
  }
}, {
  timestamps: true
});

// Virtual: staff count (computed on-demand)
departmentSchema.virtual('staffCount', {
  ref: 'StaffProfile',
  localField: 'name',
  foreignField: 'department',
  count: true
});

departmentSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Department', departmentSchema);
