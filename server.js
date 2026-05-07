import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
 if (req.url === '/api/chat' && req.method === 'POST') {
  let body = '';

  req.on('data', chunk => body += chunk);

  req.on('end', async () => {
    try {
      const { messages } = JSON.parse(body);

      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
          input: messages
        })
      });

      const data = await response.json();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        answer: data.output_text || 'No response text returned.'
      }));

    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  return;
}
