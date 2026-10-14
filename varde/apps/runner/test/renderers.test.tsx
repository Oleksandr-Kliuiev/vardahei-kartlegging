import { render } from 'preact';
import { useState } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@varde/schema/template/question';
import type { AnswerValue } from '@varde/rules/runner';
import { canContinue, QuestionRenderer } from '../src/renderers.js';
import { rendererQuestions } from '../e2e/support.js';

const root = document.createElement('div');
const questions = rendererQuestions();
afterEach(() => { render(null, root); vi.useRealTimers(); });
function mount(q: Question, onAdvance = vi.fn()) {
  function Harness() {
    const [value, setValue] = useState<AnswerValue | undefined>();
    return <QuestionRenderer question={q} answers={value === undefined ? {} : { [q.id]: value }} free={{}} lang="nn"
      onAnswer={setValue} onFree={vi.fn()} onAdvance={onAdvance} />;
  }
  void act(() => { render(<Harness />, root); });
}
function click(id: string) { void act(() => { root.querySelector<HTMLButtonElement>(`[data-id="${id}"]`)!.click(); }); }
const selected = () => [...root.querySelectorAll('[aria-checked="true"][data-id]')].map((el) => el.getAttribute('data-id'));

describe('choice renderers (1.13a)', () => {
  it('single advances at 260 ms; unmount cancels pending advance', () => {
    vi.useFakeTimers();
    const advance = vi.fn();
    mount(questions[0]!, advance);
    click('a');
    void act(() => { vi.advanceTimersByTime(259); });
    expect(advance).not.toHaveBeenCalled();
    void act(() => { vi.advanceTimersByTime(1); });
    expect(advance).toHaveBeenCalledTimes(1);
    click('b');
    render(null, root);
    void act(() => { vi.advanceTimersByTime(260); });
    expect(advance).toHaveBeenCalledTimes(1);
  });
  it('returning to an answered single does not start an automatic transition', () => {
    vi.useFakeTimers();
    const advance = vi.fn();
    void act(() => { render(<QuestionRenderer question={questions[0]!} answers={{ Q1: 'a' }} free={{}} lang="nn" onAnswer={vi.fn()} onFree={vi.fn()} onAdvance={advance} />, root); });
    void act(() => { vi.advanceTimersByTime(500); });
    expect(advance).not.toHaveBeenCalled();
  });
  it('max_choices rejects extra click and gives hint', () => {
    mount(questions[1]!);
    click('a'); click('b'); click('c');
    expect(selected()).toEqual(['a', 'b']);
    expect(root.querySelector<HTMLButtonElement>('[data-id="c"]')!.disabled).toBe(true);
    expect(root.textContent).toContain('Vel inntil 2.');
  });
  it('exclusive replaces even a full choice set; normal choice replaces exclusive', () => {
    mount(questions[1]!);
    click('a'); click('b'); click('ingen');
    expect(selected()).toEqual(['ingen']);
    click('c');
    expect(selected()).toEqual(['c']);
  });
  it('required text trims whitespace, needs two characters; optional text can proceed', () => {
    expect(canContinue(questions[2]!, ' x ')).toBe(false);
    expect(canContinue(questions[2]!, ' xy ')).toBe(true);
    const optional = { ...questions[2]! };
    delete optional.required;
    expect(canContinue(optional, '')).toBe(true);
  });
  it('uppercase text truncates to configured length', () => {
    mount(questions[2]!);
    const field = root.querySelector<HTMLInputElement>('input')!;
    void act(() => { field.value = 'abcdefghijk'; field.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(field.value).toBe('ABCDEFGH');
  });
  it('free text follows configured choices', () => {
    mount(questions[1]!);
    expect(root.querySelector<HTMLElement>('.fri')!.hidden).toBe(true);
    click('anna');
    expect(root.querySelector<HTMLElement>('.fri')!.hidden).toBe(false);
    click('ingen');
    expect(root.querySelector<HTMLElement>('.fri')!.hidden).toBe(true);
  });
});
describe('scale and NPS renderers (1.13b)', () => {
  it('scale requires every row and rejects out-of-range values', () => {
    const scale = questions[3]!;
    expect(canContinue(scale, { a: 1 })).toBe(false);
    expect(canContinue(scale, { a: 1, b: 5 })).toBe(true);
    expect(canContinue(scale, { a: 1, b: 6 })).toBe(false);
    mount(scale);
    expect(root.querySelectorAll('[role="radiogroup"]')).toHaveLength(2);
    expect(root.textContent).toContain('Låg');
    expect(root.textContent).toContain('Høg');
    expect(root.querySelector('.fri')).not.toBeNull();
  });
  for (const n of [0, 10]) it(`NPS accepts ${n} without treating zero as missing`, () => {
    expect(canContinue(questions[4]!, n)).toBe(true);
    mount(questions[4]!);
    void act(() => { [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === String(n))!.click(); });
    expect(root.querySelector('[aria-checked="true"]')!.textContent).toBe(String(n));
  });
});
