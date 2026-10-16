// Consent of the seminar registration in two boxes (decision of Oleksandr 16.10):
// - required: name, company and e-mail are stored for this registration (version `version`,
//   stored on the registration);
// - optional, not ticked by default: invitations to later seminars (version `invite_version`,
//   stored on the contact).
// `full` is the text behind «Les meir» for both. Any change of a text needs a new version of it
// (test/seminars/texts.test.ts pins the hash of each version). Nynorsk first, English when the
// seminar has it.

export interface ConsentText {
  /** Beside the required box. */
  short: string;
  /** Beside the optional box. */
  invite: string;
  full: readonly string[];
}
export interface Consent {
  version: string;
  invite_version: string;
  nn: ConsentText;
  en: ConsentText;
}

export const CONSENT: Consent = {
  version: 'pamelding-v1',
  invite_version: 'invitasjon-v1',
  nn: {
    short:
      'Eg samtykkjer i at Vardahei IT lagrar namnet, bedrifta og e-postadressa mi for denne påmeldinga.',
    invite: 'Eg vil gjerne få invitasjon til seinare seminar frå Vardahei IT.',
    full: [
      'Vardahei IT lagrar namnet, bedrifta og e-postadressa du skriv inn her, for å halde styr på kven som kjem på seminaret.',
      'Påmeldinga slettar vi 90 dagar etter seminaret. Har du ikkje kryssa av for invitasjonar, slettar vi då òg namnet og e-postadressa, med mindre du er påmeld eit anna seminar.',
      'Kryssar du av for invitasjonar, tek vi vare på namnet, bedrifta og e-postadressa så lenge du vil ha invitasjonar. Ein gong i året går vi gjennom lista.',
      'Opplysningane kjem ikkje med i rapportar eller tal som bedrifta di får frå oss, og vi deler dei ikkje med andre.',
      'Du kan når som helst be oss slutte å sende invitasjonar, eller få sjå eller slette opplysningane. Skriv til post@vardahei.no.',
    ],
  },
  en: {
    short:
      'I agree that Vardahei IT stores my name, company and email address for this registration.',
    invite: 'I would like to receive invitations to later seminars from Vardahei IT.',
    full: [
      'Vardahei IT stores the name, company and email address you enter here, to keep track of who is coming to the seminar.',
      'We delete the registration 90 days after the seminar. If you have not ticked the box for invitations, your name and email address go then too, unless you are registered for another seminar.',
      'If you tick the box for invitations, we keep your name, company and email address for as long as you want invitations. We go through the list once a year.',
      'Your details are not part of any report or figures your company gets from us, and we do not share them with anyone else.',
      'You can ask us at any time to stop sending invitations, or to see or delete your details. Write to post@vardahei.no.',
    ],
  },
};
