import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_500Medium,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ActivityIndicator, Platform, View } from 'react-native';
import { api, clearSession, hasSession, Me } from './src/api/client';
import { verifyEmailToken } from './src/auth/oidc';
import { screenFor, Screen as S } from './src/onboarding/flow';
import { BasicsScreen, UnderageScreen } from './src/screens/Basics';
import { CheckInboxScreen, CreateAccountScreen } from './src/screens/CreateAccount';
import { Main } from './src/app/Main';
import { SessionProvider } from './src/app/session';
import { LocationScreen } from './src/screens/Location';
import { PhotoScreen } from './src/screens/Photo';
import { VerifyScreen } from './src/screens/Verify';
import { LinkDeviceScreen } from './src/screens/LinkDevice';
import { WelcomeScreen } from './src/screens/Welcome';
import { DoneScreen } from './src/screens/Done';
import { color } from './src/theme/tokens';

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [screen, setScreen] = useState<S | 'loading'>('loading');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');
  const [sent, setSent] = useState<{ email: string; adult: boolean }>({ email: '', adult: true });
  const [fontsReady] = useFonts({ BricolageGrotesque_400Regular, BricolageGrotesque_500Medium, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });

  const land = (m: Me) => {
    setMe(m);
    setScreen(screenFor(m));
  };

  // Resume at the last incomplete step (F-02 edge case) or consume an email magic link.
  useEffect(() => {
    (async () => {
      try {
        const token = Platform.OS === 'web' ? new URLSearchParams(window.location.search).get('token') : null;
        if (token) {
          window.history.replaceState({}, '', '/');
          return land(await verifyEmailToken(token));
        }
        if (await hasSession()) return land(await api<Me>('GET', '/me'));
      } catch {
        await clearSession();
      }
      setScreen('welcome');
    })();
  }, []);

  const signedOut = () => {
    setMe(null);
    setScreen('welcome');
  };

  let body: React.ReactNode;
  switch (screen) {
    case 'loading':
      body = <ActivityIndicator style={{ flex: 1 }} color={color.hookup} />;
      break;
    case 'welcome':
      body = <WelcomeScreen onStart={() => { setMode('signup'); setScreen('create'); }} onLogin={() => { setMode('login'); setScreen('create'); }} onLink={() => setScreen('link')} />;
      break;
    case 'link':
      body = <LinkDeviceScreen onDone={land} onBack={() => setScreen('welcome')} />;
      break;
    case 'create':
      body = <CreateAccountScreen mode={mode} onBack={() => setScreen('welcome')} onDone={land} onEmailSent={(email, adult) => { setSent({ email, adult }); setScreen('inbox'); }} onUnderage={() => setScreen('underage')} />;
      break;
    case 'inbox':
      body = <CheckInboxScreen email={sent.email} adult={sent.adult} onBack={() => setScreen('create')} />;
      break;
    case 'basics':
      body = <BasicsScreen me={me!} onDone={land} onUnderage={async () => { await clearSession(); setScreen('underage'); }} />;
      break;
    case 'underage':
      body = <UnderageScreen />;
      break;
    case 'location':
      body = <LocationScreen me={me!} onDone={land} />;
      break;
    case 'photo':
      body = <PhotoScreen me={me!} onDone={land} />;
      break;
    case 'verify':
      // S-07 once, right after the last onboarding step (R-02.1g).
      body = <VerifyScreen onDone={(m) => { setMe(m); setScreen('done'); }} />;
      break;
    case 'done':
      body = <DoneScreen me={me!} onContinue={() => setScreen(screenFor(me))} />;
      break;
    default:
      body = (
        <SessionProvider me={me!} onSignedOut={signedOut}>
          <Main />
        </SessionProvider>
      );
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: color.bgBase }}>
        <StatusBar style="light" />
        {fontsReady ? body : null}
      </View>
    </SafeAreaProvider>
  );
}
