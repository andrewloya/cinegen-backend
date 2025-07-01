// index.js

import express from 'express';
import axios from 'axios';
import crypto from 'crypto'; // Built-in Node.js module for generating unique IDs

const app = express();
const PORT = process.env.PORT || 3001; // Render will set the PORT environment variable

// This lets our server understand JSON data sent from the frontend
app.use(express.json());

// A simple in-memory "database" to store job status.
// In a real app, you'd use a real database like Redis or Postgres.
// For now, this works! The key is the jobId.
const jobs = {};

// ---
// ENDPOINT 1: The Frontend calls this to start a new job
// ---
app.post('/api/generate', async (req, res) => {
  // Generate a unique ID for this job
  const jobId = crypto.randomUUID();

  // Get the prompt from the request body sent by the frontend
  const { prompt, aspect_ratio, style } = req.body;

  // Store the initial job status
  jobs[jobId] = { status: 'pending' };

  try {
    // THIS IS THE SECRET SAUCE
    // We are telling n8n to call US back at our callback endpoint when it's done.
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL; // Get n8n URL from environment variables
    const backendCallbackUrl = `https://cinegen-api.onrender.com/api/n8n-callback/${jobId}`;

    console.log(`Starting job ${jobId}. Calling n8n and telling it to call back to ${backendCallbackUrl}`);

    // Call the n8n webhook privately from our server
    await axios.post(n8nWebhookUrl, {
      prompt,
      aspect_ratio,
      style,
      jobId, // Pass the jobId to n8n
      callbackUrl: backendCallbackUrl, // Tell n8n where to send the result
    });

    // Immediately respond to the frontend with the job ID.
    // The frontend can now use this ID to check the status.
    res.status(202).json({ jobId });

  } catch (error) {
    console.error("Error calling n8n webhook:", error.message);
    res.status(500).json({ message: 'Failed to start generation job.' });
  }
});

// ---
// ENDPOINT 2: The n8n workflow calls this when it's finished
// ---
app.post('/api/n8n-callback/:jobId', (req, res) => {
  const { jobId } = req.params;
  const { imageUrls } = req.body; // Assuming n8n sends back an object with an imageUrls array

  console.log(`Received callback for job ${jobId}. Images are ready.`);

  // Update the job status and store the result
  jobs[jobId] = { status: 'completed', result: imageUrls };

  // Respond to n8n to let it know we received the data
  res.status(200).send('Callback received.');
});


// ---
// ENDPOINT 3: The Frontend calls this repeatedly to check job status
// ---
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];

  if (!job) {
    return res.status(404).json({ message: 'Job not found.' });
  }

  // Respond with the current job status and result (if completed)
  res.status(200).json(job);
});


app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});