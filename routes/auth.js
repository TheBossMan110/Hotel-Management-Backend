import express from 'express';
import User from '../models/User.js';
import GuestProfile from '../models/GuestProfile.js';
import { 
  authenticate, 
  generateTokens, 
  verifyRefreshToken,
  setAuthCookies,
  clearAuthCookies
} from '../middleware/auth.js';

const router = express.Router();

// ── Strong password validation ──
function validatePasswordStrength(password) {
  const errors = [];
  if (!password || password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('at least 1 uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('at least 1 lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('at least 1 number');
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) errors.push('at least 1 special character (!@#$%^&* etc.)');
  return errors;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone } = req.body;

    // Strong password validation
    const pwErrors = validatePasswordStrength(password);
    if (pwErrors.length > 0) {
      return res.status(400).json({ message: 'Password must contain: ' + pwErrors.join(', ') + '.' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists. Please log in instead.' });
    }

    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password,
      firstName,
      lastName,
      phone,
      role: 'guest'
    });

    await user.save();

    // Create GuestProfile for new guest users
    try {
      await GuestProfile.create({
        userId: user._id,
        nationality: '',
        idType: 'passport',
        loyaltyPoints: 0,
        membershipTier: 'bronze',
        preferences: {},
        totalVisits: 0,
        totalSpent: 0,
        vipStatus: false,
        blacklisted: false,
        visitHistory: []
      });
    } catch (gpErr) {
      console.error('GuestProfile creation error (non-fatal):', gpErr.message);
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      message: 'Registration successful.',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role
      },
      accessToken
    });
  } catch (error) {
    console.error('Registration error:', error);
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    res.status(500).json({ message: 'Registration failed.' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    // Find user with password
    const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Check if account is active
    if (!user.isActive) {
      return res.status(401).json({ message: 'Account is deactivated. Contact support.' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Update last login
    user.lastLogin = new Date();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Save refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Set cookies
    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      message: 'Login successful.',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone,
        role: user.role,
        avatar: user.avatar,
        department: user.department
      },
      accessToken
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed.' });
  }
});

// Logout
router.post('/logout', authenticate, async (req, res) => {
  try {
    // Clear refresh token in database
    await User.findByIdAndUpdate(req.userId, { refreshToken: null });

    // Clear cookies
    clearAuthCookies(res);

    res.json({ message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Logout failed.' });
  }
});

// Refresh token
router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required.' });
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }

    // Find user and verify stored refresh token
    const user = await User.findById(decoded.userId).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Invalid refresh token.' });
    }

    if (!user.isActive) {
      clearAuthCookies(res);
      return res.status(401).json({ message: 'Account is deactivated.' });
    }

    // Generate new tokens
    const tokens = generateTokens(user._id);

    // Update refresh token in database
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Set new cookies
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);

    res.json({
      message: 'Token refreshed.',
      accessToken: tokens.accessToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    clearAuthCookies(res);
    res.status(500).json({ message: 'Token refresh failed.' });
  }
});

// Get current user
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Failed to get user.' });
  }
});

// Update password
router.put('/password', authenticate, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new password required.' });
    }

    const pwErrors = validatePasswordStrength(newPassword);
    if (pwErrors.length > 0) {
      return res.status(400).json({ message: 'Password must contain: ' + pwErrors.join(', ') + '.' });
    }

    const user = await User.findById(req.userId).select('+password');
    
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('Update password error:', error);
    res.status(500).json({ message: 'Failed to update password.' });
  }
});

// Forgot password (placeholder - would need email service)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    
    // Always return success to prevent email enumeration
    res.json({ 
      message: 'If an account exists with this email, a password reset link has been sent.' 
    });

    // TODO: Implement actual email sending
    // if (user) {
    //   const resetToken = generateResetToken();
    //   user.resetPasswordToken = resetToken;
    //   user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    //   await user.save();
    //   await sendResetEmail(user.email, resetToken);
    // }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ message: 'Request failed.' });
  }
});

export default router;
