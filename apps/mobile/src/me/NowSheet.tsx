import React, { useState } from 'react';
import { View } from 'react-native';
import { api, ApiError } from '../api/client';
import type { NowStatus } from '../api/types';
import { useSession } from '../app/session';
import { tx } from '../i18n/app';
import { color, space } from '../theme/tokens';
import { Banner, Button, Chip, Chips, ErrorText, Field, Label, Sheet } from '../ui';

const STATUSES = ['now', 'hosting', 'can_travel', 'door_open'] as const;
const HOURS = [1, 2, 3, 6];

// F-09 Now status: one at a time, expires (R-09.1–R-09.3).
export function NowSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { me, refresh } = useSession();
  const [status, setStatus] = useState<NowStatus['status']>('now');
  const [hours, setHours] = useState(2);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await refresh();
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : tx.common.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={tx.me.now} closeLabel={tx.common.close}>
      {!me.verified ? <Banner tone="warn" text={tx.common.verifyToDo} /> : null}
      <Chips>
        {STATUSES.map((s) => (
          <Chip key={s} label={tx.now[s]} on={status === s} onPress={() => setStatus(s)} fill={color.hookup} />
        ))}
      </Chips>
      <Label>{tx.me.nowFor}</Label>
      <Chips>
        {HOURS.map((h) => (
          <Chip key={h} label={tx.me.hours(h)} on={hours === h} onPress={() => setHours(h)} fill={color.hookup} />
        ))}
      </Chips>
      <Field label={tx.me.nowText} value={text} onChangeText={setText} maxLength={80} />
      <ErrorText text={err} />
      <View style={{ gap: space.s }}>
        <Button
          testID="now-set"
          title={tx.me.nowSet}
          fill={color.hookup}
          disabled={!me.verified}
          busy={busy}
          onPress={() => run(() => api('PUT', '/me/now', { status, ttl_s: hours * 3600, text: text.trim() || null }))}
        />
        {me.now ? <Button kind="secondary" title={tx.me.nowEnd} busy={busy} onPress={() => run(() => api('DELETE', '/me/now'))} /> : null}
      </View>
    </Sheet>
  );
}
