import assert from 'node:assert/strict';
import worker from '../src/index.js';

const origin = 'https://kian731.github.io';

async function hash(value) {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

class MemoryDB {
	constructor(row) { this.row = row; }
	prepare(sql) {
		const db = this; let values = [];
		return {
			bind(...next) { values = next; return this; },
			async first() { return db.row || null; },
			async run() {
				if (sql.startsWith('UPDATE shares SET payload')) {
					const [payload, updatedAt, id, expectedVersion, editTokenHash] = values;
					if (!db.row || db.row.id !== id || db.row.version !== expectedVersion || db.row.edit_token_hash !== editTokenHash) return { meta: { changes: 0 } };
					Object.assign(db.row, { payload, updated_at: updatedAt, version: db.row.version + 1 });
					return { meta: { changes: 1 } };
				}
				if (sql.startsWith('DELETE FROM shares')) { db.row = null; return { meta: { changes: 1 } }; }
				return { meta: { changes: 0 } };
			},
		};
	}
}

function request(path, init = {}) {
	return new Request(`https://worker.test${path}`, { ...init, headers: { Origin: origin, ...(init.headers || {}) } });
}

async function run() {
	const health = await worker.fetch(request('/health'), { ALLOWED_ORIGINS: origin });
	assert.equal(health.status, 200); assert.deepEqual(await health.json(), { ok: true });

	const now = Date.now(); const editable = new MemoryDB({ id: 's_test', payload: JSON.stringify({ value: 'old' }), expires_at: now + 60000, edit_token_hash: await hash('edit-secret'), version: 1, updated_at: now });
	const env = { ALLOWED_ORIGINS: origin, DB: editable };
	const updated = await worker.fetch(request('/shares/s_test', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Edit-Token': 'edit-secret' }, body: JSON.stringify({ payload: { value: 'new' }, version: 1 }) }), env);
	assert.equal(updated.status, 200); assert.equal((await updated.json()).version, 2);
	const read = await worker.fetch(request('/shares/s_test'), env); const shared = await read.json();
	assert.deepEqual(shared.payload, { value: 'new' }); assert.equal(shared.version, 2);

	const conflictDb = new MemoryDB({ id: 's_conflict', payload: JSON.stringify({ value: 'latest' }), expires_at: now + 60000, edit_token_hash: await hash('edit-secret'), version: 3, updated_at: now });
	const conflict = await worker.fetch(request('/shares/s_conflict', { method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Edit-Token': 'edit-secret' }, body: JSON.stringify({ payload: { value: 'stale' }, version: 2 }) }), { ALLOWED_ORIGINS: origin, DB: conflictDb });
	assert.equal(conflict.status, 409); assert.equal((await conflict.json()).version, 3); assert.deepEqual(JSON.parse(conflictDb.row.payload), { value: 'latest' });

	console.log('All Worker sharing tests passed.');
}

run().catch(error => { console.error(error); process.exitCode = 1; });
