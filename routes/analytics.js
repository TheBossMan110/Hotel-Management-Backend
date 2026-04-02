import express from 'express';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import User from '../models/User.js';
import Invoice from '../models/Invoice.js';
import Task from '../models/Task.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Dashboard overview (admin)
router.get('/dashboard', authenticate, authorize('admin'), async (req, res) => {
  try {
    const today = new Date();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));

    // Parallel queries for performance
    const [
      totalRooms,
      occupiedRooms,
      totalBookings,
      monthlyBookings,
      totalGuests,
      monthlyRevenue,
      pendingTasks,
      checkInsToday,
      checkOutsToday
    ] = await Promise.all([
      Room.countDocuments({ isActive: true }),
      Room.countDocuments({ status: 'occupied' }),
      Booking.countDocuments(),
      Booking.countDocuments({ createdAt: { $gte: startOfMonth } }),
      User.countDocuments({ role: 'guest' }),
      Invoice.aggregate([
        { $match: { issuedDate: { $gte: startOfMonth } } },
        { $group: { _id: null, total: { $sum: '$summary.total' } } }
      ]),
      Task.countDocuments({ status: { $in: ['pending', 'in-progress'] } }),
      Booking.countDocuments({
        checkIn: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999))
        },
        status: 'confirmed'
      }),
      Booking.countDocuments({
        checkOut: {
          $gte: new Date(new Date().setHours(0, 0, 0, 0)),
          $lt: new Date(new Date().setHours(23, 59, 59, 999))
        },
        status: 'checked-in'
      })
    ]);

    const occupancyRate = totalRooms > 0 ? ((occupiedRooms / totalRooms) * 100).toFixed(1) : 0;

    res.json({
      overview: {
        totalRooms,
        occupiedRooms,
        occupancyRate: Number(occupancyRate),
        totalBookings,
        monthlyBookings,
        totalGuests,
        monthlyRevenue: monthlyRevenue[0]?.total || 0,
        pendingTasks,
        checkInsToday,
        checkOutsToday
      }
    });
  } catch (error) {
    console.error('Dashboard analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch analytics.' });
  }
});

// Revenue analytics (admin)
router.get('/revenue', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { period = 'monthly', year = new Date().getFullYear() } = req.query;

    let groupBy;
    if (period === 'daily') {
      groupBy = { $dayOfMonth: '$issuedDate' };
    } else if (period === 'weekly') {
      groupBy = { $week: '$issuedDate' };
    } else {
      groupBy = { $month: '$issuedDate' };
    }

    const revenue = await Invoice.aggregate([
      {
        $match: {
          issuedDate: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${Number(year) + 1}-01-01`)
          }
        }
      },
      {
        $group: {
          _id: groupBy,
          revenue: { $sum: '$summary.total' },
          paid: { $sum: '$payment.paidAmount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Revenue by category
    const byCategory = await Invoice.aggregate([
      {
        $match: {
          issuedDate: {
            $gte: new Date(`${year}-01-01`),
            $lt: new Date(`${Number(year) + 1}-01-01`)
          }
        }
      },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.category',
          total: { $sum: '$items.total' }
        }
      },
      { $sort: { total: -1 } }
    ]);

    res.json({ revenue, byCategory, year: Number(year), period });
  } catch (error) {
    console.error('Revenue analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch revenue analytics.' });
  }
});

// Occupancy analytics (admin)
router.get('/occupancy', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    // Daily occupancy
    const dailyOccupancy = await Booking.aggregate([
      {
        $match: {
          status: { $in: ['checked-in', 'checked-out'] },
          checkIn: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$checkIn' } },
          bookings: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // By room type
    const byRoomType = await Booking.aggregate([
      {
        $match: {
          status: { $in: ['confirmed', 'checked-in', 'checked-out'] },
          createdAt: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: 'rooms',
          localField: 'room',
          foreignField: '_id',
          as: 'roomData'
        }
      },
      { $unwind: '$roomData' },
      {
        $group: {
          _id: '$roomData.type',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Average stay duration
    const avgStayDuration = await Booking.aggregate([
      {
        $match: {
          status: { $in: ['checked-out'] },
          checkOut: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: null,
          avgNights: { $avg: '$pricing.nights' }
        }
      }
    ]);

    res.json({
      dailyOccupancy,
      byRoomType,
      avgStayDuration: avgStayDuration[0]?.avgNights?.toFixed(1) || 0
    });
  } catch (error) {
    console.error('Occupancy analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch occupancy analytics.' });
  }
});

// Booking source analytics (admin)
router.get('/booking-sources', authenticate, authorize('admin'), async (req, res) => {
  try {
    const sources = await Booking.aggregate([
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 },
          revenue: { $sum: '$pricing.total' }
        }
      },
      { $sort: { count: -1 } }
    ]);

    res.json({ sources });
  } catch (error) {
    console.error('Booking sources error:', error);
    res.status(500).json({ message: 'Failed to fetch booking sources.' });
  }
});

// Guest analytics (admin)
router.get('/guests', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Membership distribution
    const membershipDistribution = await User.aggregate([
      { $match: { role: 'guest' } },
      {
        $group: {
          _id: '$membershipTier',
          count: { $sum: 1 },
          totalPoints: { $sum: '$loyaltyPoints' }
        }
      }
    ]);

    // New guests this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const newGuestsThisMonth = await User.countDocuments({
      role: 'guest',
      createdAt: { $gte: startOfMonth }
    });

    // Top guests by bookings
    const topGuests = await Booking.aggregate([
      { $match: { status: { $in: ['confirmed', 'checked-in', 'checked-out'] } } },
      {
        $group: {
          _id: '$guest',
          totalBookings: { $sum: 1 },
          totalSpent: { $sum: '$pricing.total' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'guestData'
        }
      },
      { $unwind: '$guestData' },
      {
        $project: {
          firstName: '$guestData.firstName',
          lastName: '$guestData.lastName',
          email: '$guestData.email',
          membershipTier: '$guestData.membershipTier',
          totalBookings: 1,
          totalSpent: 1
        }
      }
    ]);

    res.json({
      membershipDistribution,
      newGuestsThisMonth,
      topGuests
    });
  } catch (error) {
    console.error('Guest analytics error:', error);
    res.status(500).json({ message: 'Failed to fetch guest analytics.' });
  }
});

export default router;
