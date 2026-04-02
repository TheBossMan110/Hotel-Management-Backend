import dotenv from 'dotenv';
dotenv.config();

export default {
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/hotel_management'
  },
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret-key-dev',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-key-dev',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES || '7d'
  },
  server: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || 'development'
  },
  client: {
    url: process.env.CLIENT_URL || 'http://localhost:5173'
  },
  resend: {
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY
  }
};
