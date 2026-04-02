import express from 'express';
import Room from '../models/Room.js';
import Booking from '../models/Booking.js';
import { authenticate, authorize, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Get all rooms (public, with filters)
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { 
      type, 
      status, 
      minPrice, 
      maxPrice, 
      capacity,
      amenities,
      checkIn,
      checkOut,
      city,
      hotelName,
      page = 1, 
      limit = 10,
      sort = '-createdAt'
    } = req.query;

    const query = { isActive: true };

    if (type) query.type = type;
    if (status) query.status = status;
    if (minPrice || maxPrice) {
      query['price.basePrice'] = {};
      if (minPrice) query['price.basePrice'].$gte = Number(minPrice);
      if (maxPrice) query['price.basePrice'].$lte = Number(maxPrice);
    }
    if (capacity) {
      query['capacity.adults'] = { $gte: Number(capacity) };
    }
    if (amenities) {
      const amenityList = amenities.split(',');
      query.amenities = { $all: amenityList };
    }

    // Check availability for date range
    let availableRoomIds = null;
    if (checkIn && checkOut) {
      const bookedRooms = await Booking.distinct('room', {
        status: { $in: ['confirmed', 'checked-in'] },
        $or: [
          { checkIn: { $lt: new Date(checkOut) }, checkOut: { $gt: new Date(checkIn) } }
        ]
      });
      availableRoomIds = bookedRooms;
      query._id = { $nin: bookedRooms };
      query.status = { $ne: 'maintenance' };
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [rooms, total] = await Promise.all([
      Room.find(query)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Room.countDocuments(query)
    ]);

    res.json({
      rooms,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ message: 'Failed to fetch rooms.' });
  }
});

// Get room types with counts
router.get('/types', async (req, res) => {
  try {
    const types = await Room.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$type', count: { $sum: 1 }, avgPrice: { $avg: '$price.basePrice' } } },
      { $sort: { avgPrice: 1 } }
    ]);
    res.json({ types });
  } catch (error) {
    console.error('Get room types error:', error);
    res.status(500).json({ message: 'Failed to fetch room types.' });
  }
});

// Get single room
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }
    res.json({ room });
  } catch (error) {
    console.error('Get room error:', error);
    res.status(500).json({ message: 'Failed to fetch room.' });
  }
});

// Check room availability
router.get('/:id/availability', async (req, res) => {
  try {
    const { checkIn, checkOut } = req.query;
    
    if (!checkIn || !checkOut) {
      return res.status(400).json({ message: 'Check-in and check-out dates required.' });
    }

    const room = await Room.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const isAvailable = await room.isAvailableForDates(new Date(checkIn), new Date(checkOut));
    
    res.json({ 
      available: isAvailable,
      room: {
        id: room._id,
        roomNumber: room.roomNumber,
        type: room.type,
        price: room.price
      }
    });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({ message: 'Failed to check availability.' });
  }
});

// Create room (admin only)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const room = new Room(req.body);
    await room.save();
    res.status(201).json({ message: 'Room created.', room });
  } catch (error) {
    console.error('Create room error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ message: 'Room number already exists.' });
    }
    res.status(500).json({ message: 'Failed to create room.' });
  }
});

// Update room (admin only)
router.put('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }
    res.json({ message: 'Room updated.', room });
  } catch (error) {
    console.error('Update room error:', error);
    res.status(500).json({ message: 'Failed to update room.' });
  }
});

// Update room status (admin/staff)
router.patch('/:id/status', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { status, cleaningStatus } = req.body;
    const updates = {};
    
    if (status) updates.status = status;
    if (cleaningStatus) {
      updates.cleaningStatus = cleaningStatus;
      if (cleaningStatus === 'clean') {
        updates.lastCleaned = new Date();
      }
    }

    const room = await Room.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }
    res.json({ message: 'Room status updated.', room });
  } catch (error) {
    console.error('Update room status error:', error);
    res.status(500).json({ message: 'Failed to update room status.' });
  }
});

// Delete room (admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Soft delete
    const room = await Room.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }
    res.json({ message: 'Room deleted.' });
  } catch (error) {
    console.error('Delete room error:', error);
    res.status(500).json({ message: 'Failed to delete room.' });
  }
});

export default router;
