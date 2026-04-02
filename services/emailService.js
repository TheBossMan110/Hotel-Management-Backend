import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const HOTEL_NAME = 'Grand Azure Pakistan';

/**
 * Send a custom email via Resend
 */
export async function sendEmail({ to, subject, html, text }) {
  try {
    const result = await resend.emails.send({
      from: `${HOTEL_NAME} <${FROM_EMAIL}>`,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || undefined,
      text: text || undefined
    });
    console.log('Email sent:', result);
    return { success: true, data: result };
  } catch (error) {
    console.error('Email send error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Generate a beautiful HTML email template
 */
export function buildEmailTemplate({ title, preheader, body, footerText }) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f4f7fa; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
    .email-wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .email-header { background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%); padding: 32px 40px; text-align: center; }
    .email-header h1 { color: #d4af37; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: 1px; }
    .email-header p { color: #a0b4c8; margin: 8px 0 0; font-size: 14px; }
    .email-body { padding: 40px; color: #333; line-height: 1.7; font-size: 15px; }
    .email-body h2 { color: #1e3a5f; margin-top: 0; font-size: 22px; }
    .email-body p { margin: 12px 0; }
    .email-body .highlight-box { background: #f8f9fc; border-left: 4px solid #d4af37; padding: 16px 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .email-body .btn { display: inline-block; background: linear-gradient(135deg, #d4af37, #c49b2a); color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .email-footer { background: #f4f7fa; padding: 24px 40px; text-align: center; color: #8899a6; font-size: 12px; border-top: 1px solid #e8ecf0; }
    .email-footer a { color: #1e3a5f; text-decoration: none; }
    .divider { height: 1px; background: #e8ecf0; margin: 24px 0; }
    @media (max-width: 600px) {
      .email-body { padding: 24px; }
      .email-header { padding: 24px; }
    }
  </style>
</head>
<body>
  <div style="padding: 20px;">
    ${preheader ? `<div style="display:none;font-size:1px;color:#f4f7fa;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
    <div class="email-wrapper">
      <div class="email-header">
        <h1>🏨 ${HOTEL_NAME}</h1>
        <p>Authentic Hospitality, Timeless Luxury</p>
      </div>
      <div class="email-body">
        ${body}
      </div>
      <div class="email-footer">
        <p>${footerText || `© ${new Date().getFullYear()} ${HOTEL_NAME}. All rights reserved.`}</p>
        <p>Main Boulevard, Gulberg III, Lahore, Pakistan</p>
        <p><a href="tel:+9242111222333">+92 (42) 111-222-333</a> | <a href="mailto:info@grandazure.pk">info@grandazure.pk</a></p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Send an invoice email
 */
export async function sendInvoiceEmail({ to, invoice, booking, guest }) {
  const itemsHtml = invoice.items.map(item => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">${item.description}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: center;">${item.quantity}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">Rs. ${item.unitPrice?.toLocaleString()}</td>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee; text-align: right;">Rs. ${item.total?.toLocaleString()}</td>
    </tr>
  `).join('');

  const body = `
    <h2>Invoice ${invoice.invoiceNumber}</h2>
    <p>Dear ${guest.firstName} ${guest.lastName},</p>
    <p>Thank you for choosing ${HOTEL_NAME}. Please find your invoice details below:</p>

    <div class="highlight-box">
      <strong>Booking:</strong> ${booking.bookingNumber}<br>
      <strong>Check-in:</strong> ${new Date(booking.checkIn).toLocaleDateString()}<br>
      <strong>Check-out:</strong> ${new Date(booking.checkOut).toLocaleDateString()}
    </div>

    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="background: #f8f9fc;">
          <th style="padding: 10px 0; text-align: left; font-weight: 600;">Description</th>
          <th style="padding: 10px 0; text-align: center; font-weight: 600;">Qty</th>
          <th style="padding: 10px 0; text-align: right; font-weight: 600;">Price</th>
          <th style="padding: 10px 0; text-align: right; font-weight: 600;">Total</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div style="text-align: right; margin-top: 16px;">
      <p>Subtotal: <strong>Rs. ${invoice.summary.subtotal?.toLocaleString()}</strong></p>
      <p>Tax (${(invoice.summary.taxRate * 100).toFixed(0)}%): <strong>Rs. ${invoice.summary.taxes?.toLocaleString()}</strong></p>
      ${invoice.summary.discount > 0 ? `<p>Discount: <strong>-Rs. ${invoice.summary.discount?.toLocaleString()}</strong></p>` : ''}
      <div class="divider"></div>
      <p style="font-size: 20px; color: #1e3a5f;">Total: <strong>Rs. ${invoice.summary.total?.toLocaleString()}</strong></p>
    </div>

    <p>Payment Status: <strong style="color: ${invoice.payment.status === 'paid' ? '#22c55e' : '#ef4444'};">${invoice.payment.status.toUpperCase()}</strong></p>

    <p>We hope you enjoyed your stay. Looking forward to welcoming you again!</p>
  `;

  const html = buildEmailTemplate({
    title: `Invoice ${invoice.invoiceNumber}`,
    preheader: `Your invoice from ${HOTEL_NAME}`,
    body
  });

  return sendEmail({ to, subject: `Invoice ${invoice.invoiceNumber} - ${HOTEL_NAME}`, html });
}

export default { sendEmail, buildEmailTemplate, sendInvoiceEmail };
