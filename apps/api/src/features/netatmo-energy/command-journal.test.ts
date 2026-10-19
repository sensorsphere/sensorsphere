import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesCommand} from './command-journal.js';
test('NET-UI-03 command verification checks mode and manual target',()=>{
  assert.equal(matchesCommand({mode:'manual',temperature:20},'manual',20),true);
  assert.equal(matchesCommand({mode:'manual',temperature:20},'manual',20.1),false);
  assert.equal(matchesCommand({mode:'manual',temperature:20},'away',20),false);
  assert.equal(matchesCommand({mode:'schedule'},'schedule',null),true);
  assert.equal(matchesCommand({mode:'hg'},'away',null),false);
});
