import express from 'express';
import Settings from '../models/Settings.js';
import User from '../models/User.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Get settings (admin)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    res.json({ settings });
  } catch (error) {
    console.error('Get settings error:', error);
    res.status(500).json({ message: 'Failed to fetch settings.' });
  }
});

// Get public settings (for booking widget, etc.)
router.get('/public', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    
    // Return only public-safe settings
    res.json({
      hotelInfo: {
        name: settings.hotelInfo.name,
        tagline: settings.hotelInfo.tagline,
        address: settings.hotelInfo.address,
        contact: settings.hotelInfo.contact,
        socialMedia: settings.hotelInfo.socialMedia
      },
      booking: {
        checkInTime: settings.booking.checkInTime,
        checkOutTime: settings.booking.checkOutTime,
        minAdvanceBooking: settings.booking.minAdvanceBooking,
        maxAdvanceBooking: settings.booking.maxAdvanceBooking
      },
      pricing: {
        currency: settings.pricing.currency,
        currencySymbol: settings.pricing.currencySymbol
      }
    });
  } catch (error) {
    console.error('Get public settings error:', error);
    res.status(500).json({ message: 'Failed to fetch settings.' });
  }
});

// Update hotel info (admin)
router.put('/hotel-info', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    settings.hotelInfo = { ...settings.hotelInfo, ...req.body };
    await settings.save();
    res.json({ message: 'Hotel info updated.', hotelInfo: settings.hotelInfo });
  } catch (error) {
    console.error('Update hotel info error:', error);
    res.status(500).json({ message: 'Failed to update hotel info.' });
  }
});

// Update booking settings (admin)
router.put('/booking', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    settings.booking = { ...settings.booking, ...req.body };
    await settings.save();
    res.json({ message: 'Booking settings updated.', booking: settings.booking });
  } catch (error) {
    console.error('Update booking settings error:', error);
    res.status(500).json({ message: 'Failed to update booking settings.' });
  }
});

// Update pricing settings (admin)
router.put('/pricing', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    settings.pricing = { ...settings.pricing, ...req.body };
    await settings.save();
    res.json({ message: 'Pricing settings updated.', pricing: settings.pricing });
  } catch (error) {
    console.error('Update pricing settings error:', error);
    res.status(500).json({ message: 'Failed to update pricing settings.' });
  }
});

// Update notification settings (admin)
router.put('/notifications', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    settings.notifications = { ...settings.notifications, ...req.body };
    await settings.save();
    res.json({ message: 'Notification settings updated.', notifications: settings.notifications });
  } catch (error) {
    console.error('Update notification settings error:', error);
    res.status(500).json({ message: 'Failed to update notification settings.' });
  }
});

// Update security settings (admin)
router.put('/security', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    settings.security = { ...settings.security, ...req.body };
    await settings.save();
    res.json({ message: 'Security settings updated.', security: settings.security });
  } catch (error) {
    console.error('Update security settings error:', error);
    res.status(500).json({ message: 'Failed to update security settings.' });
  }
});

// Update integration settings (admin)
router.put('/integrations', authenticate, authorize('admin'), async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    settings.integrations = { ...settings.integrations, ...req.body };
    await settings.save();
    res.json({ message: 'Integration settings updated.', integrations: settings.integrations });
  } catch (error) {
    console.error('Update integrations error:', error);
    res.status(500).json({ message: 'Failed to update integration settings.' });
  }
});

// Update self profile (admin)
router.put('/profile', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;
    const user = await User.findById(req.userId);
    
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email.toLowerCase();
    if (phone) user.phone = phone;
    
    await user.save();
    res.json({ message: 'Profile updated successfully.', user });
  } catch (error) {
    console.error('Update admin profile error:', error);
    res.status(500).json({ message: 'Failed to update profile.' });
  }
});

// Change password (admin) proxy
router.post('/password', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password required.' });
    }

    const user = await User.findById(req.userId).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password.' });
  }
});

// Toggle maintenance mode (admin)
router.post('/maintenance', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { enabled, message } = req.body;
    
    const settings = await Settings.getSettings();
    settings.maintenance = {
      maintenanceMode: enabled,
      maintenanceMessage: message || 'The system is currently under maintenance.'
    };
    await settings.save();
    
    res.json({ 
      message: enabled ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.',
      maintenance: settings.maintenance
    });
  } catch (error) {
    console.error('Toggle maintenance error:', error);
    res.status(500).json({ message: 'Failed to toggle maintenance mode.' });
  }
});

export default router;
