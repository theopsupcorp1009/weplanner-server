import express from 'express';
import cors from 'cors';
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

const mongoClient = await connectToMongoDB();
const db = client.db("wedplan");
const categories = db.collection("categories");
const services = db.collection("services");
const bookings = db.collection("bookings");
const transactions = db.collection("transactions");
const users = db.collection("user");

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

app.get('/categories', async(req, res)=>{
    const result = await categories.find().toArray();
    res.send(result);
})

app.get('/services', async(req, res)=>{
    const result = await services.find().toArray();
    res.send(result);
})

app.get('/services/:id', async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await services.findOne(query);
    res.send(result);
})

app.post('/services', async(req, res)=>{
    const data = req.body;
    const result = await services.insertOne(data);
    res.send(result);
})

app.patch('/services/:id', async(req, res)=>{
    const id = req.params.id;
    const data = req.body;
    const query = {_id: new ObjectId(id)}
    const result = await services.updateOne(query, {$set: data});
    res.send(result);
})

app.delete('/services/:id', async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await services.deleteOne(query);
    res.send(result);
})

app.get('/bookings', async(req, res)=>{
    const result = await bookings.find().toArray();
    res.send(result);
})

app.post('/bookings', async(req, res)=>{
    const data = req.body;
    const result = await bookings.insertOne(data);
    res.send(result);
})

app.get('/bookings/my-bookings/:email', async(req, res)=>{
    const email = req.params.email;
    const query = {customerEmail: email};
    const result = await bookings.find(query).toArray();
    res.send(result);
})

app.patch('/bookings/:id', async(req, res)=>{
    const id = req.params.id;
    const data = req.body;
    const query = {_id: new ObjectId(id)}
    const result = await bookings.updateOne(query, {$set: data});
    res.send(result);
})

app.delete('/bookings/:id', async(req, res)=>{
    const id = req.params.id;
    const query = {_id: new ObjectId(id)}
    const result = await bookings.deleteOne(query);
    res.send(result);
})

app.get('/', async(req, res)=>{
    res.send('Api is working fine');
})

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`)
});

