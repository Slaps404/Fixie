import { FixieEvent, money } from './types';

export interface Line {
  tone: 'info' | 'good' | 'warn' | 'bad' | 'talk';
  label: string;
  text: string;
}

/** Turn a backend event into one readable timeline line. Returns null for noise. */
export function describe(ev: FixieEvent): Line | null {
  const d = ev.data ?? {};
  switch (ev.type) {
    case 'metrics':
    case 'consent':
      return null;
    case 'transcript':
      return {
        tone: 'talk',
        label: `${d.lane ?? 'call'} / ${d.speaker ?? ''}`,
        text: String(d.text ?? ''),
      };
    case 'job_state':
      return { tone: 'info', label: 'Status', text: `${d.from} to ${d.to}` };
    case 'call_started':
      return { tone: 'info', label: 'Call started', text: `${d.party ?? d.lane} (${d.lane})` };
    case 'call_ended':
      return { tone: 'info', label: 'Call ended', text: `${d.party ?? d.lane ?? ''}: ${d.reason ?? ''}${d.durationSec != null ? `, ${d.durationSec}s` : ''}` };
    case 'diagnosis':
      return { tone: 'info', label: 'Diagnosis', text: `${d.appliance}: ${d.issue}${d.confidence != null ? ` (${Math.round(d.confidence * 100)}% confident)` : ''}` };
    case 'safety':
      return { tone: d.level === 'pro_required' ? 'bad' : 'warn', label: `Safety: ${d.level}`, text: String(d.reason ?? '') };
    case 'part_identified':
      return { tone: 'info', label: 'Part', text: `${d.part}, part number ${d.partNumber}` };
    case 'warranty':
      return { tone: d.covered ? 'good' : 'info', label: 'Warranty', text: String(d.detail ?? '') };
    case 'quote':
      return {
        tone: d.rejected ? 'bad' : 'info',
        label: d.rejected ? 'Quote rejected' : 'Quote',
        text: `${d.supplier}: ${money(Number(d.landedTotal ?? d.price ?? 0))} landed. ${d.reason ?? ''}`,
      };
    case 'best_deal':
      return { tone: 'good', label: 'Best deal', text: `${d.supplier}: ${money(Number(d.landedTotal ?? d.price))} landed${d.saved != null ? `, saves ${money(Number(d.saved))} vs a tech visit` : ''}` };
    case 'guard':
      return { tone: 'warn', label: `Guard: ${d.kind} (${d.action})`, text: String(d.reason ?? d.detail ?? '') };
    case 'order_confirmed':
      return { tone: 'good', label: 'Ordered', text: `${d.supplier}, ${money(Number(d.landedTotal ?? d.price))}, confirmed by ${d.confirmedBy ?? 'voice'}${d.mockOrder ? ' (mock order)' : ''}` };
    case 'delivered':
      return { tone: 'info', label: 'Delivered', text: `${d.carrier ?? ''} ${d.partNumber ?? ''}`.trim() };
    case 'safety_ack':
      return { tone: 'good', label: 'Safety confirmed', text: String(d.kind ?? '') };
    case 'install_step':
      return { tone: 'info', label: `Install step ${d.step}/${d.of}`, text: String(d.text ?? '') };
    case 'fix_verified':
      return { tone: d.ok ? 'good' : 'bad', label: d.ok ? 'Fixed' : 'Not fixed', text: String(d.detail ?? '') };
    case 'fault':
      return { tone: 'warn', label: 'Fault', text: `${d.asset}: ${d.code} at ${d.site}` };
    case 'note':
      return { tone: 'info', label: 'Note', text: String(d.text ?? '') };
    default:
      return { tone: 'info', label: ev.type, text: JSON.stringify(d) };
  }
}
