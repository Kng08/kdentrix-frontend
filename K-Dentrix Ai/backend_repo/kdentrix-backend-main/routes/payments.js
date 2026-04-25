const express     = require('express');
const router      = express.Router();
const https       = require('https');
const Appointment = require('../models/Appointment');

// Helper: call Paystack API
function paystackRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.paystack.co',
      port: 443,
      path,
      method,
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => (raw += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); } catch { reject(new Error('Invalid Paystack response')); }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// POST /api/payments/initiate — Start a Paystack payment for a deposit
router.post('/initiate', async (req, res) => {
  try {
    const { bookingRef, email, amount } = req.body;

    if (!bookingRef || !email || !amount) {
      return res.status(400).json({ success: false, message: 'bookingRef, email, and amount are required.' });
    }

    const appointment = await Appointment.findOne({ bookingRef: bookingRef.toUpperCase() });
    if (!appointment) {
      return res.status(404).json({ success: false, message: 'Booking not found.' });
    }

    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(503).json({ success: false, message: 'Payment service is not configured.' });
    }

    // Paystack expects amount in kobo (pesewas for GHS) — multiply by 100
    const paystackRes = await paystackRequest('POST', '/transaction/initialize', {
      email,
      amount: Math.round(parseFloat(amount) * 100),
      currency: 'GHS',
      reference: `${bookingRef}-${Date.now()}`,
      metadata: { bookingRef, appointmentId: appointment._id.toString() },
      callback_url: `${process.env.FRONTEND_URL || ''}/api/payments/verify`,
    });

    if (!paystackRes.status) {
      return res.status(502).json({ success: false, message: paystackRes.message || 'Payment initiation failed.' });
    }

    return res.json({
      success: true,
      authorizationUrl: paystackRes.data.authorization_url,
      reference: paystackRes.data.reference,
    });
  } catch (err) {
    console.error('Payment initiation error:', err);
    return res.status(500).json({ success: false, message: 'Failed to initiate payment.' });
  }
});

// GET /api/payments/verify/:reference — Verify payment after redirect
router.get('/verify/:reference', async (req, res) => {
  try {
    if (!process.env.PAYSTACK_SECRET_KEY) {
      return res.status(503).json({ success: false, message: 'Payment service is not configured.' });
    }

    const paystackRes = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(req.params.reference)}`);

    if (!paystackRes.status || paystackRes.data.status !== 'success') {
      return res.status(402).json({ success: false, message: 'Payment not successful.', data: paystackRes.data });
    }

    const { bookingRef } = paystackRes.data.metadata || {};
    if (bookingRef) {
      await Appointment.findOneAndUpdate(
        { bookingRef },
        {
          depositPaid: true,
          depositAmount: paystackRes.data.amount / 100,
          paymentRef: req.params.reference,
        }
      );
    }

    return res.json({ success: true, message: 'Payment verified successfully.', data: paystackRes.data });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ success: false, message: 'Failed to verify payment.' });
  }
});

// POST /api/payments/webhook — Paystack webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    // Acknowledge immediately
    res.sendStatus(200);

    const event = JSON.parse(req.body);
    if (event.event === 'charge.success') {
      const { metadata, amount, reference } = event.data;
      const bookingRef = metadata && metadata.bookingRef;
      if (bookingRef) {
        await Appointment.findOneAndUpdate(
          { bookingRef },
          { depositPaid: true, depositAmount: amount / 100, paymentRef: reference }
        );
      }
    }
  } catch (err) {
    console.error('Webhook error:', err);
  }
});

module.exports = router;
