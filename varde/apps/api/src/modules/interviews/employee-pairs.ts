// «Leiar vs tilsette» (2.22c, step 3.4 of «Samtalar»; decision of Oleksandr 07.11 in
// docs/BESLUTNINGER.md): the question of the employees' security survey (template `tryggleik`) that
// answers to a question of the conversation guide. Claude drafted the pairs and Oleksandr confirmed
// them on 07.11 (the step-3 content, § 3.4). A survey question is named the way the dashboard
// follows a question across versions: F1–F22 by their anchor (ADR-005: an orthographic fix keeps
// it, a semantic change gives a new one, and then the pair ends), T1–T5 of the «Haust 2026» version
// by id, since they have no anchor. Without a pair: N2–N6, N11, N15, N16, N19, N21, N24 and N25
// (the employees get no such question; the leader part of tryggleik is no «tilsette»).
import type { ChoiceQuestion, Question } from '@varde/schema/template/question';

export type EmployeeRef = { readonly anchor: string } | { readonly id: string };

/** Question of the guide → the questions to the employees, in the order they are shown. */
export const EMPLOYEE_PAIRS: ReadonlyMap<string, readonly EmployeeRef[]> = new Map([
  ['N7', [{ anchor: 'F18' }]],
  ['N8', [{ id: 'T5' }]],
  ['N9', [{ anchor: 'F16' }]],
  ['N10', [{ id: 'T1' }]],
  ['N12', [{ anchor: 'F14' }, { anchor: 'F15' }]],
  ['N13', [{ id: 'T2' }]],
  ['N14', [{ anchor: 'F7' }, { anchor: 'F8' }]],
  ['N17', [{ id: 'T3' }]],
  ['N18', [{ anchor: 'F3' }]],
  ['N20', [{ anchor: 'F17' }]],
  ['N22', [{ anchor: 'F11' }]],
  ['N23', [{ anchor: 'F9' }]],
  ['N26', [{ anchor: 'F11' }, { id: 'T4' }]],
  ['N27', [{ anchor: 'F5' }, { anchor: 'F6' }]],
  ['N28', [{ anchor: 'F12' }, { id: 'T4' }]],
]);

/** The question of a survey version that a reference names: a choice question of the employees'
 * part, never the role question or the initials; none when the version does not have it. */
export function employeeQuestion(
  questions: readonly Question[],
  ref: EmployeeRef,
): ChoiceQuestion | undefined {
  const q = questions.find(
    (x) =>
      x.part === 'common' &&
      !x.identifier &&
      !x.role &&
      ('anchor' in ref ? x.anchor_key === ref.anchor : x.id === ref.id),
  );
  return q?.type === 'single' || q?.type === 'multi' ? q : undefined;
}
