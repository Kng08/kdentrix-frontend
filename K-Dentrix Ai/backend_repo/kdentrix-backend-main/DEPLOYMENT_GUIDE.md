# K-Dentrix Backend — Full Deployment Guide
## Stack: Node.js + Express · MongoDB Atlas · Nodemailer · Paystack · Render

---

## FOLDER STRUCTURE

```
kdentrix-backend/
├── server.js                  ← Main app entry point
├── package.json
├── render.yaml                ← Render deployment config
├── .env.example               ← Copy this to .env and fill in values
├── .gitignore
│
├── models/
│   ├── Appointment.js         ← Appointment schema (MongoDB)
│   └── Admin.js               ← Admin user schema
│
├── routes/
│   ├── appointments.js        ← POST /api/appointments (book)
│   ├── admin.js               ← Admin login, dashboard, manage bookings
│   └── payments.js            ← Paystack deposit payment
│
├── services/
│   └── emailService.js        ← All email templates (confirmation, status updates)
│
└── public/
    ├── index.html             ← Your K-Dentrix frontend website
    └── admin.html             ← Admin dashboard (login + manage bookings)
```

---

## STEP 1 — SET UP MONGODB ATLAS (Free Database)

1. Go to https://www.mongodb.com/atlas → "Try Free"
2. Create a free account and sign in
3. Click "Build a Database" → Choose FREE tier (M0) → Select "AWS" → Region: closest to Ghana
4. Create a username and password — SAVE THESE
5. Under "Where would you like to connect from?" → choose "Allow access from anywhere" → Add 0.0.0.0/0
6. Click "Connect" → "Drivers" → Copy the connection string
7. It looks like: mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/
8. Replace <password> with your actual password and add "kdentrix" as the database name:
   mongodb+srv://username:yourpassword@cluster0.xxxxx.mongodb.net/kdentrix

---

## STEP 2 — SET UP GMAIL APP PASSWORD (For sending emails)

1. Go to your Google Account at https://myaccount.google.com
2. Click "Security" → Enable 2-Step Verification if not already done
3. Search for "App Passwords" in the search bar
4. Choose App: "Mail" → Device: "Other" → type "K-Dentrix"
5. Click Generate → You'll get a 16-character password like: abcd efgh ijkl mnop
6. Copy this password — you'll use it as EMAIL_PASS in your .env

---

## STEP 3 — SET UP PAYSTACK (Ghana Payments)

1. Go to https://dashboard.paystack.com → Create a free account
2. Verify your business (K-Dentrix Dental Clinic)
3. Go to Settings → API Keys & Webhooks
4. Copy your SECRET KEY (starts with sk_test_ for test mode)
5. After going live, use your LIVE secret key (sk_live_...)
6. Set Webhook URL to: https://your-render-url.onrender.com/api/payments/webhook

---

## STEP 4 — UPLOAD TO GITHUB

1. Go to https://github.com → Create a free account if you don't have one
2. Click "New Repository" → Name it "kdentrix-backend" → Public → Create
3. Download GitHub Desktop from https://desktop.github.com
4. Open GitHub Desktop → File → Add local repository → Select your kdentrix-backend folder
5. Commit all files → Push to GitHub

---

## STEP 5 — DEPLOY TO RENDER (Free Hosting)

1. Go to https://render.com → Create a free account
2. Click "New +" → "Web Service"
3. Connect your GitHub account → Select "kdentrix-backend" repo
4. Configure:
   - Name: kdentrix-backend
   - Region: Frankfurt (EU) — closest to Ghana
   - Branch: main
   - Build Command: npm install
   - Start Command: npm start
   - Plan: FREE
5. Scroll down to "Environment Variables" and add ALL these:

   Key                    | Value
   -----------------------|------------------------------------------
   MONGODB_URI            | (your MongoDB Atlas connection string)
   JWT_SECRET             | (any long random string)
   EMAIL_USER             | kingsleykaine46@gmail.com
   EMAIL_PASS             | (your 16-char Gmail App Password)
   ADMIN_EMAIL            | kingsleykaine46@gmail.com
   PAYSTACK_SECRET_KEY    | (your Paystack secret key)
   FRONTEND_URL           | https://kdentrix-backend.onrender.com
   NODE_ENV               | production

