import type { CallCtx, CallRegistry } from './contracts.ts';

const map = new Map<string, CallCtx>();

export const calls: CallRegistry = {
  register(ctx) {
    map.set(ctx.callId, ctx);
  },
  get(callId) {
    return map.get(callId);
  },
  update(callId, patch) {
    const ctx = map.get(callId);
    if (!ctx) return undefined;
    Object.assign(ctx, patch, { callId });
    return ctx;
  },
  forJob(jobId) {
    return [...map.values()].filter((c) => c.jobId === jobId);
  },
  live() {
    return [...map.values()].filter((c) => c.state !== 'ended');
  },
  reset() {
    map.clear();
  },
};
