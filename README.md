# 🖥️ WedPlan Server

The REST API behind **WedPlan**, a wedding planning platform. Built with **Node.js**, **Express 5**, and **MongoDB**, it handles services, booking requests, admin moderation, and **Stripe** subscriptions for Premium vendors. Every protected route is guarded by JWT verification and server-side role checks.

- 🔗 **Live API:** [wedplan-server-hazel.vercel.app](https://wedplan-server-hazel.vercel.app/)
- 📦 **Server Repository:** [theopsupcorp1009/weplanner-server](https://github.com/theopsupcorp1009/weplanner-server)
- 🌐 **Frontend App:** [wedplan-ten.vercel.app](https://wedplan-ten.vercel.app)
- 📦 **Frontend Repository:** [theopsupcorp1009/wed-planner](https://github.com/theopsupcorp1009/wed-planner)

---

## ✨ Features

- **Services API**: public listing of approved and active services, plus vendor and admin management routes
- **Booking API**: customers create and cancel requests, vendors accept or reject them
- **JWT verification** with `jsonwebtoken` on every protected route
- **Role-based middleware** for `admin`, `vendor`, and `customer`, checked against the database and never trusting the client
- **Blocked user protection**: blocked accounts receive `403` on all protected routes
- **Ownership checks**: vendors and customers can only change their own services and bookings
- **Free plan limit**: free vendors can keep at most 3 active services, Premium vendors have no limit
- **Booking rules**:
  - Customers cannot book their own services
  - Only approved and active services can be booked
  - Past event dates are rejected
  - Duplicate active requests for the same service and event date are rejected
  - Only pending requests can be accepted, rejected, or cancelled
- **Stripe Checkout** subscriptions for the Premium plan
- **Verified Stripe webhook** (`checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`) with signature verification
- **Server-side payment confirmation** that retrieves the Checkout session from Stripe and checks it belongs to the signed-in vendor
- **Idempotent transactions**: a unique index on `stripeSessionId` prevents duplicates when the webhook and the success page confirm the same payment
- **Automatic plan expiry**: expired Premium plans fall back to Free
- **Admin tools** to block or unblock users (admins cannot be blocked), moderate services, and view transactions
- Health check route at `/`

---

## 🖥️ Tech Stack

| Layer          | Technology                                           |
|----------------|-------------------------------------------------------|
| Runtime        | [Node.js](https://nodejs.org/) (ES Modules)           |
| Framework      | [Express](https://expressjs.com/) 5                   |
| Database       | [MongoDB](https://www.mongodb.com/) (official driver) |
| Authentication | JSON Web Tokens (`jsonwebtoken`)                      |
| Payments       | [Stripe](https://stripe.com/) Checkout and Webhooks   |
| Middleware     | cors, express.json                                    |
| Configuration  | dotenv                                                |
| Deployment     | Vercel                                                |

---

## 📂 Project Structure

```
wedplan-server/
├── index.js            # Express app, MongoDB connection, middleware, Stripe logic, and all routes
├── package.json
├── package-lock.json
├── .gitignore
└── .env                # Environment variables (never commit)
```

---

## 🗄️ Database

Data lives in a MongoDB database named `wedplan`. User accounts are created and managed by better-auth in the frontend, and this server reads the same `user` collection.

| Collection     | Purpose                                                             |
|----------------|----------------------------------------------------------------------|
| `user`         | better-auth users with `role`, `isBlocked`, `subscriptionPlan`, `premium`, `subscriptionExpiresAt`, `businessName` |
| `categories`   | Wedding service categories                                           |
| `services`     | Vendor services with `vendorId`, `serviceName`, `category`, `description`, `price`, `location`, `images`, `status`, `isActive`, `createdAt` |
| `bookings`     | Booking requests with `serviceId`, `vendorId`, `customerId`, `eventDate`, `eventLocation`, `message`, `status`, `createdAt` |
| `transactions` | Verified payments with `vendorId`, `plan`, `amount`, `currency`, `stripeSessionId`, `stripeSubscriptionId`, `status`, `createdAt` |

**Status values**

- Service status: `pending`, `approved`, `rejected`
- Booking status: `pending`, `accepted`, `rejected`, `cancelled`

---

## 🔌 API Reference

Protected routes require a JWT:

```http
Authorization: Bearer <token>
```

### Public

| Method | Endpoint         | Description                                  |
|--------|------------------|----------------------------------------------|
| GET    | `/`              | Returns `Api is working fine`                |
| GET    | `/categories`    | List all categories                          |
| GET    | `/services`      | List approved and active services            |
| GET    | `/services/:id`  | Get a single service                         |

### Authenticated (any role)

| Method | Endpoint | Description                       |
|--------|----------|-----------------------------------|
| GET    | `/me`    | Get the signed-in user's record   |

### Customer

| Method | Endpoint                          | Description                                  |
|--------|-----------------------------------|----------------------------------------------|
| GET    | `/customer/bookings`              | List the customer's own bookings             |
| POST   | `/customer/bookings`              | Create a booking request                     |
| PATCH  | `/customer/bookings/:id/cancel`   | Cancel a pending booking                     |

**Booking request body**

```json
{
  "serviceId": "6710f1c2a1b2c3d4e5f60718",
  "eventDate": "2026-12-20",
  "eventLocation": "Dhaka",
  "message": "We would like to book for our wedding."
}
```

### Vendor

| Method | Endpoint                                 | Description                                 |
|--------|------------------------------------------|---------------------------------------------|
| GET    | `/vendor/services`                       | List the vendor's own services              |
| POST   | `/vendor/services`                       | Add a service (starts as `pending`)         |
| PATCH  | `/vendor/services/:id`                   | Update a service                            |
| PATCH  | `/vendor/services/:id/availability`      | Turn a service on or off                    |
| DELETE | `/vendor/services/:id`                   | Delete a service                            |
| GET    | `/vendor/bookings`                       | List booking requests for the vendor        |
| PATCH  | `/vendor/bookings/:id`                   | Accept or reject a pending request          |
| GET    | `/vendor/transactions`                   | List the vendor's payments                  |
| POST   | `/payments/create-checkout-session`      | Start a Stripe Checkout session             |
| POST   | `/payments/confirm`                      | Verify a Checkout session with Stripe       |

**Add service body**

```json
{
  "serviceName": "Golden Hour Photography",
  "category": "Photography & Videography",
  "description": "Full day wedding photography.",
  "price": 25000,
  "location": "Dhaka",
  "images": ["https://i.ibb.co/example.jpg"]
}
```

**Update booking body**

```json
{ "status": "accepted" }
```

### Admin

| Method | Endpoint                  | Description                                        |
|--------|---------------------------|----------------------------------------------------|
| GET    | `/admin/users`            | List all users                                     |
| PATCH  | `/admin/users/:id`        | Block or unblock a non-admin user (`isBlocked`)    |
| GET    | `/admin/services`         | List all services                                  |
| PATCH  | `/admin/services/:id`     | Set status to `pending`, `approved`, or `rejected` |
| DELETE | `/admin/services/:id`     | Delete a service                                   |
| GET    | `/admin/transactions`     | List all transactions                              |

### Stripe webhook

| Method | Endpoint    | Description                                              |
|--------|-------------|----------------------------------------------------------|
| POST   | `/webhook`  | Receives Stripe events, verified with the webhook secret |

Handled events:

| Event                            | Action                                                   |
|----------------------------------|----------------------------------------------------------|
| `checkout.session.completed`     | Marks the vendor Premium and stores the transaction      |
| `customer.subscription.updated`  | Updates the Premium expiry date                          |
| `customer.subscription.deleted`  | Returns the vendor to the Free plan                      |

### Status codes

| Code | Meaning                                                                |
|------|------------------------------------------------------------------------|
| 200  | Request succeeded                                                      |
| 400  | Validation failed, rule violated, or invalid webhook signature         |
| 401  | Missing, invalid, or expired token                                     |
| 403  | Wrong role, blocked account, or payment that belongs to another vendor |
| 500  | Internal server error                                                  |

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ (recommended: latest LTS)
- npm
- A MongoDB database (local or [MongoDB Atlas](https://www.mongodb.com/atlas))
- A Stripe account in test mode with a recurring Premium price
- The [WedPlan frontend](https://github.com/theopsupcorp1009/wed-planner), which creates users and issues JWTs

### Installation

```bash
# Clone the repository
git clone https://github.com/theopsupcorp1009/weplanner-server.git
cd weplanner-server

# Install dependencies
npm install
```

### Environment Variables

Create a `.env` file in the project root:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
CLIENT_URL=http://localhost:3000
JWT_SECRET=your_shared_jwt_secret
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

- `JWT_SECRET` must match the frontend exactly.
- `CLIENT_URL` is the frontend's base URL, used for Stripe success and cancel redirects.
- `PORT` is optional and defaults to `5000`.

> Keep `.env` out of version control and never share real credentials publicly.

### Run the server

```bash
node index.js
```

The API will be available at `http://localhost:5000`. Visit `/` to confirm it is running.

### Test the Stripe webhook locally

Use the [Stripe CLI](https://docs.stripe.com/stripe-cli) to forward events to your local server:

```bash
stripe listen --forward-to localhost:5000/webhook
```

Copy the signing secret it prints into `STRIPE_WEBHOOK_SECRET`.

---

## 🌐 Deployment

The server is deployed on **Vercel**. The Express app is exported from `index.js` so it can run as a serverless function.

To deploy your own copy:

1. Push this repository to your GitHub account without the `.env` file.
2. Import the project into [Vercel](https://vercel.com/new).
3. Add `MONGODB_URI`, `CLIENT_URL`, `JWT_SECRET`, `STRIPE_SECRET_KEY`, `STRIPE_PREMIUM_PRICE_ID`, and `STRIPE_WEBHOOK_SECRET` in the Vercel project settings.
4. In the Stripe dashboard, add a webhook endpoint at `https://<your-server-domain>/webhook` for the three events listed above, and copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
5. Allow Vercel's outbound IP addresses in your MongoDB Atlas network access settings.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the ISC License.

---

## 🙏 Acknowledgments

- Built with [Express](https://expressjs.com/) and the [MongoDB Node.js driver](https://www.mongodb.com/docs/drivers/node/current/)
- Payments by [Stripe](https://stripe.com/)
- Hosted on [Vercel](https://vercel.com/)

---

## 📝 Project Summary

**WedPlan Server** is the backend of a wedding planning platform, exposing a role-based REST API for services, booking requests, admin moderation, and Premium subscriptions. Built with Express 5 and the native MongoDB driver in ES Module style, it verifies a JWT on every protected route, re-checks the user's role and blocked status against the database, and enforces ownership and business rules such as the 3 service limit for free vendors and duplicate booking protection. Stripe Checkout powers the Premium plan, and access is granted only after a verified webhook event or a server-side Checkout session confirmation, with a unique index keeping transactions idempotent. The project demonstrates practical experience with RESTful API design, token-based authorization, payment and webhook handling, MongoDB data modeling, and serverless deployment on Vercel.
