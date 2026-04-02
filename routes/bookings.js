import express from 'express';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import User from '../models/User.js';
import Invoice from '../models/Invoice.js';
import Task from '../models/Task.js';
import Notification from '../models/Notification.js';
import GuestProfile from '../models/GuestProfile.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all bookings (admin/staff)
router.get('/', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { 
      status, 
      roomId,
      guestId,
      startDate,
      endDate,
      page = 1, 
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (roomId) query.room = roomId;
    if (guestId) query.guest = guestId;
    if (startDate || endDate) {
      query.checkIn = {};
      if (startDate) query.checkIn.$gte = new Date(startDate);
      if (endDate) query.checkIn.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('guest', 'firstName lastName email phone')
        .populate('room', 'roomNumber name type')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments(query)
    ]);

    res.json({
      bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get bookings error:', error);
    res.status(500).json({ message: 'Failed to fetch bookings.' });
  }
});

// Get current user's bookings (guest)
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { guest: req.userId };
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .populate('room', 'roomNumber name type price images')
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit)),
      Booking.countDocuments(query)
    ]);

    res.json({
      bookings,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get my bookings error:', error);
    res.status(500).json({ message: 'Failed to fetch bookings.' });
  }
});

// Get single booking
router.get('/:id', authenticate, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('guest', 'firstName lastName email phone address')
      .populate('room', 'roomNumber name type price amenities images')
      .populate('notes.author', 'firstName lastName');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    // Check access
    if (req.user.role === 'guest' && booking.guest._id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    res.json({ booking });
  } catch (error) {
    console.error('Get booking error:', error);
    res.status(500).json({ message: 'Failed to fetch booking.' });
  }
});

// Create booking
router.post('/', authenticate, async (req, res) => {
  try {
    const { roomId, checkIn, checkOut, guests, specialRequests, addOns, paymentMethod } = req.body;

    // Validate dates
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    
    if (checkInDate >= checkOutDate) {
      return res.status(400).json({ message: 'Check-out must be after check-in.' });
    }

    if (checkInDate < new Date()) {
      return res.status(400).json({ message: 'Check-in date cannot be in the past.' });
    }

    // Get room and check availability
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: 'Room not found.' });
    }

    const isAvailable = await room.isAvailableForDates(checkInDate, checkOutDate);
    if (!isAvailable) {
      return res.status(400).json({ message: 'Room is not available for selected dates.' });
    }

    // Calculate pricing
    const oneDay = 24 * 60 * 60 * 1000;
    const nights = Math.round((checkOutDate - checkInDate) / oneDay);
    const roomRate = room.price.basePrice;
    const subtotal = roomRate * nights;
    const taxes = subtotal * 0.1; // 10% tax
    const fees = 25; // Service fee
    
    let addOnsTotal = 0;
    if (addOns && addOns.length > 0) {
      addOnsTotal = addOns.reduce((sum, addon) => sum + (addon.price * (addon.quantity || 1)), 0);
    }

    const total = subtotal + taxes + fees + addOnsTotal;

    // Create booking
    const booking = new Booking({
      guest: req.userId,
      room: roomId,
      checkIn: checkInDate,
      checkOut: checkOutDate,
      guests: guests || { adults: 1, children: 0 },
      pricing: {
        roomRate,
        nights,
        subtotal,
        taxes,
        fees,
        total
      },
      payment: {
        method: paymentMethod || 'credit-card',
        status: 'pending'
      },
      specialRequests,
      addOns,
      source: 'website'
    });

    await booking.save();

    // Add loyalty points
    const user = await User.findById(req.userId);
    user.loyaltyPoints += Math.floor(total / 10);
    // Update membership tier based on loyalty points
    if (user.loyaltyPoints >= 10000) user.membershipTier = 'platinum';
    else if (user.loyaltyPoints >= 5000) user.membershipTier = 'gold';
    else if (user.loyaltyPoints >= 2000) user.membershipTier = 'silver';
    else user.membershipTier = 'bronze';
    await user.save();

    // Also update GuestProfile if exists
    const guestProfile = await GuestProfile.findOne({ userId: req.userId });
    if (guestProfile) {
      guestProfile.loyaltyPoints = user.loyaltyPoints;
      guestProfile.updateMembershipTier();
      await guestProfile.save();
    }

    // Notify admins about new booking
    const admins = await User.find({ role: 'admin', isActive: true });
    const notifs = admins.map(a => ({
      recipient: a._id,
      type: 'booking',
      title: 'New Booking',
      message: `${user.firstName} ${user.lastName} booked Room ${roomId} for ${nights} nights.`,
      priority: 'normal',
      metadata: { bookingId: booking._id, roomId }
    }));
    await Notification.insertMany(notifs);

    // Auto-generate invoice for the booking
    try {
      const room = await Room.findById(roomId);
      const invoiceDoc = new Invoice({
        booking: booking._id,
        guest: req.userId,
        items: [{
          description: `Room ${room?.roomNumber || roomId} — ${nights} night(s)`,
          category: 'room',
          quantity: nights,
          unitPrice: roomRate,
          total: subtotal
        }],
        summary: {
          subtotal,
          taxRate: 0.16,
          taxes,
          serviceCharge: 0,
          discount: 0,
          total
        },
        payment: {
          status: paymentMethod ? 'paid' : 'pending',
          method: paymentMethod || 'credit-card',
          paidAmount: paymentMethod ? total : 0,
          dueDate: new Date(checkIn)
        },
        issuedBy: req.userId
      });
      await invoiceDoc.save();
    } catch (invErr) {
      console.error('Auto-invoice on booking error (non-fatal):', invErr.message);
    }

    // Populate for response
    await booking.populate('room', 'roomNumber name type');

    // ── Emit real-time WebSocket event ──
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('staff-room').emit('new-booking', {
          bookingId: booking._id,
          guest: `${user.firstName} ${user.lastName}`,
          room: booking.room?.roomNumber,
          nights
        });
        // Also push to each admin's personal room
        admins.forEach(a => io.to(`user:${a._id}`).emit('notification', { type: 'booking', title: 'New Booking' }));
      }
    } catch (wsErr) { /* non-fatal */ }

    res.status(201).json({
      message: 'Booking created successfully.',
      booking
    });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ message: 'Failed to create booking.' });
  }
});

