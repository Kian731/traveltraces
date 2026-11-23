import { accountRequest } from './account.js';
import { serveMapAsset } from './map-assets.js';

function allowedOrigins(env) {
	return String(env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
}

function requestOriginIsAllowed(request, env) {
	return allowedOrigins(env).includes(request.headers.get('Origin'));
}

function corsHeaders(request, env) {
	const origin = request.headers.get('Origin');
	return {
		...(allowedOrigins(env).includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}),
		'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
		'Access-Control-Allow-Headers': 'Content-Type, X-Share-Key, X-Delete-Token, X-Edit-Token, Authorization, X-Travel-Version',
		'Access-Control-Max-Age': '86400',
		Vary: 'Origin',
	};
}

function json(request, env, body, status = 200) {
	return Response.json(body, { status, headers: corsHeaders(request, env) });
}

function shareId() {
	return `s_${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`;
}

function accessToken() {
	return crypto.randomUUID().replaceAll('-', '');
}

function hasWritePermission(request, env) {
	const supplied = request.headers.get('X-Share-Key');
	return Boolean(env.SHARE_WRITE_KEY) && supplied === env.SHARE_WRITE_KEY;
}

async function tokenHash(value) {
	const bytes = new TextEncoder().encode(String(value));
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function validateTurnstile(token, request, env) {
	if (!token || !env.TURNSTILE_SECRET_KEY) return false;
	const form = new FormData();
	form.set('secret', env.TURNSTILE_SECRET_KEY);
	form.set('response', token);
	const ip = request.headers.get('CF-Connecting-IP');
	if (ip) form.set('remoteip', ip);
	const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: form });
	if (!response.ok) return false;
	const result = await response.json();
	return result.success === true && (!result.action || result.action === 'create_share');
}

