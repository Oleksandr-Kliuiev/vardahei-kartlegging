// Shapes of kartlegging/public/sporsmal.js (docs/kartlegging-teknisk.md «Банк вопросов»).
export type Fn = (svar: Record<string, unknown>) => unknown;
export interface Tekst {
  nn: string;
  en: string;
}
export interface Val {
  id: string;
  nn: string;
  en: string;
  aleine?: boolean;
  vis?: Fn;
}
export interface Sporsmal {
  id: string;
  del: 'A' | 'B';
  type: 'single' | 'multi' | 'text' | 'scale' | 'nps';
  tekst: Tekst;
  hjelp?: Tekst;
  ingress?: Tekst;
  plasshaldar?: Tekst;
  kort?: string;
  val?: Val[];
  vis?: Fn;
  valFraa?: string;
  maks?: number;
  minst?: number;
  fritekst?: Tekst;
  fritekstNaar?: string[];
  valfri?: boolean;
  paakravd?: boolean;
  einlinje?: boolean;
  stor?: boolean;
  maksLengd?: number;
  rolle?: boolean;
  anker?: boolean;
  farge?: Record<string, number>;
  scenario?: boolean;
  rett?: string[];
  fasit?: { tittel: Tekst; nn: string; en: string };
  skala?: { min: number; max: number; lav: Tekst; hog: Tekst };
  rader?: Val[];
}
export interface Tips {
  id: string;
  naar: Fn;
  tittel: Tekst;
  nn: string;
  en: string;
  avslutning?: boolean;
  reserve?: boolean;
}
export interface Skjema {
  id: string;
  namn: Tekst;
  kort: Tekst;
  minutt: number;
  initialar?: string;
  brev: { nn: string[]; en: string[] };
  fakta2?: Tekst;
  fakta3?: Tekst;
  fakta4?: Tekst;
  leiar: { tittel: Tekst; tekst: Tekst };
  sporsmal: Sporsmal[];
  tips: Tips[];
}
export interface Kartlegging {
  versjon: string;
  soner: { nivaa: { id: string; namn: string }[]; person: number[]; samla: number[] };
  minGruppe: number;
  kontakt: { namn: string; telefon: string; epost: string; tider: Tekst };
  avsendar: Tekst;
  kundar: Record<string, string>;
  skjema: Record<string, Skjema>;
  maksTips: number;
  leiarRoller: string[];
}
