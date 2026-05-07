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

        if (!process.env.OPENAI_API_KEY) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'OpenAI API key not configured' }));
          return;
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
            messages: messages,
            temperature: 0.7,
            max_tokens: 2000
          })
        });

        const data = await response.json();

        if (!response.ok) {
          res.writeHead(response.status, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            error: data.error?.message || 'OpenAI API error'
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
  console.log(`📝 OpenAI Model: ${process.env.OPENAI_MODEL || 'gpt-3.5-turbo'}`);
});
