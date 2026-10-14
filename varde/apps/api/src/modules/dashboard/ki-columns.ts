// Data from kartlegging/private/ki-tilsett.js::KOL (seven columns).
export const KI_COLUMNS: {
  id: string;
  label: string;
  short: Record<string, string>;
  marked?: string[];
}[] = [
  {
    id: 'K7',
    label: 'KI i jobben',
    short: {
      aldri: 'Aldri',
      provd: 'Prøvd',
      avogtil: 'Av og til',
      veke: 'Kvar veke',
      dag: 'Kvar dag',
    },
  },
  {
    id: 'K8',
    label: 'KI privat',
    short: {
      aldri: 'Aldri',
      provd: 'Prøvd',
      avogtil: 'Av og til',
      veke: 'Kvar veke',
      dag: 'Kvar dag',
    },
  },
  {
    id: 'K9',
    label: 'Nivå',
    short: {
      n0: 'Ikkje brukt',
      n1: 'Prøvd, usikker',
      n2: 'Enkle ting',
      n3: 'Fast bruk',
      n4: 'Eigne oppsett',
    },
  },
  {
    id: 'K4',
    label: 'Rutinetid i veka',
    short: {
      u1: 'Under 1 t',
      '1-3': '1–3 t',
      '3-5': '3–5 t',
      '5-10': '5–10 t',
      o10: 'Over 10 t',
      vk: 'Veit ikkje',
    },
  },
  {
    id: 'K19',
    label: 'Jobbdata i KI',
    short: {
      jobb: 'Jobbkonto',
      privat: 'Privat konto',
      begge: 'Begge',
      nei: 'Nei',
      vk: 'Hugsar ikkje',
    },
    marked: ['privat', 'begge'],
  },
  {
    id: 'K21',
    label: 'Kontrakten',
    short: {
      lim: 'Limer inn',
      fjern: 'Fjernar namn',
      jobb: 'Godkjent verktøy',
      utan: 'Utan KI',
      vk: 'Veit ikkje',
    },
    marked: ['lim', 'vk'],
  },
  {
    id: 'K14',
    label: 'Kjensle',
    short: {
      gler: 'Gler seg',
      nysgjerrig: 'Nysgjerrig',
      noytral: 'Nøytral',
      skeptisk: 'Skeptisk',
      uroa: 'Uroa',
    },
  },
];
