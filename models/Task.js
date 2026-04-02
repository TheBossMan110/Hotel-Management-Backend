import mongoose from 'mongoose';

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Task title is required'],
    trim: true,
    maxlength: 200
  },
  description: {
    type: String,
    maxlength: 1000
  },
  type: {
    type: String,
    enum: ['housekeeping', 'maintenance', 'frontdesk', 'general', 'inspection'],
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dueDate: {
    type: Date
  },
  completedAt: {
    type: Date
  },
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  checklist: [{
    item: String,
    completed: { type: Boolean, default: false },
    completedAt: Date
  }],
  notes: [{
    content: String,
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  }],
  attachments: [{
    url: String,
    name: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  estimatedDuration: {
    type: Number, // in minutes
    default: 30
  },
  actualDuration: {
    type: Number // in minutes
  }
}, {
  timestamps: true
});

// Indexes
taskSchema.index({ type: 1 });
taskSchema.index({ status: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ assignedTo: 1 });
taskSchema.index({ room: 1 });
taskSchema.index({ dueDate: 1 });

// Auto-complete room cleaning status
taskSchema.post('save', async function() {
  if (this.type === 'housekeeping' && this.room && this.status === 'completed') {
    const Room = mongoose.model('Room');
    await Room.findByIdAndUpdate(this.room, {
      cleaningStatus: 'clean',
      lastCleaned: new Date()
    });
  }
});

// Virtual for overdue status
taskSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate) return false;
  return new Date() > this.dueDate && this.status !== 'completed' && this.status !== 'cancelled';
});

taskSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Task', taskSchema);
