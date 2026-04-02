import express from 'express';
import Service from '../models/Service.js';
import ServiceRequest from '../models/ServiceRequest.js';
import Booking from '../models/Booking.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// ─── SERVICE CATALOG ──────────────────────────────────────────────────────────

// Get all services (public)
router.get('/catalog', async (req, res) => {
  try {
    const { category, available } = req.query;
    const query = {};
    if (category) query.category = category;
    if (available !== undefined) query.available = available === 'true';

    const services = await Service.find(query).sort('category name');
    res.json({ success: true, data: services });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch services.' });
  }
});

// Create service (admin)
router.post('/catalog', authenticate, authorize('admin'), async (req, res) => {
  try {
    const service = new Service(req.body);
    await service.save();
    res.status(201).json({ success: true, message: 'Service created.', data: service });
  } catch (error) {
    console.error('Create service error:', error);
    res.status(500).json({ success: false, message: 'Failed to create service.' });
  }
});

// Update service (admin)
router.put('/catalog/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const service = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!service) return res.status(404).json({ success: false, message: 'Service not found.' });
    res.json({ success: true, message: 'Service updated.', data: service });
  } catch (error) {
    console.error('Update service error:', error);
    res.status(500).json({ success: false, message: 'Failed to update service.' });
  }
});

// Delete service (admin)
router.delete('/catalog/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Service deleted.' });
  } catch (error) {
    console.error('Delete service error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete service.' });
  }
});

// ─── SERVICE REQUESTS ─────────────────────────────────────────────────────────

// Get all service requests (admin/staff)
router.get('/requests', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { status, type, page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      ServiceRequest.find(query)
        .populate('guest', 'firstName lastName email phone')
        .populate('booking', 'bookingNumber')
        .populate('room', 'roomNumber name')
        .populate('handledBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      ServiceRequest.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: requests,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (error) {
    console.error('Get service requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch service requests.' });
  }
});

// Get my service requests (guest)
router.get('/my-requests', authenticate, async (req, res) => {
  try {
    const requests = await ServiceRequest.find({ guest: req.userId })
      .populate('room', 'roomNumber name')
      .populate('booking', 'bookingNumber')
      .sort('-createdAt');
    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Get my service requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch requests.' });
  }
});

// Submit service request (guest)
router.post('/requests', authenticate, async (req, res) => {
  try {
    const { bookingId, type, description, items, scheduledTime, priority } = req.body;

    if (!bookingId || !type || !description) {
      return res.status(400).json({ success: false, message: 'Booking, type, and description are required.' });
    }

    const booking = await Booking.findById(bookingId).populate('room');
    if (!booking) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    // Verify guest owns this booking
    if (req.user.role === 'guest' && booking.guest.toString() !== req.userId.toString()) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const request = new ServiceRequest({
      guest: req.userId,
      booking: bookingId,
      room: booking.room._id,
      type,
      description,
      items: items || [],
      scheduledTime,
      priority: priority || 'normal'
    });

    await request.save();
    await request.populate('room', 'roomNumber name');

    // Notify staff
    const admins = await User.find({ role: { $in: ['admin', 'staff'] }, isActive: true });
    const notifications = admins.map(u => ({
      recipient: u._id,
      type: 'service-request',
      title: 'New Service Request',
      message: `${type} request for Room ${booking.room.roomNumber}: ${description.substring(0, 80)}`,
      priority: priority === 'urgent' ? 'urgent' : 'normal',
      metadata: { serviceRequestId: request._id, roomId: booking.room._id }
    }));
    await Notification.insertMany(notifications);

    res.status(201).json({ success: true, message: 'Service requested successfully', data: request });

    // ── Emit real-time WebSocket event ──
    try {
      const io = req.app.get('io');
      if (io) {
        io.to('staff-room').emit('new-service-request', {
          requestId: request._id,
          type,
          description,
          guestInfo: 'New service request ' + (booking.room ? `for Room ${booking.room.roomNumber}` : 'received')
        });
        admins.forEach(u => io.to(`user:${u._id}`).emit('notification', { type: 'service-request', title: 'New Request' }));
      }
    } catch (wsErr) { /* non-fatal */ }

  } catch (error) {
    console.error('Create service request error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit request.' });
  }
});

// Update service request status (admin/staff)
router.put('/requests/:id/status', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { status } = req.body;
    const request = await ServiceRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    request.status = status;
    if (status === 'completed') {
      request.completedAt = new Date();
      request.handledBy = req.userId;
    }
    if (status === 'acknowledged' || status === 'in-progress') {
      request.handledBy = req.userId;
    }

    await request.save();

    // Notify guest
    await Notification.create({
      recipient: request.guest,
      type: 'service-request',
      title: 'Service Request Update',
      message: `Your ${request.type} request is now ${status}.`,
      metadata: { serviceRequestId: request._id }
    });

    res.json({ success: true, message: 'Status updated successfully', data: request });

    // ── Emit real-time WebSocket event ──
    try {
      const io = req.app.get('io');
      if (io) {
        // Ping the staff room
        io.to('staff-room').emit('service-request-updated', {
          requestId: request._id,
          status
        });
        // Ping the guest personally
        if (request.guest) {
          io.to(`user:${request.guest._id}`).emit('notification', { type: 'service-request', title: 'Request Updated' });
        }
      }
    } catch (wsErr) { /* non-fatal */ }

  } catch (error) {
    console.error('Update service request status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
});

export default router;
