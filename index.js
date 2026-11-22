import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import Stripe from 'stripe';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config.js'

const app = express();
app.use(cors());

const port = process.env.PORT || 5000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const client = new MongoClient(process.env.MONGODB_URI);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = client.db("wedplan");
const categories = db.collection("categories");
const services = db.collection("services");
const bookings = db.collection("bookings");
const transactions = db.collection("transactions");
const users = db.collection("user");


app.post('/webhook', express.raw({type: 'application/json'}), async(req, res)=>{
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            req.headers['stripe-signature'],
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        return res.status(400).send({message: 'Invalid webhook signature'});
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const alreadySaved = await transactions.findOne({stripeSessionId: session.id});

        if (session.payment_status === 'paid' && !alreadySaved) {
            const vendorId = session.metadata.vendorId;
            const vendor = await users.findOne({_id: new ObjectId(vendorId)});
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            const periodEnd = subscription.current_period_end || subscription.items.data[0].current_period_end;

            await users.updateOne(
                {_id: new ObjectId(vendorId)},
                {$set: {subscriptionPlan: 'premium', subscriptionExpiresAt: new Date(periodEnd * 1000)}}
            );
            await services.updateMany({vendorId}, {$set: {isPremiumVendor: true}});
            await transactions.insertOne({
                vendorId,
                vendorName: vendor.name,
                vendorEmail: vendor.email,
                plan: 'premium',
                amount: session.amount_total / 100,
                currency: session.currency,
                stripeSessionId: session.id,
                stripeSubscriptionId: session.subscription,
                status: 'paid',
                createdAt: new Date(),
            });
        }
    }

    if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object;
        const periodEnd = subscription.current_period_end || subscription.items.data[0].current_period_end;

        await users.updateOne(
            {_id: new ObjectId(subscription.metadata.vendorId)},
            {$set: {subscriptionExpiresAt: new Date(periodEnd * 1000)}}
        );
    }

    if (event.type === 'customer.subscription.deleted') {
        const vendorId = event.data.object.metadata.vendorId;

        await users.updateOne(
            {_id: new ObjectId(vendorId)},
            {$set: {subscriptionPlan: 'free', subscriptionExpiresAt: null}}
        );
        await services.updateMany({vendorId}, {$set: {isPremiumVendor: false}});
    }

    res.send({received: true});
})

const verifyToken = async (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).send({message: 'Unauthorized'});
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await users.findOne({email: decoded.email});
        if (!user) {
            return res.status(401).send({message: 'Unauthorized'});
        }
        if (user.isBlocked) {
            return res.status(403).send({message: 'Your account is blocked'});
        }
        req.user = user;
        next();
    } catch (err) {
        console.log('Token error:', err.message);
        return res.status(401).send({message: 'Invalid or expired token'});
    }
}

const verifyRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.status(403).send({message: 'Forbidden'});
        }
        next();
    }
}

app.use(express.json());

app.get('/', async(req, res)=>{
    res.send('Api is working fine');
})

app.get('/categories', async(req, res)=>{
    const result = await categories.find().toArray();
    res.send(result);
})

app.get('/services', async(req, res)=>{
    const query = {status: 'approved', isActive: {$ne: false}};
    const result = await services.find(query).toArray();
    res.send(result);
})

app.get('/services/:id', async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await services.findOne(query);
    res.send(result);
})

app.get('/me', verifyToken, async(req, res)=>{
    res.send(req.user);
})

app.post('/payments/create-checkout-session', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const vendorId = req.user._id.toString();

    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [{price: process.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1}],
        customer_email: req.user.email,
        metadata: {vendorId},
        subscription_data: {metadata: {vendorId}},
        success_url: `${process.env.CLIENT_URL}/payment/success`,
        cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
    });

    res.send({url: session.url});
})

app.get('/customer/bookings', verifyToken, verifyRole('customer'), async(req, res)=>{
    const query = {customerId: req.user._id.toString()};
    const result = await bookings.find(query).sort({createdAt: -1}).toArray();
    res.send(result);
})

app.post('/customer/bookings', verifyToken, verifyRole('customer'), async(req, res)=>{
    const { serviceId, eventDate, eventLocation, message } = req.body;
    const customerId = req.user._id.toString();

    if (!eventDate || !eventLocation) {
        return res.status(400).send({message: 'Event date and location are required'});
    }
    if (eventDate < new Date().toISOString().slice(0, 10)) {
        return res.status(400).send({message: 'Event date cannot be in the past'});
    }

    const service = await services.findOne({_id: new ObjectId(serviceId), status: 'approved', isActive: {$ne: false}});
    if (!service || service.creatorMail === req.user.email) {
        return res.status(400).send({message: 'This service is not available for booking'});
    }

    const duplicate = await bookings.findOne({serviceId, eventDate, customerId, status: {$in: ['pending', 'accepted']}});
    if (duplicate) {
        return res.status(400).send({message: 'You already have an active request for this service on this date'});
    }

    const booking = {
        serviceId,
        serviceName: service.serviceName,
        serviceImage: service.images?.[0] || '',
        vendorId: service.vendorId,
        vendorName: service.creatorName,
        creatorMail: service.creatorMail,
        customerId,
        customerName: req.user.name,
        customerEmail: req.user.email,
        eventDate,
        eventLocation,
        message: message || '',
        status: 'pending',
        createdAt: new Date(),
    };
    const result = await bookings.insertOne(booking);
    res.send(result);
})

