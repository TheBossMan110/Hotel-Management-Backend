import mongoose from 'mongoose';

const staffProfileSchema = new mongoose.Schema({
  // Foreign key → users collection (1:1 relationship)
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    unique: true
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    enum: ['housekeeping', 'maintenance', 'frontdesk', 'management', 'restaurant', 'security', 'concierge']
  },
  position: {
    type: String,
    trim: true,
    maxlength: 100
  },
  shift: {
    type: String,
    enum: ['morning', 'afternoon', 'evening', 'night', 'flexible'],
    default: 'morning'
  },
  hireDate: {
    type: Date
  },
  salary: {
    amount: { type: Number, select: false },
    currency: { type: String, default: 'USD' },
    paymentFrequency: {
      type: String,
      enum: ['hourly', 'weekly', 'biweekly', 'monthly'],
      default: 'monthly'
    }
  },
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  skills: [String],
  certifications: [String],
  isOnDuty: {
    type: Boolean,
    default: false
  },
  leaveBalance: {
    type: Number,
    default: 21 // annual leave days
  },
  performanceRating: {
    type: Number,
    min: 1,
    max: 5,
    default: null
  },
  // Rooms / sections this staff member is responsible for
  assignedSections: [String],
  notes: {
    type: String,
    maxlength: 1000
  }
}, {
  timestamps: true
});

// Indexes
staffProfileSchema.index({ department: 1 });
staffProfileSchema.index({ shift: 1 });
staffProfileSchema.index({ isOnDuty: 1 });

// Auto-generate employee ID before first save
staffProfileSchema.pre('save', async function(next) {
  if (!this.employeeId) {
    const count = await mongoose.model('StaffProfile').countDocuments();
    this.employeeId = `EMP-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

staffProfileSchema.set('toJSON', { virtuals: true });

export default mongoose.model('StaffProfile', staffProfileSchema);
