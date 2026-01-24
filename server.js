const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;

function fetchArticle(mediumUrl, callback) {
  // Extract article slug from URL
  const urlParts = mediumUrl.split('/');
  const slug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
  
  // Try multiple methods
  tryMethod1(mediumUrl, (err1, data1) => {
    if (!err1 && data1 && data1.length > 1000) {
      return callback(null, data1);
    }
    
    tryMethod2(mediumUrl, (err2, data2) => {
      if (!err2 && data2 && data2.length > 1000) {
        return callback(null, data2);
      }
      
      tryMethod3(mediumUrl, (err3, data3) => {
        if (!err3 && data3 && data3.length > 1000) {
          return callback(null, data3);
        }
        callback(new Error('All methods failed'));
      });
    });
  });
}

function tryMethod1(url, callback) {
  // Method 1: Direct fetch with special headers
  const options = {
    headers: {
      'User-Agent': 'facebookexternalhit/1.1',
      'Accept': 'text/html,application/xhtml+xml'
    }
  };
  
  makeRequest(url, options, callback);
}

function tryMethod2(url, callback) {
  // Method 2: Use archive.is
  const archiveUrl = `https://archive.is/newest/${encodeURIComponent(url)}`;
  
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  
  makeRequest(archiveUrl, options, (err, data) => {
    if (err) return callback(err);
    // Extract the actual archived page URL
    const match = data.match(/https:\/\/archive\.(is|ph|today)\/[a-zA-Z0-9]+/);
    if (match) {
      makeRequest(match[0], options, callback);
    } else {
      callback(new Error('No archive found'));
    }
  });
}

function tryMethod3(url, callback) {
  // Method 3: Googlebot user agent
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html'
    }
  };
  
  makeRequest(url, options, callback);
}

function makeRequest(url, options, callback) {
  try {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    
    const req = client.get(url, options, (res) => {
      // Follow redirects
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) {
        return makeRequest(res.headers.location, options, callback);
      }
      
      if (res.statusCode !== 200) {
        return callback(new Error(`Status ${res.statusCode}`));
      }
      
      let data = '';
      res.on('data', chunk => data += chunk.toString());
      res.on('end', () => callback(null, data));
    });
    
    req.on('error', callback);
    req.setTimeout(15000, () => {
      req.destroy();
      callback(new Error('Timeout'));
    });
  } catch (e) {
    callback(e);
  }
}

