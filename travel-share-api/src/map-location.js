const GOOGLE_SHORT_URL = 'https://maps.app.goo.gl/';

function locationFromRedirect(redirect) {
	try {
		const url = new URL(redirect);
		if (url.protocol !== 'https:' || !/^(?:www\.|maps\.)?google\.(?:com|[a-z]{2}|[a-z]{2,3}\.[a-z]{2})$/i.test(url.hostname)) return null;
		const path = decodeURIComponent(url.pathname);
		if (!/^\/maps(?:\/|$)/.test(path)) return null;
		// A viewport center (/@lat,lng) can differ from the actual place.
		const place = path.includes('/dir/') ? null : /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/.exec(path);
		const coordinate = ['query', 'q', 'destination', 'll'].map(name => url.searchParams.get(name))
			.find(value => value && /^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(value));
		const [lat, lng] = (place ? place.slice(1) : coordinate?.split(',') || []).map(Number);
		if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) return null;
		return [Number(lng.toFixed(6)), Number(lat.toFixed(6))];
	} catch { return null; }
}

export async function serveMapLocation(request, env, allowed, cors) {
	const headers = { ...cors, 'Cache-Control': 'no-store' };
	if (!allowed || request.method !== 'GET') return new Response(null, { status: allowed ? 405 : 403, headers });
	const match = /^\/map-location\/([A-Za-z0-9]{8,40})$/.exec(new URL(request.url).pathname);
	if (!match) return new Response(null, { status: 400, headers });
	const rate = await env.MAP_LOCATION_LIMITER.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
	if (!rate.success) return new Response(null, { status: 429, headers });
	try {
		const response = await fetch(GOOGLE_SHORT_URL + match[1], {
			method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(5000),
		});
		if (response.status === 429 || response.status >= 500) return new Response(null, { status: 502, headers });
		return Response.json({ point: locationFromRedirect(response.headers.get('Location')) }, { headers });
	} catch { return new Response(null, { status: 502, headers }); }
}
