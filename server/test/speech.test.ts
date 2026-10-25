import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Job } from '../src/types.ts';
import { buildAssistant, buildIntakeAssistant } from '../src/vapi/assistants.ts';
import { moneyForSpeech, spellForSpeech } from '../src/vapi/speech.ts';

test('spellForSpeech: letters and digits break apart, runs chunk into 3-4 with pauses', () => {
  assert.equal(spellForSpeech('WP3392519'), 'W-P... 3-3-9... 2-5-1-9');
  assert.equal(spellForSpeech('WED4815EW'), 'W-E-D... 4-8-1-5... E-W');
  assert.equal(spellForSpeech('W10565111'), 'W... 1-0-5-6... 5-1-1-1');
  assert.equal(spellForSpeech('279838'), '2-7-9... 8-3-8');
  assert.equal(spellForSpeech('wp-339 2519'), 'W-P... 3-3-9... 2-5-1-9');
  assert.equal(spellForSpeech('AP6008325'), 'A-P... 6-0-0... 8-3-2-5');
});

test('moneyForSpeech: dollars and cents in words, never digit by digit', () => {
  assert.equal(moneyForSpeech(15), 'fifteen dollars');
  assert.equal(moneyForSpeech(9.1), 'nine dollars and ten cents');
  assert.equal(moneyForSpeech(120), 'one hundred twenty dollars');
  assert.equal(moneyForSpeech(13.05), 'thirteen dollars and five cents');
  assert.equal(moneyForSpeech(1), 'one dollar');
  assert.equal(moneyForSpeech(0.5), 'fifty cents');
  assert.equal(moneyForSpeech(21.63), 'twenty-one dollars and sixty-three cents');
  assert.equal(moneyForSpeech(1249.99), 'one thousand two hundred forty-nine dollars and ninety-nine cents');
});

const job = {
  id: 'job_s', kind: 'consumer', state: 'SOURCING', createdAt: Date.now(), updatedAt: Date.now(),
  customer: { name: 'Dorothy', phone: '+16195550100' }, appliance: 'dryer', model: 'WED4815EW', symptom: 'no heat', purchaseYear: 2019,
  part: { partNumber: 'WP3392519', name: 'thermal fuse', crossRefs: ['3392519'], techVisitCost: 200, installSteps: ['Unscrew the back panel.'] },
  bestDeal: { supplier: 'PartsDirect', price: 9.1, shipping: 3.95, landedTotal: 13.05, inStock: true, eta: 'Tuesday' },
  calls: [], vendorCallCount: {}, laneAttempts: {}, guardedCalls: 0, reservedMinutes: 0, agentCostUsd: 0, safetyAcks: [], callbackAttempts: 0, notes: [],
} as unknown as Job;

test('supplier and warranty openers say the part number in paced chunks', () => {
  for (const lane of ['supplier', 'warranty'] as const) {
    const a = buildAssistant({ lane, job, attempt: 1 }) as any;
    assert.ok(a.firstMessage.includes('W-P... 3-3-9... 2-5-1-9'), `${lane}: ${a.firstMessage}`);
  }
});

test('callback speaks the price in words', () => {
  const a = buildAssistant({ lane: 'user', job, attempt: 1 }) as any;
  assert.match(a.firstMessage, /thirteen dollars and five cents total with shipping/);
  assert.doesNotMatch(a.firstMessage + a.model.messages[0].content, /\$\d/);
});

test('no lane offers to repeat a number slower', () => {
  const all = [buildIntakeAssistant(), ...(['supplier', 'warranty', 'user', 'delivery', 'tech'] as const).map((lane) => buildAssistant({ lane, job, attempt: 1 }))] as any[];
  for (const a of all) assert.doesNotMatch(a.firstMessage + a.model.messages[0].content, /repeat that slower/i);
});
