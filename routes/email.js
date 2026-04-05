import express from 'express';
import { sendEmail, buildEmailTemplate } from '../services/emailService.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// Send custom email (authenticated)
router.post('/send', authenticate, async (req, res) => {
  try {
    const { to, subject, message } = req.body;

    if (!to || !subject || !message) {
      return res.status(400).json({ success: false, message: 'To, subject, and message are required.' });
    }

    // Detect if message is pre-built HTML (from contact form) or plain text (from admin composer)
    const isHtml = message.trim().startsWith('<');
    const body = isHtml
      ? message  // contact form sends pre-built HTML body
      : `
      <p style="color:rgba(248,244,239,0.6);font-size:13px;margin:0 0 20px;">
        Message from <strong style="color:#C9A84C;">${req.user.firstName} ${req.user.lastName}</strong>
        &nbsp;·&nbsp; <a href="mailto:${req.user.email}" style="color:#C9A84C;text-decoration:none;">${req.user.email}</a>
      </p>
      <div style="border-left:3px solid #C9A84C;padding:16px 20px;background:rgba(201,168,76,0.05);border-radius:0 8px 8px 0;margin-bottom:24px;">
        ${message.split('\n').map(line => `<p style="margin:6px 0;color:#F8F4EF;font-size:15px;">${line || '&nbsp;'}</p>`).join('')}
      </div>
      <p style="color:rgba(248,244,239,0.35);font-size:12px;margin:0;">
        Sent via LuxuryStay Hospitality admin panel &nbsp;·&nbsp; ${new Date().toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} PKT
      </p>
    `;

    const html = buildEmailTemplate({
      title: subject,
      preheader: `Message from ${req.user.firstName}`,
      body
    });

    const result = await sendEmail({ to, subject, html });

    if (result.success) {
      res.json({ success: true, message: 'Email sent successfully.', data: result.data });
    } else {
      res.status(500).json({ success: false, message: `Failed to send email: ${result.error}` });
    }
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ success: false, message: 'Failed to send email.' });
  }
});

export default router;
