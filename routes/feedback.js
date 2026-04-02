import express from 'express';
import Feedback from '../models/Feedback.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all feedback (admin)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { 
      type,
      status,
      roomId,
      minRating,
      maxRating,
      page = 1, 
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (roomId) query.room = roomId;
    if (minRating || maxRating) {
      query['ratings.overall'] = {};
      if (minRating) query['ratings.overall'].$gte = Number(minRating);
      if (maxRating) query['ratings.overall'].$lte = Number(maxRating);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [feedback, total] = await Promise.all([
      Feedback.find(query)
        .populate('guest', 'firstName lastName avatar')
        .populate('room', 'roomNumber name')
        .populate('response.respondedBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Feedback.countDocuments(query)
    ]);

    // Get stats
    const stats = await Feedback.aggregate([
      {
        $group: {
          _id: null,
          avgRating: { $avg: '$ratings.overall' },
          totalReviews: { $sum: 1 },
          avgCleanliness: { $avg: '$ratings.cleanliness' },
          avgComfort: { $avg: '$ratings.comfort' },
          avgStaff: { $avg: '$ratings.staff' },
          avgValue: { $avg: '$ratings.valueForMoney' }
        }
      }
    ]);

    res.json({
      feedback,
      stats: stats[0] || {},
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ message: 'Failed to fetch feedback.' });
  }
});

// Get public reviews (for room or hotel)
router.get('/public', optionalAuth, async (req, res) => {
  try {
    const { roomId, limit = 10, sort = '-createdAt' } = req.query;

    const query = { 
      status: 'approved',
      isPublic: true,
      type: 'review'
    };
    if (roomId) query.room = roomId;

    const feedback = await Feedback.find(query)
      .populate('guest', 'firstName lastName avatar')
      .populate('room', 'roomNumber name type')
      .sort(sort)
      .limit(Number(limit));

    res.json({ reviews: feedback });
  } catch (error) {
    console.error('Get public reviews error:', error);
    res.status(500).json({ message: 'Failed to fetch reviews.' });
  }
});

// Get my feedback (guest)
router.get('/my-feedback', authenticate, async (req, res) => {
  try {
    const feedback = await Feedback.find({ guest: req.userId })
      .populate('room', 'roomNumber name')
      .populate('booking', 'bookingNumber checkIn checkOut')
      .sort('-createdAt');

    res.json({ feedback });
  } catch (error) {
    console.error('Get my feedback error:', error);
    res.status(500).json({ message: 'Failed to fetch feedback.' });
  }
});

// Submit feedback (guest)
router.post('/', authenticate, async (req, res) => {
  try {
    const { 
      bookingId, 
      roomId, 
      type, 
      ratings, 
      title, 
      comment, 
      pros, 
      cons,
      travelType,
      isPublic
    } = req.body;

    // Sanitize ratings — Mongoose requires minimum 1
    const sanitizedRatings = {};
    if (ratings) {
      for (const key of Object.keys(ratings)) {
        sanitizedRatings[key] = Number(ratings[key]) < 1 ? 1 : Number(ratings[key]);
      }
    }

    const feedback = new Feedback({
      guest: req.userId,
      booking: bookingId,
      room: roomId,
      type: type || 'review',
      ratings: sanitizedRatings,
      title,
      comment,
      pros,
      cons,
      travelType,
      isPublic: isPublic !== false,
      stayDate: new Date()
    });

    await feedback.save();
    await feedback.populate('room', 'roomNumber name');

    res.status(201).json({ message: 'Feedback submitted.', feedback });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ message: 'Failed to submit feedback.' });
  }
});

// Update feedback status (admin)
router.patch('/:id/status', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { status } = req.body;

    const feedback = await Feedback.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('guest', 'firstName lastName');

    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    res.json({ message: 'Status updated.', feedback });
  } catch (error) {
    console.error('Update feedback status error:', error);
    res.status(500).json({ message: 'Failed to update status.' });
  }
});

// Respond to feedback (admin/staff)
router.post('/:id/respond', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { content } = req.body;

    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    feedback.response = {
      content,
      respondedBy: req.userId,
      respondedAt: new Date()
    };
    feedback.status = 'responded';

    await feedback.save();
    await feedback.populate('response.respondedBy', 'firstName lastName');

    res.json({ message: 'Response added.', feedback });
  } catch (error) {
    console.error('Respond to feedback error:', error);
    res.status(500).json({ message: 'Failed to respond.' });
  }
});

// Mark feedback as helpful
router.post('/:id/helpful', authenticate, async (req, res) => {
  try {
    const feedback = await Feedback.findById(req.params.id);
    if (!feedback) {
      return res.status(404).json({ message: 'Feedback not found.' });
    }

    const hasVoted = feedback.helpful.users.includes(req.userId);
    
    if (hasVoted) {
      // Remove vote
      feedback.helpful.users = feedback.helpful.users.filter(
        id => id.toString() !== req.userId.toString()
      );
      feedback.helpful.count--;
    } else {
      // Add vote
      feedback.helpful.users.push(req.userId);
      feedback.helpful.count++;
    }

    await feedback.save();

    res.json({ 
      message: hasVoted ? 'Vote removed.' : 'Marked as helpful.',
      helpfulCount: feedback.helpful.count
    });
  } catch (error) {
    console.error('Mark helpful error:', error);
    res.status(500).json({ message: 'Failed to update.' });
  }
});

export default router;
