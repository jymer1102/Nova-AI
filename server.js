import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const port = process.env.PORT || 3000;

const server = createServer(async (req, res) => {
  // Serve homepage
  if (req.url === '/' || req.url === '/index.html') {
    const file = await readFile('./public/index.html');
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(file);
    return;
  }

  // Serve static files
  try {
    const file = await readFile('./public' + req.url);
    res.end(file);
  } catch {
    // ignore
  }
});

server.listen(port, () => {
  console.log(`Running on ${port}`);
});
