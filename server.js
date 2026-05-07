import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = process.env.PORT || 3000;

const server = createServer(async (req, res) => {

  if (req.url === '/') {
    const file = await readFile('./index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file);
    return;
  }

  if (req.url === '/api/chat' && req.method === 'POST') {
    let body = '';

    req.on('data', chunk => body += chunk);

    req.on('end', () => {
      const msg = JSON.parse(body).messages?.[0]?.content || '';

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        answer: "You said: " + msg
      }));
    });

    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(port, () => {
  console.log("Running on " + port);
});
