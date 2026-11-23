import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/index.js';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0004_private_account_sync.sql', import.meta.url), 'utf8'));
const env = {
	ALLOWED_ORIGINS: 'https://kian731.github.io',
	GOOGLE_CLIENT_ID: 'test-client',
	SHARE_RATE_LIMITER: { limit: async () => ({ success: true }) },
	DB: {
		prepare(sql) {
			return { bind(...args) {
				const statement = db.prepare(sql);
				return {
					first: async () => statement.get(...args),
					all: async () => ({ results: statement.all(...args) }),
					run: async () => ({ meta: statement.run(...args) }),
				};
			} };
		},
		async batch(statements) {
			db.exec('BEGIN');
			try {
				const results = [];
				for (const statement of statements) results.push(await statement.run());
				db.exec('COMMIT');
				return results;
			} catch (error) { db.exec('ROLLBACK'); throw error; }
		},
	},
};

function send(path, options = {}, token = '') {
	return worker.fetch(new Request('https://worker.example/account/' + path, {
		...options,
		headers: { Origin: env.ALLOWED_ORIGINS, ...(token ? { Authorization: 'Bearer ' + token } : {}), ...options.headers },
	}), env);
}

const keys = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...await crypto.subtle.exportKey('jwk', keys.publicKey), kid: 'test-key', alg: 'RS256' };
globalThis.fetch = async url => {
	assert.equal(url, 'https://www.googleapis.com/oauth2/v3/certs');
	return Response.json({ keys: [jwk] }, { headers: { 'Cache-Control': 'max-age=600' } });
};

async function loginBody(sub, options = {}) {
	const nonce = crypto.randomUUID();
	const now = Math.floor(Date.now() / 1000);
	const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
	const unsigned = encode({ alg: 'RS256', kid: 'test-key' }) + '.' + encode({
		sub, nonce, iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, iat: now, exp: now + 600, ...options,
	});
	const signed = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, new TextEncoder().encode(unsigned));
	return { credential: unsigned + '.' + Buffer.from(signed).toString('base64url'), nonce };
}

function signIn(body) {
	return send('login', { method: 'POST', body: JSON.stringify(body) });
}

const firstLogin = await loginBody('1234');
const alice = await (await signIn(firstLogin)).json();
const aliceSecondDevice = await (await signIn(await loginBody('1234'))).json();
const bob = await (await signIn(await loginBody('9876'))).json();
assert.equal(alice.accountId, aliceSecondDevice.accountId);
assert.notEqual(alice.accountId, bob.accountId);
assert.equal((await signIn(firstLogin)).status, 401);
assert.equal((await signIn(await loginBody('1234', { aud: 'wrong-client' }))).status, 401);
const wrongNonce = await loginBody('1234');
assert.equal((await signIn({ ...wrongNonce, nonce: crypto.randomUUID() })).status, 401);
assert.equal((await signIn({ ...wrongNonce, credential: wrongNonce.credential + 'a' })).status, 401);
assert.equal((await send('archive')).status, 401);
assert.equal((await send('archive', { headers: { Origin: 'https://wrong.example' } }, alice.token)).status, 403);

function put(snapshot, version, token) {
	return send('archive', { method: 'PUT', headers: { 'X-Travel-Version': String(version) }, body: JSON.stringify(snapshot) }, token);
}

const original = { trips: [{ title: '臺南' + '旅'.repeat(399974) + '🧳旅行' + '旅'.repeat(200000) }] };
assert.deepEqual(await (await put(original, 0, alice.token)).json(), { version: 1 });
const read = await send('archive', {}, aliceSecondDevice.token);
assert.equal(read.headers.get('X-Travel-Version'), '1');
assert.equal(read.headers.get('Cache-Control'), 'no-store');
assert.deepEqual(await read.json(), original);
assert.equal((await send('archive?version=1', {}, alice.token)).status, 204);
assert.equal((await send('archive', {}, bob.token)).headers.get('X-Travel-Version'), '0');
assert.equal((await put({ trips: [] }, 0, aliceSecondDevice.token)).status, 409);
assert.deepEqual(await (await send('archive', {}, alice.token)).json(), original);
assert.deepEqual(await (await put({ trips: [{ title: '大阪' }] }, 1, aliceSecondDevice.token)).json(), { version: 2 });
assert.equal((await put({ trips: [] }, 1, alice.token)).status, 409);
assert.deepEqual(await (await send('archive', {}, alice.token)).json(), { trips: [{ title: '大阪' }] });
assert.equal((await put({ trips: ['x'.repeat(8 * 1024 * 1024)] }, 2, alice.token)).status, 413);
assert.equal((await send('session', { method: 'DELETE' }, alice.token)).status, 200);
assert.equal((await send('archive', {}, alice.token)).status, 401);
assert.equal((await send('archive', {}, aliceSecondDevice.token)).status, 200);
console.log('All account sign-in and private sync tests passed.');
