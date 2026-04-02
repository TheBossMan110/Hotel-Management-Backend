import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
  guest: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking'
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room'
  },
  type: {
    type: String,
    enum: ['review', 'complaint', 'suggestion', 'compliment'],
    default: 'review'
  },
  ratings: {
    overall: { type: Number, min: 1, max: 5, required: true },
    cleanliness: { type: Number, min: 1, max: 5 },
    comfort: { type: Number, min: 1, max: 5 },
    location: { type: Number, min: 1, max: 5 },
    facilities: { type: Number, min: 1, max: 5 },
    staff: { type: Number, min: 1, max: 5 },
    valueForMoney: { type: Number, min: 1, max: 5 }
  },
  title: {
    type: String,
    maxlength: 100
  },
  comment: {
    type: String,
    required: [true, 'Comment is required'],
    maxlength: 2000
  },
  pros: [String],
  cons: [String],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'responded'],
    default: 'pending'
  },
  response: {
    content: String,
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    respondedAt: Date
  },
  isPublic: {
    type: Boolean,
    default: true
  },
  helpful: {
    count: { type: Number, default: 0 },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  stayDate: Date,
  travelType: {
    type: String,
    enum: ['business', 'leisure', 'family', 'couple', 'solo', 'group'],
    default: 'leisure'
  }
}, {
  timestamps: true
});

// Indexes
feedbackSchema.index({ guest: 1 });
feedbackSchema.index({ room: 1 });
feedbackSchema.index({ 'ratings.overall': -1 });
feedbackSchema.index({ status: 1 });
feedbackSchema.index({ createdAt: -1 });

// Calculate average rating
feedbackSchema.virtual('averageRating').get(function() {
  const ratings = this.ratings;
  const values = [
    ratings.overall,
    ratings.cleanliness,
    ratings.comfort,
    ratings.location,
    ratings.facilities,
    ratings.staff,
    ratings.valueForMoney
  ].filter(r => r !== undefined && r !== null);
  
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
});

// Update room rating after save
feedbackSchema.post('save', async function() {
  if (this.room && this.status === 'approved') {
    const Room = mongoose.model('Room');
    const feedbacks = await mongoose.model('Feedback').find({
      room: this.room,
      status: 'approved'
    });
    
    if (feedbacks.length > 0) {
      const avgRating = feedbacks.reduce((sum, f) => sum + f.ratings.overall, 0) / feedbacks.length;
      await Room.findByIdAndUpdate(this.room, {
        'rating.average': Math.round(avgRating * 10) / 10,
        'rating.count': feedbacks.length
      });
    }
  }
});

feedbackSchema.set('toJSON', { virtuals: true });

export default mongoose.model('Feedback', feedbackSchema);
