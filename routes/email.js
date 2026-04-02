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

    // Build beautiful HTML email
    const body = `
      <h2>${subject}</h2>
      <p>From: <strong>${req.user.firstName} ${req.user.lastName}</strong> (${req.user.email})</p>
      <div class="divider"></div>
      ${message.split('\n').map(line => `<p>${line}</p>`).join('')}
      <div class="divider"></div>
      <p style="color: #8899a6; font-size: 13px;">This email was sent via Grand Azure Pakistan Hotel Management System.</p>
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
