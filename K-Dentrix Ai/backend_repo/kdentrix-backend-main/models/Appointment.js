const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, trim: true, default: '' },
  phone:      { type: String, required: true, trim: true },
  email:      { type: String, trim: true, lowercase: true, default: '' },
  service:    { type: String, trim: true, default: '' },
  date:       { type: String, trim: true, default: '' },
  time:       { type: String, trim: true, default: '' },
  notes:      { type: String, trim: true, default: '' },
  bookingRef: { type: String, unique: true },
  status:     { type: String, enum: ['pending', 'confirmed', 'completed', 'cancelled'], default: 'pending' },
  depositPaid:   { type: Boolean, default: false },
  depositAmount: { type: Number, default: 0 },
  paymentRef:    { type: String, default: '' },
}, { timestamps: true });

// Generate a short booking reference before saving
appointmentSchema.pre('save', function (next) {
  if (!this.bookingRef) {
    this.bookingRef = 'KDX-' + Date.now().toString(36).toUpperCase();
  }
  next();
});

module.exports = mongoose.model('Appointment', appointmentSchema);
