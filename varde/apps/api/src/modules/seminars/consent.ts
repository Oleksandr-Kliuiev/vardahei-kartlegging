// Consent of the seminar registration (3.2): a short text beside the checkbox and the full text
// behind «Les meir». The version is stored on the contact (`consent_version`); any change of the
// texts needs a new version (test/seminars/consent.test.ts pins the hash of each version).
// Texts for people outside Vardahei: nynorsk first, English when the seminar has it.

export interface ConsentText {
  short: string;
  full: readonly string[];
}
export interface Consent {
  version: string;
  nn: ConsentText;
  en: ConsentText;
}

export const CONSENT: Consent = {
  version: 'samtykke-v1',
  nn: {
    short:
      'Eg samtykkjer i at Vardahei IT lagrar namnet, bedrifta og e-postadressa mi, slik at dei kan halde styr på påmeldinga og invitere meg til seinare seminar.',
    full: [
      'Vardahei IT lagrar namnet, bedrifta og e-postadressa du skriv inn her. Vi brukar dei til å halde styr på kven som kjem, og til å invitere deg til seinare seminar.',
      'Påmeldinga til dette seminaret slettar vi 90 dagar etter seminaret.',
      'Namnet, bedrifta og e-postadressa tek vi vare på så lenge du eller bedrifta di har eit samarbeid med oss, og du ikkje har bede oss slette dei. Ein gong i året går vi gjennom lista.',
      'Opplysningane kjem ikkje med i rapportar eller tal som bedrifta di får frå oss, og vi deler dei ikkje med andre.',
      'Du kan når som helst be om å få sjå eller slette opplysningane. Skriv til post@vardahei.no.',
    ],
  },
  en: {
    short:
      'I agree that Vardahei IT stores my name, company and email address so they can keep track of my registration and invite me to later seminars.',
    full: [
      'Vardahei IT stores the name, company and email address you enter here. We use them to keep track of who is coming and to invite you to later seminars.',
      'We delete your registration for this seminar 90 days after the seminar.',
      'We keep your name, company and email address for as long as you or your company works with us and you have not asked us to delete them. We go through the list once a year.',
      'Your details are not part of any report or figures your company gets from us, and we do not share them with anyone else.',
      'You can ask to see or delete your details at any time. Write to post@vardahei.no.',
    ],
  },
};
