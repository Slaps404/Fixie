import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadFaultTree,
  initialState,
  observe,
  posterior,
  expectedInfoGain,
  nextTest,
  isConfident,
  topHypothesis,
  reasonFor,
} from '../src/diagnosis.ts';

const tree = loadFaultTree('dryer_no_heat');
const sum = (p: Record<string, number>) => Object.values(p).reduce((a, b) => a + b, 0);
const METER = { acks: ['unplugged'], hasMeter: true };

test('priors and every posterior are normalized', () => {
  let s = initialState(tree);
  assert.ok(Math.abs(sum(posterior(s)) - 1) < 1e-9);
  assert.equal(posterior(s).thermal_fuse, 0.45);
  for (const [t, r] of [['breaker_check', 'ok'], ['any_warmth', 'none'], ['fuse_continuity', 'closed'], ['element_continuity', 'ok']] as const) {
    s = observe(s, tree, tree.tests.find((x) => x.id === t)!, r);
    assert.ok(Math.abs(sum(posterior(s)) - 1) < 1e-9);
  }
});

test('every test likelihood table covers every outcome and hypothesis', () => {
  for (const t of tree.tests) {
    for (const o of t.outcomes) for (const h of tree.hypotheses) assert.equal(typeof t.likelihood[o]?.[h.id], 'number', `${t.id}/${o}/${h.id}`);
  }
});

test('fuse open: thermal_fuse >= 0.85 and confident', () => {
  const s0 = initialState(tree);
  const s1 = observe(s0, tree, 'fuse_continuity', 'open');
  assert.ok(posterior(s1).thermal_fuse >= 0.95);
  assert.ok(isConfident(s1));
  assert.equal(topHypothesis(s1).id, 'thermal_fuse');
  assert.equal(isConfident(s0), false);
  assert.equal(s0.posterior.thermal_fuse, 0.45, 'observe must not mutate the previous state');
  assert.match(reasonFor(s0, s1, tree.tests.find((t) => t.id === 'fuse_continuity')!, 'open'), /^Fuse open → P\(fuse\) 0\.45→0\.97$/);
});

test('fuse closed: fuse drops and next test is element or thermostat', () => {
  const s = observe(initialState(tree), tree, 'fuse_continuity', 'closed');
  assert.ok(posterior(s).thermal_fuse < 0.1);
  assert.equal(isConfident(s), false);
  const next = nextTest(s, tree, METER);
  assert.ok(next && ['element_continuity', 'thermostat_continuity'].includes(next.id), String(next?.id));
});

test('unknown readings do not change the posterior but count', () => {
  const s0 = initialState(tree);
  const s1 = observe(s0, tree, 'fuse_continuity', 'unknown');
  assert.deepEqual(s1.posterior, s0.posterior);
  assert.equal(s1.unknowns, 1);
  const s2 = observe(s1, tree, 'element_continuity', "it flickers");
  assert.deepEqual(s2.posterior, s0.posterior);
  assert.equal(s2.unknowns, 2);
  assert.equal(isConfident(s2), false);
  assert.match(reasonFor(s1, s2, tree.tests.find((t) => t.id === 'element_continuity')!, 'it flickers'), /no change/);
});

test('nextTest respects acks and hasMeter', () => {
  const s = initialState(tree);
  const needsAck = nextTest(s, tree, { acks: [], hasMeter: true });
  assert.ok(needsAck && needsAck.requiresAck.length === 0, 'no unplugged ack -> no meter test');
  const withAck = nextTest(s, tree, METER);
  assert.equal(withAck?.id, 'fuse_continuity');
  const noMeter = nextTest(s, tree, { acks: ['unplugged'], hasMeter: false });
  assert.ok(noMeter && !noMeter.needsMeter);
});

test('with no meter only the no-tool tests are chosen, then null', () => {
  let s = initialState(tree);
  const seen: string[] = [];
  for (let i = 0; i < 10; i++) {
    const t = nextTest(s, tree, { acks: ['unplugged'], hasMeter: false });
    if (!t) break;
    assert.equal(t.needsMeter, false);
    assert.equal(t.safetyCost, 0);
    seen.push(t.id);
    s = observe(s, tree, t, t.outcomes[0]);
  }
  assert.deepEqual([...seen].sort(), ['any_warmth', 'breaker_check', 'drum_spins']);
  assert.equal(nextTest(s, tree, { acks: ['unplugged'], hasMeter: false }), null);
});

test('observed tests are never re-asked; expectedInfoGain is non-negative', () => {
  let s = initialState(tree);
  for (const t of tree.tests) assert.ok(expectedInfoGain(s, tree, t) >= 0);
  for (const t of tree.tests) s = observe(s, tree, t, 'unknown');
  assert.equal(nextTest(s, tree, METER), null);
});
