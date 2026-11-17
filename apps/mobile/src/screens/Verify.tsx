import React, { useState } from 'react';
import { View } from 'react-native';
import { api, Me } from '../api/client';
import { t } from '../i18n/strings';
import { color, space } from '../theme/tokens';
import { Banner, Body, Button, H1, Screen } from '../ui';

// S-06. Liveness + blind-signed credential is F-03 (next slice); "Later" → browse-only (R-02.8).
export function VerifyScreen({ onDone }: { onDone: (me: Me) => void }) {
  const [soon, setSoon] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Screen progress={5}>
      <H1>{t.verify.title}</H1>
      <View style={{ alignSelf: 'center', width: 180, height: 230, borderRadius: 115, borderWidth: 3, borderColor: color.trust, marginVertical: space.l }} />
      <Body muted>{t.verify.body}</Body>
      {t.verify.bullets.map((b) => (
        <Body key={b}>✓ {b}</Body>
      ))}
      {soon ? <Banner text={t.verify.soon} tone="warn" /> : null}
      <View style={{ flex: 1 }} />
      <Button title={t.verify.start} onPress={() => setSoon(true)} />
      <Button
        testID="verify-later"
        title={t.verify.later}
        kind="ghost"
        busy={busy}
        onPress={async () => {
          setBusy(true);
          onDone(await api<Me>('POST', '/me/onboarding/verify_later'));
        }}
      />
    </Screen>
  );
}
