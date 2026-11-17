// F-08 chat media: AES-256-GCM on device, ciphertext blob via /media, key inside the MLS message (R-08.2).
import { gcm } from '@noble/ciphers/aes.js';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, Text, View } from 'react-native';
import { api } from '../api/client';
import { useSession } from '../app/session';
import { tx } from '../i18n/app';
import { color, radius, space, type } from '../theme/tokens';
import { fromB64, rand, toB64 } from './bytes';
import * as E from './engine';

export type SendOpts = { once: boolean; expiry: '1h' | '24h' | '7d' | 'keep'; save: boolean };
const EXPIRY_S = { '1h': 3600, '24h': 86400, '7d': 7 * 86400, keep: null } as const;

export async function readBytes(uri: string): Promise<Uint8Array> {
  if (Platform.OS === 'web') return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  const { File } = await import('expo-file-system');
  return new File(uri).bytes();
}

/** Encrypts and uploads bytes; returns the blob reference (key never leaves the device unencrypted). */
export async function uploadEncrypted(bytes: Uint8Array, opts: { album?: boolean; ttl_s?: number } = {}) {
  const key = rand(32);
  const iv = rand(12);
  const ct = gcm(key, iv).encrypt(bytes);
  const r = await api<{ blob_id: string; put_url: string }>('POST', '/media/upload', { size: ct.length, ...opts });
  const put = await fetch(r.put_url, { method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: ct as unknown as BodyInit });
  if (!put.ok) throw new Error('upload failed');
  return { blob: r.blob_id, key: toB64(key), iv: toB64(iv) };
}

const cache = new Map<string, string>();

/** Downloads and decrypts a blob into a data URI (memory only). */
export async function decryptToUri(ref: { blob: string; key: string; iv: string; mime: string }): Promise<string> {
  const hit = cache.get(ref.blob);
  if (hit) return hit;
  const { url } = await api<{ url: string }>('GET', `/media/${ref.blob}`);
  const ct = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const plain = gcm(fromB64(ref.key), fromB64(ref.iv)).decrypt(ct);
  const uri = `data:${ref.mime};base64,${toB64(plain)}`;
  cache.set(ref.blob, uri);
  return uri;
}

/** Picks a photo, re-encodes it (drops EXIF/GPS, R-08.1), encrypts, uploads and sends it. */
export async function pickAndSendMedia(conv: E.Conv, opts: SendOpts = { once: false, expiry: 'keep', save: false }) {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, exif: false, allowsEditing: false });
  if (r.canceled || !r.assets[0]) return;
  const a = r.assets[0];
  const bytes = await readBytes(a.uri);
  if (bytes.length > 20 * 1024 * 1024) throw new Error('too large');
  const exp = EXPIRY_S[opts.expiry];
  const ref = await uploadEncrypted(bytes, { ttl_s: exp ?? undefined });
  await E.send(conv.id, {
    t: 'media',
    media: { ...ref, mime: a.mimeType ?? 'image/jpeg', w: a.width, h: a.height, once: opts.once || undefined, exp: exp ? Date.now() + exp * 1000 : undefined, save: opts.save || undefined },
  });
}

// R-07.10 / R-08.7: media from someone you haven't replied to follows Settings › explicit_from_strangers.
// Until the on-device classifier ships, all such media is treated as possibly explicit.
function strangerPolicy(conv: E.Conv, setting: string | undefined): 'show' | 'blur' | 'block' {
  if (conv.iWrote) return 'show';
  return setting === 'allow' ? 'show' : setting === 'block' ? 'block' : 'blur';
}

export function MediaBubble({ m, media, mine, cid, conv }: { m: E.Msg; media: E.MediaRef; mine: boolean; cid: string; conv: E.Conv }) {
  const { me } = useSession();
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [full, setFull] = useState(false);
  const fg = mine ? color.onAccent : color.fgPrimary;
  const [now] = useState(() => Date.now());
  const expired = !!media.exp && media.exp < now;
  const policy = mine ? 'show' : strangerPolicy(conv, me.settings?.explicit_from_strangers);
  const once = !!media.once && !mine;
  const gone = expired || (once && m.opened);
  const autoload = !gone && !once && policy !== 'block';

  useEffect(() => {
    if (!autoload) return;
    decryptToUri(media).then(setUri, () => setFailed(true));
  }, [autoload, media]);

  if (policy === 'block') return <Text style={{ ...type.meta, color: fg }}>{tx.chat.mediaBlocked}</Text>;
  if (gone) return <Text style={{ ...type.meta, color: fg }}>📷 {expired ? tx.chat.mediaExpired : tx.chat.viewedOnce}</Text>;
  if (failed) return <Text style={{ ...type.meta, color: fg }}>📷 {tx.common.error}</Text>;

  const w = 220;
  const h = media.w && media.h ? Math.min(320, Math.round((w * media.h) / media.w)) : 220;

  if (once) {
    return (
      <>
        <Pressable
          accessibilityRole="button"
          onPress={() => decryptToUri(media).then((u) => { setUri(u); setFull(true); }, () => setFailed(true))}
          style={{ paddingVertical: space.xs }}
        >
          <Text style={{ ...type.headline, color: fg }}>👁 {tx.chat.viewOnce}</Text>
        </Pressable>
        <Viewer
          uri={full ? uri : null}
          onClose={() => {
            setFull(false);
            setUri(null);
            E.markOpened(cid, m.id);
          }}
        />
      </>
    );
  }

  const blurred = policy === 'blur' && !reveal;
  return (
    <>
      <Pressable accessibilityRole="imagebutton" onPress={() => (blurred ? setReveal(true) : setFull(true))} style={{ width: w, height: h, borderRadius: radius.sm, overflow: 'hidden', backgroundColor: color.bgOverlay }}>
        {uri ? <Image source={{ uri }} style={{ width: w, height: h }} blurRadius={blurred ? 40 : 0} resizeMode="cover" accessibilityLabel={tx.chat.photo} /> : null}
        {blurred ? (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ ...type.headline, color: color.fgPrimary }}>{tx.chat.tapToView}</Text>
          </View>
        ) : null}
      </Pressable>
      <Viewer uri={full ? uri : null} onClose={() => setFull(false)} />
    </>
  );
}

/** S-43 media viewer. */
function Viewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel={tx.common.close} style={{ flex: 1, backgroundColor: color.bgBase, alignItems: 'center', justifyContent: 'center' }}>
        {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
      </Pressable>
    </Modal>
  );
}
