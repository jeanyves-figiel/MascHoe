import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import app from '../../app.json';
import { wn, wnLang } from '../i18n/whatsnew';
import { color, font, radius, space, type } from '../theme/tokens';
import { afterSheet, Button, Sheet } from '../ui';
import { langOf, pickNote } from './logic';
import { NOTES, type Glyph, type Note, type NoteLine, type Target, type Tone } from './notes';

// F-17 R-17.15 (#238), S-78/S-79: What's new card (once per note, after an update) and history.
// Local only: the notes ship in the app; the one value stored is the last seen note id.
export const SEEN_KEY = 'thirstr.whatsNewSeen';
const PREFS_KEY = 'thirstr.prefs'; // exists on every phone that ran an earlier version (upgrade, not fresh install)
const DELAY_MS = 1200;
const lang = langOf(wnLang);

const tone: Record<Tone, string> = { hookup: color.hookup, friends: color.friends, sport: color.sport, trust: color.trust, travel: color.travel, personal: color.personal };
const tint = (c: string) => `${c}26`; // 15 % of the line colour on ink

const glyphs: Record<Glyph, string[]> = {
  moments: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18', 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8'],
  flame: ['M12 3c2 3 5 4 5 8a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-7z'],
  check: ['M5 12l4 4L19 6'],
  shield: ['M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z'],
  hand: ['M8 13V5.5a1.5 1.5 0 0 1 3 0V11', 'M11 10V4.5a1.5 1.5 0 0 1 3 0V11', 'M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5A6.5 6.5 0 0 1 4 15l-.8-2.4a1.5 1.5 0 0 1 2.7-1.2L8 14'],
  plane: ['M10 14L3 11l1.5-1.5 6.5 1 4.5-4.5a2 2 0 0 1 3 3L14 13.5l1 6.5L13.5 21.5 10.5 15'],
  pin: ['M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z', 'M12 7.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4'],
  video: ['M4 7h11v10H4z', 'M15 10l5-3v10l-5-3'],
  pen: ['M4 20h4L19 9l-4-4L4 16z'],
  spark: ['M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6'],
};

function GlyphTile({ line }: { line: NoteLine }) {
  const c = tone[line.tone];
  return (
    <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: tint(c) }}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        {glyphs[line.glyph].map((d) => (
          <Path key={d} d={d} />
        ))}
      </Svg>
    </View>
  );
}

function Line({ line, onOpen, pressBg = color.bgRaised }: { line: NoteLine; onOpen?: (t: Target) => void; pressBg?: string }) {
  const [title, sub] = line.text[lang];
  const go = line.to && onOpen ? () => onOpen(line.to!) : undefined;
  return (
    <Pressable
      disabled={!go}
      onPress={go}
      accessibilityRole={go ? 'button' : 'text'}
      accessibilityLabel={go ? wn.open(`${title}. ${sub}`) : `${title}. ${sub}`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space.m, paddingVertical: 9, paddingHorizontal: 6, borderRadius: 16, backgroundColor: pressed ? pressBg : 'transparent' })}
    >
      <GlyphTile line={line} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ ...type.headline, fontFamily: font.bold, fontSize: 15, color: color.fgPrimary }}>{title}</Text>
        <Text style={{ ...type.meta, fontFamily: font.regular, color: color.fgSecondary }}>{sub}</Text>
      </View>
      {go ? (
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color.fgMuted} strokeWidth={2.4} strokeLinecap="round">
          <Path d="M9 6l6 6-6 6" />
        </Svg>
      ) : null}
    </Pressable>
  );
}

function Dots() {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[color.personal, color.friends, color.sport].map((c) => (
        <Svg key={c} width={6} height={6}>
          <Circle cx={3} cy={3} r={3} fill={c} />
        </Svg>
      ))}
    </View>
  );
}

