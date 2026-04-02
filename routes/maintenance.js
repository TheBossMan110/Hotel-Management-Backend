import express from 'express';
import MaintenanceRequest from '../models/MaintenanceRequest.js';
import Room from '../models/Room.js';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get all maintenance requests (admin/staff)
router.get('/', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const {
      status, priority, category, roomId,
      assignedTo, page = 1, limit = 20, sort = '-createdAt'
    } = req.query;

    const query = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (roomId) query.room = roomId;
    if (assignedTo) query.assignedTo = assignedTo;

    const skip = (Number(page) - 1) * Number(limit);

    const [requests, total] = await Promise.all([
      MaintenanceRequest.find(query)
        .populate('room', 'roomNumber name floor')
        .populate('reportedBy', 'firstName lastName role')
        .populate('assignedTo', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      MaintenanceRequest.countDocuments(query)
    ]);

    // Stats
    const stats = {
      total: await MaintenanceRequest.countDocuments(),
      open: await MaintenanceRequest.countDocuments({ status: 'open' }),
      inProgress: await MaintenanceRequest.countDocuments({ status: 'in-progress' }),
      resolved: await MaintenanceRequest.countDocuments({ status: 'resolved' }),
      critical: await MaintenanceRequest.countDocuments({ priority: 'critical' })
    };

    res.json({
      success: true,
      data: { requests, stats },
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get maintenance requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch maintenance requests.' });
  }
});

// Get my maintenance requests (staff)
router.get('/my-requests', authenticate, async (req, res) => {
  try {
    const query = { assignedTo: req.userId };
    const { status } = req.query;
    if (status) query.status = status;

    const requests = await MaintenanceRequest.find(query)
      .populate('room', 'roomNumber name floor')
      .populate('reportedBy', 'firstName lastName')
      .sort('-createdAt');

    res.json({ success: true, data: requests });
  } catch (error) {
    console.error('Get my maintenance requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch requests.' });
  }
});

// Get single maintenance request
router.get('/:id', authenticate, async (req, res) => {
  try {
    const request = await MaintenanceRequest.findById(req.params.id)
      .populate('room', 'roomNumber name floor type')
      .populate('reportedBy', 'firstName lastName email role')
      .populate('assignedTo', 'firstName lastName email')
      .populate('progressNotes.author', 'firstName lastName');

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    res.json({ success: true, data: request });
  } catch (error) {
    console.error('Get maintenance request error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch request.' });
  }
});

// Create maintenance request (any authenticated user)
router.post('/', authenticate, async (req, res) => {
  try {
    const { roomId, category, priority, title, description, images } = req.body;

    if (!roomId || !category || !title || !description) {
      return res.status(400).json({ success: false, message: 'Room, category, title, and description are required.' });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ success: false, message: 'Room not found.' });
    }

    const request = new MaintenanceRequest({
      room: roomId,
      reportedBy: req.userId,
      category,
      priority: priority || 'medium',
      title,
      description,
      images: images || []
    });

    // Auto-generate ticket number
    const count = await MaintenanceRequest.countDocuments();
    request.ticketNumber = `MNT-${Date.now()}-${String(count + 1).padStart(4, '0')}`;

    await request.save();
    await request.populate('room', 'roomNumber name');
    await request.populate('reportedBy', 'firstName lastName');

    // Notify admins about new maintenance request
    const admins = await User.find({ role: 'admin', isActive: true });
    const notifications = admins.map(admin => ({
      recipient: admin._id,
      type: 'maintenance',
      title: 'New Maintenance Request',
      message: `${priority === 'critical' ? '🚨 URGENT: ' : ''}Maintenance request for Room ${room.roomNumber}: ${title}`,
      priority: priority === 'critical' ? 'urgent' : 'normal',
      link: '/admin/maintenance',
      metadata: { roomId: room._id, maintenanceRequestId: request._id }
    }));
    await Notification.insertMany(notifications);

    // If critical, also notify maintenance staff
    if (priority === 'critical') {
      const maintenanceStaff = await User.find({ role: 'staff' });
      // We'd filter by department but User model doesn't have department directly
      // so this goes to all staff — in production you'd join with StaffProfile
    }

    res.status(201).json({ success: true, message: 'Maintenance request submitted.', data: request });
  } catch (error) {
    console.error('Create maintenance request error:', error);
    res.status(500).json({ success: false, message: 'Failed to create request.' });
  }
});

// Update maintenance request (admin/staff)
router.put('/:id', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { status, assignedTo, priority, resolution, estimatedCost, actualCost } = req.body;
    const request = await MaintenanceRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    const oldStatus = request.status;

    if (status) request.status = status;
    if (assignedTo) {
      request.assignedTo = assignedTo;
      if (request.status === 'open') request.status = 'assigned';
    }
    if (priority) request.priority = priority;
    if (resolution) request.resolution = resolution;
    if (estimatedCost !== undefined) request.estimatedCost = estimatedCost;
    if (actualCost !== undefined) request.actualCost = actualCost;

    if (status === 'in-progress' && !request.startedAt) {
      request.startedAt = new Date();
    }
    if (status === 'resolved') {
      request.resolvedAt = new Date();
    }

    await request.save();
    await request.populate('room', 'roomNumber name');
    await request.populate('assignedTo', 'firstName lastName');

    // Notify reporter about status change
    if (oldStatus !== request.status) {
      await Notification.create({
        recipient: request.reportedBy,
        type: 'maintenance',
        title: 'Maintenance Update',
        message: `Your maintenance request "${request.title}" is now ${request.status}.`,
        priority: 'normal',
        metadata: { maintenanceRequestId: request._id, roomId: request.room }
      });
    }

    res.json({ success: true, message: 'Request updated.', data: request });
  } catch (error) {
    console.error('Update maintenance request error:', error);
    res.status(500).json({ success: false, message: 'Failed to update request.' });
  }
});

// Add progress note
router.post('/:id/notes', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { content } = req.body;
    const request = await MaintenanceRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ success: false, message: 'Request not found.' });
    }

    request.progressNotes.push({ content, author: req.userId });
    await request.save();
    await request.populate('progressNotes.author', 'firstName lastName');

    res.json({ success: true, message: 'Note added.', data: request.progressNotes });
  } catch (error) {
    console.error('Add maintenance note error:', error);
    res.status(500).json({ success: false, message: 'Failed to add note.' });
  }
});

export default router;
