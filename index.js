// index.js

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

// --- SERVER SETUP ---
const app = express();
const PORT = process.env.PORT || 3001;

// Helper to get the correct directory path in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CORS CONFIGURATION (DEBUGGING) ---
// This temporarily allows requests from ANY origin to confirm if CORS is the issue.
app.use(cors());


app.use(express.json());


// --- API ENDPOINTS (No changes needed in the logic here) ---

const jobs = {}; // In-memory job store

// ENDPOINT 1: The Frontend calls this to start a new job
app.post('/api/generate', async (req, res) => {
  const jobId = crypto.randomUUID();
  const { prompt, ratio, style, workflow, optimizePrompt } = req.body;

  const webhookUrls = {
    'IMAGE': process.env.N8N_WORKFLOW_IMAGE,
    'VIDEO': process.env.N8N_WORKFLOW_VIDEO,
  };

  const n8nWebhookUrl = webhookUrls[workflow];

  if (!n8nWebhookUrl) {
    console.error(`Invalid workflow specified: ${workflow}`);
    return res.status(400).json({ message: `Invalid workflow specified: ${workflow}` });
  }

  jobs[jobId] = { status: 'pending' };

  try {
    const backendCallbackUrl = `https://cinegen-api.onrender.com/api/n8n-callback/${jobId}`;

    axios.post(n8nWebhookUrl, {
      prompt, 
      ratio, 
      style, 
      jobId, 
      callbackUrl: backendCallbackUrl,
      optimizePrompt
    }).catch(err => {
        console.error(`Error sending request to n8n workflow '${workflow}':`, err.message);
        jobs[jobId] = { status: 'failed', error: 'Failed to start job.' };
    });

    console.log(`Job ${jobId} started for workflow '${workflow}'. Optimize: ${optimizePrompt}`);
    res.status(202).json({ jobId });

  } catch (error) {
    console.error("Error in /api/generate:", error.message);
    res.status(500).json({ message: 'Failed to start generation job.' });
  }
});

// ENDPOINT 2: The n8n workflow calls this when it's finished
app.post('/api/n8n-callback/:jobId', (req, res) => {
  const { jobId } = req.params;
  let { imageUrls } = req.body;

  console.log(`Received callback for job ${jobId}.`);

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


// ENDPOINT 3: The Frontend calls this repeatedly to check job status
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];

  if (!job) {
    return res.status(404).json({ message: 'Job not found.' });
  }
  
  res.status(200).json(job);
});

app.listen(PORT, () => {
  console.log(`API-only server (DEBUG MODE) listening on port ${PORT}`);
});
