import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { api, ApiError } from '../api/client';
import type { Mode } from '../api/types';
import { tx } from '../i18n/app';
import { color, space, type } from '../theme/tokens';
import { Button, Chip, Chips, ErrorText, Field, Sheet, useAccent } from '../ui';

const TAGS = ['hosting', 'can_travel', 'drinks_first', 'party', 'other'];

/** Hours from now offered as start / end chips (R-09.6: now → 03:00). */
function slots(): Date[] {
  const out: Date[] = [];
  const d = new Date();
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
  const end = new Date();
  end.setHours(27, 0, 0, 0);
  for (let t = new Date(Date.now()); t <= end && out.length < 16; ) {
    out.push(new Date(t));
    t = out.length === 1 ? new Date(d) : new Date(t.getTime() + 3600e3);
  }
  return out;
}

const hhmm = (d: Date, i: number) => (i === 0 ? tx.now.now : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));

// R-09.9 Post plan: window, text 140, tag, audience.
export function PlanSheet({ visible, onClose, onDone, mode }: { visible: boolean; onClose: () => void; onDone: () => void; mode: Mode }) {
  const accent = useAccent();
  const [text, setText] = useState('');
  const [tag, setTag] = useState('hosting');
  const [aud, setAud] = useState<'verified' | 'chats'>('verified');
  const [ws, setWs] = useState(0);
  const [we, setWe] = useState(3);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const s = slots();

  const post = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('POST', '/tonight', {
        mode,
        text: text.trim(),
        tag,
        audience: aud,
        window_start: s[ws].toISOString(),
        window_end: s[Math.max(we, ws + 1)]?.toISOString() ?? new Date(s[ws].getTime() + 2 * 3600e3).toISOString(),
        tz_offset_min: -new Date().getTimezoneOffset(),
      });
      setText('');
      onDone();
    } catch (e) {
      setErr(e instanceof ApiError ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message) : tx.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={tx.tonight.post} closeLabel={tx.common.close}>
      <Field testID="plan-text" label={tx.tonight.planText} value={text} onChangeText={setText} maxLength={140} multiline />
      <View style={{ gap: space.xs }}>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.tonight.from}</Text>
        <Chips>
          {s.slice(0, 8).map((d, i) => (
            <Chip
              key={i}
              label={hhmm(d, i)}
              on={ws === i}
              fill={accent}
              onPress={() => {
                setWs(i);
                if (we <= i) setWe(i + 2);
              }}
            />
          ))}
        </Chips>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.tonight.to}</Text>
        <Chips>{s.map((d, i) => (i > ws ? <Chip key={i} label={hhmm(d, i)} on={we === i} fill={accent} onPress={() => setWe(i)} /> : null))}</Chips>
      </View>
      <Chips>
        {TAGS.map((t) => (
          <Chip key={t} label={tx.tonight.tags[t]} on={tag === t} fill={accent} onPress={() => setTag(t)} />
        ))}
      </Chips>
      <View style={{ gap: space.xs }}>
        <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.tonight.audience}</Text>
        <Chips>
          {(['verified', 'chats'] as const).map((a) => (
            <Chip key={a} label={tx.tonight.audiences[a]} on={aud === a} fill={color.trust} onPress={() => setAud(a)} />
          ))}
        </Chips>
      </View>
      <ErrorText text={err} />
      <Button testID="plan-post" title={tx.tonight.publish} busy={busy} disabled={!text.trim()} onPress={post} />
    </Sheet>
  );
}
