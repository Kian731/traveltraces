const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
let googleKeys;

async function hash(value) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBase64Url(value) {
	return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}

async function googlePublicKey(kid) {
	if (!googleKeys || googleKeys.expiresAt <= Date.now()) {
		const response = await fetch('https://www.googleapis.com/oauth2/v3/certs');
		if (!response.ok) throw new Error('Google 驗證服務無法連線');
		const maxAge = Number(response.headers.get('Cache-Control')?.match(/max-age=(\d+)/)?.[1] || 60);
		const { keys } = await response.json();
		googleKeys = { keys, expiresAt: Date.now() + maxAge * 1000 };
	}
	return googleKeys.keys.find(key => key.kid === kid && key.kty === 'RSA' && key.alg === 'RS256');
}

async function verifyCredential(credential, nonce, clientId) {
	if (typeof credential !== 'string' || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(credential)) return null;
	const [header, payload, signature] = credential.split('.');
	const decode = value => JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
	const { alg, kid } = decode(header);
	if (alg !== 'RS256' || typeof kid !== 'string') return null;
	const claims = decode(payload);
	const now = Math.floor(Date.now() / 1000);
	if (!['https://accounts.google.com', 'accounts.google.com'].includes(claims.iss) ||
		claims.aud !== clientId || (claims.azp && claims.azp !== clientId) ||
		!Number.isSafeInteger(claims.exp) || claims.exp <= now ||
		!Number.isSafeInteger(claims.iat) || claims.iat < now - 600 || claims.iat > now + 60 ||
		claims.nonce !== nonce || typeof claims.sub !== 'string' || !claims.sub) return null;
	const jwk = await googlePublicKey(kid);
	if (!jwk) return null;
	const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
	const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, decodeBase64Url(signature), new TextEncoder().encode(header + '.' + payload));
	return valid ? claims : null;
}

async function readBoundedText(request, limit) {
	const decoder = new TextDecoder('utf-8', { fatal: true });
	let bytes = 0;
	let value = '';
	for await (const chunk of request.body || []) {
		bytes += chunk.byteLength;
		if (bytes > limit) throw new RangeError('資料超過容量上限');
		value += decoder.decode(chunk, { stream: true });
	}
	return value + decoder.decode();
}

async function login(request, env, json) {
	const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
	if (!(await env.SHARE_RATE_LIMITER.limit({ key: 'account-login:' + ip })).success) return json({ error: '登入嘗試太頻繁，請稍後再試' }, 429);
	let claims, nonce;
	try {
		const body = JSON.parse(await readBoundedText(request, 10000));
		nonce = body.nonce;
		if (typeof nonce === 'string' && /^[a-f0-9-]{36}$/.test(nonce)) claims = await verifyCredential(body.credential, nonce, env.GOOGLE_CLIENT_ID);
	} catch { /* Invalid or expired Google credential. */ }
	if (!claims) return json({ error: 'Google 登入驗證失敗，請重新登入' }, 401);
	const accountId = await hash('google:' + claims.sub);
	const token = (crypto.randomUUID() + crypto.randomUUID()).replaceAll('-', '');
	const result = await env.DB.prepare('INSERT INTO account_sessions (token_hash, nonce_hash, account_id, expires_at) VALUES (?, ?, ?, ?) ON CONFLICT(nonce_hash) DO NOTHING')
		.bind(await hash(token), await hash(nonce), accountId, Date.now() + 7 * 86400000).run();
	if (!result.meta.changes) return json({ error: '這次登入已使用，請重新登入' }, 401);
	return json({ token, accountId, email: claims.email_verified === true && typeof claims.email === 'string' ? claims.email : '' });
}

async function readArchive(env, accountId, knownVersion, headers) {
	const { results } = await env.DB.prepare('SELECT a.version, p.payload FROM account_archives a LEFT JOIN account_archive_parts p ON p.account_id = a.account_id AND a.version <> ? WHERE a.account_id = ? ORDER BY p.part')
		.bind(knownVersion, accountId).all();
	const version = results[0]?.version || 0;
	headers.set('X-Travel-Version', String(version));
	if (!version || version === knownVersion) return new Response(null, { status: 204, headers });
	headers.set('Content-Type', 'application/json; charset=utf-8');
	return new Response(results.map(row => row.payload).join(''), { headers });
}