6. Click "Create Web Service" → Wait 3-5 minutes for it to deploy
7. Your backend URL will be: https://kdentrix-backend.onrender.com

---

## STEP 6 — ADD YOUR FRONTEND TO THE BACKEND

1. Copy your kdentrix.html file → Rename it to "index.html"
2. Place it inside the /public/ folder
3. Commit and push to GitHub → Render will auto-redeploy

Then update the booking form in index.html to call your backend:

```javascript
// Replace the handleBooking() function in index.html with:
async function handleBooking() {
  const firstName = document.querySelector('[name=firstName]').value.trim();
  const phone     = document.querySelector('[name=phone]').value.trim();
  if (!firstName || !phone) { showToast('Please fill in required fields'); return; }

  const formData = {
    firstName,
    lastName:  document.querySelector('[name=lastName]').value,
    phone,
    email:     document.querySelector('[name=email]').value,
    service:   document.querySelector('[name=service]').value,
    date:      document.querySelector('[name=date]').value,
    time:      document.querySelector('[name=time]').value,
    notes:     document.querySelector('[name=notes]').value
  };

  try {
    const res  = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(formData) });
    const data = await res.json();
    if (data.success) {
      showToast('✅ Booked! Ref: ' + data.bookingRef + ' – Check your email!');
    } else {
      showToast('⚠️ ' + data.message);
    }
  } catch {
    showToast('⚠️ Connection error. Please try again.');
  }
}
```

---

## STEP 7 — CREATE YOUR ADMIN ACCOUNT (One-time setup)

After deployment, open your browser and run this once:

```
POST https://kdentrix-backend.onrender.com/api/admin/setup
Body (JSON): {
  "name": "K-Dentrix Admin",
  "email": "kingsleykaine46@gmail.com",
  "password": "YourStrongPassword123!"
}
```

You can do this using a free tool like https://hoppscotch.io or https://www.postman.com

After running setup once, the endpoint is permanently disabled (no duplicate admins).

---

## STEP 8 — ACCESS YOUR ADMIN DASHBOARD

Visit: https://kdentrix-backend.onrender.com/admin.html

Login with the email and password you created in Step 7.

From the dashboard you can:
✅ See all bookings in real-time
✅ Confirm, cancel or mark appointments as complete
✅ Search by patient name, phone, or booking reference
✅ Track payments and deposits
✅ Every status change sends an automatic email to the patient

---

## API ENDPOINTS REFERENCE

| Method | Endpoint                              | Description                    | Auth? |
|--------|---------------------------------------|--------------------------------|-------|
| POST   | /api/appointments                     | Book new appointment           | No    |
| GET    | /api/appointments/check/:ref          | Patient looks up booking       | No    |
| POST   | /api/admin/setup                      | Create first admin (once only) | No    |
| POST   | /api/admin/login                      | Admin login → returns JWT      | No    |
| GET    | /api/admin/dashboard                  | Stats + recent bookings        | ✅ Yes |
| GET    | /api/admin/appointments               | All bookings (filterable)      | ✅ Yes |
| PATCH  | /api/admin/appointments/:id/status    | Update booking status          | ✅ Yes |
| DELETE | /api/admin/appointments/:id           | Delete a booking               | ✅ Yes |
| POST   | /api/payments/initiate                | Start Paystack payment         | No    |
| GET    | /api/payments/verify/:reference       | Verify payment after redirect  | No    |
| POST   | /api/payments/webhook                 | Paystack webhook               | No    |
| GET    | /api/health                           | Server health check            | No    |

---

## ESTIMATED MONTHLY COST

| Service         | Cost              |
|-----------------|-------------------|
| Render (hosting)| FREE (free tier)  |
| MongoDB Atlas   | FREE (M0 tier)    |
| Gmail (email)   | FREE              |
| Paystack        | FREE + 1.5% per txn |
| TOTAL           | ~FREE to start ✅ |

---

## QUESTIONS?

Contact K-Dentrix: kingsleykaine46@gmail.com | 0578 444 450
