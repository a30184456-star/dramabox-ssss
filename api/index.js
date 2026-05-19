const https = require('https');

const cache = new Map();

function fetchDramabox(endpoint, params = {}) {
    return new Promise((resolve) => {
        const query = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
        const options = {
            hostname: 'dramabox.com',
            path: '/api' + endpoint + query,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36',
                'Accept': 'application/json',
            },
            timeout: 15000,
        };
        https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ code: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ code: res.statusCode, data: null }); }
            });
        }).on('error', err => resolve({ code: 0, error: err.message })).end();
    });
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const params = Object.fromEntries(url.searchParams);

    if (path === '/api/status') {
        return res.json({ success: true, api: 'Dramabox API', scraper: 'V5.9.0' });
    }

    if (path === '/api/trending') {
        const result = await fetchDramabox('/home/recommend', { page: 1, size: 20 });
        if (result.code === 200 && result.data?.code === 200) {
            const dramas = (result.data.data || []).map(item => ({
                id: item.bookId || '',
                title: item.bookName || '',
                cover: item.coverUrl || '',
                rating: item.score || 0,
            }));
            return res.json({ success: true, data: dramas });
        }
        return res.json({ success: false, error: 'Failed' });
    }

    if (path === '/api/search') {
        const q = params.q;
        if (!q) return res.json({ success: false, error: 'Param q required' });
        const result = await fetchDramabox('/search', { keyword: q, page: 1, size: 20 });
        if (result.code === 200 && result.data?.code === 200) {
            const dramas = (result.data.data || []).map(item => ({
                id: item.bookId || '',
                title: item.bookName || '',
                cover: item.coverUrl || '',
            }));
            return res.json({ success: true, data: dramas });
        }
        return res.json({ success: false, error: 'Failed' });
    }

    if (path === '/api/detail') {
        const id = params.id;
        if (!id) return res.json({ success: false, error: 'Param id required' });
        const result = await fetchDramabox('/book/info', { bookId: id });
        if (result.code === 200 && result.data?.code === 200) {
            const book = result.data.data;
            return res.json({
                success: true,
                data: {
                    id: book.bookId,
                    title: book.bookName,
                    cover: book.coverUrl,
                    episodes: (book.chapterList || []).map(ch => ({
                        episode: ch.chapterNo,
                        title: ch.chapterName,
                        is_free: (ch.isFree || 0) == 1,
                    })),
                }
            });
        }
        return res.json({ success: false, error: 'Failed' });
    }

    res.json({ error: 'Not found', endpoints: ['/api/status', '/api/trending', '/api/search?q=', '/api/detail?id='] });
};
