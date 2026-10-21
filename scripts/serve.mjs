import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build.mjs';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
await build(root);
const base = resolve(root, 'dist');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.json':'application/json', '.sh':'text/plain', '.py':'text/plain' };
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    let path = resolve(base, '.' + pathname);
    if (path !== base && !path.startsWith(base + '/')) throw new Error('Invalid path');
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    const body = await readFile(path);
    res.writeHead(200, { 'Content-Type':mime[extname(path)] || 'application/octet-stream' }); res.end(body);
  } catch { res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8' }); res.end(await readFile(resolve(base, '404.html'))); }
});
server.listen(Number(process.env.PORT || 4321), '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${server.address().port}`));
