# WedPlan — Server

Express + MongoDB + Stripe API for the **WedPlan** wedding planning platform.

The client lives in a separate repository (Next.js). This server handles
authentication tokens, services, bookings, admin actions, and Stripe
subscriptions for Premium vendors.

## Live API

- **API base URL:** `https://<your-server-url>` (replace after deployment)

## Tech Stack

- Node.js + Express 5
- MongoDB (official `mongodb` driver)
- Stripe (Checkout + Subscriptions + Webhooks)
- JSON Web Tokens (`jsonwebtoken`) for role-based access
- `cors` + `dotenv`

## Getting Started

```bash
npm install
node index.js
```

The server listens on `PORT` (default `5000`) and connects to MongoDB on boot.

## Environment Variables

Create a `.env` file in the project root. **Never commit this file.**

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>/<db>
CLIENT_URL=http://localhost:3000

JWT_SECRET=<long-random-string>

STRIPE_SECRET_KEY=sk_test_...
STRIPE_PREMIUM_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## API Routes

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| GET | `/` | public | Health check |
| GET | `/categories` | public | List service categories |
| GET | `/services` | public | List approved + active services |
| GET | `/services/:id` | public | Single service details |
| GET | `/me` | auth | Current user profile |
| POST | `/payments/create-checkout-session` | vendor | Start Stripe Checkout |
| POST | `/payments/confirm` | vendor | Verify a paid session server-side |
| GET | `/vendor/transactions` | vendor | Vendor payment history |
| GET/POST | `/customer/bookings` | customer | List / create booking requests |
| PATCH | `/customer/bookings/:id/cancel` | customer | Cancel a booking request |
| GET/POST | `/vendor/services` | vendor | List / create services (free plan max 3) |
| PATCH/DELETE | `/vendor/services/:id` | vendor | Update / delete a service |
| PATCH | `/vendor/services/:id/availability` | vendor | Toggle service availability |
| GET/PATCH | `/vendor/bookings` | vendor | List / update booking requests |
| GET/PATCH | `/admin/users` | admin | List / block users |
| GET/PATCH/DELETE | `/admin/services` | admin | Approve / remove services |
| GET | `/admin/transactions` | admin | Platform transactions |
| POST | `/webhook` | Stripe | Stripe webhook endpoint |

## Stripe Setup

1. Create a Premium recurring **Price** in the Stripe dashboard and copy its id
   into `STRIPE_PREMIUM_PRICE_ID`.
2. Forward webhooks locally:

   ```bash
   stripe listen --forward-to localhost:5000/webhook
   ```

   Copy the printed signing secret into `STRIPE_WEBHOOK_SECRET`.
3. On a successful payment the server stores the transaction and activates
   Premium immediately (the webhook and the success-page confirmation share the
   same idempotent handler).

## Premium Rules

- Vendors start on the **free** plan (`premium: false`).
- Free vendors can keep up to **3 active services**; the API returns `400` with
  `"Free plan allows 3 active services. Upgrade to Premium."` beyond that.
- Premium is activated after a paid checkout and expires with the Stripe
  subscription period.

## Deployment Guideline

1. Push this repository to GitHub (without `.env`).
2. Deploy to a Node host (Render, Railway, Fly.io, etc.).
3. Set every environment variable from the list above in the host dashboard.
   Set `CLIENT_URL` to the deployed client origin.
4. In Stripe, add a webhook endpoint pointing to
   `https://<your-server-url>/webhook` for the events
   `checkout.session.completed`, `customer.subscription.updated`, and
   `customer.subscription.deleted`.
5. Verify `GET https://<your-server-url>/` returns `Api is working fine`.
