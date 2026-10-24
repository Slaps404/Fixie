// Drives the real webhook handler and orchestrator with Vapi-shaped tool-calls; prints one JSON line. Run by memory.test.ts.
import express from 'express';
import type { AddressInfo } from 'node:net';
import { config } from '../../src/config.ts';
import { jobs } from '../../src/jobs.ts';
import { createWebhookHandler } from '../../src/vapi/webhook.ts';

const app = express();
app.use(express.json());
app.post('/vapi/webhook', createWebhookHandler());
const server = app.listen(0);
const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
let n = 0;

async function tool(callId: string, phone: string, name: string, args: object, call: object = { type: 'inboundPhoneCall' }): Promise<string> {
  const res = await fetch(`${base}/vapi/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Vapi-Secret': config.webhookSecret },
    body: JSON.stringify({
      message: {
        type: 'tool-calls',
        call: { id: callId, customer: { number: phone }, ...call },
        toolCallList: [{ id: `tc_${++n}`, type: 'function', function: { name, arguments: args } }],
      },
    }),
  });
  return ((await res.json()) as any).results[0].result;
}

const out: Record<string, string> = {};
out.recorded = await tool('kA', '+15555550123', 'record_knowledge', { concept: 'breaker_box', knows: false });
out.lookupSamePhone = await tool('kB', '+15555550123', 'lookup_caller', {});
out.lookupOtherPhone = await tool('kC', '+15555550999', 'lookup_caller', {});
out.unknownConcept = await tool('kA', '+15555550123', 'record_knowledge', { concept: 'sprocket', knows: false });
await tool('mA', '+15555550124', 'record_test', { test: 'has_meter', reading: 'unknown' });
out.lookupAfterMeter = await tool('mB', '+15555550124', 'lookup_caller', {});
out.firstTest = await tool('tA', '+15555550125', 'record_test', { test: 'drum_spins', reading: 'yes' });
out.secondTest = await tool('tA', '+15555550125', 'record_test', { test: 'any_warmth', reading: 'none' });
await tool('bA', '+15555550123', 'record_test', { test: 'has_meter', reading: 'no' });
await tool('bA', '+15555550123', 'record_test', { test: 'drum_spins', reading: 'yes' });
out.noBreakerCaller = await tool('bA', '+15555550123', 'record_test', { test: 'any_warmth', reading: 'none' });
await tool('jA', '+15555550126', 'start_job', { callerName: 'Ann', appliance: 'dryer', model: 'WED4815EW', symptom: 'no heat', consentCallback: true });
out.emptyStartJob = await tool('eA', '+15555550127', 'start_job', {});
out.fullStartJobAfterEmpty = await tool('eA', '+15555550127', 'start_job', { appliance: 'dryer', model: 'WED4815EW', symptom: 'no heat', consentCallback: true });
out.emptyStartJobState = jobs.byCaller('+15555550127')?.state ?? 'none';
const jobId = jobs.byCaller('+15555550126')?.id ?? '';
const supplier = { type: 'outboundPhoneCall', name: `${jobId}|valley|supplier` };
out.endBeforeQuote = await tool('sA', '+15555557613', 'end_call', {}, supplier);
out.endBeforeQuoteAgain = await tool('sA', '+15555557613', 'end_call', {}, supplier);
out.endAfterQuoteCall = await tool('sB', '+15555557614', 'record_quote', { price: 9.1, shipping: 3.95, inStock: true, eta: 'Tuesday', partNumberSaid: 'WP3392519' }, { type: 'outboundPhoneCall', name: `${jobId}|partsdirect|supplier` });
out.endAfterQuote = await tool('sB', '+15555557614', 'end_call', {}, { type: 'outboundPhoneCall', name: `${jobId}|partsdirect|supplier` });
console.log(JSON.stringify(out));
server.close();
process.exit(0);
