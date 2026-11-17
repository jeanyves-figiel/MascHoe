import { Platform } from 'react-native';
import { api, platform, saveSession, Session } from '../api/client';

// WebAuthn on web (DEV). Native passkeys (ASAuthorization / Credential Manager) land with the
// native build; see I-03. Server contract is identical.

const b64u = {
  enc(buf: ArrayBuffer): string {
    const s = String.fromCharCode(...new Uint8Array(buf));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(s: string): Uint8Array<ArrayBuffer> {
    const pad = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
    return Uint8Array.from(atob(pad), (c) => c.charCodeAt(0));
  },
};

export function passkeysAvailable(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

type Opts = { challenge_id: string; publicKey: Record<string, any> };

export async function registerPasskey(ageConfirmed: boolean) {
  const opts = await api<Opts>('POST', '/auth/passkey/register/options', {});
  const pk = opts.publicKey;
  const cred = (await navigator.credentials.create({
    publicKey: {
      ...pk,
      challenge: b64u.dec(pk.challenge),
      user: { ...pk.user, id: b64u.dec(pk.user.id) },
    } as unknown as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('cancelled');
  const r = cred.response as AuthenticatorAttestationResponse;
  const s = await api<Session>('POST', '/auth/passkey/register', {
    challenge_id: opts.challenge_id,
    attestation_object: b64u.enc(r.attestationObject),
    client_data_json: b64u.enc(r.clientDataJSON),
    age_confirmed: ageConfirmed,
    platform,
  });
  return saveSession(s);
}

export async function loginPasskey() {
  const opts = await api<Opts>('POST', '/auth/passkey/login/options', {});
  const pk = opts.publicKey;
  const cred = (await navigator.credentials.get({
    publicKey: { ...pk, challenge: b64u.dec(pk.challenge) } as unknown as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('cancelled');
  const r = cred.response as AuthenticatorAssertionResponse;
  const s = await api<Session>('POST', '/auth/passkey/login', {
    challenge_id: opts.challenge_id,
    credential_id: b64u.enc(cred.rawId),
    authenticator_data: b64u.enc(r.authenticatorData),
    signature: b64u.enc(r.signature),
    client_data_json: b64u.enc(r.clientDataJSON),
    platform,
  });
  return saveSession(s);
}

export { b64u };
