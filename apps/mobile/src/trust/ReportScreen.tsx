import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { api, ApiError } from '../api/client';
import * as E from '../chat/engine';
import { tx } from '../i18n/app';
import { color, space, type } from '../theme/tokens';
import { Banner, Button, Check, Chip, Chips, ErrorText, Field } from '../ui';

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void };
type Params = { profileId: string; cid?: string; messageIds?: string[]; context?: string };

const REASONS = ['spam_bot', 'scam', 'underage', 'harassment', 'non_consensual', 'hate', 'impersonation', 'other'];

const label = (m: E.Msg) => {
  const p = m.p as { t: string; text?: string };
  return p.text ?? (p.t === 'media' ? '📷' : p.t);
};

// S-50 Report (F-15 R-15.9): reason, optional note, optional franked messages, block offered.
export function ReportScreen({ navigation, route }: { navigation: Nav; route: { params: Params } }) {
  const { profileId, cid, messageIds, context } = route.params;
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [theirs, setTheirs] = useState<E.Msg[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set(messageIds ?? []));
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!cid) return;
    E.messages(cid).then((l) => setTheirs(l.filter((m) => m.from === 'them' && m.raw && m.fk && (!m.by || m.by === profileId)).slice(-20).reverse()));
  }, [cid, profileId]);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setErr(null);
    try {
      const messages = theirs.filter((m) => picked.has(m.id)).map((m) => ({ plain: m.raw, fk: m.fk }));
      await api('POST', '/reports', { profile_id: profileId, reason, note: note.trim() || undefined, context: context ?? (cid ? 'chat' : 'profile'), messages });
      if (block) await api('POST', `/profiles/${profileId}/block`).catch(() => {});
      if (block && cid) await E.setConv(cid, { archived: true });
      setDone(true);
    } catch (e) {
      setErr(e instanceof ApiError ? (Object.values(e.fields ?? {})[0]?.[0] ?? e.message) : tx.common.error);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase, padding: space.l, gap: space.l }}>
        <Banner tone="trust" text={tx.report.sent} />
        <Button testID="report-done" title={tx.common.done} onPress={() => navigation.goBack()} />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 120 }}>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.report.title}</Text>
      <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.report.why}</Text>
      <Chips>
        {REASONS.map((r) => (
          <Chip key={r} label={tx.report.reasons[r]} on={reason === r} fill={color.danger} onPress={() => setReason(r)} />
        ))}
      </Chips>
      <Field testID="report-note" label={tx.report.note} value={note} onChangeText={setNote} maxLength={500} multiline />
      {theirs.length ? (
        <View style={{ gap: space.s }}>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.report.attach}</Text>
          <Text style={{ ...type.meta, color: color.trust }}>🔏 {tx.report.attachHint}</Text>
          {theirs.map((m) => (
            <Check
              key={m.id}
              label={label(m)}
              on={picked.has(m.id)}
              onPress={() =>
                setPicked((s) => {
                  const n = new Set(s);
                  if (n.has(m.id)) n.delete(m.id);
                  else n.add(m.id);
                  return n;
                })
              }
            />
          ))}
        </View>
      ) : null}
      <Check label={tx.report.block} on={block} onPress={() => setBlock(!block)} />
      <ErrorText text={err} />
      <Button testID="report-send" kind="danger" title={tx.report.send} busy={busy} disabled={!reason} onPress={send} />
    </ScrollView>
  );
}
