import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { ApiError } from '../api/client';
import { useSession } from '../app/session';
import * as E from '../chat/engine';
import { tx } from '../i18n/app';
import { color, space, type } from '../theme/tokens';
import { Banner, Button, Chip, Chips, ErrorText, Field, Loading, Toggle } from '../ui';
import { biometrics, checkPin, getLock, type LockCfg, waitMs } from './lock';
import { PinPad } from './parts';
import * as S from './safety';
import { Sos } from './SafetyScreen';

type Nav = { navigate: (s: string, p?: object) => void; goBack: () => void; replace?: (s: string, p?: object) => void };
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// S-51 Check-in start: from chat ⋯ (includes that chat) or Me › Safety.
export function CheckinStartScreen({ navigation, route }: { navigation: Nav; route: { params?: { cid?: string } } }) {
  const { me } = useSession();
  const cid = route.params?.cid;
  const conv = cid ? E.getConv(cid) : undefined;
  const [minutes, setMinutes] = useState(60);
  const [custom, setCustom] = useState('');
  const [include, setInclude] = useState(!!conv);
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    S.contacts().then((l) => setReady(l.some((c) => c.accepted)));
  }, []);

  const start = async () => {
    const m = custom ? parseInt(custom, 10) : minutes;
    if (!(m >= 15 && m <= 720)) return setErr(tx.safety.custom + ': 15–720');
    setBusy(true);
    setErr(null);
    try {
      const name = await S.myName(me.profile?.display_name ?? 'Me');
      let who: S.Who | undefined;
      let msgs: S.ChatLine[] | undefined;
      if (conv && include) {
        who = { name: conv.name, age: conv.age };
        msgs = (await E.messages(conv.id))
          .filter((x) => (x.p as { t: string }).t === 'text')
          .slice(-20)
          .map((x) => ({ me: x.from === 'me', text: String((x.p as { text?: string }).text ?? '').slice(0, 500), at: new Date(x.at).toISOString() }));
      }
      await S.startCheckin({ minutes: m, name, who, msgs, live });
      navigation.goBack();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : e instanceof Error && e.message === 'no_contacts' ? tx.safety.needContacts : tx.common.error);
    } finally {
      setBusy(false);
    }
  };

  if (ready === null) return <Loading />;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 120 }}>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.safety.checkin}</Text>
      <Text style={{ ...type.body, color: color.fgSecondary }}>{tx.safety.startHint}</Text>
      {!ready ? (
        <>
          <Banner tone="warn" text={tx.safety.needContacts} />
          <Button kind="trust" title={tx.safety.add} onPress={() => navigation.navigate('Safety')} />
        </>
      ) : (
        <>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.safety.dueIn}</Text>
          <Chips>
            {[60, 120, 180].map((m) => (
              <Chip key={m} label={tx.safety.presets[m]} on={!custom && minutes === m} fill={color.trust} onPress={() => (setCustom(''), setMinutes(m))} />
            ))}
          </Chips>
          <Field testID="checkin-custom" label={tx.safety.custom} value={custom} onChangeText={(v) => setCustom(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />
          {conv ? <Toggle label={tx.safety.include} value={include} onChange={setInclude} tone={color.trust} /> : null}
          <Toggle label={tx.safety.live} value={live} onChange={setLive} tone={color.trust} />
          <Text style={{ ...type.meta, color: color.fgMuted }}>{tx.safety.killedNote}</Text>
          <ErrorText text={err} />
          <Button testID="checkin-go" kind="trust" title={tx.safety.go} busy={busy} onPress={start} />
        </>
      )}
    </ScrollView>
  );
}

// S-52 Check-in due: I'm OK (PIN / biometrics), +30 min, SOS. Duress PIN looks identical (AC-13.3).
export function CheckinDueScreen({ navigation }: { navigation: Nav }) {
  const { me } = useSession();
  const [act, setAct] = useState<S.Active | null | undefined>(undefined);
  const [cfg, setCfg] = useState<LockCfg | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    S.syncActive().then(setAct);
    getLock().then(setCfg);
  }, []);

  const ok = async () => {
    setBusy(true);
    await S.okCheckin().catch(() => {});
    setBusy(false);
    setDone(true);
  };

  const pin = async (p: string) => {
    if (!cfg) return;
    const r = await checkPin(cfg, p);
    if (r === 'ok') return ok();
    if (r === 'duress') {
      // Same screen as OK; the alert leaves silently (R-13.9).
      setDone(true);
      S.panic(me.profile?.display_name ?? 'Me').catch(() => {});
      return;
    }
    setErr(r === 'wait' ? tx.safety.lock.wait(Math.ceil((await waitMs()) / 1000)) : tx.safety.lock.wrong);
  };

  const more = async () => {
    setErr(null);
    try {
      setAct(await S.extendCheckin());
    } catch (e) {
      setErr(e instanceof ApiError && e.code === 'max_extensions' ? tx.safety.maxExt : tx.common.error);
    }
  };

  if (done)
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase, padding: space.l, gap: space.l, justifyContent: 'center' }}>
        <Banner tone="trust" text={tx.safety.okDone} />
        <Button testID="checkin-done" title={tx.common.done} onPress={() => navigation.goBack()} />
      </View>
    );
  if (act === undefined) return <Loading />;
  if (act === null)
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase, padding: space.l, gap: space.l }}>
        <Text style={{ ...type.body, color: color.fgSecondary }}>{tx.safety.contactsHint}</Text>
        <Button title={tx.common.back} onPress={() => navigation.goBack()} />
      </View>
    );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, gap: space.l, paddingBottom: 120 }}>
      <Text style={{ ...type.display, color: color.fgPrimary }}>{tx.safety.allGood}</Text>
      <Text style={{ ...type.body, color: color.fgSecondary }}>{tx.safety.allGoodBody}</Text>
      <Text style={{ ...type.meta, color: color.trust }}>{tx.safety.active(time(act.due))}</Text>
      {cfg ? (
        <PinPad
          title={tx.safety.imOk}
          error={err}
          onDone={pin}
          extra={cfg.bio ? <Button small kind="ghost" title={tx.safety.lock.useBio} onPress={() => biometrics(tx.safety.imOk).then((y) => (y ? ok() : undefined))} /> : null}
        />
      ) : (
        <>
          <Button testID="checkin-ok" kind="trust" title={tx.safety.imOk} busy={busy} onPress={ok} />
          <ErrorText text={err} />
        </>
      )}
      {act.ext < 3 ? <Button testID="checkin-more" kind="secondary" title={tx.safety.more} onPress={more} /> : null}
      <Sos name={act.name} onSent={() => navigation.goBack()} />
    </ScrollView>
  );
}
