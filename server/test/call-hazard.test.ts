import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transcriptHazard } from '../src/orchestrator.ts';

test('a stated gas appliance is a hazard', () => {
  assert.equal(transcriptHazard("It's a gas dryer")?.ok, false);
  assert.equal(transcriptHazard('I think I smell gas near it')?.ok, false);
});

test('denied hazards do not block DIY', () => {
  assert.equal(transcriptHazard("I don't smell gas"), null);
  assert.equal(transcriptHazard('no smoke'), null);
  assert.equal(transcriptHazard('there is no burning smell'), null);
  assert.equal(transcriptHazard("it's not a gas dryer, it's electric"), null);
});

test('a denial of one hazard does not hide another', () => {
  assert.equal(transcriptHazard("no smoke but it's a gas dryer")?.ok, false);
  assert.equal(transcriptHazard('No it is gas')?.ok, false);
});
