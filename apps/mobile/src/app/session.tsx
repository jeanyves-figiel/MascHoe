import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, Me } from '../api/client';
import type { Mode } from '../api/types';

type Session = {
  me: Me;
  setMe: (m: Me) => void;
  refresh: () => Promise<Me>;
  mode: Mode;
  setMode: (m: Mode) => void;
  signOut: () => void;
};

const Ctx = createContext<Session | null>(null);
const MODE_KEY = 'thirstr.mode';

export function SessionProvider({ me: initial, onSignedOut, children }: { me: Me; onSignedOut: () => void; children: React.ReactNode }) {
  const [me, setMe] = useState<Me>(initial);
  const [mode, setModeState] = useState<Mode>('hookup');

  // R-04.1: mode persists across launches.
  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then((m) => {
      if (m === 'hookup' || m === 'friends' || m === 'sport') setModeState(m);
    });
  }, []);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    AsyncStorage.setItem(MODE_KEY, m);
  }, []);

  const refresh = useCallback(async () => {
    const m = await api<Me>('GET', '/me');
    setMe(m);
    return m;
  }, []);

  const value = useMemo(() => ({ me, setMe, refresh, mode, setMode, signOut: onSignedOut }), [me, refresh, mode, setMode, onSignedOut]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
