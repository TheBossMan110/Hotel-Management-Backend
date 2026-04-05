import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const HOTEL_NAME = 'LuxuryStay Hospitality';

// Resolve and encode frontend logo as Base64 for direct inline rendering
const LOGO_PATH = path.resolve(__dirname, '../../frontend code/public/logo.png');
let logoSrc = 'https://luxurystay-hospitality.vercel.app/logo.png'; // fallback
try {
  if (fs.existsSync(LOGO_PATH)) {
    const logoData = fs.readFileSync(LOGO_PATH);
    logoSrc = `data:image/png;base64,${logoData.toString('base64')}`;
  }
} catch (err) {
  console.log('Failed to read logo file, using fallback URL.');
}

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
 * Generate a stunning luxury HTML email template
 */
export function buildEmailTemplate({ title, preheader, body, footerText }) {
  // If logo attachment fails, fallback to a hosted placeholder or text
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#0A0A0A;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  ${preheader ? `<div style="display:none;font-size:1px;color:#0A0A0A;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</div>` : ''}
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0A0A0A;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;border-radius:16px;overflow:hidden;border:1px solid rgba(201,168,76,0.25);box-shadow:0 0 80px rgba(201,168,76,0.06);">

        <!-- HEADER -->
        <tr>
          <td style="background:linear-gradient(135deg,#0F0F0F 0%,#1A1400 50%,#0F0F0F 100%);padding:40px 40px 32px;text-align:center;border-bottom:1px solid rgba(201,168,76,0.2);">
            <img src="${logoSrc}" alt="${HOTEL_NAME}" width="160" style="max-width:160px;height:auto;display:inline-block;margin-bottom:16px;" />
            <div style="width:48px;height:1px;background:linear-gradient(90deg,transparent,#C9A84C,transparent);margin:0 auto 16px;"></div>
            <p style="color:rgba(201,168,76,0.7);font-size:11px;letter-spacing:4px;text-transform:uppercase;margin:0;font-family:'Segoe UI',sans-serif;">Premium Hospitality · Pakistan</p>
          </td>
        </tr>

        <!-- TITLE BAR -->
        <tr>
          <td style="background:#111111;padding:20px 40px;border-bottom:1px solid rgba(201,168,76,0.1);">
            <h1 style="color:#F8F4EF;margin:0;font-size:20px;font-weight:300;letter-spacing:0.5px;">${title}</h1>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:#111111;padding:32px 40px;color:#F8F4EF;font-size:15px;line-height:1.75;">
            ${body}
          </td>
        </tr>

        <!-- DIVIDER -->
        <tr>
          <td style="background:#111111;padding:0 40px;">
            <div style="height:1px;background:linear-gradient(90deg,transparent,rgba(201,168,76,0.3),transparent);"></div>
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#0D0D0D;padding:28px 40px;text-align:center;border-top:1px solid rgba(201,168,76,0.1);">
            <p style="color:rgba(248,244,239,0.6);font-size:13px;margin:0 0 6px;">${footerText || `© ${new Date().getFullYear()} ${HOTEL_NAME}. All rights reserved.`}</p>
            <p style="color:rgba(248,244,239,0.35);font-size:12px;margin:0 0 4px;">Main Boulevard, Gulberg III, Lahore, Pakistan</p>
            <p style="margin:8px 0 0;">
              <a href="tel:+9242111222333" style="color:#C9A84C;text-decoration:none;font-size:12px;">+92 (42) 111-222-333</a>
              <span style="color:rgba(201,168,76,0.3);margin:0 8px;">|</span>
              <a href="mailto:info@luxurystay.pk" style="color:#C9A84C;text-decoration:none;font-size:12px;">info@luxurystay.pk</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
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
