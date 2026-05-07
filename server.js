import { createServer } from 'node:http';

const port = process.env.PORT || 3000;

const server = createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Chromebook AI server is running');
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ answer: "Server is working, but AI not connected yet." }));
    });

    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
