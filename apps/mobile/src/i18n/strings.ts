// Beta languages en/fr/de (D-06). Keys per screen; copy voice per design-system.md.
const en = {
  welcome: {
    count: (n: number) => `${n} guys around you. Right now.`,
    joining: 'Guys are joining near you',
    promises: ['No phone number. Ever.', 'You choose how precisely you are seen.', 'Chats are end-to-end encrypted.'],
    start: 'Get started',
    login: 'I have an account',
  },
  create: {
    title: 'Create your account',
    passkey: 'Continue with passkey',
    apple: 'Continue with Apple',
    google: 'Continue with Google',
    email: 'Continue with email',
    adult: 'I am 18 or older',
    adultRequired: 'Confirm you are 18 or older to continue',
    noPhone: 'No phone number, no password.',
    emailPlaceholder: 'you@example.com',
    sendLink: 'Send link',
  },
  inbox: {
    title: 'Check your inbox',
    body: 'We sent you a sign-in link. It works once and expires in 15 minutes.',
    devHint: 'DEV: open Mailpit at https://localhost:7443/mail',
    back: 'Use another method',
  },
  basics: {
    title: 'The basics',
    name: 'Name',
    namePh: 'What guys call you',
    birthday: 'Birthday',
    birthdayHint: 'Only your age is shown.',
    iam: 'I am',
    genders: { man: 'Man', trans_man: 'Trans man', non_binary: 'Non-binary', other: 'Other' } as Record<string, string>,
    otherPh: 'Your words (20 max)',
    herefor: 'Here for',
    hereFor: { hookup: 'Hookup', tonight: 'Tonight', chat: 'Chat', friends: 'Friends', sport: 'Sport' } as Record<string, string>,
    continue: 'Continue',
  },
  underage: { title: 'You need to be 18+', body: 'Thirstr is for adults only. Your account has been deleted.' },
  location: {
    title: 'How precisely can guys see you?',
    explain: 'We never store your exact position. Your phone turns it into an area before anything leaves it.',
    levels: {
      hidden: ['Hidden', 'After you verify'],
      city: ['City', 'Visible as being in your city'],
      area: ['Area', 'Visible to guys within ~200 m. Widens automatically when it is quiet.'],
      exact: ['Exact', 'Pin on the map, expires automatically'],
    } as Record<string, [string, string]>,
    allow: 'Allow location',
    denied: 'No problem. Pick your city instead.',
    cityPh: 'Search city',
  },
  photo: {
    title: 'Your main photo',
    rule: 'Face or body, keep it vanilla. Spicier ones go in the 4 extra slots.',
    pick: 'Choose photo',
    checking: 'Checking…',
    ok: 'Looks good',
    too_explicit: 'Needs to be less explicit for your main photo',
    no_person: 'We need to see a person',
    extra: 'Extra photos (optional)',
    continue: 'Continue',
  },
  verify: {
    title: 'Get verified',
    body: 'A 10-second selfie check proves you are real. The video never leaves your phone.',
    bullets: ['Be seen and message first', 'Verified badge', 'Unlock Hidden mode'],
    start: 'Verify now',
    soon: 'Verification ships in the next build (F-03).',
    later: 'Later',
  },
  explore: {
    banner: 'Verify to be seen and message first',
    around: (n: number | null, city: string | null) => (n ? `${n} guys around ${city ?? 'you'}` : 'Guys are joining near you'),
    placeholder: 'Map and grid arrive with F-04.',
    pause: 'Pause account',
    resume: 'Resume account',
    logoutAll: 'Log out everywhere',
    delete: 'Delete account',
    deleteConfirm: 'Type DELETE to confirm',
  },
  errors: { generic: 'Something went wrong. Try again.' },
};

type Strings = typeof en;

const fr: Strings = {
  ...en,
  welcome: { ...en.welcome, count: (n) => `${n} mecs autour de toi. Maintenant.`, joining: 'Des mecs arrivent près de toi', promises: ['Jamais de numéro de téléphone.', 'Tu choisis ta précision de localisation.', 'Discussions chiffrées de bout en bout.'], start: 'Commencer', login: "J'ai déjà un compte" },
  create: { ...en.create, title: 'Crée ton compte', passkey: 'Continuer avec une clé d’accès', apple: 'Continuer avec Apple', google: 'Continuer avec Google', email: 'Continuer avec un e-mail', adult: "J'ai 18 ans ou plus", adultRequired: 'Confirme que tu as 18 ans ou plus', noPhone: 'Ni téléphone, ni mot de passe.', sendLink: 'Envoyer le lien' },
  basics: { ...en.basics, title: 'L’essentiel', name: 'Prénom', birthday: 'Date de naissance', iam: 'Je suis', herefor: 'Ici pour', continue: 'Continuer', genders: { man: 'Homme', trans_man: 'Homme trans', non_binary: 'Non-binaire', other: 'Autre' }, hereFor: { hookup: 'Plan', tonight: 'Ce soir', chat: 'Discuter', friends: 'Amis', sport: 'Sport' } },
  underage: { title: 'Tu dois avoir 18 ans', body: 'Thirstr est réservé aux adultes. Ton compte a été supprimé.' },
};

const de: Strings = {
  ...en,
  welcome: { ...en.welcome, count: (n) => `${n} Typen in deiner Nähe. Jetzt.`, joining: 'Gerade kommen Typen in deiner Nähe dazu', promises: ['Nie eine Telefonnummer.', 'Du bestimmst, wie genau man dich sieht.', 'Chats sind Ende-zu-Ende-verschlüsselt.'], start: 'Los geht’s', login: 'Ich habe ein Konto' },
  create: { ...en.create, title: 'Konto erstellen', passkey: 'Mit Passkey fortfahren', apple: 'Mit Apple fortfahren', google: 'Mit Google fortfahren', email: 'Mit E-Mail fortfahren', adult: 'Ich bin 18 oder älter', adultRequired: 'Bestätige, dass du 18 oder älter bist', noPhone: 'Keine Telefonnummer, kein Passwort.', sendLink: 'Link senden' },
  basics: { ...en.basics, title: 'Das Wichtigste', name: 'Name', birthday: 'Geburtstag', iam: 'Ich bin', herefor: 'Hier für', continue: 'Weiter', genders: { man: 'Mann', trans_man: 'Trans Mann', non_binary: 'Nicht-binär', other: 'Anderes' }, hereFor: { hookup: 'Sex', tonight: 'Heute Nacht', chat: 'Chat', friends: 'Freunde', sport: 'Sport' } },
  underage: { title: 'Du musst 18+ sein', body: 'Thirstr ist nur für Erwachsene. Dein Konto wurde gelöscht.' },
};

function pick(): Strings {
  const lang = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en').slice(0, 2);
  return lang === 'fr' ? fr : lang === 'de' ? de : en;
}

export const t = pick();
export { en, fr, de };
