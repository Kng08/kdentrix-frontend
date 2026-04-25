const express     = require('express');
const router      = express.Router();
const Appointment = require('../models/Appointment');
const { sendBookingConfirmation } = require('../services/emailService');

// POST /api/appointments — Book a new appointment
router.post('/', async (req, res) => {
  try {
    const { firstName, lastName, phone, email, service, date, time, notes } = req.body;

    if (!firstName || !phone) {
      return res.status(400).json({ success: false, message: 'First name and phone number are required.' });
    }

    const appointment = new Appointment({ firstName, lastName, phone, email, service, date, time, notes });
    await appointment.save();

    // Send confirmation email (non-blocking — failure won't crash the response)
    sendBookingConfirmation(appointment).catch(err => console.error('Email error:', err));

    // Notify admin
    if (process.env.ADMIN_EMAIL) {
      const nodemailer = require('nodemailer');
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
        });
        transporter.sendMail({
          from: `"K-Dentrix System" <${process.env.EMAIL_USER}>`,
          to: process.env.ADMIN_EMAIL,
          subject: `New Booking – ${firstName} ${lastName || ''} (${appointment.bookingRef})`,
          html: `<p>New appointment booked.</p>
                 <ul>
                   <li><strong>Name:</strong> ${firstName} ${lastName || ''}</li>
                   <li><strong>Phone:</strong> ${phone}</li>
                   <li><strong>Email:</strong> ${email || 'N/A'}</li>
                   <li><strong>Service:</strong> ${service || 'N/A'}</li>
                   <li><strong>Date:</strong> ${date || 'TBD'}</li>
                   <li><strong>Time:</strong> ${time || 'TBD'}</li>
                   <li><strong>Ref:</strong> ${appointment.bookingRef}</li>
                 </ul>`,
        }).catch(err => console.error('Admin email error:', err));
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully!',
      bookingRef: appointment.bookingRef,
      appointment,
    });
  } catch (err) {
    console.error('Booking error:', err);
    return res.status(500).json({ success: false, message: 'Failed to book appointment. Please try again.' });
  }
});

// GET /api/appointments/check/:ref — Patient looks up their booking
router.get('/check/:ref', async (req, res) => {
  try {
    const appointment = await Appointment.findOne({ bookingRef: req.params.ref.toUpperCase() });
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Booking not found. Please check your reference number.' });
    }
    return res.json({ success: true, appointment });
  } catch (err) {
    console.error('Lookup error:', err);
    return res.status(500).json({ success: false, message: 'Error looking up booking.' });
  }
});

module.exports = router;
