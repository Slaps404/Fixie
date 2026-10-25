'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildThreads } from './derive';
import { KIND_COLOR } from './NumbersTab';
import type { AdminState, DirectoryEntry, MessageChannel, MessageView, TextTarget } from './types';
import { Badge, Btn, FAULT, GREY, OK, WARM, inputCls, mono, panel, post, small, stamp } from './ui';

const STATUS_COLOR: Record<MessageView['status'], string> = { sent: OK, received: OK, failed: FAULT, dry_run: WARM };
const BODY_MAX = 1000;

type Result = { tone: 'ok' | 'warn' | 'bad'; text: string };
const RESULT_COLOR = { ok: OK, warn: WARM, bad: FAULT };

export function MessagesTab({ state, target, refresh }: { state: AdminState; target: TextTarget | null; refresh: () => Promise<void> }) {
  const { messages, directory, channels } = state;
  const threads = useMemo(() => buildThreads(messages), [messages]);
  const textable = useMemo(() => directory.filter((d) => d.textable), [directory]);
  const [active, setActive] = useState<string | null>(null);
  const [channel, setChannel] = useState<MessageChannel>('whatsapp');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const convo = useRef<HTMLDivElement>(null);

  // A "Text" button elsewhere preselects its recipient here.
  useEffect(() => {
    if (target) setActive(target.key);
  }, [target]);

  const current = active ?? threads[0]?.key ?? null;
  const thread = threads.find((t) => t.key === current) ?? null;
  const recipient = textable.find((d) => d.key === current) ?? null;
  const open = (key: string | null) => { setActive(key); setResult(null); };

  // A conversation opened from a directory entry with no messages still needs a header.
  const entry = directory.find((d) => d.key === current) ?? null;
  const title = thread?.name ?? entry?.name ?? 'Conversation';
  const subtitle = thread?.phone ?? entry?.phone;

  const available = (c: MessageChannel) => channels[c] || channels.dryRun;
  const noChannel = !channels.whatsapp && !channels.sms;
  // Falls back to whichever channel works so a lone SMS setup does not leave WhatsApp selected and disabled.
  const effective: MessageChannel = available(channel) || !available('sms') ? channel : 'sms';
  const canSend = !!recipient && body.trim().length > 0 && body.length <= BODY_MAX && available(effective) && !sending;

  useEffect(() => {
    convo.current?.scrollTo({ top: convo.current.scrollHeight });
  }, [thread?.messages.length, current]);

  const send = async () => {
    if (!recipient) return;
    setSending(true);
    setResult(null);
    try {
      const out = (await post({ action: 'text', to: recipient.key, channel: effective, body })) as { ok?: boolean; message?: MessageView };
      const m = out.message;
      if (m?.status === 'failed') setResult({ tone: 'bad', text: `Not delivered: ${m.reason ?? 'unknown reason'}` });
      else if (m?.status === 'dry_run') setResult({ tone: 'warn', text: 'Dry run: logged, not sent.' });
      else setResult(out.ok === false ? { tone: 'bad', text: `Not delivered${m?.reason ? `: ${m.reason}` : ''}` } : { tone: 'ok', text: `Sent to ${recipient.name}.` });
      if (out.ok !== false) setBody('');
      await refresh();
    } catch (err) {
      setResult({ tone: 'bad', text: `Send failed: ${(err as Error).message}` });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {channels.dryRun && (
        <Banner color={WARM}>Dry run: messages are logged, not sent.</Banner>
      )}
      {noChannel && (
        <Banner color={FAULT}>Neither WhatsApp nor SMS is configured on the server{channels.dryRun ? ', so nothing could be sent outside dry run' : ', so texts cannot be sent'}.</Banner>
      )}
      <div className="grid gap-2.5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
        <div className={`${panel} flex min-w-0 flex-col p-3.5 lg:h-[calc(100vh-250px)] lg:min-h-[420px]`}>
          <div className="mb-2 flex items-center justify-between">
            <span className={small}>Threads</span>
            <span className={small}>{threads.length}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {threads.length === 0 && <p className="m-0 py-3 text-[12.5px] text-faint">No messages yet. Texts Fixie sends, and replies customers send back, are listed here by contact.</p>}
            {threads.map((t) => (
              <button
                key={t.key}
                onClick={() => open(t.key)}
                className={`flex w-full flex-col gap-0.5 border-b border-line px-2 py-2.5 text-left last:border-0 hover:bg-[#18181A] ${t.key === current ? 'bg-[#18181A]' : ''}`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px]">{t.name}</span>
                    <Badge color={t.kind === 'unknown' ? GREY : kindColor(t.kind)}>{t.kind}</Badge>
                  </span>
                  <span className={`${mono} shrink-0 text-[10.5px] text-faint`}>{stamp(t.last.at)}</span>
                </span>
                <span className="truncate text-[12px] text-muted">{t.last.direction === 'out' ? 'You: ' : ''}{t.last.body}</span>
              </button>
            ))}
          </div>
        </div>

        <div className={`${panel} flex min-w-0 flex-col p-3.5 lg:h-[calc(100vh-250px)] lg:min-h-[420px]`}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="text-[15px]">{title}</span>
            {subtitle && <span className={`${mono} ${small}`}>{subtitle}</span>}
          </div>
          <div ref={convo} className="flex min-h-[200px] flex-1 flex-col gap-2 overflow-y-auto rounded-[10px] bg-bg p-3">
            {!thread && (
              <p className="m-auto text-center text-[12.5px] text-faint">
                {current ? `No messages with ${title} yet. Write one below.` : 'Pick a thread, or choose a recipient below to start one.'}
              </p>
            )}
            {thread?.messages.map((m) => <Bubble key={m.id} m={m} />)}
          </div>

          <div className="mt-3 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <RecipientPicker value={recipient?.key ?? ''} options={textable} onChange={(k) => open(k || null)} />
              <select
                value={effective}
                onChange={(e) => setChannel(e.target.value as MessageChannel)}
                aria-label="Channel"
                className={`${inputCls} cursor-pointer`}
              >
                <option value="whatsapp" disabled={!available('whatsapp')}>WhatsApp{channels.whatsapp ? '' : ' (not configured)'}</option>
                <option value="sms" disabled={!available('sms')}>SMS{channels.sms ? '' : ' (not configured)'}</option>
              </select>
            </div>
            {current && !recipient && (
              <span className="text-[12px]" style={{ color: WARM }}>This number is not in the directory, so it cannot be texted from here.</span>
            )}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) send(); }}
              rows={3}
              placeholder={recipient ? `Message ${recipient.name}` : 'Choose a recipient first'}
              disabled={!recipient}
              className="w-full resize-y rounded-[12px] border border-line-strong bg-bg px-3 py-2 text-[13px] outline-none placeholder:text-faint focus:border-accent disabled:opacity-50"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px]" style={{ color: result ? RESULT_COLOR[result.tone] : undefined }} role="status">
                {result?.text ?? <span className="text-faint">{body.length}/{BODY_MAX}</span>}
              </span>
              <Btn tone="light" disabled={!canSend} onClick={send}>{sending ? 'Sending…' : 'Send'}</Btn>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const kindColor = (k: string) => KIND_COLOR[(k === 'unknown' ? 'test_user' : k) as keyof typeof KIND_COLOR] ?? GREY;

