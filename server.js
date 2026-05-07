import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = process.env.PORT || 3000;

// Hugging Face inference API endpoint
const HF_API_URL = 'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2/v1/chat/completions';
const HF_API_KEY = process.env.HUGGING_FACE_API_KEY;

const server = createServer(async (req, res) => {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // HOME PAGE
  if (req.url === '/' && req.method === 'GET') {
    try {
      const file = await readFile('./index.html');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(file);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error loading page');
    }
    return;
  }

  // CHAT API
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => body += chunk);

    req.on('end', async () => {
      try {
        const { messages } = JSON.parse(body);

        if (!HF_API_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Hugging Face API key not configured. Set HUGGING_FACE_API_KEY environment variable.' }));
          return;
        }

        const response = await fetch(HF_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messages: messages,
            max_tokens: 1024,
            temperature: 0.7,
            top_p: 0.95
          })
        });

        const data = await response.json();

        if (!response.ok) {
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: data.error || data.message || 'Hugging Face API error'
          }));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          answer: data.choices[0]?.message?.content || 'No response received'
        }));

      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    return;
  }

  // 404 fallback
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`🚀 Chromebook AI running on port ${port}`);
  console.log(`🤖 Model: Mistral-7B-Instruct (via Hugging Face)`);
  console.log(`✅ Free & Unlimited Usage`);
});
