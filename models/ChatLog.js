import mongoose from 'mongoose';

const chatLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  sessionId: {
    type: String,
    required: true
  },
  messages: [{
    role: { type: String, enum: ['user', 'assistant'], required: true },
    content: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
  }],
  metadata: {
    userAgent: String,
    ipAddress: String
  }
}, {
  timestamps: true
});

chatLogSchema.index({ user: 1 });
chatLogSchema.index({ sessionId: 1 });
chatLogSchema.index({ createdAt: -1 });

export default mongoose.model('ChatLog', chatLogSchema);