async function writeArchive(request, env, accountId, json) {
	const rawVersion = request.headers.get('X-Travel-Version');
	const version = Number(rawVersion);
	if (!rawVersion || !Number.isSafeInteger(version) || version < 0) return json({ error: '缺少有效的同步版本' }, 400);
	let payload;
	try { payload = await readBoundedText(request, MAX_ARCHIVE_BYTES); }
	catch (error) { return json({ error: error instanceof RangeError ? '旅遊記錄超過 8 MB，請縮小自訂封面後再試' : '資料格式錯誤' }, error instanceof RangeError ? 413 : 400); }
	if (!payload.startsWith('{') || !payload.endsWith('}')) return json({ error: '資料格式錯誤' }, 400);
	const writeId = crypto.randomUUID();
	// The transaction changes parts only after the version check succeeds.
	const statements = [
		version === 0
			? env.DB.prepare('INSERT INTO account_archives (account_id, version, write_id) VALUES (?, 1, ?) ON CONFLICT(account_id) DO NOTHING').bind(accountId, writeId)
			: env.DB.prepare('UPDATE account_archives SET version = version + 1, write_id = ? WHERE account_id = ? AND version = ?').bind(writeId, accountId, version),
		env.DB.prepare('DELETE FROM account_archive_parts WHERE account_id = ? AND EXISTS (SELECT 1 FROM account_archives WHERE account_id = ? AND write_id = ?)').bind(accountId, accountId, writeId),
	];
	for (let offset = 0, part = 0; offset < payload.length; part++) {
		let end = Math.min(offset + 400000, payload.length);
		if (payload.charCodeAt(end - 1) >= 0xD800 && payload.charCodeAt(end - 1) <= 0xDBFF) end--;
		statements.push(env.DB.prepare('INSERT INTO account_archive_parts (account_id, part, payload) SELECT ?, ?, ? FROM account_archives WHERE account_id = ? AND write_id = ?')
			.bind(accountId, part, payload.slice(offset, end), accountId, writeId));
		offset = end;
	}
	const [update] = await env.DB.batch(statements);
	return update.meta.changes ? json({ version: version + 1 }) : json({ error: '另一台裝置已更新旅遊記錄' }, 409);
}

export async function accountRequest(request, env, path, allowed, cors) {
	const headers = new Headers(cors);
	headers.set('Cache-Control', 'no-store');
	headers.set('Access-Control-Expose-Headers', 'X-Travel-Version');
	const json = (body, status = 200) => Response.json(body, { status, headers });
	if (!allowed) return json({ error: '不允許的網站來源' }, 403);
	if (!env.GOOGLE_CLIENT_ID) return json({ error: '帳號同步尚未啟用' }, 503);
	const method = request.method;
	if (path === '/account/config' && method === 'GET') return json({ clientId: env.GOOGLE_CLIENT_ID });
	if (path === '/account/login' && method === 'POST') return login(request, env, json);
	const token = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
	if (!token) return json({ error: '請登入後再同步' }, 401);
	const tokenHash = await hash(token);
	const session = await env.DB.prepare('SELECT account_id FROM account_sessions WHERE token_hash = ? AND expires_at > ?')
		.bind(tokenHash, Date.now()).first();
	if (!session) return json({ error: '登入已過期，請重新登入' }, 401);
	if (path === '/account/session' && method === 'DELETE') {
		await env.DB.prepare('DELETE FROM account_sessions WHERE token_hash = ?').bind(tokenHash).run();
		return json({ signedOut: true });
	}
	if (path === '/account/archive' && method === 'GET') {
		const knownVersion = Number(new URL(request.url).searchParams.get('version') || 0);
		return readArchive(env, session.account_id, Number.isSafeInteger(knownVersion) ? knownVersion : 0, headers);
	}
	if (path === '/account/archive' && method === 'PUT') return writeArchive(request, env, session.account_id, json);
	return json({ error: '找不到 API' }, 404);
}
