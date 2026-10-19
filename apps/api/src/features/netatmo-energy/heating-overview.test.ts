import test from 'node:test';
import assert from 'node:assert/strict';
import { readingValue } from './heating-overview.js';

test('heating metric values preserve false and zero without inventing measurements',()=>{
  const base={external_id:'sim-02:netatmo:module:x:y',metric_key:'heating',time:new Date('2026-10-19T10:00:00Z'),value_double:null,value_text:null,value_boolean:false};
  assert.deepEqual(readingValue(base),{value:false,recordedAt:'2026-10-19T10:00:00.000Z'});
  assert.equal(readingValue({...base,value_double:0,value_boolean:null}).value,0);
  assert.equal(readingValue({...base,time:null,value_boolean:null}).value,null);
});
