// WhatsApp notifications via Twilio (sandbox tonight: recipients must have sent the sandbox "join" code).
// Plain SMS from our number is carrier-blocked until 10DLC registration (Twilio error 30034), so WhatsApp carries text.
import type { Express } from 'express';
import { config } from '../config.ts';
import { emit, maskPhone, onEvent } from '../events.ts';
import { jobs } from '../jobs.ts';

const FROM = process.env.WHATSAPP_FROM ?? 'whatsapp:+14155238886';
const sid = () => process.env.TWILIO_ACCOUNT_SID ?? '';
const token = () => process.env.TWILIO_AUTH_TOKEN ?? '';

export function whatsappEnabled(): boolean {
  return !config.dryRun && Boolean(sid() && token()) && process.env.WHATSAPP_DISABLED !== '1';
}

/** Send one WhatsApp message. Never throws; returns the Twilio message sid or null. */
export async function sendWhatsApp(to: string, body: string, jobId: string | null = null): Promise<string | null> {
  if (!whatsappEnabled() || !to) return null;
  const auth = 'Basic ' + Buffer.from(`${sid()}:${token()}`).toString('base64');
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid()}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: FROM, To: `whatsapp:${to}`, Body: body }),
    });
    const j = (await res.json()) as { sid?: string; code?: number; message?: string };
    if (!res.ok || !j.sid) {
      emit(jobId, 'note', { kind: 'whatsapp_failed', to: maskPhone(to), code: j.code ?? res.status, detail: (j.message ?? '').slice(0, 120) });
      return null;
    }
    emit(jobId, 'note', { kind: 'whatsapp_sent', to: maskPhone(to), text: body });
    return j.sid;
  } catch (err) {
    emit(jobId, 'note', { kind: 'whatsapp_failed', to: maskPhone(to), detail: (err as Error).message });
    return null;
  }
}

const usd = (n: unknown) => (typeof n === 'number' ? `$${n.toFixed(2)}` : '');

export function register(_app: Express): void {
  onEvent((ev) => {
    if (ev.simulated || !ev.jobId) return;
    const job = jobs.get(ev.jobId);
    if (!job || job.kind !== 'consumer') return;
    const name = job.customer.name?.split(' ')[0] ?? 'there';
    const appliance = job.appliance ?? 'appliance';
    if (ev.type === 'order_confirmed') {
      const total = usd(ev.data.price ?? ev.data.landedTotal ?? job.bestDeal?.landedTotal);
      const eta = job.bestDeal?.eta ? `, arriving ${job.bestDeal.eta}` : '';
      const saved = job.part?.techVisitCost && job.bestDeal ? ` (about ${usd(job.part.techVisitCost - job.bestDeal.landedTotal)} less than a repair visit)` : '';
      void sendWhatsApp(
        job.customer.phone,
        `☀️ Hi ${name}, it's Fixie. I ordered the part for your ${appliance}: ${total}${eta}${saved}. I'll call you when it arrives to walk you through the install. Questions? Just call (619) 771-1086.`,
        job.id,
      );
    }
    if (ev.type === 'fix_verified' && ev.data.ok) {
      void sendWhatsApp(job.customer.phone, `🎉 Your ${appliance} is fixed! Remember to keep the vent clear. Fixie is here anytime: (619) 771-1086.`, job.id);
    }
  });
  console.log(`[notify] WhatsApp ${whatsappEnabled() ? `enabled (from ${FROM})` : 'disabled (dry run or no Twilio creds)'}`);
}
