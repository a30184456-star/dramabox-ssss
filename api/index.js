const https = require('https');
const crypto = require('crypto');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;
    const params = Object.fromEntries(url.searchParams);

    // ========== CONFIG ==========
    const API_HOST = 'sapi.dramaboxvideo.com';
    
    const HEADERS = {
        'accept-encoding': 'gzip',
        'version': '580',
        'package-name': 'com.storymatrix.drama',
        'p': '63',
        'cid': 'DRA1000042',
        'apn': '2',
        'country-code': 'ID',
        'mchid': 'DRA1000042',
        'tz': '-420',
        'language': 'in',
        'mcc': '510',
        'locale': 'in_ID',
        'is_root': '0',
        'device-id': crypto.randomUUID(),
        'nchid': 'DRA1000042',
        'md': 'Redmi Note 5',
        'store-source': 'store_google',
        'mf': 'XIAOMI',
        'device-score': '60',
        'brand': 'Xiaomi',
        'lat': '0',
        'is_emulator': '0',
        'current-language': 'in',
        'ov': '10',
        'srn': '1080x2160',
        'is_vpn': '0',
        'build': 'Build/QQ3A.200805.001',
        'pline': 'ANDROID',
        'vn': '5.8.0',
        'user-agent': 'okhttp/4.12.0',
        'content-type': 'application/json; charset=UTF-8',
    };

    // ========== HELPERS ==========
    function getLocalTime() {
        const now = new Date();
        const offset = 7 * 60 * 60 * 1000; // GMT+7
        const bt = new Date(now.getTime() + offset);
        const pad = (n) => n.toString().padStart(2, '0');
        return `${bt.getUTCFullYear()}-${pad(bt.getUTCMonth() + 1)}-${pad(bt.getUTCDate())} ${pad(bt.getUTCHours())}:${pad(bt.getUTCMinutes())}:${pad(bt.getUTCSeconds())}.${bt.getUTCMilliseconds().toString().padStart(3, '0')} +0700`;
    }

    function dramaboxPost(endpoint, body) {
        return new Promise((resolve) => {
            const bodyStr = JSON.stringify(body);
            const urlObj = new URL(endpoint);
            
            const headers = {
                ...HEADERS,
                'local-time': getLocalTime(),
                'time-zone': '+0700',
                'Content-Length': Buffer.byteLength(bodyStr),
            };

            const options = {
                hostname: urlObj.hostname || API_HOST,
                path: urlObj.pathname + urlObj.search,
                method: 'POST',
                headers,
                timeout: 10000,
            };

            const request = https.request(options, (response) => {
                let data = '';
                response.on('data', chunk => data += chunk);
                response.on('end', () => {
                    try {
                        resolve({ code: response.statusCode, data: JSON.parse(data) });
                    } catch (e) {
                        resolve({ code: response.statusCode, error: 'Invalid JSON', raw: data.substring(0, 300) });
                    }
                });
            });

            request.on('error', (err) => resolve({ code: 0, error: err.message }));
            request.on('timeout', () => { request.destroy(); resolve({ code: 0, error: 'Timeout' }); });
            request.write(bodyStr);
            request.end();
        });
    }

    function formatDrama(item) {
        return {
            id: item.bookId || '',
            title: item.bookName || item.bookTitle || '',
            cover: item.coverUrl || item.bookCover || '',
            rating: item.score || item.bookScore || 0,
            total_ep: item.chapterCount || item.totalChapters || 0,
            author: item.author || '',
            tags: item.bookTags || item.tags || [],
        };
    }

    try {
        // ========== STATUS ==========
        if (path === '/api/status') {
            return res.end(JSON.stringify({
                success: true,
                api: 'Dramabox Unlock API v5.0',
                server: 'Vercel',
                source: 'sapi.dramaboxvideo.com',
                endpoints: [
                    '/api/status',
                    '/api/trending',
                    '/api/search?q=',
                    '/api/latest',
                    '/api/rank?type=1',
                    '/api/detail?id=',
                    '/api/vip',
                    '/api/comingsoon',
                ],
                timestamp: new Date().toISOString(),
            }));
        }

        // ========== TRENDING (FYP) ==========
        if (path === '/api/trending') {
            const body = {
                homePageStyle: 0,
                isNeedRank: 1,
                isNeedNewChannel: 1,
                type: 0,
                index: 0,
                channelId: 175,
                recSessionId: crypto.randomBytes(32).toString('hex'),
            };

            const result = await dramaboxPost('https://sapi.dramaboxvideo.com/drama-box/he001/theater', body);

            if (result.code === 200 && result.data?.data?.columnVoList) {
                const books = result.data.data.columnVoList.flatMap(col => col.bookList || []);
                return res.end(JSON.stringify({
                    success: true,
                    total: books.length,
                    data: books.map(formatDrama),
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch trending', debug: result }));
        }

        // ========== SEARCH ==========
        if (path === '/api/search') {
            const q = params.q;
            if (!q) return res.end(JSON.stringify({ success: false, error: 'Parameter q wajib' }));

            const body = {
                searchSource: '',
                sortType: 1,
                synSwitch: 1,
                pageNo: 1,
                pageSize: 20,
                from: 'search_result',
                keyword: q,
            };

            const result = await dramaboxPost('https://sapi.dramaboxvideo.com/drama-box/search/search', body);

            if (result.code === 200 && result.data?.data?.searchList) {
                return res.end(JSON.stringify({
                    success: true,
                    total: result.data.data.searchList.length,
                    data: result.data.data.searchList.map(formatDrama),
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch search', debug: result }));
        }

        // ========== LATEST ==========
        if (path === '/api/latest') {
            const body = {
                newChannelStyle: 1,
                isNeedRank: 1,
                pageNo: 1,
                index: 1,
                channelId: 43,
                recSessionId: crypto.randomBytes(32).toString('hex'),
            };

            const result = await dramaboxPost('https://sapi.dramaboxvideo.com/drama-box/he001/theater', body);

            if (result.code === 200 && result.data?.data?.newTheaterList?.records) {
                return res.end(JSON.stringify({
                    success: true,
                    total: result.data.data.newTheaterList.records.length,
                    data: result.data.data.newTheaterList.records.map(formatDrama),
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch latest', debug: result }));
        }

        // ========== RANK ==========
        if (path === '/api/rank') {
            const type = parseInt(params.type) || 1;

            const body = { rankType: type };
            const result = await dramaboxPost('https://sapi.dramaboxvideo.com/drama-box/he001/rank', body);

            if (result.code === 200 && result.data?.data?.rankList) {
                return res.end(JSON.stringify({
                    success: true,
                    type,
                    total: result.data.data.rankList.length,
                    data: result.data.data.rankList.map(formatDrama),
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch rank', debug: result }));
        }

        // ========== VIP ==========
        if (path === '/api/vip') {
            const body = {
                homePageStyle: 0,
                isNeedRank: 1,
                index: 4,
                type: 0,
                channelId: 205,
            };

            const result = await dramaboxPost('https://sapi.dramaboxvideo.com/drama-box/he001/theater', body);

            if (result.code === 200 && result.data?.data?.columnVoList) {
                const books = result.data.data.columnVoList.flatMap(col => col.bookList || []);
                return res.end(JSON.stringify({
                    success: true,
                    total: books.length,
                    data: books.map(formatDrama),
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch VIP', debug: result }));
        }

        // ========== COMING SOON ==========
        if (path === '/api/comingsoon') {
            const body = {};
            const result = await dramaboxPost('https://sapi.dramaboxvideo.com/drama-box/he001/reserveBook', body);

            if (result.code === 200 && result.data?.data?.reserveBookList) {
                return res.end(JSON.stringify({
                    success: true,
                    total: result.data.data.reserveBookList.length,
                    data: result.data.data.reserveBookList.map(item => ({
                        ...formatDrama(item),
                        release_date: item.bookShelfTime || null,
                    })),
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch coming soon', debug: result }));
        }

        // ========== DETAIL (EPISODES) ==========
        if (path === '/api/detail') {
            const id = params.id;
            if (!id) return res.end(JSON.stringify({ success: false, error: 'Parameter id wajib' }));

            const body = {
                boundaryIndex: 0,
                index: -1,
                currencyPlaySource: 'discover_175_rec',
                needEndRecommend: 0,
                currencyPlaySourceName: '首页发现_Untukmu_推荐列表',
                preLoad: false,
                rid: '',
                pullCid: '',
                enterReaderChapterIndex: 0,
                loadDirection: 0,
                startUpKey: crypto.randomUUID(),
                bookId: String(id),
            };

            const result = await dramaboxPost('https://sapi.dramaboxvideo.com/drama-box/chapterv2/batch/load', body);

            if (result.code === 200 && result.data?.data?.chapterList) {
                const chapters = result.data.data.chapterList.map(ch => ({
                    episode: ch.chapterIndex || ch.chapterNo || 0,
                    chapter_id: ch.chapterId || '',
                    title: ch.chapterName || ch.chapterTitle || '',
                    is_free: (ch.isFree || 0) == 1,
                    price: ch.price || 0,
                }));

                return res.end(JSON.stringify({
                    success: true,
                    book_id: id,
                    total_episodes: chapters.length,
                    episodes: chapters,
                }));
            }

            return res.end(JSON.stringify({ success: false, error: 'Gagal fetch detail', debug: result }));
        }

        // ========== HOMEPAGE ==========
        if (path === '/') {
            res.setHeader('Content-Type', 'text/html');
            return res.end(`<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dramabox API v5.0</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        body{font-family:sans-serif;background:#0a0a0f;color:#cdd6f4;padding:40px}
        h1{background:linear-gradient(135deg,#00ff88,#89b4fa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;font-size:2em}
        .badge{background:#00ff88;color:#000;padding:4px 12px;border-radius:20px;font-weight:700;font-size:.85em;margin:10px 0 30px;display:inline-block}
        .ep{background:#13131a;border:1px solid #1e1e2e;padding:15px;margin:10px 0;border-radius:8px}
        .method{color:#89b4fa;font-weight:bold}
        code{color:#f9e2af;background:#000;padding:2px 6px;border-radius:4px}
        a{color:#00ff88;text-decoration:none}
        .test-btn{background:#00ff88;color:#000;padding:4px 12px;border-radius:5px;font-size:.8em;font-weight:700;margin-left:8px}
    </style>
</head>
<body>
    <h1>🎬 Dramabox Unlock API v5.0</h1>
    <div class="badge">Vercel • sapi.dramaboxvideo.com</div>
    <div class="ep"><span class="method">GET</span> <code>/api/status</code> <a class="test-btn" href="/api/status">Test</a></div>
    <div class="ep"><span class="method">GET</span> <code>/api/trending</code> <a class="test-btn" href="/api/trending">Test</a></div>
    <div class="ep"><span class="method">GET</span> <code>/api/search?q=ceo</code></div>
    <div class="ep"><span class="method">GET</span> <code>/api/latest</code> <a class="test-btn" href="/api/latest">Test</a></div>
    <div class="ep"><span class="method">GET</span> <code>/api/rank?type=1</code> <a class="test-btn" href="/api/rank?type=1">Test</a></div>
    <div class="ep"><span class="method">GET</span> <code>/api/vip</code> <a class="test-btn" href="/api/vip">Test</a></div>
    <div class="ep"><span class="method">GET</span> <code>/api/comingsoon</code> <a class="test-btn" href="/api/comingsoon">Test</a></div>
    <div class="ep"><span class="method">GET</span> <code>/api/detail?id=</code></div>
</body>
</html>`);
        }

        // ========== 404 ==========
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Not found', help: 'Buka / untuk daftar endpoint' }));

    } catch (error) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'Server error', message: error.message }));
    }
};
