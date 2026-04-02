import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema({
  // Foreign key → users collection
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required']
  },
  type: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: [
      'booking',
      'check-in',
      'check-out',
      'payment',
      'maintenance',
      'housekeeping',
      'service-request',
      'alert',
      'system',
      'promotion'
    ]
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: 150
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    maxlength: 1000
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  isRead: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date,
    default: null
  },
  // Frontend route to navigate to on click
  link: {
    type: String,
    default: null
  },
  // Flexible metadata — store related document IDs
  metadata: {
    bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
    roomId: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', default: null },
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    serviceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest', default: null },
    maintenanceRequestId: { type: mongoose.Schema.Types.ObjectId, ref: 'MaintenanceRequest', default: null }
  },
  // Auto-expire notifications (null = never expires)
  expiresAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

// Static: mark all unread for a user as read
notificationSchema.statics.markAllRead = async function(userId) {
  return this.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() }
  );
};

// Static: count unread notifications for a user
notificationSchema.statics.countUnread = async function(userId) {
  return this.countDocuments({ recipient: userId, isRead: false });
};

notificationSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Notification', notificationSchema);
