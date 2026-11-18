// Response shapes (docs/spec/api.md). Account ids never appear.
import type { Photo } from './client';

export type Mode = 'hookup' | 'friends' | 'sport';
export type Kind = 'now' | 'sport' | 'friends';
export const kindForMode: Record<Mode, Kind> = { hookup: 'now', sport: 'sport', friends: 'friends' };

export type Visibility = 'public' | 'verified' | 'chats' | 'only_me';

export type MyProfile = {
  id: string;
  kind: Kind;
  display_name: string;
  age: number;
  gender: string;
  gender_other: string | null;
  here_for: string[];
  /** F-06 R-06.1a: lenses this profile appears in. */
  show_in: Mode[];
  fields: Record<string, unknown>;
  visibility_map: Record<string, Visibility>;
  completeness: number;
  photos: Photo[];
};

export type NowStatus = { status: 'now' | 'hosting' | 'can_travel' | 'door_open'; text: string | null; since?: string; expires_at?: string; fresh?: boolean };

export type Distance = null | { kind: 'exact'; m: number } | { kind: 'area'; bucket: string } | { kind: 'city'; city: string | null };

export type Card = {
  id: string;
  display_name: string;
  age: number;
  verified: boolean;
  photo: string | null;
  online: boolean;
  distance: Distance;
  now: NowStatus | null;
  exact: boolean;
  pin_expires_at: string | null;
  further: boolean;
  creator: boolean;
  intent: string | null;
  position: string | null;
  new: boolean;
  lat?: number;
  lng?: number;
};

export type Grid = { items: Card[]; next: string | null; further_from: number | null; reason: string | null; fit_m?: number | null };
export type MapData = { cells: { cell: string; res: number; count: number }[]; pins: Card[]; avatars: Card[] };

export type ProfileView = {
  id: string;
  kind: Kind;
  display_name: string;
  age: number;
  gender: string;
  gender_other: string | null;
  fields: Record<string, unknown>;
  photos: string[];
  verified: boolean;
  verified_since: string | null;
  member_since: string;
  now: NowStatus | null;
  distance: Distance;
  tapped: boolean;
  tapped_me: boolean;
  vouches: number;
  vouched?: boolean;
  can_vouch?: boolean;
  badges: { kind: string; since?: string; years?: number; up_pct?: number; total?: number }[];
  linked_accounts: { platform: string; handle: string; verified?: boolean; url?: string }[];
  self: boolean;
};

export type Settings = {
  hide_from_unverified: boolean;
  hide_from_new: boolean;
  hide_from_age_min: number | null;
  hide_from_age_max: number | null;
  show_in_grid: boolean;
  show_in_map: boolean;
  show_in_tonight: boolean;
  show_in_activities: boolean;
  show_in_venues: boolean;
  show_distance: 'exact' | 'range' | 'none';
  online_visible: boolean;
  read_receipts: boolean;
  who_can_message: 'verified' | 'tapped' | 'filters';
  explicit_from_strangers: 'blur' | 'allow' | 'block';
  disappearing_default: '24h' | '7d' | 'never';
  push: Record<string, boolean>;
  quiet_hours: null | { from: number; to: number; tz_offset_min: number };
};

export type ProfileOptions = {
  options: Record<string, string[]>;
  defaults: Record<string, { visibility: Visibility; kinds: Kind[] | 'all'; lenses?: Mode[] }>;
  health: string[];
};

export type Tap = { profile: { id: string; display_name: string; age: number; verified: boolean; photo: string | null }; at: string; seen: boolean; mutual: boolean; kind: Kind };
