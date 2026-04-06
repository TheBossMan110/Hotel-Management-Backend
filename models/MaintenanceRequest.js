import mongoose from 'mongoose';

const maintenanceRequestSchema = new mongoose.Schema({
  ticketNumber: {
    type: String,
    unique: true
  },
  // Foreign keys
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: [true, 'Room reference is required']
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Reporter reference is required']
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // Optional link to a Task created from this request
  linkedTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task',
    default: null
  },
  // Issue classification
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'plumbing',
      'electrical',
      'hvac',
      'furniture',
      'appliance',
      'structural',
      'cleaning',
      'pest-control',
      'internet',
      'security',
      'other'
    ]
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['open', 'assigned', 'in-progress', 'on-hold', 'resolved', 'closed'],
    default: 'open'
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    maxlength: 2000
  },
  images: [String],   // photo URLs of the issue
  // Cost tracking
  estimatedCost: {
    type: Number,
    default: 0
  },
  actualCost: {
    type: Number,
    default: 0
  },
  // Timeline
  startedAt: {
    type: Date
  },
  resolvedAt: {
    type: Date
  },
  resolution: {
    type: String,
    maxlength: 1000
  },
  // Progress notes / activity log
  progressNotes: [{
    content: { type: String, required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

// Indexes
maintenanceRequestSchema.index({ room: 1 });
maintenanceRequestSchema.index({ reportedBy: 1 });
maintenanceRequestSchema.index({ assignedTo: 1 });
maintenanceRequestSchema.index({ status: 1 });
maintenanceRequestSchema.index({ priority: 1 });
maintenanceRequestSchema.index({ category: 1 });
maintenanceRequestSchema.index({ createdAt: -1 });

// Auto-generate ticket number before first save
maintenanceRequestSchema.pre('validate', async function(next) {
  if (!this.ticketNumber) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const count = await mongoose.model('MaintenanceRequest').countDocuments();
    this.ticketNumber = `MR-${year}${month}${day}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

// When resolved, automatically update room maintenance info
maintenanceRequestSchema.post('save', async function() {
  if (this.status === 'resolved' && this.resolvedAt) {
    const Room = mongoose.model('Room');
    await Room.findByIdAndUpdate(this.room, {
      lastMaintenance: this.resolvedAt
    });
  }
});

maintenanceRequestSchema.set('toJSON', { virtuals: true });

export default mongoose.model('MaintenanceRequest', maintenanceRequestSchema);
