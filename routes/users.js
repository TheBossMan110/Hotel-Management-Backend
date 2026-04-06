import express from 'express';
import User from '../models/User.js';
import Booking from '../models/Booking.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// ── Global search: rooms, bookings, guests, staff ──
router.get('/search', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) {
      return res.json({ results: [] });
    }

    const regex = { $regex: q, $options: 'i' };

    // Import models dynamically
    const Room = (await import('../models/Room.js')).default;
    const Booking = (await import('../models/Booking.js')).default;

    const [rooms, guests, staffMembers, bookings] = await Promise.all([
      Room.find({ $or: [{ roomNumber: regex }, { type: regex }, { name: regex }] })
        .limit(5).select('roomNumber type status'),
      User.find({ role: 'guest', $or: [{ firstName: regex }, { lastName: regex }, { email: regex }] })
        .limit(5).select('firstName lastName email'),
      User.find({ role: 'staff', $or: [{ firstName: regex }, { lastName: regex }, { email: regex }, { department: regex }] })
        .limit(5).select('firstName lastName email department'),
      Booking.find({})
        .populate('guest', 'firstName lastName')
        .populate('room', 'roomNumber type')
        .limit(100)
        .select('guest room status checkIn bookingNumber')
        .then(bookings => bookings.filter(b => {
          const gn = `${b.guest?.firstName || ''} ${b.guest?.lastName || ''}`.toLowerCase();
          const rn = `${b.room?.roomNumber || ''} ${b.room?.type || ''}`.toLowerCase();
          const bn = (b.bookingNumber || '').toLowerCase();
          return gn.includes(q.toLowerCase()) || rn.includes(q.toLowerCase()) || bn.includes(q.toLowerCase());
        }).slice(0, 5))
    ]);

    const results = [
      ...rooms.map(r => ({ type: 'room', id: r._id, label: `Room ${r.roomNumber} — ${r.type}`, sublabel: r.status, link: '/admin/rooms' })),
      ...guests.map(g => ({ type: 'guest', id: g._id, label: `${g.firstName} ${g.lastName}`, sublabel: g.email, link: '/admin/guests' })),
      ...staffMembers.map(s => ({ type: 'staff', id: s._id, label: `${s.firstName} ${s.lastName}`, sublabel: s.department, link: '/admin/staff' })),
      ...bookings.map(b => ({ type: 'booking', id: b._id, label: `${b.guest?.firstName || ''} ${b.guest?.lastName || ''} — Room ${b.room?.roomNumber || '?'}`, sublabel: b.status, link: '/admin/bookings' }))
    ];

    res.json({ results });
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ message: 'Search failed.' });
  }
});

// Get all users (admin only)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { 
      role, 
      department,
      search,
      isActive,
      page = 1, 
      limit = 20,
      sort = '-createdAt'
    } = req.query;

    const query = {};
    if (role) query.role = role;
    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [users, total] = await Promise.all([
      User.find(query)
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(query)
    ]);

    res.json({
      users,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Failed to fetch users.' });
  }
});

// Get staff members (admin and staff)
router.get('/staff', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { department } = req.query;
    
    const query = { role: 'staff' };
    if (department) query.department = department;

    const staff = await User.find(query).sort('department firstName');
    
    // Group by department
    const grouped = staff.reduce((acc, member) => {
      const dept = member.department || 'other';
      if (!acc[dept]) acc[dept] = [];
      acc[dept].push(member);
      return acc;
    }, {});

    res.json({ staff, grouped });
  } catch (error) {
    console.error('Get staff error:', error);
    res.status(500).json({ message: 'Failed to fetch staff.' });
  }
});

// Get guests (admin/staff)
router.get('/guests', authenticate, authorize('admin', 'staff'), async (req, res) => {
  try {
    const { 
      membershipTier,
      search,
      page = 1,
      limit = 20
    } = req.query;

    const query = { role: 'guest' };
    if (membershipTier) query.membershipTier = membershipTier;
    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    // Use aggregation to join with Bookings and count them
    const [guests, total] = await Promise.all([
      User.aggregate([
        { $match: query },
        { $sort: { loyaltyPoints: -1 } },
        { $skip: skip },
        { $limit: Number(limit) },
        {
          $lookup: {
            from: 'bookings',
            localField: '_id',
            foreignField: 'guest',
            as: 'bookings'
          }
        },
        {
          $addFields: {
            totalBookings: { $size: '$bookings' },
            totalSpent: {
              $sum: '$bookings.pricing.total'
            }
          }
        },
        { $project: { bookings: 0, password: 0, refreshToken: 0 } }
      ]),
      User.countDocuments(query)
    ]);

    res.json({
      guests,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get guests error:', error);
    res.status(500).json({ message: 'Failed to fetch guests.' });
  }
});

// Get single user
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Check access
    if (req.user.role === 'guest' && req.params.id !== req.userId.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to fetch user.' });
  }
});

// Update profile (own profile or admin)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check access
    if (req.user.role !== 'admin' && id !== req.userId.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    // Fields users can update themselves
    const allowedFields = ['firstName', 'lastName', 'phone', 'avatar', 'address', 'preferences'];
    
    // Admin can update additional fields
    const adminFields = ['role', 'department', 'isActive', 'loyaltyPoints', 'membershipTier'];
    
    const updates = {};
    Object.keys(req.body).forEach(key => {
      if (allowedFields.includes(key)) {
        updates[key] = req.body[key];
      }
      if (req.user.role === 'admin' && adminFields.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'Profile updated.', user });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Failed to update user.' });
  }
});

// Create staff member (admin only)
router.post('/staff', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, department } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered.' });
    }

    const user = new User({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      phone,
      role: 'staff',
      department
    });

    await user.save();

    res.status(201).json({ message: 'Staff member created.', user });
  } catch (error) {
    console.error('Create staff error:', error);
    res.status(500).json({ message: 'Failed to create staff member.' });
  }
});

// Deactivate user (admin only)
router.patch('/:id/deactivate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User deactivated.', user });
  } catch (error) {
    console.error('Deactivate user error:', error);
    res.status(500).json({ message: 'Failed to deactivate user.' });
  }
});

// Reactivate user (admin only)
router.patch('/:id/activate', authenticate, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive: true },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User activated.', user });
  } catch (error) {
    console.error('Activate user error:', error);
    res.status(500).json({ message: 'Failed to activate user.' });
  }
});

// Delete user (admin only - hard delete)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.json({ message: 'User deleted.' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Failed to delete user.' });
  }
});

export default router;
