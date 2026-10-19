import test from 'node:test';
import assert from 'node:assert/strict';
import {netatmoPermissions} from './credentials.js';
test('OAuth permissions are only granted for explicit scopes',()=>{
 assert.deepEqual(netatmoPermissions(undefined),{read:'unknown',write:'unknown'});
 assert.deepEqual(netatmoPermissions('read_thermostat'),{read:'granted',write:'missing'});
 assert.deepEqual(netatmoPermissions('read_thermostat write_thermostat'),{read:'granted',write:'granted'});
 assert.deepEqual(netatmoPermissions(''),{read:'missing',write:'missing'});
});
