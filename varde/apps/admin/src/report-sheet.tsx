// The A4 pages of the client report (5.1): only what the API gives from released aggregate
// cells and saved aggregate findings. Hidden numbers stay «–»; zones always carry their word.
// Page 1 is the summary (as the Vardestien mockup), page 2 the questions one by one.
import logo from './logo.png';
import {
  type ClientReport,
  type ReportLang,
  type ReportTexts,
  TEXTS,
  ZONE_IDS,
  changeText,
  dayText,
  decimal,
  percent,
  periodText,
} from './report-texts.js';

function Zone({ level, t }: { level: number | null; t: ReportTexts }) {
  if (level === null) return <span className="rapport-sone">–</span>;
  return (
    <span className={`rapport-sone ${ZONE_IDS[level] ?? ''}`}>
      <i aria-hidden="true" />
      {t.zones[level]}
    </span>
  );
}

const Fjell = () => (
  <svg className="rapport-fjell" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true">
    <path
      className="bak"
      d="M0,40 L0,26 L60,14 L110,24 L170,6 L230,20 L290,10 L350,22 L400,14 L400,40Z"
    />
    <path
      className="fram"
      d="M0,40 L0,32 L80,24 L140,30 L200,18 L270,28 L330,20 L400,26 L400,40Z"
    />
  </svg>
);

function Comparison({ c, lang }: { c: NonNullable<ClientReport['comparison']>; lang: ReportLang }) {
  const t = TEXTS[lang];
  const count = (n: number | null) => (n === null ? '–' : String(n));
  return (
    <section className="rapport-del">
      <h2>{t.compare(c.round.name)}</h2>
      <table className="rapport-tabell kort-tabell">
        <thead>
          <tr>
            <td />
            <th scope="col">{t.before}</th>
            <th scope="col">{t.now}</th>
            <th scope="col">{t.change}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{t.mean}</th>
            <td>{decimal(c.before.mean, lang)}</td>
            <td>{decimal(c.now.mean, lang)}</td>
            <td>{changeText(c.change.mean, lang)}</td>
          </tr>
          <tr>
            <th scope="row">{t.critical}</th>
            <td>{percent(c.before.critical, lang)}</td>
            <td>{percent(c.now.critical, lang)}</td>
            <td>{changeText(c.change.critical, lang, true)}</td>
          </tr>
          <tr>
            <th scope="row">{t.zone}</th>
            <td>
              <Zone level={c.before.zone} t={t} />
            </td>
            <td>
              <Zone level={c.now.zone} t={t} />
            </td>
            <td />
          </tr>
        </tbody>
      </table>
      <p className="rapport-merk">
        {t.caveat[c.degree](count(c.before.respondents), count(c.now.respondents))}
      </p>
    </section>
  );
}

