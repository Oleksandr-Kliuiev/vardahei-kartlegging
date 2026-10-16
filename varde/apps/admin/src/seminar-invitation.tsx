// «Invitasjon» of a seminar (3.10): the letter to send by hand, the registration link, the
// calendar file, the A4 poster with a QR code, and «Last ned invitasjon» with all of it in one zip.
// Varde sends nothing by itself.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api.js';
import { Icon } from './icons.js';
import { ErrorMessage } from './queries.js';
import { copy, type SeminarDetail, type SeminarLang } from './seminar-models.js';
import { useToast } from './shell.js';
import { Seg } from './widgets.js';

const NAMES: Record<SeminarLang, string> = { nn: 'Nynorsk', en: 'English' };

export function Invitation({ seminar }: { seminar: SeminarDetail }) {
  const toast = useToast();
  const [lang, setLang] = useState<SeminarLang>('nn');
  const letter = useQuery({
    queryKey: ['seminars', 'invitation', seminar.id, lang],
    queryFn: () =>
      api<{ text: string; link: string }>(`/api/admin/seminars/${seminar.id}/invitation?lang=${lang}`),
  });
  const [text, setText] = useState('');
  useEffect(() => {
    if (letter.data) setText(letter.data.text);
  }, [letter.data]);
  const base = `/api/admin/seminars/${seminar.id}`;
  return (
    <div className="flate">
      <section className="kort s7">
        <div className="kort-hovud">
          <h2>Invitasjon</h2>
          {seminar.languages.length > 1 && (
            <Seg
              label="Språk"
              value={lang}
              options={seminar.languages.map((l) => [l, NAMES[l]] as const)}
              onChange={setLang}
            />
          )}
        </div>
        <div className="kort-innhald sem-invitasjon">
          <p className="forklaring">
            Teksten er skriven for at du eller leiaren hos kunden sender han frå eigen e-post eller i
            Teams. Varde sender ingenting sjølv.
          </p>
          <ErrorMessage error={letter.error} />
          <label className="field">
            <span>Tekst til dei som skal inviterast</span>
            <textarea className="input sem-tekst" value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {letter.data && (
            <div className="sem-lenkje">
              <code>{letter.data.link}</code>
              <button type="button" className="btn sm" onClick={() => copy(letter.data.link, toast, 'Lenkja er kopiert')}>
                <Icon name="kopi" small />
                Kopier lenkje
              </button>
            </div>
          )}
          <div className="handlingar">
            <button type="button" className="btn primary sm" disabled={!text} onClick={() => copy(text, toast, 'Teksten er kopiert')}>
              <Icon name="kopi" small />
              Kopier tekst
            </button>
          </div>
        </div>
      </section>
      <section className="kort s5">
        <div className="kort-hovud">
          <h2>Last ned</h2>
        </div>
        <div className="kort-innhald">
          <p>
            Pakken har teksten, lenkja, kalenderfila og ein A4-plakat med QR-kode
            {seminar.languages.includes('en') ? ', på nynorsk og engelsk' : ''}.
          </p>
          <div className="handlingar sem-last-ned">
            <a className="btn primary sm" href={`${base}/invitation.zip`} download>
              <Icon name="ned" small />
              Last ned invitasjon
            </a>
            <a className="btn sm" href={`${base}/calendar.ics?lang=${lang}`} download>
              <Icon name="kalender" small />
              Kalenderfil (ICS)
            </a>
            <a className="btn sm" href={`/admin/poster/seminar/${seminar.id}?lang=${lang}`} target="_blank" rel="noopener noreferrer">
              <Icon name="dok" small />
              Opne plakaten (A4)
            </a>
          </div>
          <p className="forklaring">
            Plakaten opnar i ei ny fane, klar til utskrift. QR-koden er laga i Varde og går rett til
            påmeldinga.
          </p>
        </div>
      </section>
    </div>
  );
}