app.patch('/customer/bookings/:id/cancel', verifyToken, verifyRole('customer'), async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id), customerId: req.user._id.toString(), status: 'pending'}
    const result = await bookings.updateOne(query, {$set: {status: 'cancelled'}});
    if (result.modifiedCount === 0) {
        return res.status(400).send({message: 'Only your pending bookings can be cancelled'});
    }
    res.send(result);
})

app.get('/vendor/services', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const query = {vendorId: req.user._id.toString()};
    const result = await services.find(query).sort({createdAt: -1}).toArray();
    res.send(result);
})

app.post('/vendor/services', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const { serviceName, category, description, price, location, images } = req.body;
    const vendorId = req.user._id.toString();

    if (!serviceName || !category || !description || !price || !location || !images?.length) {
        return res.status(400).send({message: 'All fields and at least one image are required'});
    }

    const activeCount = await services.countDocuments({vendorId, isActive: true, status: {$ne: 'rejected'}});
    if (req.user.subscriptionPlan !== 'premium' && activeCount >= 3) {
        return res.status(400).send({message: 'Free plan allows 3 active services. Upgrade to Premium.'});
    }

    const service = {
        vendorId,
        creatorName: req.user.businessName || req.user.name,
        creatorMail: req.user.email,
        isPremiumVendor: req.user.subscriptionPlan === 'premium',
        serviceName,
        category,
        description,
        price: Number(price),
        location,
        images,
        purchaseCount: 0,
        status: 'pending',
        isActive: true,
        createdAt: new Date(),
    };
    const result = await services.insertOne(service);
    res.send(result);
})

app.patch('/vendor/services/:id', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const id = req.params.id;
    const { serviceName, category, description, price, location, images } = req.body;
    const query = {_id: new ObjectId(id), vendorId: req.user._id.toString()}
    const result = await services.updateOne(query, {$set: {serviceName, category, description, price: Number(price), location, images}});
    res.send(result);
})

app.patch('/vendor/services/:id/availability', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const id = req.params.id;
    const { isActive } = req.body;
    const vendorId = req.user._id.toString();

    const activeCount = await services.countDocuments({vendorId, isActive: true, status: {$ne: 'rejected'}});
    if (isActive && req.user.subscriptionPlan !== 'premium' && activeCount >= 3) {
        return res.status(400).send({message: 'Free plan allows 3 active services. Upgrade to Premium.'});
    }

    const query = {_id: new ObjectId(id), vendorId}
    const result = await services.updateOne(query, {$set: {isActive: Boolean(isActive)}});
    res.send(result);
})

app.delete('/vendor/services/:id', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id), vendorId: req.user._id.toString()}
    const result = await services.deleteOne(query);
    res.send(result);
})

app.get('/vendor/bookings', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const query = {vendorId: req.user._id.toString()};
    const result = await bookings.find(query).sort({createdAt: -1}).toArray();
    res.send(result);
})

app.patch('/vendor/bookings/:id', verifyToken, verifyRole('vendor'), async(req, res)=>{
    const id = req.params.id;
    const { status } = req.body;

    if (status !== 'accepted' && status !== 'rejected') {
        return res.status(400).send({message: 'Status must be accepted or rejected'});
    }

    const query = {_id: new ObjectId(id), vendorId: req.user._id.toString(), status: 'pending'}
    const result = await bookings.updateOne(query, {$set: {status}});
    if (result.modifiedCount === 0) {
        return res.status(400).send({message: 'Only your pending requests can be processed'});
    }
    res.send(result);
})

app.get('/admin/users', verifyToken, verifyRole('admin'), async(req, res)=>{
    const result = await users.find().toArray();
    res.send(result);
})

app.patch('/admin/users/:id', verifyToken, verifyRole('admin'), async(req, res)=>{
    const id = req.params.id;
    const { isBlocked } = req.body;
    const query = {_id: new ObjectId(id), role: {$ne: 'admin'}}
    const result = await users.updateOne(query, {$set: {isBlocked: Boolean(isBlocked)}});
    res.send(result);
})

app.get('/admin/services', verifyToken, verifyRole('admin'), async(req, res)=>{
    const result = await services.find().sort({createdAt: -1}).toArray();
    res.send(result);
})

app.patch('/admin/services/:id', verifyToken, verifyRole('admin'), async(req, res)=>{
    const id = req.params.id;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).send({message: 'Invalid status'});
    }

    const query = {_id: new ObjectId(id)}
    const result = await services.updateOne(query, {$set: {status}});
    res.send(result);
})

app.delete('/admin/services/:id', verifyToken, verifyRole('admin'), async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await services.deleteOne(query);
    res.send(result);
})

app.get('/admin/transactions', verifyToken, verifyRole('admin'), async(req, res)=>{
    const result = await transactions.find().sort({createdAt: -1}).toArray();
    res.send(result);
})

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`)
});

export default app;