// Update booking status (admin/staff)
router.patch('/:id/status', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { status } = req.body;
    
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    booking.status = status;

    // Handle check-in/check-out
    if (status === 'checked-in') {
      booking.actualCheckIn = new Date();
      await Room.findByIdAndUpdate(booking.room, { status: 'occupied' });

      // Notify guest
      await Notification.create({
        recipient: booking.guest,
        type: 'check-in',
        title: 'Welcome! Check-in Complete',
        message: 'You have been successfully checked in. Enjoy your stay!',
        metadata: { bookingId: booking._id }
      });

    } else if (status === 'checked-out') {
      booking.actualCheckOut = new Date();
      await Room.findByIdAndUpdate(booking.room, { 
        status: 'cleaning',
        cleaningStatus: 'dirty'
      });

      // ── AUTO-GENERATE INVOICE ──
      try {
        const room = await Room.findById(booking.room);
        const invoiceItems = [{
          description: `Room ${room?.roomNumber || 'N/A'} — ${booking.pricing.nights} night(s)`,
          category: 'room',
          quantity: booking.pricing.nights,
          unitPrice: booking.pricing.roomRate,
          total: booking.pricing.subtotal
        }];

        // Add add-ons as line items
        if (booking.addOns?.length > 0) {
          booking.addOns.forEach(addon => {
            invoiceItems.push({
              description: addon.name,
              category: 'service',
              quantity: addon.quantity || 1,
              unitPrice: addon.price,
              total: addon.price * (addon.quantity || 1)
            });
          });
        }

        const invoice = new Invoice({
          booking: booking._id,
          guest: booking.guest,
          items: invoiceItems,
          summary: {
            subtotal: 0,
            taxRate: 0.16,
            serviceCharge: 0,
            discount: booking.pricing.discount || 0
          },
          payment: {
            status: booking.payment.status === 'paid' ? 'paid' : 'pending',
            method: booking.payment.method,
            paidAmount: booking.payment.paidAmount || 0,
            dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          },
          issuedBy: req.userId
        });
        await invoice.save();
      } catch (invErr) {
        console.error('Auto-invoice error (non-fatal):', invErr.message);
      }

      // ── AUTO-CREATE HOUSEKEEPING TASK ──
      try {
        const room = await Room.findById(booking.room);
        await Task.create({
          title: `Clean Room ${room?.roomNumber || 'N/A'} — Post Checkout`,
          description: `Guest checked out. Room needs cleaning and inspection.`,
          type: 'housekeeping',
          priority: 'high',
          room: booking.room,
          createdBy: req.userId,
          dueDate: new Date(Date.now() + 2 * 60 * 60 * 1000),
          checklist: [
            { item: 'Strip and change bed linens', completed: false },
            { item: 'Clean bathroom', completed: false },
            { item: 'Vacuum and mop floors', completed: false },
            { item: 'Restock minibar and amenities', completed: false },
            { item: 'Final inspection', completed: false }
          ]
        });
      } catch (taskErr) {
        console.error('Auto-housekeeping task error (non-fatal):', taskErr.message);
      }

      // Notify guest about checkout
      await Notification.create({
        recipient: booking.guest,
        type: 'check-out',
        title: 'Check-out Complete',
        message: 'Thank you for staying with us! Your invoice has been generated.',
        metadata: { bookingId: booking._id }
      });

      // Update guest profile visit history
      try {
        const guestProfile = await GuestProfile.findOne({ userId: booking.guest });
        if (guestProfile) {
          await guestProfile.recordVisit(booking);
        }
      } catch (gpErr) {
        console.error('Guest profile update error (non-fatal):', gpErr.message);
      }
    }

    await booking.save();
    await booking.populate('guest', 'firstName lastName email');
    await booking.populate('room', 'roomNumber name type');

    res.json({ message: 'Booking status updated.', booking });
  } catch (error) {
    console.error('Update booking status error:', error);
    res.status(500).json({ message: 'Failed to update booking status.' });
  }
});

