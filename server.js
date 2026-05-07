import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = process.env.PORT || 3000;

const server = createServer(async (req, res) => {

  // HOME PAGE
  if (req.url === '/' && req.method === 'GET') {
    const file = await readFile('./index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file);
    return;
  }

  // CHAT API (echo version first, stable)
  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => body += chunk);

    req.on('end', () => {
      try {
        const { messages } = JSON.parse(body);

        const userMsg = messages?.[0]?.content || '';

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          answer: `You said: ${userMsg}`
        }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
