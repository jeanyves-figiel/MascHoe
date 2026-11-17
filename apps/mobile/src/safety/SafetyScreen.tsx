import { getLocales } from 'expo-localization';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import { Linking, ScrollView, Share, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import { useSession } from '../app/session';
import { tx } from '../i18n/app';
import { color, space, type } from '../theme/tokens';
import { Banner, Button, ErrorText, Field, ListRow, Section, Sheet } from '../ui';
import { HoldButton } from './parts';
import * as S from './safety';

type Nav = { navigate: (s: string, p?: object) => void };

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error && e.message === 'no_contacts' ? tx.safety.needContacts : tx.common.error);

/** SOS hold + "call emergency number?" sheet (R-13.8). Shared by the hub and the due screen. */
export function Sos({ name, onSent }: { name: string; onSent?: () => void }) {
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = S.emergencyNumber(getLocales()[0]?.regionCode);
  return (
    <View style={{ gap: space.s }}>
      <HoldButton
        testID="sos"
        label={`${tx.safety.sos} · ${tx.safety.sosHold}`}
        ms={2000}
        onDone={() => {
          setErr(null);
          S.panic(name).then(
            () => {
              setAsk(true);
              onSent?.();
            },
            (e) => setErr(errText(e)),
          );
        }}
      />
      <ErrorText text={err} />
      <Sheet visible={ask} onClose={() => setAsk(false)} title={tx.safety.sosSent} closeLabel={tx.common.close}>
        <Button testID="sos-call" kind="danger" title={tx.safety.call(n)} onPress={() => Linking.openURL(`tel:${n}`).finally(() => setAsk(false))} />
        <Button kind="ghost" title={tx.safety.callNo} onPress={() => setAsk(false)} />
      </Sheet>
    </View>
  );
}

// Me › Safety: trusted contacts (S-53), check-in entry (S-51), SOS, app lock.
export function SafetyScreen({ navigation }: { navigation: Nav }) {
  const { me } = useSession();
  const fallback = me.profile?.display_name ?? 'Me';
  const [list, setList] = useState<S.Contact[]>([]);
  const [act, setAct] = useState<S.Active | null>(null);
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    S.contacts().then(setList);
    S.syncActive().then(setAct);
    S.myName(fallback).then(setName);
  }, [fallback]);
  useFocusEffect(load);

  const share = (c: S.Contact) => Share.share({ message: tx.safety.share(S.link(c)) }).catch(() => {});

  const add = async () => {
    setBusy(true);
    setErr(null);
    try {
      const c = await S.invite(label, name || fallback);
      setAdding(false);
      setLabel('');
      load();
      share(c);
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'contacts_full' ? tx.safety.full : errText(e));
    } finally {
      setBusy(false);
    }
  };

  const ok = list.some((c) => c.accepted);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 120 }}>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.safety.title}</Text>
      {act ? <Banner tone="trust" text={tx.safety.active(time(act.due))} onPress={() => navigation.navigate('CheckinDue')} /> : null}

      <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.safety.checkin}</Text>
      {!ok ? <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.safety.needContacts}</Text> : null}
      {act ? null : <Button testID="checkin-start" kind="trust" title={tx.safety.start} disabled={!ok} onPress={() => navigation.navigate('CheckinStart', {})} />}
      <Sos name={name || fallback} onSent={load} />

      <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.safety.contacts}</Text>
      <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.safety.contactsHint}</Text>
      {list.length ? (
        <Section>
        {list.map((c) => (
          <View key={c.id} testID={`contact-${c.accepted ? 'accepted' : 'pending'}`} style={{ gap: space.xs }}>
            <ListRow title={c.label} sub={c.accepted ? (c.push ? tx.safety.accepted : tx.safety.acceptedNoPush) : tx.safety.pending} />
            <View style={{ flexDirection: 'row', gap: space.s }}>
              {!c.accepted ? <Button small kind="secondary" title={tx.safety.resend} onPress={() => share(c)} /> : null}
              <Button small kind="ghost" title={tx.safety.remove} onPress={() => S.removeContact(c.id).then(load)} />
            </View>
          </View>
        ))}
        </Section>
      ) : null}
      {list.length < 5 ? <Button testID="contact-add" kind="secondary" title={tx.safety.add} onPress={() => setAdding(true)} /> : null}
      <Field testID="safety-name" label={tx.safety.myName} value={name} onChangeText={setName} onEndEditing={() => S.setMyName(name || fallback)} maxLength={40} />

      <Section>
        <ListRow testID="app-lock" title={tx.safety.lock.title} onPress={() => navigation.navigate('AppLock')} />
      </Section>

      <Sheet visible={adding} onClose={() => setAdding(false)} title={tx.safety.add} closeLabel={tx.common.close}>
        <Field testID="contact-label" label={tx.safety.label} value={label} onChangeText={setLabel} maxLength={40} />
        <ErrorText text={err} />
        <Button testID="contact-invite" kind="trust" title={tx.safety.invite} busy={busy} onPress={add} />
      </Sheet>
    </ScrollView>
  );
}
