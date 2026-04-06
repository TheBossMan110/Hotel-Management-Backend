import express from 'express';
import Invoice from '../models/Invoice.js';
import Booking from '../models/Booking.js';
import Room from '../models/Room.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { generateInvoicePDF } from '../services/pdfService.js';
import { sendInvoiceEmail } from '../services/emailService.js';

const router = express.Router();

// ── Backfill invoices for existing bookings that don't have one ──
router.post('/backfill', authenticate, authorize('admin'), async (req, res) => {
  try {
    // Find all bookings
    const allBookings = await Booking.find({}).populate('room', 'roomNumber name type');

    // Find all booking IDs that already have an invoice
    const existingInvoices = await Invoice.find({}).select('booking');
    const invoicedBookingIds = new Set(existingInvoices.map(inv => inv.booking?.toString()).filter(Boolean));

    // Create invoices for bookings missing one
    let created = 0;
    for (const booking of allBookings) {
      const bookingId = booking._id.toString();
      if (invoicedBookingIds.has(bookingId)) continue;

      const nights = booking.pricing?.nights || 1;
      const roomRate = booking.pricing?.roomRate || 0;
      const subtotal = booking.pricing?.subtotal || roomRate * nights;
      const total = booking.pricing?.total || subtotal;
      const roomLabel = booking.room?.roomNumber || 'N/A';

      const invoice = new Invoice({
        booking: booking._id,
        guest: booking.guest,
        items: [{
          description: `Room ${roomLabel} — ${nights} night(s)`,
          category: 'room',
          quantity: nights,
          unitPrice: roomRate,
          total: subtotal
        }],
        summary: {
          subtotal,
          taxRate: 0.1,
          taxes: booking.pricing?.taxes || subtotal * 0.1,
          serviceCharge: 0,
          discount: 0,
          total
        },
        payment: {
          status: booking.payment?.status === 'paid' ? 'paid' : 'pending',
          method: booking.payment?.method || 'credit-card',
          paidAmount: booking.payment?.paidAmount || 0,
          dueDate: new Date(booking.checkIn)
        },
        issuedBy: req.userId
      });

      await invoice.save();
      created++;
    }

    res.json({
      message: `Backfill complete. Created ${created} invoice(s) for ${allBookings.length} total bookings.`,
      created,
      total: allBookings.length
    });
  } catch (error) {
    console.error('Invoice backfill error:', error);
    res.status(500).json({ message: 'Failed to backfill invoices.' });
  }
});

// Get all invoices (admin)
router.get('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { 
      status,
      guestId,
      startDate,
      endDate,
      page = 1, 
      limit = 20,
      sort = '-issuedDate'
    } = req.query;

    const query = {};
    if (status) query['payment.status'] = status;
    if (guestId) query.guest = guestId;
    if (startDate || endDate) {
      query.issuedDate = {};
      if (startDate) query.issuedDate.$gte = new Date(startDate);
      if (endDate) query.issuedDate.$lte = new Date(endDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate('guest', 'firstName lastName email')
        .populate('booking', 'bookingNumber checkIn checkOut')
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Invoice.countDocuments(query)
    ]);

    // Calculate totals
    const stats = await Invoice.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$summary.total' },
          totalPaid: { $sum: '$payment.paidAmount' },
          totalPending: { 
            $sum: { 
              $subtract: ['$summary.total', '$payment.paidAmount'] 
            } 
          }
        }
      }
    ]);

    res.json({
      invoices,
      stats: stats[0] || { totalRevenue: 0, totalPaid: 0, totalPending: 0 },
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get invoices error:', error);
    res.status(500).json({ message: 'Failed to fetch invoices.' });
  }
});

// Get my invoices (guest)
router.get('/my-invoices', authenticate, async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    
    const query = { guest: req.userId };
    if (status) query['payment.status'] = status;

    const skip = (Number(page) - 1) * Number(limit);

    const [invoices, total] = await Promise.all([
      Invoice.find(query)
        .populate({
          path: 'booking',
          select: 'bookingNumber checkIn checkOut pricing room',
          populate: { path: 'room', select: 'roomNumber name type' }
        })
        .sort('-issuedDate')
        .skip(skip)
        .limit(Number(limit)),
      Invoice.countDocuments(query)
    ]);

    res.json({
      invoices,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    console.error('Get my invoices error:', error);
    res.status(500).json({ message: 'Failed to fetch invoices.' });
  }
});

