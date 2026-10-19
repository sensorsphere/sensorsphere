import test from 'node:test';
import assert from 'node:assert/strict';
import {readingValue,assetModuleIdentity,registryModuleIdentity,controlCapability} from './heating-overview.js';

test('heating metric values preserve false and zero without inventing measurements',()=>{
  const base={external_id:'sim-02:netatmo:module:x:y',metric_key:'heating',time:new Date('2026-10-19T10:00:00Z'),value_double:null,value_text:null,value_boolean:false};
  assert.deepEqual(readingValue(base),{value:false,recordedAt:'2026-10-19T10:00:00.000Z'});
  assert.equal(readingValue({...base,value_double:0,value_boolean:null}).value,0);
  assert.equal(readingValue({...base,time:null,value_boolean:null}).value,null);
});
test('multi-home and multi-connection module identities do not collide',()=>{
  assert.equal(assetModuleIdentity('site-1:netatmo:module:home-a:module-x','site-1'),'home-a:module-x');
  assert.equal(assetModuleIdentity('site-1:netatmo:module:home-b:module-x','site-1'),'home-b:module-x');
  assert.equal(assetModuleIdentity('site-2:netatmo:module:home-a:module-x','site-1'),null);
  assert.equal(registryModuleIdentity('site-1:home-a:module-x','site-1'),'home-a:module-x');
  assert.equal(assetModuleIdentity('site-1:netatmo:room:home-a:room-x','site-1'),null);
});
test('real Netatmo equipment remains read-only even if OAuth grants write',()=>{
  assert.equal(controlCapability('netatmo-home','external','granted'),'read-only');
  assert.equal(controlCapability('sim-02','external','granted'),'read-only');
  assert.equal(controlCapability('sim-01','simulator','granted'),'read-only');
  assert.equal(controlCapability('sim-02','simulator','granted'),'simulator-enabled');
});
