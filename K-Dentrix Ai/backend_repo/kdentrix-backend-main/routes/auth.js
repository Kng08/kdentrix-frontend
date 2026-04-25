const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, name: user.name || '' },
    process.env.JWT_SECRET || 'kdentrix_secret',
    { expiresIn: '7d' }
  );
}

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name || '',
    email: user.email,
    provider: user.googleId ? 'google' : 'email'
  };
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorised. Please log in.' });
  }

  try {
    const token = authHeader.split(' ')[1];
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'kdentrix_secret');
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

router.get('/config', (req, res) => {
  res.json({
    success: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  });
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.json({ success: true, user: sanitizeUser(user) });
  } catch (err) {
    console.error('Auth me error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load user profile.' });
  }
});

router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ success: false, message: 'An account with that email already exists.' });
    }

    const user = new User({
      name: name.trim(),
      email: normalizedEmail,
      password
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: 'User registered successfully.',
      token: signToken(user),
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ success: false, message: 'Failed to register user.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user || !(await user.isValidPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    return res.json({
      success: true,
      message: 'User logged in successfully.',
      token: signToken(user),
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google credential is required.' });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(503).json({ success: false, message: 'Google sign-in is not configured on the server.' });
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const email = (payload.email || '').trim().toLowerCase();
    const name = (payload.name || payload.given_name || 'Google User').trim();
    const googleId = payload.sub;

    if (!email || !googleId) {
      return res.status(400).json({ success: false, message: 'Google account details are incomplete.' });
    }

    let user = await User.findOne({ $or: [{ email }, { googleId }] });

    if (!user) {
      user = new User({
        name,
        email,
        googleId,
        password: `google-${googleId}-${Date.now()}`
      });
    } else {
      user.googleId = googleId;
      if (!user.name) user.name = name;
      if (!user.password) user.password = `google-${googleId}-${Date.now()}`;
    }

    await user.save();

    return res.json({
      success: true,
      message: 'Google sign-in successful.',
      token: signToken(user),
      user: sanitizeUser(user)
    });
  } catch (err) {
    console.error('Google auth error:', err);
    return res.status(500).json({ success: false, message: 'Google sign-in failed. Please try again.' });
  }
});

module.exports = router;
