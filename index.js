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
// ENDPOINT 1: The Frontend calls this to start a new job (MODIFIED)
// ---
app.post('/api/generate', async (req, res) => {
  const jobId = crypto.randomUUID();
  // --- CHANGE 1: Read the new 'workflow' property from the request body ---
  const { prompt, ratio, style, workflow } = req.body;

  // --- CHANGE 2: Create a lookup for your n8n webhook URLs ---
  // Ensure you have set these environment variables in your Render dashboard.
  const webhookUrls = {
    'IMAGE': process.env.N8N_WORKFLOW_IMAGE,
    'VIDEO': process.env.N8N_WORKFLOW_VIDEO,
    // Add other workflows here as needed
    // 'TRANSCODE': process.env.N8N_WORKFLOW_TRANSCODE, 
  };

  // --- CHANGE 3: Select the webhook URL based on the 'workflow' identifier ---
  const n8nWebhookUrl = webhookUrls[workflow];

  // --- CHANGE 4: Add error handling for an invalid workflow identifier ---
  if (!n8nWebhookUrl) {
    console.error(`Invalid workflow specified: ${workflow}`);
    return res.status(400).json({ message: `Invalid workflow specified: ${workflow}` });
  }

  jobs[jobId] = { status: 'pending' };

  try {
    // This URL must be your public Render URL
    const backendCallbackUrl = `https://cinegen-api.onrender.com/api/n8n-callback/${jobId}`;

    // Fire-and-forget call to the *selected* n8n webhook
    axios.post(n8nWebhookUrl, {
      prompt,
      ratio,
      style,
      jobId,
      callbackUrl: backendCallbackUrl,
    }).catch(err => {
        // Log errors from the n8n call but don't crash the server
        console.error(`Error sending request to n8n workflow '${workflow}':`, err.message);
        jobs[jobId] = { status: 'failed', error: 'Failed to start job.' };
    });

    console.log(`Job ${jobId} started for workflow '${workflow}'.`);
    res.status(202).json({ jobId });

  } catch (error) {
    console.error("Error in /api/generate:", error.message);
    res.status(500).json({ message: 'Failed to start generation job.' });
  }
});

// ---
// ENDPOINT 2: The n8n workflow calls this when it's finished (NO CHANGES NEEDED)
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
// ENDPOINT 3: The Frontend calls this repeatedly to check job status (NO CHANGES NEEDED)
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
```

### Next Steps

1.  **Update Environment Variables on Render**: Go to your Render dashboard and add the new environment variables. For example:
    * `N8N_WORKFLOW_IMAGE` = `https://your-n8n-instance/webhook/image-gen-workflow`
    * `N8N_WORKFLOW_VIDEO` = `https://your-n8n-instance/webhook/video-gen-workflow`

2.  **Update Your Frontend**: As discussed previously, you must now update your `index.html` file's JavaScript to send the `workflow` identifier in the body of the request to `/api/generate`.

    **Example of the new request body from your frontend:**
    ```json
    {
        "prompt": "A cat in a hat",
        "ratio": "1:1",
        "style": "realistic",
        "workflow": "IMAGE" 
    }
    
