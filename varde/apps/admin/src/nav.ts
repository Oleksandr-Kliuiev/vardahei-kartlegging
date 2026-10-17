/** In-app navigation without a page load: the shell follows popstate (App.tsx). */
export function goTo(href: string) {
  window.history.pushState(null, '', href);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
