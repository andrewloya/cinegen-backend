// index.js

import express from 'express';
import axios from 'axios';
import cors from 'cors'; // <-- 1. IMPORT THE CORS PACKAGE
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3001;

// --- MIDDLEWARE SETUP ---
app.use(cors()); // <-- 2. USE THE MIDDLEWARE. This is the fix!
app.use(express.json());

// A simple in-memory "database" to store job status.
const jobs = {};

// ---
// ENDPOINT 1: The Frontend calls this to start a new job
// ---
app.post('/api/generate', async (req, res) => {
  const jobId = crypto.randomUUID();
  const { prompt, ratio, style } = req.body; // Corrected to match UI

  jobs[jobId] = { status: 'pending' };

  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    // NOTE: Make sure your Render app name is correct here
    const backendCallbackUrl = `https://cinegen-api.onrender.com/api/n8n-callback/${jobId}`;

    console.log(`Starting job ${jobId}. Calling n8n and telling it to call back to ${backendCallbackUrl}`);

    // Call the n8n webhook privately
    axios.post(n8nWebhookUrl, {
      prompt,
      ratio, // Pass ratio
      style, // Pass style
      jobId,
      callbackUrl: backendCallbackUrl,
    });

    // Immediately respond to the frontend with the job ID.
    res.status(202).json({ jobId });

  } catch (error) {
    console.error("Error calling n8n webhook:", error.message);
    jobs[jobId] = { status: 'failed', error: 'Failed to start job.' };
    res.status(500).json({ message: 'Failed to start generation job.' });
  }
});

// ---
// ENDPOINT 2: The n8n workflow calls this when it's finished
// ---
app.post('/api/n8n-callback/:jobId', (req, res) => {
  const { jobId } = req.params;
  const { imageUrls } = req.body;

  console.log(`Received callback for job ${jobId}.`);

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
  console.log(`Backend server with CORS enabled listening on port ${PORT}`);
});