function extractContent(html) {
  try {
    // Extract title
    let titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
    if (!titleMatch) {
      titleMatch = html.match(/<title>(.*?)<\/title>/i);
    }
    const title = titleMatch ? 
      titleMatch[1].replace(/<[^>]*>/g, '').replace(/\s*[|•]\s*Medium.*$/i, '').trim() : 
      'Article';
    
    // Extract article content - try multiple selectors
    let content = '';
    
    // Try article tag first
    let articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleMatch) {
      content = articleMatch[1];
    } else {
      // Try main tag
      articleMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      if (articleMatch) {
        content = articleMatch[1];
      } else {
        // Try to find content div
        articleMatch = html.match(/<div[^>]*class="[^"]*postArticle[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        if (articleMatch) {
          content = articleMatch[1];
        }
      }
    }
    
    if (!content) {
      // Last resort - get body content
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      if (bodyMatch) {
        content = bodyMatch[1];
      }
    }
    
    // Clean up content
    if (content) {
      // Remove scripts, styles, nav, footer
      content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      content = content.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '');
      content = content.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '');
      content = content.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '');
      
      // Clean attributes
      content = content.replace(/\s*class="[^"]*"/gi, '');
      content = content.replace(/\s*id="[^"]*"/gi, '');
      content = content.replace(/\s*data-[^=]*="[^"]*"/gi, '');
      content = content.replace(/\s*style="[^"]*"/gi, '');
      
      // Extract paragraphs if still too messy
      const paragraphs = content.match(/<p[^>]*>.*?<\/p>/gi);
      if (paragraphs && paragraphs.length > 3) {
        content = paragraphs.join('\n');
      }
    }
    
    return {
      title: title || 'Article',
      content: content || '<p>Unable to extract content. Try a different article or check if the URL is correct.</p>'
    };
  } catch (e) {
    return {
      title: 'Error',
      content: '<p>Failed to parse article content.</p>'
    };
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
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
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafa; }
    .header { background: #191919; color: #fff; padding: 1rem; position: sticky; top: 0; z-index: 10; }
    .container { max-width: 680px; margin: 0 auto; padding: 1rem; }
    h1 { font-size: 1.5rem; font-weight: 600; }
    .input-group { margin: 2rem 0; }
    input { width: 100%; padding: 0.875rem 1rem; border: 2px solid #ddd; border-radius: 8px; font-size: 1rem; }
    input:focus { outline: none; border-color: #191919; }
    button { width: 100%; padding: 0.875rem; background: #191919; color: #fff; border: none; border-radius: 8px; font-size: 1rem; font-weight: 600; cursor: pointer; margin-top: 0.75rem; }
    button:hover:not(:disabled) { background: #000; }
    button:disabled { background: #ccc; cursor: not-allowed; }
    .article { background: #fff; padding: 2.5rem 2rem; border-radius: 8px; margin-top: 2rem; display: none; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .article.show { display: block; }
    .article h2 { font-size: 2.25rem; margin-bottom: 2rem; line-height: 1.25; font-weight: 700; }
    .article-content { font-size: 1.125rem; line-height: 1.8; color: #242424; }
    .article-content p { margin-bottom: 1.75rem; }
    .article-content h1, .article-content h2, .article-content h3 { margin: 2.5rem 0 1rem; font-weight: 700; }
    .article-content img { max-width: 100%; height: auto; margin: 2rem 0; border-radius: 4px; }
    .article-content pre { background: #f4f4f4; padding: 1rem; border-radius: 4px; overflow-x: auto; margin: 1.5rem 0; }
    .article-content blockquote { border-left: 3px solid #191919; padding-left: 1.5rem; margin: 1.5rem 0; font-style: italic; }
    .loading { text-align: center; padding: 3rem; display: none; }
    .loading.show { display: block; }
    .spinner { border: 3px solid #f3f3f3; border-top: 3px solid #191919; border-radius: 50%; width: 40px; height: 40px; animation: spin 1s linear infinite; margin: 0 auto 1rem; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .error { background: #fee; color: #c00; padding: 1rem; border-radius: 8px; margin-top: 1rem; display: none; }
    .error.show { display: block; }
    .info { background: #e8f4f8; padding: 1rem; border-radius: 8px; margin-bottom: 1rem; font-size: 0.9rem; color: #0c5460; border-left: 4px solid #17a2b8; }
    @media (max-width: 768px) { .article { padding: 1.5rem 1rem; } }
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
      <strong>How to use:</strong> Paste any Medium article URL below. The app tries multiple methods to bypass paywalls. Wait 10-20 seconds for results.
    </div>
    <div class="input-group">
      <input type="url" id="url" placeholder="https://medium.com/...">
      <button onclick="read()" id="btn">Read Article</button>
    </div>
    <div class="error" id="error"></div>
    <div class="loading" id="loading">
      <div class="spinner"></div>
      <div>Fetching article... Trying multiple methods...</div>
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
        showError('Please enter a URL');
        return;
      }
      
      if (!url.includes('medium.com') && !url.includes('towardsdatascience.com')) {
        showError('Please enter a valid Medium URL');
        return;
      }
      
      document.getElementById('loading').classList.add('show');
      document.getElementById('article').classList.remove('show');
      document.getElementById('error').classList.remove('show');
      document.getElementById('btn').disabled = true;
      
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        
        const res = await fetch('/read?url=' + encodeURIComponent(url), {
          signal: controller.signal
        });
        
        clearTimeout(timeout);
        
        if (!res.ok) {
          throw new Error('Server error');
        }
        
        const data = await res.json();
        
        if (data.error) {
          showError(data.error);
          return;
        }
        
        document.getElementById('title').textContent = data.title;
        document.getElementById('content').innerHTML = data.content;
        document.getElementById('article').classList.add('show');
        
        setTimeout(() => {
          document.getElementById('article').scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } catch (e) {
        if (e.name === 'AbortError') {
          showError('Request timeout. Please try again.');
        } else {
          showError('Failed to load article. Please try again or use a different URL.');
        }
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
    
    if (!articleUrl) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'URL required' }));
      return;
    }

    fetchArticle(articleUrl, (err, html) => {
      if (err) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          error: 'Could not fetch article. The article may be unavailable or the paywall is too strict. Try a different article.' 
        }));
        return;
      }

      const { title, content } = extractContent(html);
      
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ title, content }));
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
