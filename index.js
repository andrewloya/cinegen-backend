// index.js

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';

const app = express();
const PORT = process.env.PORT || 3001;

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.json());

// A simple in-memory "database" to store job status.
const jobs = {};

// ---
// ENDPOINT 1: The Frontend calls this to start a new job
// ---
app.post('/api/generate', async (req, res) => {
  const jobId = crypto.randomUUID();
  const { prompt, ratio, style } = req.body;

  jobs[jobId] = { status: 'pending' };

  try {
    const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL;
    const backendCallbackUrl = `https://cinegen-api.onrender.com/api/n8n-callback/${jobId}`;

    // Fire-and-forget call to n8n
    axios.post(n8nWebhookUrl, {
      prompt,
      ratio,
      style,
      jobId,
      callbackUrl: backendCallbackUrl,
    }).catch(err => {
        // Log errors from the n8n call but don't crash the server
        console.error("Error sending request to n8n:", err.message);
        jobs[jobId] = { status: 'failed', error: 'Failed to start job.' };
    });

    console.log(`Job ${jobId} started.`);
    res.status(202).json({ jobId });

  } catch (error) {
    console.error("Error in /api/generate:", error.message);
    res.status(500).json({ message: 'Failed to start generation job.' });
  }
});

// ---
// ENDPOINT 2: The n8n workflow calls this when it's finished
// ---
app.post('/api/n8n-callback/:jobId', (req, res) => {
  const { jobId } = req.params;
  let { imageUrls } = req.body;

  console.log(`Received callback for job ${jobId}.`);

  // Parse if imageUrls is a stringified array
  if (typeof imageUrls === 'string' && imageUrls.startsWith('[') && imageUrls.endsWith(']')) {
    try {
      imageUrls = JSON.parse(imageUrls);
    } catch (e) {
      console.error('Failed to parse imageUrls string.', e);
      imageUrls = [];
    }
  }

  jobs[jobId] = { status: 'completed', result: imageUrls };
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
  
  res.status(200).json(job);
});

app.listen(PORT, () => {
  console.log(`Simplified backend server listening on port ${PORT}`);
});
