import React from 'react';
import { Text, View } from 'react-native';
import { opt, tx } from '../i18n/app';
import { color, space, type } from '../theme/tokens';
import { Chip, Chips, Label, Section } from '../ui';
import { GROUPS } from './fieldMeta';

function fmt(k: string, v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? '✓' : null;
  if (k === 'height_cm') return `${v} cm`;
  if (k === 'weight_kg') return `${v} kg`;
  if (typeof v === 'string') return ['bio', 'prompt_a', 'boundaries', 'pronouns', 'gym', 'last_tested'].includes(k) ? v : opt(v);
  return String(v);
}

/** Read-only profile details grouped like S-20. */
export function FieldList({ fields, accent }: { fields: Record<string, unknown>; accent: string }) {
  return (
    <View style={{ gap: space.l }}>
      {fields.bio ? <Text style={{ ...type.body, color: color.fgPrimary }}>{String(fields.bio)}</Text> : null}
      {fields.prompt_q && fields.prompt_a ? (
        <View style={{ gap: 2 }}>
          <Label>{opt(String(fields.prompt_q))}</Label>
          <Text style={{ ...type.headline, color: color.fgPrimary }}>{String(fields.prompt_a)}</Text>
        </View>
      ) : null}
      {GROUPS.map(({ group, keys }) => {
        const rows = keys.filter((k) => !['bio', 'prompt_q', 'prompt_a'].includes(k) && fields[k] !== undefined);
        if (!rows.length) return null;
        return (
          <Section key={group} title={tx.profile.sections[group]}>
            {rows.map((k) => {
              const v = fields[k];
              return (
                <View key={k} style={{ paddingVertical: space.s, gap: space.xs }}>
                  <Text style={{ ...type.meta, color: color.fgSecondary }}>{tx.edit.fields[k] ?? k}</Text>
                  {Array.isArray(v) ? (
                    <Chips>
                      {v.map((x) => (
                        <Chip key={String(x)} label={opt(String(x))} on fill={accent} onPress={() => {}} />
                      ))}
                    </Chips>
                  ) : (
                    <Text style={{ ...type.body, color: color.fgPrimary }}>{fmt(k, v)}</Text>
                  )}
                </View>
              );
            })}
          </Section>
        );
      })}
    </View>
  );
}
