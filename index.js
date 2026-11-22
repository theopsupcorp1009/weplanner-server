import express from 'express';
import cors from 'cors';
import { MongoClient, ObjectId } from 'mongodb';
import 'dotenv/config.js'

const app = express();
app.use(cors());
app.use(express.json());

const port = process.env.PORT || 5000;

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