function Banner({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[10px] px-3.5 py-2 text-[12.5px]" style={{ color, background: `${color}1A`, border: `1px solid ${color}44` }}>
      {children}
    </div>
  );
}

function RecipientPicker({ value, options, onChange }: { value: string; options: DirectoryEntry[]; onChange: (key: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Recipient" className={`${inputCls} min-w-[220px] max-w-full cursor-pointer`}>
      <option value="">Choose recipient…</option>
      {options.map((d) => (
        <option key={d.key} value={d.key}>{d.name} · {d.kind.replace('_', ' ')} · {d.phone}</option>
      ))}
    </select>
  );
}

function Bubble({ m }: { m: MessageView }) {
  const out = m.direction === 'out';
  return (
    <div className={`flex max-w-[78%] flex-col gap-1 ${out ? 'self-end items-end' : 'self-start items-start'}`}>
      <div className="whitespace-pre-wrap break-words rounded-[14px] px-3 py-2 text-[13px] leading-[1.4]" style={out ? { background: '#8E9BFF26', color: '#EDEDED' } : { background: '#232326', color: '#EDEDED' }}>
        {m.body}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${mono} text-[10.5px] text-faint`}>{stamp(m.at)}</span>
        <Badge color={GREY}>{m.channel}</Badge>
        <Badge color={STATUS_COLOR[m.status]}>{m.status.replace('_', ' ')}</Badge>
        <Badge color={GREY}>{m.source}</Badge>
        {m.reason && <span className="text-[11px]" style={{ color: m.status === 'failed' ? FAULT : WARM }}>{m.reason}</span>}
      </div>
    </div>
  );
}
