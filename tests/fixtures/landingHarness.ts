import { createElement, StrictMode, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

import { usePublicPageview } from '../../src/hooks/usePublicPageview';

const container = document.createElement('div');
document.body.append(container);
let root = createRoot(container);
let effectSetups = 0;
let hydrated = (window as Window & { harnessHydrated?: boolean }).harnessHydrated ?? true;

const Landing = ({ eligible }: { eligible: boolean }) => {
  usePublicPageview(eligible && hydrated, hydrated);
  useEffect(() => {
    effectSetups += 1;
  }, []);
  return createElement('div', null, eligible ? 'Public landing' : 'Private state');
};

const render = (eligible: boolean) =>
  flushSync(() =>
    root.render(createElement(StrictMode, null, createElement(Landing, { eligible })))
  );

Object.assign(window, {
  landingHarness: {
    effectSetups: () => effectSetups,
    hydrate: () => {
      hydrated = true;
      render(true);
    },
    render,
    unmount: () => flushSync(() => root.unmount()),
    remount: () => {
      root = createRoot(container);
      render(true);
    },
  },
});
render(true);
