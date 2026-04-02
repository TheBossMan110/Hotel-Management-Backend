import PDFDocument from 'pdfkit';

const HOTEL_NAME = 'Grand Azure Pakistan';
const HOTEL_TAGLINE = 'Authentic Hospitality, Timeless Luxury';
const HOTEL_ADDRESS = 'Main Boulevard, Gulberg III, Lahore, Punjab 54000, Pakistan';
const HOTEL_PHONE = '+92 (42) 111-222-333';
const HOTEL_EMAIL = 'info@grandazure.pk';

/**
 * Generate a professional PDF invoice and return it as a Buffer
 */
export async function generateInvoicePDF(invoice, booking, guest) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];

      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const colors = {
        primary: '#1e3a5f',
        gold: '#c49b2a',
        text: '#333333',
        lightText: '#666666',
        border: '#e0e0e0',
        bg: '#f8f9fc'
      };

      // ─── Header ────────────────────────────────────────────────────────
      doc.rect(0, 0, 612, 120).fill(colors.primary);

      doc.fillColor('#d4af37')
        .fontSize(28)
        .font('Helvetica-Bold')
        .text(`🏨 ${HOTEL_NAME}`, 50, 35, { align: 'left' });

      doc.fillColor('#a0b4c8')
        .fontSize(10)
        .font('Helvetica')
        .text(HOTEL_TAGLINE, 50, 70)
        .text(`${HOTEL_ADDRESS}`, 50, 85)
        .text(`${HOTEL_PHONE} | ${HOTEL_EMAIL}`, 50, 100);

      // INVOICE label
      doc.fillColor('#ffffff')
        .fontSize(24)
        .font('Helvetica-Bold')
        .text('INVOICE', 400, 40, { align: 'right', width: 162 });

      doc.fillColor('#d4af37')
        .fontSize(12)
        .text(invoice.invoiceNumber || 'N/A', 400, 70, { align: 'right', width: 162 });

      // ─── Invoice Details ─────────────────────────────────────────────────
      let y = 140;

      doc.fillColor(colors.text).fontSize(11).font('Helvetica-Bold');
      doc.text('Bill To:', 50, y);
      doc.font('Helvetica').fillColor(colors.lightText);
      doc.text(`${guest?.firstName || 'Guest'} ${guest?.lastName || ''}`, 50, y + 18);
      doc.text(`${guest?.email || ''}`, 50, y + 33);
      if (guest?.phone) doc.text(guest.phone, 50, y + 48);

      doc.fillColor(colors.text).font('Helvetica-Bold');
      doc.text('Invoice Date:', 350, y);
      doc.font('Helvetica').fillColor(colors.lightText);
      doc.text(new Date(invoice.issuedDate || invoice.createdAt).toLocaleDateString('en-PK', { year: 'numeric', month: 'long', day: 'numeric' }), 350, y + 18);

      doc.fillColor(colors.text).font('Helvetica-Bold');
      doc.text('Payment Status:', 350, y + 38);

      const statusColor = invoice.payment?.status === 'paid' ? '#22c55e' : '#ef4444';
      doc.fillColor(statusColor).font('Helvetica-Bold');
      doc.text((invoice.payment?.status || 'pending').toUpperCase(), 455, y + 38);

      // ─── Booking Info ──────────────────────────────────────────────────
      y = 220;
      doc.rect(50, y, 512, 55).fill(colors.bg);
      doc.fillColor(colors.text).fontSize(10).font('Helvetica-Bold');
      doc.text('Booking Reference', 65, y + 10);
      doc.text('Check-in', 200, y + 10);
      doc.text('Check-out', 330, y + 10);
      doc.text('Duration', 460, y + 10);

      doc.font('Helvetica').fillColor(colors.lightText).fontSize(10);
      doc.text(booking?.bookingNumber || 'N/A', 65, y + 30);
      doc.text(booking?.checkIn ? new Date(booking.checkIn).toLocaleDateString() : 'N/A', 200, y + 30);
      doc.text(booking?.checkOut ? new Date(booking.checkOut).toLocaleDateString() : 'N/A', 330, y + 30);

      const nights = booking?.pricing?.nights || 0;
      doc.text(`${nights} night${nights !== 1 ? 's' : ''}`, 460, y + 30);

      // ─── Line Items Table ────────────────────────────────────────────────
      y = 300;

      // Table header
      doc.rect(50, y, 512, 28).fill(colors.primary);
      doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold');
      doc.text('Description', 65, y + 8);
      doc.text('Qty', 340, y + 8, { width: 50, align: 'center' });
      doc.text('Unit Price', 390, y + 8, { width: 80, align: 'right' });
      doc.text('Total', 475, y + 8, { width: 75, align: 'right' });

      y += 28;

      // Table rows
      const items = invoice.items || [];
      items.forEach((item, i) => {
        if (i % 2 === 0) {
          doc.rect(50, y, 512, 24).fill('#fafafa');
        }

        doc.fillColor(colors.text).fontSize(9).font('Helvetica');
        doc.text(item.description || 'Item', 65, y + 7, { width: 260 });
        doc.text(String(item.quantity || 1), 340, y + 7, { width: 50, align: 'center' });
        doc.text(`Rs. ${(item.unitPrice || 0).toLocaleString()}`, 390, y + 7, { width: 80, align: 'right' });
        doc.text(`Rs. ${(item.total || 0).toLocaleString()}`, 475, y + 7, { width: 75, align: 'right' });

        y += 24;
      });

      // Separator
      doc.moveTo(50, y + 5).lineTo(562, y + 5).stroke(colors.border);
      y += 15;

      // ─── Summary ───────────────────────────────────────────────────────
      const summaryX = 380;

      doc.fillColor(colors.lightText).fontSize(10).font('Helvetica');
      doc.text('Subtotal:', summaryX, y);
      doc.text(`Rs. ${(invoice.summary?.subtotal || 0).toLocaleString()}`, 475, y, { width: 75, align: 'right' });
      y += 18;

      doc.text(`Tax (${((invoice.summary?.taxRate || 0.16) * 100).toFixed(0)}%):`, summaryX, y);
      doc.text(`Rs. ${(invoice.summary?.taxes || 0).toLocaleString()}`, 475, y, { width: 75, align: 'right' });
      y += 18;

      if (invoice.summary?.serviceCharge > 0) {
        doc.text('Service Charge:', summaryX, y);
        doc.text(`Rs. ${invoice.summary.serviceCharge.toLocaleString()}`, 475, y, { width: 75, align: 'right' });
        y += 18;
      }

      if (invoice.summary?.discount > 0) {
        doc.fillColor('#22c55e');
        doc.text('Discount:', summaryX, y);
        doc.text(`-Rs. ${invoice.summary.discount.toLocaleString()}`, 475, y, { width: 75, align: 'right' });
        y += 18;
      }

      // Total
      doc.moveTo(summaryX, y + 2).lineTo(562, y + 2).stroke(colors.gold);
      y += 10;

      doc.fillColor(colors.primary).fontSize(14).font('Helvetica-Bold');
      doc.text('TOTAL:', summaryX, y);
      doc.text(`Rs. ${(invoice.summary?.total || 0).toLocaleString()}`, 455, y, { width: 97, align: 'right' });

      // ─── Footer ────────────────────────────────────────────────────────
      const footerY = 720;
      doc.moveTo(50, footerY).lineTo(562, footerY).stroke(colors.border);

      doc.fillColor(colors.lightText).fontSize(8).font('Helvetica');
      doc.text('Thank you for choosing Grand Azure Pakistan! We look forward to welcoming you again.', 50, footerY + 10, { align: 'center', width: 512 });
      doc.text(`This is a computer-generated invoice. Generated on ${new Date().toLocaleDateString()}.`, 50, footerY + 25, { align: 'center', width: 512 });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

export default { generateInvoicePDF };