// Get single invoice
router.get('/:id', authenticate, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('guest', 'firstName lastName email phone address')
      .populate('booking', 'bookingNumber checkIn checkOut room')
      .populate('issuedBy', 'firstName lastName');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    // Check access
    if (req.user.role === 'guest' && invoice.guest._id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    res.json({ invoice });
  } catch (error) {
    console.error('Get invoice error:', error);
    res.status(500).json({ message: 'Failed to fetch invoice.' });
  }
});

// Create invoice (admin)
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { bookingId, items, notes } = req.body;

    const booking = await Booking.findById(bookingId).populate('guest');
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found.' });
    }

    // Calculate item totals
    const processedItems = items.map(item => ({
      ...item,
      total: item.unitPrice * (item.quantity || 1)
    }));

    const invoice = new Invoice({
      booking: bookingId,
      guest: booking.guest._id,
      items: processedItems,
      summary: {
        subtotal: 0, // Will be calculated in pre-save
        taxRate: 0.1
      },
      payment: {
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
      },
      notes,
      issuedBy: req.userId
    });

    await invoice.save();
    await invoice.populate('guest', 'firstName lastName email');
    await invoice.populate('booking', 'bookingNumber');

    res.status(201).json({ message: 'Invoice created.', invoice });
  } catch (error) {
    console.error('Create invoice error:', error);
    res.status(500).json({ message: 'Failed to create invoice.' });
  }
});

// Add item to invoice (admin)
router.post('/:id/items', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { description, category, quantity, unitPrice } = req.body;

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    if (invoice.payment.status === 'paid') {
      return res.status(400).json({ message: 'Cannot modify paid invoice.' });
    }

    invoice.items.push({
      description,
      category,
      quantity: quantity || 1,
      unitPrice,
      total: unitPrice * (quantity || 1)
    });

    await invoice.save();

    res.json({ message: 'Item added.', invoice });
  } catch (error) {
    console.error('Add invoice item error:', error);
    res.status(500).json({ message: 'Failed to add item.' });
  }
});

// Record payment (admin)
router.post('/:id/payment', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { amount, method } = req.body;

    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    invoice.payment.paidAmount += amount;
    invoice.payment.method = method;
    invoice.payment.paidDate = new Date();

    await invoice.save();

    // Update booking payment if linked
    if (invoice.booking) {
      await Booking.findByIdAndUpdate(invoice.booking, {
        'payment.status': invoice.payment.status,
        'payment.paidAmount': invoice.payment.paidAmount
      });
    }

    res.json({ message: 'Payment recorded.', invoice });
  } catch (error) {
    console.error('Record payment error:', error);
    res.status(500).json({ message: 'Failed to record payment.' });
  }
});

// Send invoice via email (admin)
router.post('/:id/send', authenticate, authorize('admin'), async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('guest', 'email firstName lastName phone')
      .populate('booking', 'bookingNumber checkIn checkOut pricing');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    const result = await sendInvoiceEmail({
      to: invoice.guest.email,
      invoice,
      booking: invoice.booking,
      guest: invoice.guest
    });

    if (result.success) {
      res.json({ message: `Invoice sent to ${invoice.guest.email}`, invoice });
    } else {
      res.status(500).json({ message: `Failed to send: ${result.error}` });
    }
  } catch (error) {
    console.error('Send invoice error:', error);
    res.status(500).json({ message: 'Failed to send invoice.' });
  }
});

// Download invoice as PDF
router.get('/:id/pdf', authenticate, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('guest', 'firstName lastName email phone')
      .populate('booking', 'bookingNumber checkIn checkOut pricing');

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    // Check access
    if (req.user.role === 'guest' && invoice.guest._id.toString() !== req.userId.toString()) {
      return res.status(403).json({ message: 'Access denied.' });
    }

    const pdfBuffer = await generateInvoicePDF(invoice, invoice.booking, invoice.guest);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=Invoice-${invoice.invoiceNumber}.pdf`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({ message: 'Failed to generate PDF.' });
  }
});

export default router;
