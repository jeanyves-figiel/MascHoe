// F-08 R-08.12 camera roll for the media tray (photos only in beta). Thumbnails are read by the
// OS image loader straight from the library; nothing leaves the phone until it is sent.
import * as ML from 'expo-media-library/legacy';
import { Linking, Platform } from 'react-native';

export type Access = 'all' | 'limited' | 'none' | 'undetermined';
export type Shot = { id: string; uri: string; w: number; h: number };

export const available = true;

function access(p: ML.PermissionResponse): Access {
  if (p.status === 'undetermined') return 'undetermined';
  if (!p.granted) return 'none';
  return p.accessPrivileges === 'limited' ? 'limited' : 'all';
}

export async function current(): Promise<Access> {
  return access(await ML.getPermissionsAsync(false, ['photo']));
}

export async function ask(): Promise<Access> {
  return access(await ML.requestPermissionsAsync(false, ['photo']));
}

/** iOS limited access: the system "selected photos" picker; otherwise app settings. */
export async function manage(a: Access) {
  if (a === 'limited' && Platform.OS === 'ios') return ML.presentPermissionsPickerAsync(['photo']);
  return Linking.openSettings();
}

export async function page(after?: string): Promise<{ items: Shot[]; next?: string }> {
  const r = await ML.getAssetsAsync({ first: 60, after, mediaType: ML.MediaType.photo, sortBy: [[ML.SortBy.creationTime, false]] });
  return {
    items: r.assets.map((a) => ({ id: a.id, uri: a.uri, w: a.width, h: a.height })),
    next: r.hasNextPage ? r.endCursor : undefined,
  };
}

/** A file URI the image re-encoder can read (iOS ph:// → local file, downloads from iCloud if needed). */
export async function fileUri(s: Shot): Promise<string> {
  const info = await ML.getAssetInfoAsync(s.id, { shouldDownloadFromNetwork: true });
  return info.localUri ?? s.uri;
}

export const onChange = (fn: () => void) => {
  const sub = ML.addListener(() => fn());
  return () => sub.remove();
};
