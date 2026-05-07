import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = process.env.PORT || 3000;

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

        if (!process.env.REPLICATE_API_TOKEN) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Replicate API token not configured. Set REPLICATE_API_TOKEN environment variable.' }));
          return;
        }

        // Get the user's last message
        const userMessage = messages[messages.length - 1]?.content || '';

        // Call Replicate API with Llama 2 70B Chat (free and reliable)
        const response = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            version: 'a16z-infra/llama-2-70b-chat:56541d8490b46533605a32656f0d4419427c7cc337f34a46ddd7d0b11c9547bf',
            input: {
              prompt: userMessage,
              temperature: 0.7,
              max_tokens: 512
            }
          })
        });

        const data = await response.json();

        if (!response.ok) {
          console.error('Replicate Error:', data);
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: data.detail || data.error || 'Replicate API error'
          }));
          return;
        }

        // Extract answer from Replicate output
        let answer = '';

        if (data.output && Array.isArray(data.output)) {
          answer = data.output.join('');
        } else if (data.output) {
          answer = String(data.output);
        } else if (data.status === 'processing') {
          answer = 'Processing your request...';
        } else {
          answer = 'No response received';
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ answer }));

      } catch (err) {
        console.error('Server Error:', err);
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
  console.log(`🤖 Model: Llama 2 70B Chat via Replicate`);
  console.log(`✅ Free & Unlimited`);
});
