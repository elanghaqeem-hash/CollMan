import test from 'node:test';
import assert from 'node:assert/strict';
import {postgresSQL} from '../src/postgres.js';

test('PostgreSQL placeholders are parameterized and ordered',()=>{
  assert.equal(postgresSQL('SELECT * FROM assets WHERE id=? AND tenant_id=?'),'SELECT * FROM assets WHERE id=$1 AND tenant_id=$2');
});
test('SQLite UTC expressions become PostgreSQL-compatible timestamps',()=>{
  const converted=postgresSQL("UPDATE sessions SET expires_at=datetime('now','+12 hours') WHERE token_hash=?");
  assert.match(converted,/timezone\('utc',now\(\)\) \+ interval '12 hours'/);
  assert.match(converted,/\$1/);
  assert.equal(postgresSQL("SELECT datetime('now','-15 minutes')"),"SELECT (timezone('utc',now()) - interval '15 minutes')");
});
test('No legacy datetime calls remain after conversion',()=>{
  assert.doesNotMatch(postgresSQL("SELECT datetime('now')"),/datetime\(/);
});