function encodedPayload(payload) {
	if (!payload || typeof payload !== 'object') return { error: '缺少旅程資料' };
	const value = JSON.stringify(payload);
	if (new TextEncoder().encode(value).byteLength > 500000) return { error: '旅程資料過大，無法儲存' };
	return { value };
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);

		if (request.method === 'OPTIONS') {
			if (!requestOriginIsAllowed(request, env)) return new Response(null, { status: 403 });
			return new Response(null, { status: 204, headers: corsHeaders(request, env) });
		}

		if (request.method === 'GET' && url.pathname === '/health') {
			return json(request, env, { ok: true });
		}

		if (url.pathname.startsWith('/account/')) {
			return accountRequest(request, env, url.pathname, requestOriginIsAllowed(request, env), corsHeaders(request, env));
		}

		if (url.pathname.startsWith('/map-assets/')) {
			return serveMapAsset(request, env, requestOriginIsAllowed(request, env), corsHeaders(request, env));
		}

		if (request.method === 'POST' && url.pathname === '/auth/check') {
			if (!requestOriginIsAllowed(request, env)) return json(request, env, { error: '不允許的網站來源' }, 403);
			if (!hasWritePermission(request, env)) return json(request, env, { error: '分享密碼錯誤' }, 401);
			return json(request, env, { ok: true });
		}

		if (request.method === 'POST' && url.pathname === '/shares') {
			if (!requestOriginIsAllowed(request, env)) return json(request, env, { error: '不允許的網站來源' }, 403);

			let body;
			try { body = await request.json(); } catch { return json(request, env, { error: '資料格式錯誤' }, 400); }
			const encoded = encodedPayload(body?.payload);
			if (encoded.error) return json(request, env, { error: encoded.error }, 400);
			if (!await validateTurnstile(body.turnstileToken, request, env)) return json(request, env, { error: '人機驗證失敗，請重新嘗試' }, 403);
			const rateKey = `${request.headers.get('CF-Connecting-IP') || 'unknown'}:${request.headers.get('User-Agent') || ''}`;
			const rate = await env.SHARE_RATE_LIMITER.limit({ key: rateKey });
			if (!rate.success) return json(request, env, { error: '建立分享的次數太頻繁，請稍後再試' }, 429);

			const requestedDays = Number(body.expiresInDays || 30);
			const expiresInDays = Math.min(Math.max(Math.round(requestedDays) || 30, 1), 180);
			const createdAt = Date.now();
			const expiresAt = createdAt + expiresInDays * 86400000;
			const id = shareId();
			const deleteToken = accessToken() + accessToken();
			const editToken = accessToken();
			const deleteTokenHash = await tokenHash(deleteToken);
			const editTokenHash = await tokenHash(editToken);

			await env.DB.prepare('INSERT INTO shares (id, payload, created_at, expires_at, delete_token_hash, edit_token_hash, version, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)')
				.bind(id, encoded.value, createdAt, expiresAt, deleteTokenHash, editTokenHash, createdAt).run();
			return json(request, env, { id, expiresAt, deleteToken, editToken, version: 1, updatedAt: createdAt }, 201);
		}

		const match = url.pathname.match(/^\/shares\/(s_[A-Za-z0-9]+)$/);
		if (match && request.method === 'GET') {
			const row = await env.DB.prepare('SELECT payload, expires_at, version, updated_at FROM shares WHERE id = ?').bind(match[1]).first();
			if (!row) return json(request, env, { error: '找不到分享內容' }, 404);
			if (Number(row.expires_at) <= Date.now()) {
				await env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(match[1]).run();
				return json(request, env, { error: '分享連結已過期' }, 410);
			}
			return json(request, env, { payload: JSON.parse(row.payload), expiresAt: row.expires_at, version: Number(row.version) || 1, updatedAt: Number(row.updated_at) || 0 });
		}

		if (match && request.method === 'PUT') {
			if (!requestOriginIsAllowed(request, env)) return json(request, env, { error: '不允許的網站來源' }, 403);
			let body;
			try { body = await request.json(); } catch { return json(request, env, { error: '資料格式錯誤' }, 400); }
			const encoded = encodedPayload(body?.payload);
			if (encoded.error) return json(request, env, { error: encoded.error }, 400);
			const supplied = request.headers.get('X-Edit-Token');
			if (!supplied) return json(request, env, { error: '缺少協作編輯權限' }, 401);
			const row = await env.DB.prepare('SELECT edit_token_hash, version, expires_at, updated_at FROM shares WHERE id = ?').bind(match[1]).first();
			if (!row) return json(request, env, { error: '找不到分享內容' }, 404);
			if (Number(row.expires_at) <= Date.now()) {
				await env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(match[1]).run();
				return json(request, env, { error: '分享連結已過期' }, 410);
			}
			if (!row.edit_token_hash || await tokenHash(supplied) !== row.edit_token_hash) return json(request, env, { error: '協作編輯權限無效' }, 401);
			const expectedVersion = Number(body.version);
			if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return json(request, env, { error: '缺少有效的資料版本' }, 400);
			if (expectedVersion !== Number(row.version)) return json(request, env, { error: '這趟旅程已在其他裝置更新，請重新載入後再編輯', version: Number(row.version), updatedAt: Number(row.updated_at) || 0 }, 409);
			const updatedAt = Date.now();
			const result = await env.DB.prepare('UPDATE shares SET payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND edit_token_hash = ?')
				.bind(encoded.value, updatedAt, match[1], expectedVersion, row.edit_token_hash).run();
			if (!result.meta?.changes) {
				const latest = await env.DB.prepare('SELECT version, updated_at FROM shares WHERE id = ?').bind(match[1]).first();
				return json(request, env, { error: '這趟旅程已在其他裝置更新，請重新載入後再編輯', version: Number(latest?.version) || expectedVersion, updatedAt: Number(latest?.updated_at) || updatedAt }, 409);
			}
			return json(request, env, { updated: true, version: expectedVersion + 1, updatedAt, expiresAt: Number(row.expires_at) });
		}

		if (match && request.method === 'DELETE') {
			if (!requestOriginIsAllowed(request, env)) return json(request, env, { error: '不允許的網站來源' }, 403);
			let allowed = hasWritePermission(request, env);
			if (!allowed) {
				const supplied = request.headers.get('X-Delete-Token');
				const row = await env.DB.prepare('SELECT delete_token_hash FROM shares WHERE id = ?').bind(match[1]).first();
				allowed = Boolean(supplied && row?.delete_token_hash && await tokenHash(supplied) === row.delete_token_hash);
			}
			if (!allowed) return json(request, env, { error: '沒有權限撤銷這個分享' }, 401);
			await env.DB.prepare('DELETE FROM shares WHERE id = ?').bind(match[1]).run();
			return json(request, env, { deleted: true });
		}

		return json(request, env, { error: '找不到 API' }, 404);
	},

	async scheduled(_controller, env) {
		await env.DB.prepare('DELETE FROM shares WHERE expires_at <= ?').bind(Date.now()).run();
		if (env.GOOGLE_CLIENT_ID) await env.DB.prepare('DELETE FROM account_sessions WHERE expires_at <= ?').bind(Date.now()).run();
	},
};
