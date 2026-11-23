const MAP_HOST = 'https://tiles.openfreemap.org';
const MAP_AGENT = 'TravelTraces/1.0 (+https://kian731.github.io/traveltraces/)';
const GLYPHS = new Set([0, 256, 512, 768, 1024, 1280, 1536, 1792, 2048, 2304, 3072, 3328, 3584, 8192, 12288, 12544, 65280]);

function upstreamMapUrl(path) {
	const tile = /^\/map-assets\/tile\/(\d{1,2})\/(\d{1,5})\/(\d{1,5})\.pbf$/.exec(path);
	if (tile) {
		const [z, x, y] = tile.slice(1).map(Number);
		if (z > 14 || x >= 2 ** z || y >= 2 ** z) return null;
		return MAP_HOST + '/planet/latest/' + z + '/' + x + '/' + y + '.pbf';
	}
	const glyph = /^\/map-assets\/font\/(\d{1,5})-(\d{1,5})\.pbf$/.exec(path);
	if (glyph && GLYPHS.has(Number(glyph[1])) && Number(glyph[2]) === Number(glyph[1]) + 255) {
		return MAP_HOST + '/fonts/Noto%20Sans%20Regular/' + Number(glyph[1]) + '-' + Number(glyph[2]) + '.pbf';
	}
	return null;
}

export async function serveMapAsset(request, env, allowed, cors) {
	if (!allowed || request.method !== 'GET') return new Response(null, { status: allowed ? 405 : 403, headers: cors });
	const url = upstreamMapUrl(new URL(request.url).pathname);
	if (!url) return new Response(null, { status: 400, headers: cors });
	const rate = await env.MAP_RATE_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
	if (!rate.success) return new Response(null, { status: 429, headers: cors });
	let response;
	try {
		response = await fetch(url, { headers: { 'User-Agent': MAP_AGENT }, signal: AbortSignal.timeout(12000) });
	} catch { return new Response(null, { status: 502, headers: cors }); }
	if (!response.ok) {
		await response.body?.cancel();
		return new Response(null, { status: response.status === 404 ? 404 : 502, headers: { ...cors, 'Content-Type': 'application/x-protobuf' } });
	}
	const headers = new Headers(cors);
	headers.set('Content-Type', 'application/x-protobuf');
	headers.set('Cache-Control', 'public, max-age=3600');
	const encoding = response.headers.get('Content-Encoding');
	if (encoding) headers.set('Content-Encoding', encoding);
	return new Response(response.body, { headers });
}
