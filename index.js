// index.js

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';
import { createClient } from 'redis'; // Import the Redis client

const app = express();
const PORT = process.env.PORT || 3001;

// --- Redis Client Setup ---
// The Redis client is configured using the REDIS_URL environment variable,
// which Render automatically provides when you link a Redis instance.
let redisClient;
(async () => {
    try {
        redisClient = createClient({ url: process.env.REDIS_URL });
        redisClient.on('error', (err) => console.error('Redis Client Error', err));
        await redisClient.connect();
        console.log('Successfully connected to Redis.');
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
    }
})();


// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.json());

// ---
// ENDPOINT 1: The Frontend calls this to start a new job
// ---
app.post('/api/generate', async (req, res) => {
  const jobId = crypto.randomUUID();
  const { prompt, ratio, style } = req.body;

  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    const backendCallbackUrl = `https://cinegen-api.onrender.com/api/n8n-callback/${jobId}`;

    // Await the call to n8n to ensure it's received before we proceed.
    // This prevents telling the frontend a job started when it couldn't be sent.
    await axios.post(n8nWebhookUrl, {
      prompt,
      ratio,
      style,
      jobId,
      callbackUrl: backendCallbackUrl,
    });

    // If the call to n8n is successful, store the pending job status in Redis.
    // We set an expiration of 1 hour (3600 seconds) for the job key.
    await redisClient.set(jobId, JSON.stringify({ status: 'pending' }), { EX: 3600 });
    
    console.log(`Job ${jobId} started successfully and stored in Redis.`);
    res.status(202).json({ jobId });

  } catch (error) {
    console.error("Error calling n8n webhook:", error.message);
    res.status(500).json({ message: 'Failed to communicate with the generation service.' });
  }
});

// ---
// ENDPOINT 2: The n8n workflow calls this when it's finished
// ---
app.post('/api/n8n-callback/:jobId', async (req, res) => {
  const { jobId } = req.params;
  let { imageUrls } = req.body; // Use 'let' to allow modification

  console.log(`Received callback for job ${jobId}. Raw imageUrls type: ${typeof imageUrls}`);

  // --- THE FIX ---
  // Check if imageUrls is a string that looks like an array. This is a common
  // issue when data comes from n8n expressions.
  if (typeof imageUrls === 'string' && imageUrls.startsWith('[') && imageUrls.endsWith(']')) {
    try {
      imageUrls = JSON.parse(imageUrls);
      console.log('Successfully parsed imageUrls string into an array.');
    } catch (e) {
      console.error('Failed to parse imageUrls string, will store as empty array.', e);
      imageUrls = []; // Default to empty array on parsing failure
    }
  }
  // --- END FIX ---

  // Update the job status in Redis with the final result.
  await redisClient.set(jobId, JSON.stringify({ status: 'completed', result: imageUrls }), { EX: 3600 });
  
  res.status(200).send('Callback received and job updated in Redis.');
});


// ---
// ENDPOINT 3: The Frontend calls this repeatedly to check job status
// ---
app.get('/api/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  
  try {
    const jobJSON = await redisClient.get(jobId);

    if (!jobJSON) {
      return res.status(404).json({ message: 'Job not found. It may have expired or never existed.' });
    }
    
    const job = JSON.parse(jobJSON);
    res.status(200).json(job);

  } catch (error) {
    console.error('Error retrieving job from Redis:', error);
    res.status(500).json({ message: 'Error checking job status.' });
  }
});


app.listen(PORT, () => {
  console.log(`Backend server with CORS and Redis enabled listening on port ${PORT}`);
});