/** Shown once per note when `ready` (Explore on top, nothing else open) stays true for 1.2 s. */
export function WhatsNewCard({ ready, onOpen, onHistory }: { ready: boolean; onOpen: (t: Target) => void; onHistory: () => void }) {
  const [pending, setPending] = useState<{ note: Note; earlier: number } | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem(SEEN_KEY), AsyncStorage.getItem(PREFS_KEY)])
      .then(([seen, prefs]) => {
        const last = seen != null && Number.isFinite(Number(seen)) ? Number(seen) : null;
        const r = pickNote(last, prefs != null);
        if (r.note && alive) setPending({ note: r.note, earlier: r.earlier });
        // Fresh install / nothing new: remember the newest id so this build never shows a card later.
        else if (last !== r.latest) AsyncStorage.setItem(SEEN_KEY, String(r.latest)).catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!pending || open || !ready) return;
    const t = setTimeout(() => setOpen(true), DELAY_MS);
    return () => clearTimeout(t);
  }, [pending, open, ready]);

  if (!pending) return null;
  const done = (then?: () => void) => {
    setOpen(false);
    setPending(null);
    AsyncStorage.setItem(SEEN_KEY, String(NOTES[0]?.id ?? pending.note.id)).catch(() => {});
    if (then) afterSheet(then);
  };
  return (
    <Sheet visible={open} onClose={() => done()} title={wn.title} closeLabel={wn.gotIt}>
      <View testID="whats-new" style={{ gap: space.m, marginTop: -space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Dots />
          <Text style={{ ...type.caption, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase', color: color.fgMuted }}>{wn.version(app.expo.version)}</Text>
        </View>
        <View style={{ gap: space.xs }}>
          {pending.note.lines.map((l, i) => (
            <Line key={i} line={l} onOpen={(to) => done(() => onOpen(to))} />
          ))}
        </View>
        <Button title={wn.gotIt} onPress={() => done()} testID="whats-new-ok" />
        <Pressable onPress={() => done(onHistory)} accessibilityRole="link" hitSlop={8}>
          <Text style={{ ...type.meta, color: color.fgMuted, textAlign: 'center' }}>{pending.earlier ? `${wn.earlier(pending.earlier)} · ` : ''}{wn.findAgain}</Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const fmtDate = (iso: string) => {
  try {
    return new Intl.DateTimeFormat(wnLang, { day: 'numeric', month: 'short' }).format(new Date(`${iso}T12:00:00Z`));
  } catch {
    return iso;
  }
};

/** S-79: Settings › About › What's new. Last 10 notes, newest first, lines open their screen. */
export function WhatsNewScreen({ navigation }: { navigation: { navigate: (r: string, p?: object) => void } }) {
  const notes = NOTES.slice(0, 10);
  return (
    <ScrollView style={{ flex: 1, backgroundColor: color.bgBase }} contentContainerStyle={{ padding: space.l, paddingTop: space.s, gap: space.xl, paddingBottom: 120, maxWidth: 560, width: '100%', alignSelf: 'center' }}>
      <Text accessibilityRole="header" style={{ ...type.display, fontSize: 34, lineHeight: 40, color: color.fgPrimary }}>
        {wn.title}
      </Text>
      {notes.length ? null : <Text style={{ ...type.body, color: color.fgSecondary }}>{wn.empty}</Text>}
      {notes.map((n, i) => (
        <View key={n.id} style={{ gap: space.s }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, marginHorizontal: space.xs }}>
            <Text style={{ ...type.caption, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: color.fgMuted }}>{fmtDate(n.date)}</Text>
            {i === 0 ? (
              <View style={{ paddingHorizontal: 6, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: color.hookup }}>
                <Text style={{ ...type.caption, fontSize: 10, color: color.onAccent }}>{wn.isNew}</Text>
              </View>
            ) : null}
          </View>
          <View style={{ borderRadius: radius.md, backgroundColor: color.bgRaised, padding: space.xs }}>
            {n.lines.map((l, j) => (
              <Line key={j} line={l} pressBg={color.bgOverlay} onOpen={(to) => navigation.navigate(to.route, to.params)} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
