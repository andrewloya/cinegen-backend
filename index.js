// index.js

import express from 'express';
import axios from 'axios';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
// --- AWS SDK Imports ---
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// --- SERVER SETUP ---
const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- MIDDLEWARE ---
app.use(cors());
// This limit is still good to have, but not for file uploads anymore.
app.use(express.json({ limit: '1mb' })); 
// Serve static files (like CSS, images, and your HTML files) from the 'public' directory
// Note: You might need to adjust this path depending on your project structure.
// If your 'public' folder is at the root, and 'index.js' is in a 'backend' folder, this should be correct.
app.use(express.static(path.join(__dirname, '..', 'public')));


// --- AWS S3 SETUP ---
// It's critical to use environment variables for your AWS credentials and not hardcode them.
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    }
});
const BUCKET_NAME = process.env.S3_BUCKET_NAME;


// --- PAGE ROUTING ---
// When a user visits the root URL '/', send them the new main home page.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// When a user visits '/image', send them the image generator tool page.
app.get('/image', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'image.html'));
});

// When a user visits '/video', send them the new video generator tool page.
app.get('/video', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'video.html'));
});


// --- API ENDPOINTS ---
const jobs = {}; // Note: This is not a persistent job store. Consider Redis for production.

/**
 * NEW ENDPOINT: /api/get-presigned-url
 * Generates a secure, temporary URL that the frontend can use to upload a file directly to S3.
 */
app.post('/api/get-presigned-url', async (req, res) => {
    // Ensure required environment variables are set
    if (!BUCKET_NAME || !process.env.AWS_REGION) {
        console.error('S3 bucket name or region is not configured in environment variables.');
        return res.status(500).json({ message: 'Server configuration error for file uploads.' });
    }

    const { fileName, fileType } = req.body;
    if (!fileName || !fileType) {
        return res.status(400).json({ message: 'fileName and fileType are required.' });
    }

    // Create a unique file name using a random UUID to prevent file overwrites in the bucket.
    const uniqueFileName = `${crypto.randomUUID()}-${fileName}`;
    
    // This command describes the object we want to create in S3.
    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: uniqueFileName,
        ContentType: fileType,
    });

    try {
        // Generate the presigned URL. It will be valid for 1 hour (3600 seconds).
        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
        
        // This is the permanent public URL of the file after it's uploaded.
        const fileUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${uniqueFileName}`;
        
        res.status(200).json({ uploadUrl, fileUrl });
    } catch (error) {
        console.error("Error creating presigned URL:", error);
        res.status(500).json({ message: 'Could not create upload URL.' });
    }
});


/**
 * ENDPOINT: /api/generate
 * Starts a new generation job. It now expects an 'image_url' from S3 instead of a Base64 string.
 */
app.post('/api/generate', async (req, res) => {
  const jobId = crypto.randomUUID();
  const payload = req.body;
  const n8nRouterWebhookUrl = process.env.N8N_ROUTER_WEBHOOK;

  if (!n8nRouterWebhookUrl) {
    console.error('N8N_ROUTER_WEBHOOK environment variable not set.');
    return res.status(500).json({ message: 'Server configuration error.' });
  }

  jobs[jobId] = { status: 'pending' };

  try {
    const backendCallbackUrl = `https://cinegen-api.onrender.com/api/n8n-callback/${jobId}`;
    
    // Forward the job to n8n, including the job ID and the callback URL for n8n to use when done.
    axios.post(n8nRouterWebhookUrl, {
      ...payload,
      jobId, 
      callbackUrl: backendCallbackUrl,
    }).catch(err => {
        // This catch block handles errors in sending the request to n8n.
        console.error(`Error sending request to n8n router:`, err.message);
        jobs[jobId] = { status: 'failed', error: 'Failed to start job.' };
    });

    console.log(`Job ${jobId} forwarded to router for workflow '${payload.workflow}' with model '${payload.model}'.`);
    res.status(202).json({ jobId });

  } catch (error) {
    console.error("Error in /api/generate:", error.message);
    res.status(500).json({ message: 'Failed to start generation job.' });
  }
});

/**
 * ENDPOINT: /api/n8n-callback/:jobId
 * This is the webhook that n8n will call when a generation job is complete.
 */
app.post('/api/n8n-callback/:jobId', (req, res) => {
  const { jobId } = req.params;
  let { imageUrls, finalPrompt, error } = req.body;
  
  console.log(`Received callback for job ${jobId}.`);

  if (error) {
      console.error(`Job ${jobId} failed with error: ${error}`);
      jobs[jobId] = { status: 'failed', error: error };
  } else {
      // Ensure imageUrls is an array, as n8n might return a single string.
      if (typeof imageUrls === 'string') {
        try { imageUrls = JSON.parse(imageUrls); } catch (e) { imageUrls = [imageUrls]; }
      }
      jobs[jobId] = { status: 'completed', result: imageUrls, finalPrompt: finalPrompt || 'Prompt not provided' };
  }
  
  res.status(200).send('Callback received.');
});

/**
 * ENDPOINT: /api/status/:jobId
 * The frontend polls this endpoint to check the status of a generation job.
 */
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = jobs[jobId];

  if (!job) { 
    return res.status(404).json({ message: 'Job not found.' }); 
  }
  res.status(200).json(job);
});

// --- START SERVER ---
app.listen(PORT, () => {
  console.log(`API server listening on port ${PORT}`);
});
