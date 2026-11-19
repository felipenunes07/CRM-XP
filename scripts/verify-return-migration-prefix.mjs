import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {migrations} from '../apps/api/dist/db/migrations.js';
const first105Hash=createHash('sha256').update(JSON.stringify(migrations.slice(0,105)).replaceAll('\\r\\n','\\n')).digest('hex');
assert.equal(first105Hash,'c5358f38e1609b6e39e9613a9b0211d5765a66076154af0fb4d4bd4c2453f86a','Do not modify migrations already published');
assert.equal(migrations.length,107);
console.log(JSON.stringify({first105Preserved:true,first105Hash,migrations:migrations.length}));
