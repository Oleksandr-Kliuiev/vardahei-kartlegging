// Answer shapes shared by the runner functions (1.6). A template version is the parsed
// TemplateContent of @varde/schema (1.1); only the fields the runner needs are required here.
import type { Question } from '@varde/schema/template/question';
import type { Identification } from '@varde/schema/template/template';

export type ScaleAnswer = Record<string, number>;
export type AnswerValue = string | number | string[] | ScaleAnswer;
export type Answers = Record<string, AnswerValue>;
/** Raw input before normalisation: anything a client may send. */
export type RawAnswers = Record<string, unknown>;

export interface RunnerVersion {
  identification: Identification;
  leader_roles: readonly string[];
  questions: readonly Question[];
}
