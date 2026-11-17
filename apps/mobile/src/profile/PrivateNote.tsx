import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { kv } from '../chat/kv';
import { tx } from '../i18n/app';
import { color, font, radius, space, type } from '../theme/tokens';

// R-06.9: private note + tags on someone else's profile. Device-only (encrypted store), never sent.
type Note = { text: string; tags: string[] };

export function PrivateNote({ profileId }: { profileId: string }) {
  const [note, setNote] = useState<Note | null>(null);
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState('');
  const [tags, setTags] = useState('');

  useEffect(() => {
    kv.get<Note>('note:' + profileId).then((n) => setNote(n ?? { text: '', tags: [] }));
  }, [profileId]);

  if (!note) return null;

  const save = async () => {
    const n: Note = {
      text: text.trim().slice(0, 500),
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 10),
    };
    if (n.text || n.tags.length) await kv.set('note:' + profileId, n);
    else await kv.del('note:' + profileId);
    setNote(n);
    setEdit(false);
  };

  const box = { borderWidth: 1.5, borderStyle: 'dashed' as const, borderColor: color.personal, borderRadius: radius.md, padding: space.m, gap: space.s };

  if (edit) {
    return (
      <View style={box}>
        <Text style={{ ...type.caption, color: color.personal, textTransform: 'uppercase' }}>{tx.profile.privateNote}</Text>
        <TextInput
          testID="note-text"
          value={text}
          onChangeText={setText}
          maxLength={500}
          multiline
          placeholder={tx.profile.notePlaceholder}
          placeholderTextColor={color.fgMuted}
          style={{ color: color.fgPrimary, fontFamily: font.regular, fontSize: 15, minHeight: 60 }}
        />
        <TextInput
          value={tags}
          onChangeText={setTags}
          placeholder={tx.profile.noteTags}
          placeholderTextColor={color.fgMuted}
          style={{ color: color.fgPrimary, fontFamily: font.regular, fontSize: 13 }}
        />
        <View style={{ flexDirection: 'row', gap: space.l, justifyContent: 'flex-end' }}>
          <Pressable accessibilityRole="button" onPress={() => setEdit(false)}>
            <Text style={{ ...type.headline, color: color.fgSecondary }}>{tx.common.cancel}</Text>
          </Pressable>
          <Pressable testID="note-save" accessibilityRole="button" onPress={save}>
            <Text style={{ ...type.headline, color: color.personal }}>{tx.common.save}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable
      testID="note-card"
      accessibilityRole="button"
      onPress={() => {
        setText(note.text);
        setTags(note.tags.join(', '));
        setEdit(true);
      }}
      style={box}
    >
      <Text style={{ ...type.caption, color: color.personal, textTransform: 'uppercase' }}>{tx.profile.privateNote} · {tx.profile.onlyYou}</Text>
      {note.text ? <Text style={{ ...type.body, color: color.fgPrimary }}>{note.text}</Text> : <Text style={{ ...type.meta, color: color.fgMuted }}>{tx.profile.addNote}</Text>}
      {note.tags.length ? <Text style={{ ...type.meta, color: color.personal }}>{note.tags.map((t) => '#' + t).join('  ')}</Text> : null}
    </Pressable>
  );
}
