import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { analyzeFace, faceAvailable, type FaceReading } from '../../modules/thirstr-face';
import { api, ApiError, Me } from '../api/client';
import { rand } from '../chat/bytes';
import { t } from '../i18n/strings';
import { color, space, type } from '../theme/tokens';
import { blind, type IssuerKey } from '../trust/blind';
import { Banner, Body, Button, H1, Screen } from '../ui';

type Step = 'turn_left' | 'turn_right' | 'blink' | 'smile' | 'look_up';
type Challenge = { nonce: string; steps: Step[]; key: IssuerKey };
type Shot = { takePictureAsync: (o: object) => Promise<{ uri: string }> };

// DEV web build only (localhost): no camera module, so the liveness result is simulated.
const devSimulate = Platform.OS === 'web' && typeof location !== 'undefined' && location.hostname === 'localhost';
const supported = (Platform.OS === 'ios' && faceAvailable) || devSimulate;

const eyes = (r: FaceReading) => ((r.leftEye ?? 0) + (r.rightEye ?? 0)) / 2;

/** R-03.1 step check against the neutral baseline (one face in every frame). */
function passes(step: Step, base: FaceReading, r: FaceReading): boolean {
  if (r.faces !== 1) return false;
  switch (step) {
    case 'turn_left':
    case 'turn_right':
      return Math.abs((r.yaw ?? 0) - (base.yaw ?? 0)) >= 0.3;
    case 'look_up':
      return Math.abs((r.pitch ?? 0) - (base.pitch ?? 0)) >= 0.2;
    case 'blink':
      return eyes(base) > 0 && eyes(r) < eyes(base) * 0.6;
    case 'smile':
      return (base.mouth ?? 0) > 0 && (r.mouth ?? 0) >= (base.mouth ?? 0) * 1.12;
  }
}

async function burst(cam: Shot, n = 3): Promise<FaceReading[]> {
  const out: FaceReading[] = [];
  const { File } = await import('expo-file-system');
  for (let i = 0; i < n; i++) {
    const { uri } = await cam.takePictureAsync({ quality: 0.3, skipProcessing: true, shutterSound: false });
    try {
      out.push(await analyzeFace(uri));
    } finally {
      // R-03.5: the frame is deleted as soon as it is measured.
      try {
        new File(uri).delete();
      } catch {
        /* already gone */
      }
    }
  }
  return out;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// S-06 Verify (F-03): server nonce + 3 random steps → on-device liveness → blind-signed credential.
export function VerifyScreen({ onDone }: { onDone: (me: Me) => void }) {
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'intro' | 'camera' | 'failed' | 'unsupported'>('intro');
  const [prompt, setPrompt] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [perm, askPerm] = useCameraPermissions();
  const cam = useRef<Shot | null>(null);

  const finish = async (ch: Challenge, passed: boolean) => {
    const token = rand(32);
    const b = blind(token, ch.key, rand);
    const r = await api<{ signature?: string; passed?: boolean; attempts_left?: number }>('POST', '/verification/attest', { nonce: ch.nonce, passed, blinded: passed ? b.blinded : undefined });
    if (!r.signature) {
      setLeft(r.attempts_left ?? 0);
      setPhase('failed');
      return;
    }
    const { toB64url } = await import('../chat/bytes');
    onDone(await api<Me>('POST', '/verification/redeem', { token: toB64url(token), signature: b.unblind(r.signature) }));
  };

  const run = async () => {
    setErr(null);
    setBusy(true);
    try {
      if (!supported) {
        setPhase('unsupported');
        return;
      }
      const ch = await api<Challenge>('POST', '/verification/challenge');
      if (devSimulate) {
        await finish(ch, true);
        return;
      }
      if (!perm?.granted && !(await askPerm()).granted) {
        setErr(t.verify.camera);
        return;
      }
      setPhase('camera');
      await wait(1200);
      setPrompt(t.verify.steps.look);
      await wait(1500);
      const base = (await burst(cam.current!, 1))[0];
      if (base.faces !== 1) {
        await finish(ch, false);
        return;
      }
      let ok = true;
      for (const s of ch.steps) {
        setPrompt(t.verify.steps[s]);
        await wait(1500);
        const frames = await burst(cam.current!);
        if (!frames.some((f) => passes(s, base, f))) {
          ok = false;
          break;
        }
      }
      setPrompt('');
      await finish(ch, ok);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t.verify.error);
      setPhase('intro');
    } finally {
      setBusy(false);
    }
  };

  if (phase === 'camera') {
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase }}>
        <CameraView ref={(r) => void (cam.current = r as unknown as Shot)} facing="front" style={{ flex: 1 }} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 80, alignItems: 'center', padding: space.l }}>
          <Text style={{ ...type.display, color: color.fgPrimary, textAlign: 'center' }}>{prompt}</Text>
          <Text style={{ ...type.meta, color: color.trust, marginTop: space.s }}>🔒 {t.verify.private}</Text>
        </View>
      </View>
    );
  }

  return (
    <Screen progress={5}>
      <H1>{t.verify.title}</H1>
      <View style={{ alignSelf: 'center', width: 180, height: 230, borderRadius: 115, borderWidth: 3, borderColor: color.trust, marginVertical: space.l }} />
      <Body muted>{t.verify.body}</Body>
      {t.verify.bullets.map((b) => (
        <Body key={b}>✓ {b}</Body>
      ))}
      {phase === 'failed' ? <Banner text={left ? t.verify.failed(left) : t.verify.cooldown} tone="warn" /> : null}
      {phase === 'unsupported' ? <Banner text={t.verify.iosOnly} tone="warn" /> : null}
      {err ? <Banner text={err} tone="danger" /> : null}
      <View style={{ flex: 1 }} />
      <Button testID="verify-start" title={phase === 'failed' ? t.verify.retry : t.verify.start} busy={busy} disabled={phase === 'failed' && !left} onPress={run} />
      <Button
        testID="verify-later"
        title={t.verify.later}
        kind="ghost"
        onPress={async () => {
          const me = await api<Me>('GET', '/me');
          onDone(me.onboarding_step === 'verify' ? await api<Me>('POST', '/me/onboarding/verify_later') : me);
        }}
      />
    </Screen>
  );
}
