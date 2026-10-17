import { useEffect, type MouseEvent } from 'react';

/** In-app navigation without a page load: the shell follows popstate (App.tsx). */
export function goTo(href: string) {
  window.history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** An old or incomplete address becomes the right one without a new history entry (2.17). */
export function replaceTo(href: string) {
  window.history.replaceState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** A link inside the app: a plain click stays in the page, a modified click opens a tab as usual. */
export function follow(event: MouseEvent<HTMLAnchorElement>, href: string) {
  if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  goTo(href);
}

/** The tab title of a page with its own heading (a round, a client): «<name> – Varde». */
export function useTitle(text: string | undefined) {
  useEffect(() => {
    if (text) document.title = `${text} – Varde`;
  }, [text]);
}
