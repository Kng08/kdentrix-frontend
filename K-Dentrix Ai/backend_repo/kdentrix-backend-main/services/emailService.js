const nodemailer = require('nodemailer');

function createTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

async function sendBookingConfirmation(appointment) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  if (!appointment.email) return;

  const transporter = createTransport();
  await transporter.sendMail({
    from: `"K-Dentrix Dental Clinic" <${process.env.EMAIL_USER}>`,
    to: appointment.email,
    subject: `Booking Confirmed – Ref: ${appointment.bookingRef}`,
    html: `
      <h2>Thank you, ${appointment.firstName}!</h2>
      <p>Your appointment has been received. Here are your details:</p>
      <ul>
        <li><strong>Booking Ref:</strong> ${appointment.bookingRef}</li>
        <li><strong>Service:</strong> ${appointment.service || 'N/A'}</li>
        <li><strong>Date:</strong> ${appointment.date || 'TBD'}</li>
        <li><strong>Time:</strong> ${appointment.time || 'TBD'}</li>
      </ul>
      <p>We will confirm your appointment shortly. Please keep your booking reference safe.</p>
      <p>– K-Dentrix Dental Clinic</p>
    `,
  });
}

async function sendStatusUpdate(appointment) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  if (!appointment.email) return;

  const statusMessages = {
    confirmed:  'Your appointment has been <strong>confirmed</strong>. We look forward to seeing you!',
    completed:  'Your appointment has been marked as <strong>completed</strong>. Thank you for visiting K-Dentrix!',
    cancelled:  'Unfortunately, your appointment has been <strong>cancelled</strong>. Please contact us to reschedule.',
    pending:    'Your appointment is <strong>pending</strong> review.',
  };

  const transporter = createTransport();
  await transporter.sendMail({
    from: `"K-Dentrix Dental Clinic" <${process.env.EMAIL_USER}>`,
    to: appointment.email,
    subject: `Appointment Update – Ref: ${appointment.bookingRef}`,
    html: `
      <h2>Hello, ${appointment.firstName}!</h2>
      <p>${statusMessages[appointment.status] || 'Your appointment status has been updated.'}</p>
      <ul>
        <li><strong>Booking Ref:</strong> ${appointment.bookingRef}</li>
        <li><strong>Service:</strong> ${appointment.service || 'N/A'}</li>
        <li><strong>Date:</strong> ${appointment.date || 'TBD'}</li>
        <li><strong>Time:</strong> ${appointment.time || 'TBD'}</li>
      </ul>
      <p>– K-Dentrix Dental Clinic</p>
    `,
  });
}

module.exports = { sendBookingConfirmation, sendStatusUpdate };
