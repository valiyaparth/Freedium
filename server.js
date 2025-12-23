const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;

function fetchArticle(url, callback) {
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  };

  https.get(url, options, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => callback(null, data));
  }).on('error', (e) => callback(e));
}

function extractContent(html) {
  // Extract article content
  const titleMatch = html.match(/<title>(.*?)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(' | Medium', '').replace(' - Medium', '') : 'Article';
  
  // Extract main content
  let content = html;
  
  // Remove scripts and styles
  content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Extract article body
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    content = articleMatch[1];
  }
  
  return { title, content };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medium Reader</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; }
    .header { background: #fff; border-bottom: 1px solid #e6e6e6; padding: 1rem; position: sticky; top: 0; z-index: 10; }
    .container { max-width: 680px; margin: 0 auto; padding: 2rem 1rem; }
    h1 { font-size: 1.5rem; font-weight: 600; }
    .input-group { margin: 2rem 0; }
    input { width: 100%; padding: 0.75rem 1rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; }
    input:focus { outline: none; border-color: #000; }
    button { width: 100%; padding: 0.75rem; background: #000; color: #fff; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; margin-top: 0.5rem; }
    button:hover { background: #333; }
    .article { background: #fff; padding: 2rem; border-radius: 4px; margin-top: 2rem; display: none; }
    .article.show { display: block; }
    .article h2 { font-size: 2rem; margin-bottom: 1.5rem; line-height: 1.3; }
    .article-content { font-size: 1.125rem; line-height: 1.8; color: #333; }
    .article-content p { margin-bottom: 1.5rem; }
    .article-content h1, .article-content h2, .article-content h3 { margin: 2rem 0 1rem; }
    .article-content img { max-width: 100%; height: auto; margin: 1.5rem 0; }
    .article-content pre { background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; margin: 1rem 0; }
    .loading { text-align: center; padding: 2rem; display: none; }
    .loading.show { display: block; }
  </style>
</head>
<body>
  <div class="header">
    <div class="container">
      <h1>📖 Medium Reader</h1>
    </div>
  </div>
  <div class="container">
    <div class="input-group">
      <input type="url" id="url" placeholder="Paste Medium article URL here">
      <button onclick="read()">Read Article</button>
    </div>
    <div class="loading" id="loading">Loading article...</div>
    <div class="article" id="article">
      <h2 id="title"></h2>
      <div class="article-content" id="content"></div>
    </div>
  </div>
  <script>
    async function read() {
      const url = document.getElementById('url').value;
      if (!url) return alert('Please enter a Medium URL');
      
      document.getElementById('loading').classList.add('show');
      document.getElementById('article').classList.remove('show');
      
      try {
        const res = await fetch('/read?url=' + encodeURIComponent(url));
        const data = await res.json();
        
        document.getElementById('title').textContent = data.title;
        document.getElementById('content').innerHTML = data.content;
        document.getElementById('article').classList.add('show');
      } catch (e) {
        alert('Failed to load article');
      }
      
      document.getElementById('loading').classList.remove('show');
    }
  </script>
</body>
</html>`);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/read') {
    const articleUrl = url.searchParams.get('url');
    
    if (!articleUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'URL required' }));
      return;
    }

    fetchArticle(articleUrl, (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch article' }));
        return;
      }

      const { title, content } = extractContent(html);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ title, content }));
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Medium Reader running on http://localhost:${PORT}`);
});