function Questions({ report, t }: { report: ClientReport; t: ReportTexts }) {
  const lang = report.lang;
  const previous = report.questions.some((q) => q.before !== null);
  return (
    <section className="rapport-del">
      <h2>{t.questions}</h2>
      <table className="rapport-tabell">
        <thead>
          <tr>
            <th scope="col">{t.question}</th>
            <th scope="col">{t.zone}</th>
            <th scope="col">{t.mean}</th>
            <th scope="col">{t.critical}</th>
            {previous && <th scope="col">{t.previous}</th>}
          </tr>
        </thead>
        <tbody>
          {report.questions.map((q) => (
            <tr key={q.id}>
              <th scope="row">{q.label}</th>
              <td>
                <Zone level={q.zone} t={t} />
              </td>
              <td>{decimal(q.mean, lang)}</td>
              <td>{percent(q.critical, lang)}</td>
              {previous && <td>{decimal(q.before?.mean, lang)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rapport-merk">{t.dash}</p>
    </section>
  );
}

function ContactBlock({ report, t }: { report: ClientReport; t: ReportTexts }) {
  const c = report.contact;
  const hours = c.hours[report.lang] ?? c.hours.nn;
  return (
    <section className="rapport-del rapport-kontakt">
      <h2>{t.contact}</h2>
      <p>{t.contactLead}</p>
      <p>
        <b>{c.name}</b> · {c.phone} · {c.email}
        {hours ? ` · ${hours}` : ''}
      </p>
    </section>
  );
}

function Method({ t }: { t: ReportTexts }) {
  return (
    <section className="rapport-del rapport-metode">
      <h2>{t.method}</h2>
      <p>{t.methodText}</p>
    </section>
  );
}

export function ReportSheet({ report }: { report: ClientReport }) {
  const lang = report.lang;
  const t = TEXTS[lang];
  const kicker =
    report.template === 'tryggleik' || report.template === 'ki'
      ? t.kicker[report.template]
      : t.kicker.other;
  const zone = report.zone;
  const zoneId = zone?.zone == null ? 'ingen' : ZONE_IDS[zone.zone];
  const detail = report.questions.length > 0;
  return (
    <div className="rapport-ark" lang={lang}>
      <article className="rapport-side" aria-label={`${kicker} ${report.client.name}`}>
        <header className="rapport-topp">
          <img className="rapport-logo" src={logo} alt="Vardahei IT" />
          <span>
            {t.made} {dayText(report.generated, lang)}
          </span>
        </header>
        <div className="rapport-tittel">
          <p className="rapport-kicker">{kicker}</p>
          <h1>{report.client.name}</h1>
          <p>
            {report.round.name} · {periodText(report.round.opened, report.round.closed, lang)}
          </p>
        </div>
        <div className="rapport-tal">
          {zone && (
            <>
              <div className={`rapport-boks sone-${zoneId}`}>
                <span>{t.zone}</span>
                <b>
                  <Zone level={zone.zone} t={t} />
                </b>
              </div>
              <div className="rapport-boks">
                <span>{t.mean}</span>
                <b>{decimal(zone.mean, lang)}</b>
                {zone.mean !== null && <small>{t.of3}</small>}
              </div>
              <div className="rapport-boks">
                <span>{t.critical}</span>
                <b>{percent(zone.critical, lang)}</b>
              </div>
            </>
          )}
          <div className="rapport-boks">
            <span>{t.respondents}</span>
            <b>{report.respondents ?? '–'}</b>
          </div>
        </div>
        {report.respondents === null ? (
          <p className="rapport-merk">{t.tooFew}</p>
        ) : (
          zone && <p className="rapport-merk">{t.scale}</p>
        )}
        <section className="rapport-del">
          <h2>{report.template === 'tryggleik' ? t.findings.tryggleik : t.findings.other}</h2>
          {report.findings.length ? (
            <ol className="rapport-funn">
              {report.findings.map((f) => (
                <li key={f.key} lang={f.lang}>
                  <b>{f.tal}</b> {f.text}{' '}
                  <span className={`rapport-niva ${f.level}`}>{t.level[f.severity][f.level]}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p>{t.noFindings}</p>
          )}
        </section>
        {report.findings.length > 0 && (
          <section className="rapport-del">
            <h2>{t.suggest}</h2>
            <ol className="rapport-forslag">
              {report.findings.map((f) => (
                <li key={f.key} lang={f.lang}>
                  {f.action}
                </li>
              ))}
            </ol>
          </section>
        )}
        {report.comparison && <Comparison c={report.comparison} lang={lang} />}
        <Method t={t} />
        <ContactBlock report={report} t={t} />
        <Fjell />
      </article>
      {detail && (
        <article className="rapport-side" aria-label={`${t.questions}, ${report.client.name}`}>
          <header className="rapport-topp">
            <img className="rapport-logo" src={logo} alt="" />
            <span>
              {report.client.name} · {report.round.name}
            </span>
          </header>
          <Questions report={report} t={t} />
          <Fjell />
        </article>
      )}
    </div>
  );
}
