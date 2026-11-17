import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { api, ApiError, Me, platform, saveSession, Session } from '../api/client';
import { tx } from '../i18n/app';
import { color, space } from '../theme/tokens';
import { Body, Button, ErrorText, Field, H1, Screen } from '../ui';

// R-01.6 new device: scan the QR (or type the code) shown on the old phone, wait for its OK.
export function LinkDeviceScreen({ onDone, onBack }: { onDone: (me: Me) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [scan, setScan] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [perm, askPerm] = useCameraPermissions();
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const go = async (raw: string) => {
    const c = raw.replace(/^thirstr:\/\/link\//, '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (c.length !== 8) return setErr(tx.devices.badCode);
    setErr(null);
    setScan(false);
    setWaiting(true);
    try {
      const r = await api<{ claim: string }>('POST', '/auth/device-link', { code: c, platform });
      for (let i = 0; i < 60 && alive.current; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const s = await api<Session | { state: string }>('POST', '/auth/device-link', { code: c, claim: r.claim });
        if ('access_token' in s) return onDone(await saveSession(s));
      }
      throw new Error('timeout');
    } catch (e) {
      setWaiting(false);
      setErr(e instanceof ApiError && e.status !== 404 ? e.message : tx.devices.badCode);
    }
  };

  if (scan)
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase }}>
        <CameraView style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => go(data)} />
        <View style={{ padding: space.l }}>
          <Button kind="ghost" title={tx.common.back} onPress={() => setScan(false)} />
        </View>
      </View>
    );

  return (
    <Screen>
      <H1>{tx.devices.haveApp}</H1>
      <Body muted>{waiting ? tx.devices.waiting : tx.devices.enterHint}</Body>
      {!waiting ? (
        <>
          {Platform.OS !== 'web' ? (
            <Button
              title={tx.devices.scan}
              kind="secondary"
              onPress={async () => {
                if (perm?.granted || (await askPerm()).granted) setScan(true);
              }}
            />
          ) : null}
          <Field testID="link-code-input" label={tx.devices.enterCode} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={9} />
          <ErrorText text={err} />
          <Button testID="link-send" title={tx.devices.send} disabled={code.replace(/[^0-9A-Za-z]/g, '').length !== 8} onPress={() => go(code)} />
        </>
      ) : null}
      <View style={{ flex: 1 }} />
      <Button kind="ghost" title={tx.common.back} onPress={onBack} />
    </Screen>
  );
}
