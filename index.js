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

// --- MIDDLEWARE SETUP ---
app.use(cors());
app.use(express.json());
// Serve static files (like CSS, images, and your HTML files) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// --- PAGE ROUTING ---
// When a user visits the root URL '/', send them the main home page.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// When a user visits '/image', send them the image generator tool page.
app.get('/image', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'image.html'));
});


// --- API ENDPOINTS (No changes needed here) ---

const jobs = {}; // In-memory job store

// ENDPOINT 1: The Frontend calls this to start a new job
app.post('/api/generate', async (req, res) => {
  const jobId = crypto.randomUUID();
  const { prompt, ratio, style, workflow } = req.body;

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
      prompt, ratio, style, jobId, callbackUrl: backendCallbackUrl,
    }).catch(err => {
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
  console.log(`Dynamic backend server listening on port ${PORT}`);
});
```

---

### 2. Updated HTML Files

Now, we update the links in your HTML files to use the new routes.

**Home Page (`index.html`)**
I've updated the links in the navigation bar and the "Image Generation" card to point to `/image`.


```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CineGen Pro - AI Content Generation</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Poppins', sans-serif; background-color: #05080f; overflow-x: hidden; }
        .background-wrapper { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: linear-gradient(180deg, #05080f 0%, #0b192e 100%); background-size: 400% 400%; animation: gradientAnimation 20s ease infinite; }
        @keyframes gradientAnimation { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .frosted-glass { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .glow-on-hover:hover { box-shadow: 0 0 25px rgba(59, 130, 246, 0.7); }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center justify-center p-4">
    <div class="background-wrapper"></div>

    <nav id="app-header" class="fixed top-0 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50 transition-all duration-500 ease-in-out mt-4">
        <div class="frosted-glass rounded-xl flex items-center justify-between p-3 shadow-lg">
            <a href="/" class="flex items-center space-x-3">
                <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 30L50 15L80 30V70L50 85L20 70V30Z" stroke="url(#paint0_linear_logo)" stroke-width="6"/><defs><linearGradient id="paint0_linear_logo" x1="50" y1="15" x2="50" y2="85" gradientUnits="userSpaceOnUse"><stop stop-color="#3B82F6"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs></svg>
                <span class="text-white font-bold text-xl">CineGen</span>
            </a>
            <div class="hidden md:flex items-center space-x-6">
                <a href="/image" class="text-gray-300 hover:text-white transition-colors">Image Tool</a>
                <a href="#" class="text-gray-300 hover:text-white transition-colors">Pricing</a>
            </div>
            <div><button class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300">Sign In</button></div>
        </div>
    </nav>
    
    <div class="relative z-20 w-full max-w-4xl text-center">
        <header class="mb-10">
            <h1 class="text-5xl md:text-7xl font-bold text-white mb-4 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">CineGen Pro</h1>
            <p class="text-xl text-gray-300 max-w-3xl mx-auto">AI-powered content generation platform for creators</p>
        </header>
        
        <main>
            <p class="text-gray-400 mb-8">Choose a tool below to get started.</p>
            <div class="flex flex-wrap justify-center gap-6">
                <a href="/image" class="frosted-glass rounded-2xl p-8 w-full md:w-80 text-left hover:border-blue-500/50 border border-transparent transition-all duration-300 transform hover:-translate-y-1 glow-on-hover">
                    <h2 class="text-2xl font-bold text-white mb-2">Image Generation</h2>
                    <p class="text-gray-400">Create stunning, high-resolution images from a simple text prompt. Perfect for concept art, social media, and more.</p>
                </a>
                <div class="frosted-glass rounded-2xl p-8 w-full md:w-80 text-left relative overflow-hidden border border-transparent">
                     <div class="absolute top-2 right-2 bg-yellow-500 text-black text-xs font-bold px-2 py-1 rounded-full">Coming Soon</div>
                    <h2 class="text-2xl font-bold text-gray-600 mb-2">Video Generation</h2>
                    <p class="text-gray-500">Transform your ideas into dynamic, cinematic video clips with our advanced AI video models.</p>
                </div>
            </div>
        </main>
    </div>
</body>
</html>
```

**Image Tool Page (`image.html`)**
I've updated the navigation links here to point to `/` and `/image`.


```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Image Generator - CineGen Pro</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        body { font-family: 'Poppins', sans-serif; background-color: #05080f; overflow-x: hidden; }
        .background-wrapper { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: -1; background: linear-gradient(180deg, #05080f 0%, #0b192e 100%); background-size: 400% 400%; animation: gradientAnimation 20s ease infinite; }
        @keyframes gradientAnimation { 0% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } 100% { background-position: 0% 50%; } }
        .frosted-glass { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.1); }
        .glow-on-hover:hover { box-shadow: 0 0 20px rgba(59, 130, 246, 0.6); }
        @keyframes pulse-bar { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
        .animate-pulse-bar { animation: pulse-bar 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        .animate-on-load { opacity: 0; transform: translateY(20px); transition: opacity 1s ease-out, transform 1s ease-out; }
        .animate-on-load.is-visible { opacity: 1; transform: translateY(0); }
    </style>
</head>
<body class="min-h-screen flex flex-col items-center p-4">
    <div class="background-wrapper"></div>

    <nav id="app-header" class="fixed top-0 left-1/2 -translate-x-1/2 w-[95%] max-w-5xl z-50 transition-all duration-500 ease-in-out mt-4">
        <div class="frosted-glass rounded-xl flex items-center justify-between p-3 shadow-lg">
            <a href="/" class="flex items-center space-x-3">
                <svg width="32" height="32" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 30L50 15L80 30V70L50 85L20 70V30Z" stroke="url(#paint0_linear_logo)" stroke-width="6"/><defs><linearGradient id="paint0_linear_logo" x1="50" y1="15" x2="50" y2="85" gradientUnits="userSpaceOnUse"><stop stop-color="#3B82F6"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs></svg>
                <span class="text-white font-bold text-xl">CineGen</span>
            </a>
            <div class="hidden md:flex items-center space-x-6">
                <a href="/image" class="text-white font-semibold transition-colors">Image Tool</a>
                <button id="history-btn" class="text-gray-300 hover:text-white transition-colors">History</button>
                <a href="#" class="text-gray-300 hover:text-white transition-colors">Pricing</a>
            </div>
            <div><button class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-300">Sign In</button></div>
        </div>
    </nav>
    
    <div class="relative z-20 w-full max-w-4xl mt-40">
        <header class="text-center mb-10 animate-on-load">
            <h1 class="text-5xl md:text-6xl font-bold text-white mb-3 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">Image Generator</h1>
            <p class="text-lg text-gray-300 max-w-2xl mx-auto">Create stunning visuals from a simple text description.</p>
        </header>
        
        <main id="main-card" class="frosted-glass rounded-2xl p-6 md:p-8 shadow-2xl transition-all duration-300 animate-on-load">
            <form id="input-form" class="space-y-6">
                <div>
                    <label for="prompt" class="block text-white text-sm font-medium mb-2">Describe your cinematic vision</label>
                    <textarea id="prompt" rows="5" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="A futuristic cityscape at dusk..."></textarea>
                    <p id="prompt-error" class="text-red-400 text-sm mt-2 hidden">Please enter a description.</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label for="ratio" class="block text-white text-sm font-medium mb-2">Aspect Ratio</label>
                        <select id="ratio" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="16:9">16:9</option><option value="9:16">9:16</option><option value="1:1">1:1</option><option value="21:9">21:9</option></select>
                    </div>
                    <div>
                        <label for="style" class="block text-white text-sm font-medium mb-2">Style</label>
                        <select id="style" class="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"><option value="cinematic">Cinematic</option><option value="realistic">Realistic</option><option value="futuristic">Futuristic</option></select>
                    </div>
                </div>
                <div class="pt-2 flex justify-center"><button type="submit" id="generate-btn" class="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-10 rounded-lg glow-on-hover transition duration-300 flex items-center space-x-2"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd" /></svg><span>Generate</span></button></div>
            </form>
            <div id="loading-state" class="hidden text-center py-10">
                <div class="flex justify-center mb-4"><div class="w-16 h-16 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div></div>
                <div class="flex justify-center items-center space-x-2 mt-4"><div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse-bar"></div><div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse-bar" style="animation-delay: 0.2s;"></div><div class="w-2 h-2 bg-blue-400 rounded-full animate-pulse-bar" style="animation-delay: 0.4s;"></div></div>
                <h3 class="text-xl font-medium text-white mb-2 mt-4">Generating your cinematic vision...</h3><p class="text-gray-400">This may take a few minutes.</p>
            </div>
            <div id="results-grid" class="hidden grid gap-6 mt-6"></div>
            <div id="new-generation-wrapper" class="hidden text-center mt-8"><button id="new-generation-btn" class="bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 px-6 rounded-lg border border-slate-700">Create New Generation</button></div>
        </main>
        <section id="job-history" class="hidden mt-12">
            <h2 class="text-3xl font-bold text-white text-center mb-6">Generation History</h2>
            <div id="history-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
        </section>
    </div>
    <div id="error-banner" class="hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-2xl p-4 mb-4 bg-red-800/80 backdrop-blur-sm text-white rounded-lg shadow-lg flex justify-between items-center">
        <p id="error-message">An unknown error occurred.</p>
        <button id="close-error-btn" class="text-2xl font-bold">&times;</button>
    </div>

    <script>
        const inputForm = document.getElementById('input-form'), loadingState = document.getElementById('loading-state'), resultsGrid = document.getElementById('results-grid'), newGenerationWrapper = document.getElementById('new-generation-wrapper'), newGenerationBtn = document.getElementById('new-generation-btn'), promptInput = document.getElementById('prompt'), promptError = document.getElementById('prompt-error'), errorBanner = document.getElementById('error-banner'), errorMessage = document.getElementById('error-message'), closeErrorBtn = document.getElementById('close-error-btn'), historyBtn = document.getElementById('history-btn'), jobHistorySection = document.getElementById('job-history'), historyGrid = document.getElementById('history-grid');
        const API_BASE_URL = 'https://cinegen-api.onrender.com';
        function showError(message) { errorMessage.textContent = message; errorBanner.classList.remove('hidden'); }
        function hideError() { errorBanner.classList.add('hidden'); }
        async function handleSubmit(event) {
            event.preventDefault(); hideError(); const promptValue = promptInput.value;
            if (!promptValue.trim()) { promptError.classList.remove('hidden'); promptInput.classList.add('border-red-500'); return; }
            promptError.classList.add('hidden'); promptInput.classList.remove('border-red-500'); inputForm.classList.add('hidden'); loadingState.classList.remove('hidden'); jobHistorySection.classList.add('hidden'); resultsGrid.innerHTML = ''; resultsGrid.classList.add('hidden'); newGenerationWrapper.classList.add('hidden');
            try {
                const ratioValue = document.getElementById('ratio').value, styleValue = document.getElementById('style').value, workflowIdentifier = 'IMAGE';
                const jobId = await startGeneration(promptValue, ratioValue, styleValue, workflowIdentifier);
                pollForResult(jobId, promptValue);
            } catch (error) { console.error('Error:', error); loadingState.classList.add('hidden'); newGenerationWrapper.classList.remove('hidden'); showError(error.message); }
        }
        async function startGeneration(prompt, ratio, style, workflow) {
            const response = await fetch(`${API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, ratio, style, workflow }) });
            if (!response.ok) { const errorData = await response.json(); throw new Error(errorData.message || 'Failed to start job.'); }
            const data = await response.json(); return data.jobId;
        }
        function pollForResult(jobId, prompt) {
            const intervalId = setInterval(async () => {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/status/${jobId}`);
                    if (!response.ok) { throw new Error(`Server responded with status: ${response.status}`); }
                    const data = await response.json();
                    if (data.status === 'completed') { clearInterval(intervalId); showResults(data.result, prompt); } 
                    else if (data.status !== 'pending') { throw new Error(data.message || 'Job failed.'); }
                } catch (error) { clearInterval(intervalId); console.error('Polling failed:', error); loadingState.classList.add('hidden'); newGenerationWrapper.classList.remove('hidden'); showError(error.message); }
            }, 1000);
        }
        function showResults(resultsArray, prompt) {
            loadingState.classList.add('hidden'); newGenerationWrapper.classList.remove('hidden'); resultsGrid.classList.remove('hidden'); resultsGrid.innerHTML = '';
            if (!resultsArray || resultsArray.length === 0) { resultsGrid.innerHTML = `<p class="text-center text-gray-400 col-span-full">No media URLs returned.</p>`; return; }
            saveToHistory(prompt, resultsArray[0]);
            resultsGrid.className = `grid grid-cols-1 md:grid-cols-2 gap-6 mt-6`;
            const titles = ["Base Image", "Upscaled Image", "Final Video", "Upscaled Video"];
            resultsArray.forEach((url, index) => {
                const card = document.createElement('div'); card.className = 'frosted-glass rounded-lg overflow-hidden p-4 w-full';
                const isVideo = url.includes('.mp4');
                const mediaElement = isVideo ? `<video controls class="w-full h-auto rounded bg-slate-900"><source src="${url}" type="video/mp4"></video>` : `<img src="${url}" alt="${titles[index] || 'Result'}" class="w-full h-auto rounded bg-slate-900" />`;
                const downloadButton = document.createElement('button'); downloadButton.className = 'text-blue-400 hover:text-blue-300 text-sm font-medium mt-2 inline-flex items-center space-x-1';
                downloadButton.innerHTML = `<span>Download ${isVideo ? 'Video' : 'Image'}</span><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>`;
                downloadButton.onclick = () => handleDownload(url, `cinegen-result-${index + 1}.${isVideo ? 'mp4' : 'png'}`);
                card.innerHTML = `<h3 class="text-white font-medium mb-2">${titles[index] || `Result #${index + 1}`}</h3>${mediaElement}`;
                card.appendChild(downloadButton); resultsGrid.appendChild(card);
            });
        }
        function createResultCard(prompt, imageUrl) { return `<div class="frosted-glass rounded-lg overflow-hidden p-4 w-full max-w-lg"><h3 class="text-white font-medium mb-2 truncate" title="${prompt}">Prompt: ${prompt}</h3><img src="${imageUrl}" alt="${prompt}" class="w-full h-auto rounded bg-slate-900" /><button onclick="handleDownload('${imageUrl}', 'cinegen-result.png')" class="text-blue-400 hover:text-blue-300 text-sm font-medium mt-2 inline-flex items-center space-x-1"><span>Download Image</span><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg></button></div>`; }
        function resetForm() { hideError(); resultsGrid.classList.add('hidden'); newGenerationWrapper.classList.add('hidden'); loadingState.classList.add('hidden'); jobHistorySection.classList.add('hidden'); inputForm.classList.remove('hidden'); promptInput.value = ''; }
        function getHistory() { return JSON.parse(localStorage.getItem('cinegenHistory') || '[]'); }
        function saveToHistory(prompt, imageUrl) { const history = getHistory(); const newEntry = { prompt, imageUrl, date: new Date().toISOString() }; history.unshift(newEntry); if (history.length > 20) { history.pop(); } localStorage.setItem('cinegenHistory', JSON.stringify(history)); }
        function renderHistory() { const history = getHistory(); historyGrid.innerHTML = ''; if (history.length === 0) { historyGrid.innerHTML = `<p class="text-center text-gray-400 col-span-full">No past generations found.</p>`; } else { history.forEach(item => { historyGrid.innerHTML += createResultCard(item.prompt, item.imageUrl); }); } }
        function toggleHistory() {
            const mainCard = document.getElementById('main-card');
            if (jobHistorySection.classList.contains('hidden')) { 
                mainCard.classList.add('hidden'); 
                renderHistory(); 
                jobHistorySection.classList.remove('hidden'); 
            } else { 
                jobHistorySection.classList.add('hidden'); 
                mainCard.classList.remove('hidden'); 
            } 
        }
        async function handleDownload(url, filename) { try { const response = await fetch(url); const blob = await response.blob(); const blobUrl = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.style.display = 'none'; a.href = blobUrl; a.download = filename || 'cinegen-download.png'; document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(blobUrl); a.remove(); } catch (error) { console.error('Download failed:', error); showError('Download failed.'); } }
        
        document.addEventListener('DOMContentLoaded', () => {
            const elementsToAnimate = document.querySelectorAll('.animate-on-load');
            elementsToAnimate.forEach((el) => { setTimeout(() => { el.classList.add('is-visible'); }, 200); });
            inputForm.addEventListener('submit', handleSubmit);
            newGenerationBtn.addEventListener('click', resetForm);
            closeErrorBtn.addEventListener('click', hideError);
            historyBtn.addEventListener('click', toggleHistory);
        });
    </script>
</body>
</html>
