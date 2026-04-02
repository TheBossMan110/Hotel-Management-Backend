import express from 'express';
import ChatLog from '../models/ChatLog.js';
import Room from '../models/Room.js';
import Booking from '../models/Booking.js';
import Settings from '../models/Settings.js';
import Service from '../models/Service.js';
import { authenticate, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

async function callGemini(messages, systemPrompt) {
  const contents = [];

  // Add conversation history
  for (const msg of messages) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    });
  }

  const body = {
    contents,
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.7,
      topP: 0.9,
      topK: 40,
      maxOutputTokens: 1024
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
    ]
  };

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Gemini API error:', errorText);
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'I apologize, I could not generate a response.';
}

// Chat endpoint
router.post('/message', optionalAuth, async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    if (!message || !sessionId) {
      return res.status(400).json({ success: false, message: 'Message and sessionId are required.' });
    }

    if (!GEMINI_API_KEY) {
      return res.status(500).json({ success: false, message: 'AI service not configured.' });
    }

    // Get hotel context
    const [settings, roomTypes, services, userBookings] = await Promise.all([
      Settings.getSettings(),
      Room.aggregate([
        { $match: { isActive: true } },
        { $group: { _id: '$type', count: { $sum: 1 }, minPrice: { $min: '$price.basePrice' }, maxPrice: { $max: '$price.basePrice' } } }
      ]),
      Service.find({ available: true }).select('name category price').lean(),
      req.userId
        ? Booking.find({ guest: req.userId }).populate('room', 'roomNumber name type').sort('-createdAt').limit(5).lean()
        : []
    ]);

    const roomInfo = roomTypes.map(rt =>
      `${rt._id}: ${rt.count} rooms | Rs. ${rt.minPrice?.toLocaleString()} - Rs. ${rt.maxPrice?.toLocaleString()}`
    ).join('\n');

    const servicesInfo = services.map(s => `${s.name} (${s.category}) - Rs. ${s.price?.toLocaleString()}`).join('\n');

    const bookingsInfo = userBookings.length > 0
      ? userBookings.map(b => `${b.bookingNumber}: ${b.room?.name || 'Room'} | ${new Date(b.checkIn).toLocaleDateString()} - ${new Date(b.checkOut).toLocaleDateString()} | Status: ${b.status}`).join('\n')
      : 'No bookings found.';

    const systemPrompt = `You are Azure, the super friendly and fun AI concierge for ${settings.hotelInfo?.name || 'Grand Azure Pakistan'} hotel. You talk like a cool, helpful friend — not a boring robot.

PERSONALITY:
- You're warm, witty, and genuinely caring
- Use casual language when guests are casual (e.g., if they say "yo wassup" reply like "Heyyyyy! 👋 What's good? Welcome to Grand Azure! How can I help you today?")
- Match the guest's energy — if they're formal, be professional; if they're chill, be chill
- Use emojis naturally 🏨✨😊
- Keep responses short and punchy (under 150 words)
- Be enthusiastic about the hotel!

CONVERSATION RULES:
- If someone greets you casually (hi, hey, yo, wassup, salam, etc.) — greet them back warmly and ask how you can help
- If someone asks "how are you" — respond naturally like "I'm great! Thanks for asking 😊 Ready to help you out!"
- Small talk is OK as long as you steer it back to hotel services
- NEVER share code, HTML, CSS, JavaScript or any technical/programming content. If asked, say: "Haha nice try! 😄 I'm your hotel concierge, not a developer! But I CAN help you book an amazing room or find our best services. What do you need?"
- For non-hotel topics (politics, religion, personal advice, etc.): "That's a bit outside my lane! 😅 I'm all about making your hotel stay amazing. Need help with rooms, dining, spa, or anything hotel-related?"

HOTEL INFO:
- Name: ${settings.hotelInfo?.name || 'Grand Azure Pakistan'}
- Tagline: ${settings.hotelInfo?.tagline || 'Authentic Hospitality, Timeless Luxury'}
- Location: ${settings.hotelInfo?.address?.city || 'Lahore'}, Pakistan
- Contact: ${settings.hotelInfo?.contact?.phone || '+92 (42) 111-222-333'}
- Check-in: ${settings.booking?.checkInTime || '2:00 PM'} | Check-out: ${settings.booking?.checkOutTime || '12:00 PM'}
- Currency: PKR (Pakistani Rupees)

ROOM TYPES & PRICING:
${roomInfo || 'Contact front desk for current availability.'}

SERVICES:
${servicesInfo || 'Contact front desk for services.'}

${req.userId ? `GUEST'S BOOKINGS:\n${bookingsInfo}` : 'Guest is not logged in — suggest they log in to see booking info.'}

Remember: You ARE Azure. Be yourself — friendly, helpful, hotel-focused. Make every guest feel special! 🌟`;


    // Load conversation history
    let chatLog = await ChatLog.findOne({ sessionId });
    if (!chatLog) {
      chatLog = new ChatLog({
        sessionId,
        user: req.userId || null,
        messages: []
      });
    }

    // Add user message
    chatLog.messages.push({ role: 'user', content: message });

    // Get recent messages for context (last 10)
    const recentMessages = chatLog.messages.slice(-10);

    // Call Gemini
    const aiResponse = await callGemini(recentMessages, systemPrompt);

    // Save response
    chatLog.messages.push({ role: 'assistant', content: aiResponse });
    await chatLog.save();

    res.json({
      success: true,
      data: {
        reply: aiResponse,
        sessionId
      }
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({
      success: false,
      message: 'AI assistant is temporarily unavailable. Please try again.',
      data: {
        reply: "I apologize, I'm having a brief moment. Please try asking again, or contact our front desk at +92 (42) 111-222-333 for immediate assistance! 🏨",
        sessionId: req.body.sessionId
      }
    });
  }
});

// Get chat history
router.get('/history/:sessionId', optionalAuth, async (req, res) => {
  try {
    const chatLog = await ChatLog.findOne({ sessionId: req.params.sessionId });
    res.json({
      success: true,
      data: chatLog?.messages || []
    });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch history.' });
  }
});

export default router;
