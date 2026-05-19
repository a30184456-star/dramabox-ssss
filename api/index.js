const https = require('https');

module.exports = async (req, res) => {
    // Set CORS header
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    // Parse URL
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const params = Object.fromEntries(url.searchParams);

    // Helper: fetch from Dramabox
    function fetchDramabox(endpoint, queryParams = {}) {
        return new Promise((resolve) => {
            const qs = Object.keys(queryParams).length 
                ? '?' + new URLSearchParams(queryParams).toString() 
                : '';
            
            const options = {
                hostname: 'dramabox.com',
                path: '/api' + endpoint + qs,
                method: 'GET',
                headers: {
                    'User-Agent': 'Dramabox/5.9.0',
                    'Accept': 'application/json',
                },
                timeout: 10000,
            };

            const request = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        resolve({ code: response.statusCode, data: JSON.parse(data) });
                    } catch (e) {
                        resolve({ code: response.statusCode, error: 'Invalid JSON' });
                    }
                });
            });

            request.on('error', (err) => resolve({ code: 0, error: err.message }));
            request.on('timeout', () => {
                request.destroy();
                resolve({ code: 0, error: 'Timeout' });
            });
            request.end();
        });
    }

    // ========== ROUTES ==========

    try {
        // Status
        if (path === '/api/status') {
            return res.end(JSON.stringify({
                success: true,
                api: 'Dramabox Unlock API',
                version: '3.0.0',
                server: 'Vercel',
                endpoints: [
                    '/api/status',
                    '/api/trending',
                    '/api/search?q=',
                    '/api/detail?id=',
                ]
            }));
        }

        // Trending
        if (path === '/api/trending') {
            const result = await fetchDramabox('/home/recommend', { page: 1, size: 20 });
            
            if (result.code === 200 && result.data && result.data.code === 200) {
                const dramas = (result.data.data || []).map(item => ({
                    id: item.bookId || '',
                    title: item.bookName || '',
                    cover: item.coverUrl || '',
                    rating: item.score || 0,
                    total_ep: item.chapterCount || 0,
                }));
                return res.end(JSON.stringify({ success: true, total: dramas.length, data: dramas }));
            }
            
            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch trending', debug: result }));
        }

        // Search
        if (path === '/api/search') {
            const q = params.q;
            if (!q) return res.end(JSON.stringify({ success: false, error: 'Parameter q wajib' }));

            const result = await fetchDramabox('/search', { keyword: q, page: 1, size: 20 });

            if (result.code === 200 && result.data && result.data.code === 200) {
                const dramas = (result.data.data || []).map(item => ({
                    id: item.bookId || '',
                    title: item.bookName || '',
                    cover: item.coverUrl || '',
                    rating: item.score || 0,
                }));
                return res.end(JSON.stringify({ success: true, total: dramas.length, data: dramas }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch search', debug: result }));
        }

        // Detail
        if (path === '/api/detail') {
            const id = params.id;
            if (!id) return res.end(JSON.stringify({ success: false, error: 'Parameter id wajib' }));

            const result = await fetchDramabox('/book/info', { bookId: id });

            if (result.code === 200 && result.data && result.data.code === 200) {
                const book = result.data.data;
                const episodes = (book.chapterList || []).map(ch => ({
                    episode: ch.chapterNo || 0,
                    title: ch.chapterName || '',
                    is_free: (ch.isFree || 0) == 1,
                }));

                return res.end(JSON.stringify({
                    success: true,
                    data: {
                        id: book.bookId || id,
                        title: book.bookName || '',
                        cover: book.coverUrl || '',
                        rating: book.score || 0,
                        total_episodes: book.chapterCount || episodes.length,
                        episodes,
                    }
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch detail', debug: result }));
        }

        // Homepage
        if (path === '/') {
            res.setHeader('Content-Type', 'text/html');
            return res.end(`<!DOCTYPE html>
<html><head><title>Drama API</title>
<style>body{font-family:sans-serif;background:#0a0a0f;color:#cdd6f4;padding:40px}h1{color:#00ff88}.ep{background:#13131a;border:1px solid #1e1e2e;padding:15px;margin:10px 0;border-radius:8px}.method{color:#89b4fa;font-weight:bold}code{color:#f9e2af;background:#000;padding:2px 6px;border-radius:4px}a{color:#00ff88}</style></head>
<body><h1>🎬 Drama Unlock API v3.0</h1><p>Running on Vercel ✅</p>
<div class="ep"><span class="method">GET</span> <code>/api/status</code> <a href="/api/status">Test</a></div>
<div class="ep"><span class="method">GET</span> <code>/api/trending</code> <a href="/api/trending">Test</a></div>
<div class="ep"><span class="method">GET</span> <code>/api/search?q=ceo</code></div>
<div class="ep"><span class="method">GET</span> <code>/api/detail?id=</code></div>
</body></html>`);
        }

        // 404
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found', help: 'Buka / untuk daftar endpoint' }));

    } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Server error', message: error.message }));
    }
};
