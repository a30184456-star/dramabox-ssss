const https = require('https');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const params = Object.fromEntries(url.searchParams);

    function fetchDramabox(endpoint, queryParams = {}) {
        return new Promise((resolve) => {
            const qs = Object.keys(queryParams).length
                ? '?' + new URLSearchParams(queryParams).toString()
                : '';

            function makeRequest(hostname, path, redirectCount) {
                if (redirectCount > 5) {
                    return resolve({ code: 0, error: 'Too many redirects' });
                }

                const options = {
                    hostname: hostname,
                    path: path,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Origin': 'https://dramabox.com',
                        'Referer': 'https://dramabox.com/',
                    },
                    timeout: 10000,
                };

                const request = https.request(options, (response) => {
                    if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
                        let redirectUrl = response.headers.location;
                        if (redirectUrl.startsWith('/')) {
                            redirectUrl = hostname + redirectUrl;
                        } else {
                            const u = new URL(redirectUrl);
                            hostname = u.hostname;
                            redirectUrl = u.pathname + u.search;
                        }
                        return makeRequest(hostname, redirectUrl, redirectCount + 1);
                    }

                    let data = '';
                    response.on('data', chunk => data += chunk);
                    response.on('end', () => {
                        try {
                            resolve({ code: response.statusCode, data: JSON.parse(data) });
                        } catch (e) {
                            resolve({ code: response.statusCode, error: 'Invalid JSON', raw: data.substring(0, 200) });
                        }
                    });
                });

                request.on('error', (err) => resolve({ code: 0, error: err.message }));
                request.on('timeout', () => { request.destroy(); resolve({ code: 0, error: 'Timeout' }); });
                request.end();
            }

            makeRequest('dramabox.com', '/api' + endpoint + qs, 0);
        });
    }

    try {
        if (path === '/api/status') {
            return res.end(JSON.stringify({
                success: true,
                api: 'Dramabox Unlock API v3.1',
                server: 'Vercel',
                endpoints: ['/api/status', '/api/trending', '/api/search?q=', '/api/detail?id='],
                timestamp: new Date().toISOString(),
            }));
        }

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

        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found', endpoints: ['/api/status', '/api/trending', '/api/search?q=', '/api/detail?id='] }));

    } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Server error', message: error.message }));
    }
};
