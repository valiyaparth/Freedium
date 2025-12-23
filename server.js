const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 3000;

function fetchArticle(mediumUrl, callback) {
  // Use freedium.cfd proxy
  const proxyUrl = `https://freedium.cfd/${mediumUrl}`;
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    }
  };

  https.get(proxyUrl, options, (res) => {
    if (res.statusCode === 301 || res.statusCode === 302) {
      https.get(res.headers.location, options, (res2) => {
        let data = '';
        res2.on('data', chunk => data += chunk);
        res2.on('end', () => callback(null, data));
      }).on('error', callback);
    } else {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => callback(null, data));
    }
  }).on('error', callback);
}

function extractContent(html) {
  // Remove scripts and styles
  let content = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  
  // Extract title
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  let title = titleMatch ? titleMatch[1].replace(/\s*\|\s*Freedium/gi, '').trim() : 'Article';
  
  // Try to find main article content
  let articleContent = '';
  
  // Look for article tag
  const articleMatch = content.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    articleContent = articleMatch[1];
  } else {
    // Look for main content div
    const mainMatch = content.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    if (mainMatch) {
      articleContent = mainMatch[1];
    } else {
      // Look for content class
      const contentMatch = content.match(/<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (contentMatch) {
        articleContent = contentMatch[1];
      }
    }
  }
  
  // Clean up the content
  if (articleContent) {
    // Remove navigation, footer, etc
    articleContent = articleContent.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
    articleContent = articleContent.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
    articleContent = articleContent.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');
    
    // Clean attributes but keep structure
    articleContent = articleContent.replace(/\s*class="[^"]*"/gi, '');
    articleContent = articleContent.replace(/\s*id="[^"]*"/gi, '');
    articleContent = articleContent.replace(/\s*data-[^=]*="[^"]*"/gi, '');
  }
  
  return {
    title: title || 'Article',
    content: articleContent || '<p>Content could not be extracted. The article may not be available.</p>'
  };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Medium Reader</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #fafafa; }
    .header { background: #fff; border-bottom: 1px solid #e6e6e6; padding: 1rem; position: sticky; top: 0; z-index: 10; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .container { max-width: 680px; margin: 0 auto; padding: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 600; }
    .input-group { margin: 2rem 0; }
    input { width: 100%; padding: 0.875rem 1rem; border: 1px solid #ddd; border-radius: 8px; font-size: 1rem; transition: all 0.2s; }
    input:focus { outline: none; border-color: #000; box-shadow: 0 0 0 3px rgba(0,0,0,0.1); }
    button { width: 100%; padding: 0.875rem; background: #000; color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 0.75rem; transition: background 0.2s; }
    button:hover:not(:disabled) { background: #333; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .article { background: #fff; padding: 2.5rem 2rem; border-radius: 8px; margin-top: 2rem; display: none; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .article.show { display: block; }
    .article h2 { font-size: 2.25rem; margin-bottom: 2rem; line-height: 1.25; font-weight: 700; }
    .article-content { font-size: 1.125rem; line-height: 1.8; color: #242424; }
    .article-content p { margin-bottom: 1.75rem; }
    .article-content h1, .article-content h2, .article-content h3, .article-content h4 { margin: 2.5rem 0 1rem; font-weight: 700; }
    .article-content h1 { font-size: 2rem; }
    .article-content h2 { font-size: 1.75rem; }
    .article-content h3 { font-size: 1.5rem; }
    .article-content img { max-width: 100%; height: auto; margin: 2rem 0; border-radius: 4px; }
    .article-content figure { margin: 2rem 0; }
    .article-content pre { background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; margin: 1.5rem 0; font-size: 0.9rem; }
    .article-content code { background: #f4f4f4; padding: 0.2rem 0.4rem; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 0.9em; }
    .article-content pre code { background: none; padding: 0; }
    .article-content blockquote { border-left: 3px solid #000; padding-left: 1.5rem; margin: 1.5rem 0; font-style: italic; color: #555; }
    .article-content ul, .article-content ol { margin: 1rem 0 1.75rem 1.5rem; }
    .article-content li { margin-bottom: 0.5rem; }
    .article-content a { color: #0066cc; text-decoration: none; }
    .article-content a:hover { text-decoration: underline; }
    .loading { text-align: center; padding: 3rem; display: none; color: #666; }
    .loading.show { display: block; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #000; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .error { background: #fee; color: #c00; padding: 1rem; border-radius: 8px; margin-top: 1rem; display: none; }
    .error.show { display: block; }
    .info { background: #e3f2fd; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; color: #1976d2; }
    @media (max-width: 768px) {
      .container { padding: 0.75rem; }
      .article { padding: 1.5rem 1rem; }
      .article h2 { font-size: 1.75rem; }
      .article-content { font-size: 1.05rem; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="container">
      <h1>📖 Medium Reader</h1>
    </div>
  </div>
  <div class="container">
    <div class="info">
      Paste any Medium article URL to read it without paywall limits.
    </div>
    <div class="input-group">
      <input type="url" id="url" placeholder="https://medium.com/..." value="">
      <button onclick="read()" id="btn">Read Article</button>
    </div>
    <div class="error" id="error"></div>
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <div>Fetching article... This may take 10-15 seconds</div>
    </div>
    <div class="article" id="article">
      <h2 id="title"></h2>
      <div class="article-content" id="content"></div>
    </div>
  </div>
  <script>
    async function read() {
      const url = document.getElementById('url').value.trim();
      if (!url) {
        showError('Please enter a Medium URL');
        return;
      }
      
      if (!url.includes('medium.com')) {
        showError('Please enter a valid Medium URL');
        return;
      }
      
      document.getElementById('loading').classList.add('show');
      document.getElementById('article').classList.remove('show');
      document.getElementById('error').classList.remove('show');
      document.getElementById('btn').disabled = true;
      
      try {
        const res = await fetch('/read?url=' + encodeURIComponent(url));
        const data = await res.json();
        
        if (data.error) {
          showError(data.error);
          return;
        }
        
        document.getElementById('title').textContent = data.title;
        document.getElementById('content').innerHTML = data.content;
        document.getElementById('article').classList.add('show');
        
        setTimeout(() => {
          document.getElementById('article').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      } catch (e) {
        showError('Failed to load article. Please try again or try a different article.');
      }
      
      document.getElementById('loading').classList.remove('show');
      document.getElementById('btn').disabled = false;
    }
    
    function showError(msg) {
      document.getElementById('error').textContent = msg;
      document.getElementById('error').classList.add('show');
      document.getElementById('loading').classList.remove('show');
      document.getElementById('btn').disabled = false;
    }
    
    document.getElementById('url').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') read();
    });
  </script>
</body>
</html>`);
    return;
  }

  if (req.method === 'GET' && url.pathname === '/read') {
    const articleUrl = url.searchParams.get('url');
    
    if (!articleUrl || !articleUrl.includes('medium.com')) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Valid Medium URL required' }));
      return;
    }

    fetchArticle(articleUrl, (err, html) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to fetch article. Please try again.' }));
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
  console.log(`Server running on http://localhost:${PORT}`);
});