// Cancel booking
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const { reason } = req.body;
    
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    // Check access
    if (req.user.role === 'guest' && booking.guest.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Check if can be cancelled
    if (!booking.canBeCancelled() && req.user.role === 'guest') {
      return res.status(400).json({ 
        message: 'Booking cannot be cancelled less than 24 hours before check-in.' 
      });
    }

    // Calculate refund
    let refundAmount = 0;
    const hoursUntilCheckIn = (new Date(booking.checkIn) - new Date()) / (1000 * 60 * 60);
    
    if (hoursUntilCheckIn > 48) {
      refundAmount = booking.payment.paidAmount; // Full refund
    } else if (hoursUntilCheckIn > 24) {
      refundAmount = booking.payment.paidAmount * 0.5; // 50% refund
    }

    booking.status = 'cancelled';
    booking.cancellation = {
      date: new Date(),
      reason,
      refundAmount,
      cancelledBy: req.userId
    };

    if (refundAmount > 0 && booking.payment.paidAmount > 0) {
      booking.payment.status = 'refunded';
    }

    await booking.save();

    res.json({ 
      message: 'Booking cancelled.', 
      refundAmount,
      booking 
    });
  } catch (error) {
    console.error('Cancel booking error:', error);
    res.status(500).json({ message: 'Failed to cancel booking.' });
  }
});

// Add note to booking (admin/staff)
router.post('/:id/notes', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { content } = req.body;
    
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    booking.notes.push({
      content,
      author: req.userId
    });

    await booking.save();
    await booking.populate('notes.author', 'firstName lastName');

    res.json({ message: 'Note added.', notes: booking.notes });
  } catch (error) {
    console.error('Add note error:', error);
    res.status(500).json({ message: 'Failed to add note.' });
  }
});

// Update payment status (admin)
router.patch('/:id/payment', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { amount, method, reference } = req.body;
    
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    booking.payment.paidAmount += amount;
    booking.payment.transactions.push({
      amount,
      method: method || booking.payment.method,
      reference,
      type: 'payment'
    });

    if (booking.payment.paidAmount >= booking.pricing.total) {
      booking.payment.status = 'paid';
    } else if (booking.payment.paidAmount > 0) {
      booking.payment.status = 'partial';
    }

    await booking.save();

    res.json({ message: 'Payment recorded.', booking });
  } catch (error) {
    console.error('Update payment error:', error);
    res.status(500).json({ message: 'Failed to update payment.' });
  }
});

export default router;
