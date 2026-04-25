const express     = require('express');
const router      = express.Router();
const jwt         = require('jsonwebtoken');
const Admin       = require('../models/Admin');
const Appointment = require('../models/Appointment');
const { sendStatusUpdate } = require('../services/emailService');

// ── JWT middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorised. Please log in.' });
  }
  try {
    const token = authHeader.split(' ')[1];
    req.admin = jwt.verify(token, process.env.JWT_SECRET || 'kdentrix_secret');
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
}

// POST /api/admin/setup — Create the first admin account (one-time only)
router.post('/setup', async (req, res) => {
  try {
    const existing = await Admin.countDocuments();
    if (existing > 0) {
      return res.status(403).json({ success: false, message: 'Admin account already exists. Setup is disabled.' });
    }

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    const admin = new Admin({ name, email, password });
    await admin.save();

    return res.status(201).json({ success: true, message: 'Admin account created successfully. You can now log in.' });
  } catch (err) {
    console.error('Setup error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create admin account.' });
  }
});

// POST /api/admin/reset — Wipe all admins and create a fresh one
router.post('/reset', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required.' });
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Please provide a valid email address.' });
    }

    // Minimum password length
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    }

    // Clear every existing admin document
    await Admin.deleteMany({});

    // Create the new admin (password is hashed by the pre-save hook)
    const admin = new Admin({ name, email, password });
    await admin.save();

    return res.status(201).json({
      success: true,
      message: 'Admin account reset successfully. You can now log in with the new credentials.',
      admin: { name: admin.name, email: admin.email },
    });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ success: false, message: 'Failed to reset admin account.' });
  }
});

// POST /api/admin/login — Admin login → returns JWT
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin || !(await admin.comparePassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: admin._id, email: admin.email, name: admin.name },
      process.env.JWT_SECRET || 'kdentrix_secret',
      { expiresIn: '8h' }
    );

    return res.json({ success: true, token, admin: { name: admin.name, email: admin.email } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// GET /api/admin/dashboard — Stats + recent bookings (protected)
router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const [total, pending, confirmed, completed, cancelled, recent] = await Promise.all([
      Appointment.countDocuments(),
      Appointment.countDocuments({ status: 'pending' }),
      Appointment.countDocuments({ status: 'confirmed' }),
      Appointment.countDocuments({ status: 'completed' }),
      Appointment.countDocuments({ status: 'cancelled' }),
      Appointment.find().sort({ createdAt: -1 }).limit(10),
    ]);

    return res.json({
      success: true,
      stats: { total, pending, confirmed, completed, cancelled },
      recent,
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
});

// GET /api/admin/appointments — All bookings with optional filters (protected)
router.get('/appointments', authMiddleware, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (status) query.status = status;
    if (search) {
      const re = new RegExp(search, 'i');
      query.$or = [{ firstName: re }, { lastName: re }, { phone: re }, { bookingRef: re }];
    }

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const [appointments, total] = await Promise.all([
      Appointment.find(query).sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
      Appointment.countDocuments(query),
    ]);

    return res.json({ success: true, appointments, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Appointments fetch error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch appointments.' });
  }
});

// PATCH /api/admin/appointments/:id/status — Update booking status (protected)
router.patch('/appointments/:id/status', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${validStatuses.join(', ')}.` });
    }

    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    // Send status update email (non-blocking)
    sendStatusUpdate(appointment).catch(err => console.error('Status email error:', err));

    return res.json({ success: true, message: `Appointment marked as ${status}.`, appointment });
  } catch (err) {
    console.error('Status update error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update appointment status.' });
  }
});

// DELETE /api/admin/appointments/:id — Delete a booking (protected)
router.delete('/appointments/:id', authMiddleware, async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndDelete(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }
    return res.json({ success: true, message: 'Appointment deleted successfully.' });
  } catch (err) {
    console.error('Delete error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete appointment.' });
  }
});

module.exports = router;
