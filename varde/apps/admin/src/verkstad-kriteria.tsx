// The criteria of a question in a conversation guide (3.1, decision 07.11): when the answer is
// «Ivaretatt», «Forbetringspotensial» or «Manglar». The conversation shows each under its rating button.
// They take the place of the answers a survey question has; an emptied field leaves the question, as the
// short name does, and the draft is saved as with any other text.
import { useId } from 'react';
import {
  CRITERION_LABEL,
  CRITERION_MAX_LENGTH,
  criterionEntries,
} from '../../../packages/schema/src/template/criteria.js';
import type { Question } from '../../../packages/schema/src/template/question.js';
import { TekstFelt } from './verkstad-felt.js';
import type { Lang } from './verkstad-model.js';

export function Kriteria({
  q,
  lang,
  locked,
  onChange,
}: {
  q: Question;
  lang: Lang;
  locked: boolean;
  onChange: (q: Question) => void;
}) {
  const id = useId();
  return (
    <div
      className="vk-blokk vk-kriteria"
      role="group"
      aria-labelledby={`${id}-tittel`}
      aria-describedby={`${id}-hint`}
    >
      <div className="vk-etikett" id={`${id}-tittel`}>
        Vurdering
      </div>
      <small className="vk-hint" id={`${id}-hint`}>
        Kva som skal til for kvar vurdering. Teksten står under knappen når du vurderer i samtalen.
      </small>
      {criterionEntries().map(([rating, key]) => (
        <TekstFelt
          key={key}
          label={CRITERION_LABEL[rating]}
          text={q.texts[key]}
          lang={lang}
          multiline
          readOnly={locked}
          maxLength={CRITERION_MAX_LENGTH}
          onChange={(text) => {
            const texts = { ...q.texts };
            if (Object.values(text).some(Boolean)) texts[key] = text;
            else delete texts[key];
            onChange({ ...q, texts });
          }}
        />
      ))}
    </div>
  );
}
