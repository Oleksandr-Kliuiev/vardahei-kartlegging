// What the landscape shows for each screen of the survey: camera, hiker position, marks on the trail and the bubble.
import type { Landscape, Mark } from './landscape/landscape.js';

export type Screen =
  | 'intro'
  | 'q'
  | 'leader'
  | 'review'
  | 'summit'
  | 'loading'
  | 'invalid'
  | 'closed'
  | 'revoked'
  | 'offline';

export interface Trail {
  /** Section per dot: one dot per visible question, leader questions included. */
  sections: readonly (string | number)[];
  marks: readonly Mark[];
  /** Dot of the current question. */
  at: number;
  /** Last common question (the leader choice is made right after it). */
  lastCommon: number;
  /** Bubble: question number and the number of questions the respondent is answering now. */
  no: number;
  total: number;
  leaderCount: number;
}
export interface Words {
  of: string;
  top: string;
}

/** `isCurrent` tells whether the screen is still showing when a walk ends (the respondent may have moved on). */
export function direct(
  l: Landscape,
  screen: Screen,
  t: Trail,
  w: Words,
  instant: boolean,
  isCurrent: () => boolean = () => true,
): void {
  l.finish(screen === 'summit');
  l.mood(
    screen === 'invalid' || screen === 'revoked' ? 'take' : screen === 'closed' ? 'kveld' : '',
  );
  l.preview(false);
  switch (screen) {
    case 'intro':
    case 'loading':
      void l.camera('hero', instant);
      void l.walkTo(l.trailhead, { instant, keepDone: true });
      l.bubble(false);
      return;
    case 'q':
      void l.camera('sti', instant);
      l.marks(t.marks);
      void l.walkTo(l.checkX(t.at), { instant });
      l.bubble(true, { i: t.no, total: t.total, of: w.of });
      return;
    case 'leader':
      void l.camera('sti', instant);
      l.marks(t.marks);
      void l
        .walkTo(l.checkX(t.lastCommon) + 6, { instant })
        .then(() => isCurrent() && l.preview(true));
      l.bubble(true, { text: `+${t.leaderCount}` });
      return;
    case 'review':
      void l.camera('sti', instant);
      l.marks(t.marks);
      void l.walkTo(l.endX, { instant });
      l.bubble(true, { i: t.total, total: t.total, of: w.of });
      return;
    case 'summit':
      void l.camera('topp', instant);
      l.marks(t.marks);
      void l.walkTo(l.summitX, { instant, top: true }).then(() => isCurrent() && l.wave());
      l.bubble(true, { text: w.top });
      return;
    default:
      l.marks([]);
      void l.camera('tilstand', instant);
      l.bubble(false);
      if (screen === 'closed') void l.walkTo(l.summitX, { instant: true, keepDone: true });
      else {
        l.reset();
        void l.walkTo(22, { instant: true, keepDone: true });
      }
  }
}
