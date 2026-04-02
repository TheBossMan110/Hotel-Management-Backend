import express from 'express';
import Notification from '../models/Notification.js';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get my notifications
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20, isRead } = req.query;
    const query = { recipient: req.userId };
    if (isRead !== undefined) query.isRead = isRead === 'true';

    const skip = (Number(page) - 1) * Number(limit);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort('-createdAt')
        .skip(skip)
        .limit(Number(limit)),
      Notification.countDocuments(query),
      Notification.countUnread(req.userId)
    ]);

    res.json({
      success: true,
      data: notifications,
      unreadCount,
      pagination: {
        page: Number(page), limit: Number(limit), total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});

// Get unread count only (for badge)
router.get('/unread-count', authenticate, async (req, res) => {
  try {
    const count = await Notification.countUnread(req.userId);
    res.json({ success: true, data: { count } });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ success: false, message: 'Failed to get count.' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found.' });
    }

    res.json({ success: true, data: notification });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read.' });
  }
});

// Mark all as read
router.put('/read-all', authenticate, async (req, res) => {
  try {
    await Notification.markAllRead(req.userId);
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (error) {
    console.error('Mark all read error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all as read.' });
  }
});

// Broadcast notification (admin)
router.post('/broadcast', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { title, message, type, targetRole, priority } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: 'Title and message are required.' });
    }

    const query = { isActive: true };
    if (targetRole) query.role = targetRole;

    const users = await User.find(query);
    const notifications = users.map(user => ({
      recipient: user._id,
      type: type || 'system',
      title,
      message,
      priority: priority || 'normal'
    }));

    await Notification.insertMany(notifications);

    res.json({
      success: true,
      message: `Notification sent to ${notifications.length} users.`,
      data: { recipientCount: notifications.length }
    });
  } catch (error) {
    console.error('Broadcast notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to broadcast.' });
  }
});

// Delete notification
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.userId });
    res.json({ success: true, message: 'Notification deleted.' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete notification.' });
  }
});

export default router;
