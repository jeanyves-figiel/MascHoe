import type { Me } from '../api/client';

// F-02 flow (S-01…S-06). Pure logic, unit tested.
export type Screen = 'welcome' | 'create' | 'inbox' | 'basics' | 'underage' | 'location' | 'photo' | 'verify' | 'explore' | 'link';

export function screenFor(me: Me | null): Screen {
  if (!me) return 'welcome';
  switch (me.onboarding_step) {
    case 'basics':
      return 'basics';
    case 'location':
      return 'location';
    case 'photo':
      return 'photo';
    case 'verify':
      return 'verify';
    default:
      return 'explore';
  }
}

// R-02.1: progress bar with 5 segments, S-02…S-06.
export const PROGRESS: Partial<Record<Screen, number>> = { create: 1, inbox: 1, basics: 2, location: 3, photo: 4, verify: 5 };

export function ageOn(birthdate: Date, today: Date): number {
  let age = today.getFullYear() - birthdate.getFullYear();
  const m = today.getMonth() - birthdate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthdate.getDate())) age--;
  return age;
}

export function parseBirthday(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

export type BasicsInput = { display_name: string; birthdate: string; gender: string; gender_other: string; here_for: string[] };

// Mirrors server validation (R-02.4/R-02.5) so Continue only enables when valid.
export function basicsValid(b: BasicsInput): boolean {
  const name = b.display_name.trim();
  if (name.length < 1 || name.length > 30) return false;
  if (!parseBirthday(b.birthdate)) return false;
  if (!['man', 'trans_man', 'non_binary', 'other'].includes(b.gender)) return false;
  if (b.gender === 'other' && (b.gender_other.trim().length < 1 || b.gender_other.length > 20)) return false;
  return b.here_for.length > 0;
}

// R-02.2: rounded down to nearest 10 below 100 (server already rounds; kept for display safety).
export function displayCount(n: number | null): number | null {
  if (n === null || n < 10) return null;
  return n < 100 ? Math.floor(n / 10) * 10 : n;
}
