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

app.get('/categories', async(req, res)=>{
    const result = await categories.find().toArray();
    res.send(result);
})



app.post('/services', async(req, res)=>{
    const data = req.body;
    const result = await services.insertOne(data);
    res.send(result);
})


app.get('/', async(req, res)=>{
    res.send('Api is working fine');
})

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`)
});

