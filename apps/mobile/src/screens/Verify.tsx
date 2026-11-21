import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { analyzeFace, faceAvailable, type FaceReading } from '../../modules/thirstr-face';
import { api, ApiError, Me } from '../api/client';
import { rand } from '../chat/bytes';
import { t } from '../i18n/strings';
import { o } from '../i18n/onboarding';
import { STEP_OF } from '../onboarding/flow';
import { BigButton, StepShell } from '../onboarding/kit';
import { color, font, radius, space, type } from '../theme/tokens';
import { blind, type IssuerKey } from '../trust/blind';
import { passes, type Step } from '../trust/liveness';
import { Banner } from '../ui';

type Challenge = { nonce: string; steps: Step[]; key: IssuerKey };
type Shot = { takePictureAsync: (o: object) => Promise<{ uri: string }> };

// DEV web build only (localhost): no camera module, so the liveness result is simulated.
const devSimulate = Platform.OS === 'web' && typeof location !== 'undefined' && location.hostname === 'localhost';
const supported = (Platform.OS === 'ios' && faceAvailable) || devSimulate;

/** One still → numbers; the frame file is deleted as soon as it is measured (R-03.5). */
async function frame(cam: Shot): Promise<FaceReading> {
  const { File } = await import('expo-file-system');
  const { uri } = await cam.takePictureAsync({ quality: 0.2, skipProcessing: true, shutterSound: false });
  try {
    return await analyzeFace(uri);
  } finally {
    try {
      new File(uri).delete();
    } catch {
      /* already gone */
    }
  }
}

/** #131: sample continuously until `ok` or the time is up (a fixed 3-frame window missed most moves). */
async function until(cam: Shot, ok: (r: FaceReading) => boolean, ms: number): Promise<FaceReading | null> {
  const end = Date.now() + ms;
  do {
    const r = await frame(cam);
    if (ok(r)) return r;
  } while (Date.now() < end);
  return null;
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
      await wait(1000);
      setPrompt(t.verify.steps.look);
      await wait(800);
      // Baseline: a face looking at the camera. None found → ask again, no try is spent (#131).
      const base = await until(cam.current!, (r) => r.faces >= 1 && Math.abs(r.yaw ?? 0) < 0.35, 5000);
      if (!base) {
        setPrompt('');
        setPhase('intro');
        setErr(t.verify.noFace);
        return;
      }
      let ok = true;
      for (const s of ch.steps) {
        setPrompt(t.verify.steps[s]);
        await wait(400);
        if (!(await until(cam.current!, (r) => passes(s, base, r), 6000))) {
          ok = false;
          break;
        }
        setPrompt('✓');
        await wait(500);
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

  const later = async () => {
    const me = await api<Me>('GET', '/me');
    onDone(me.onboarding_step === 'verify' ? await api<Me>('POST', '/me/onboarding/verify_later') : me);
  };

  if (phase === 'camera') {
    // S-06 liveness: front camera behind a face oval, one big prompt (R-02.8).
    return (
      <View style={{ flex: 1, backgroundColor: color.bgBase }}>
        <CameraView ref={(r) => void (cam.current = r as unknown as Shot)} facing="front" style={{ flex: 1 }} />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
          <View style={v.oval} />
        </View>
        <View style={v.promptBox}>
          <Text style={v.prompt} accessibilityLiveRegion="polite">{prompt}</Text>
          <Text style={v.private}>{t.verify.private}</Text>
        </View>
      </View>
    );
  }

  // S-06 intro (R-02.8): sell the payoff, then Verify now / Later.
  return (
    <StepShell
      step={STEP_OF.verify}
      title={o.verify.title}
      sub={o.verify.sub}
      scroll
      cta={{ title: phase === 'failed' ? t.verify.retry : o.verify.now, testID: 'verify-start', fill: color.trust, busy, disabled: phase === 'failed' && !left, onPress: run }}
      below={<BigButton testID="verify-later" kind="text" title={o.verify.later} onPress={later} />}
    >
      <View style={v.badge}>
        <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={color.onAccent} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 12l5 5 9-10" />
        </Svg>
      </View>
      <View style={{ gap: 10 }}>
        {o.verify.perks.map(([strong, rest]) => (
          <View key={strong} style={v.perk}>
            <View style={v.perkDot} />
            <Text style={v.perkText}>
              <Text style={{ fontFamily: font.heavy }}>{strong}</Text>
              {rest}
            </Text>
          </View>
        ))}
      </View>
      {phase === 'failed' ? <Banner text={left ? t.verify.failed(left) : t.verify.cooldown} tone="warn" /> : null}
      {phase === 'unsupported' ? <Banner text={t.verify.iosOnly} tone="warn" /> : null}
      {err ? <Banner text={err} tone="danger" /> : null}
    </StepShell>
  );
}

const v = StyleSheet.create({
  oval: { width: 250, height: 320, borderRadius: 160, borderWidth: 6, borderColor: color.trust },
  promptBox: { position: 'absolute', left: 0, right: 0, bottom: 80, alignItems: 'center', padding: space.l, gap: space.s },
  prompt: { fontFamily: font.heavy, fontSize: 30, lineHeight: 34, letterSpacing: -0.9, color: color.fgPrimary, textAlign: 'center' },
  private: { ...type.meta, color: color.trust },
  badge: { width: 76, height: 76, borderRadius: 38, backgroundColor: color.trust, alignItems: 'center', justifyContent: 'center', marginTop: space.s },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.m, paddingHorizontal: space.l, paddingVertical: 14, borderRadius: radius.md, backgroundColor: color.bgRaised },
  perkDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.trust },
  perkText: { flex: 1, fontFamily: font.regular, fontSize: 15, lineHeight: 20, color: color.fgPrimary },
});
