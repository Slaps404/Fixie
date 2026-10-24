// Single choke point for vision events. Tests swap the sink so they never write to data/events.jsonl.
import { emit } from '../events.ts';
import type { FixieEventType } from '../types.ts';

/** Not in FixieEventType yet (see docs/issues/15-visual-inspection.md), so cast locally. */
export type VisionEventType = 'vision_session' | 'vision_capture' | 'vision_rank' | 'vision_extract' | 'vision_done' | 'note' | 'error';
type Sink = (jobId: string | null, type: VisionEventType, data: Record<string, unknown>, simulated: boolean) => void;

const defaultSink: Sink = (jobId, type, data, simulated) => {
  emit(jobId, type as unknown as FixieEventType, data, simulated ? { simulated: true } : {});
};
let sink: Sink = defaultSink;

export function vemit(jobId: string | null, type: VisionEventType, data: Record<string, unknown>, simulated = false): void {
  sink(jobId, type, data, simulated);
}
export function setVisionSink(s: Sink | null): void {
  sink = s ?? defaultSink;
}
