import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';
import { build } from 'vite';

import type { MediaItem, NetflixViewingItem, StatsData } from '../src/types';

const origin = 'https://iquit.moket-home.de';
const sdk = readFileSync('tests/fixtures/umami-3.4.1.txt', 'utf8');
type Write = { type: string; payload: Record<string, string> };

const intercept = async (page: Page, delay = 0) => {
  const writes: Write[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.href === 'https://stats.mogott.sh/script.js') {
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      await route.fulfill({
        contentType: 'text/javascript',
        body: sdk,
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    } else if (url.href === 'https://stats.mogott.sh/api/send') {
      if (route.request().method() === 'POST') writes.push(route.request().postDataJSON());
      await route.fulfill({
        json: { cache: 'test-cache' },
        headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': '*' },
      });
    } else if (url.origin === origin) {
      const response = await route.fetch({ url: `http://127.0.0.1:4187${url.pathname}` });
      await route.fulfill({ response });
    } else {
      await route.abort();
    }
  });
  return writes;
};

test('empty hydrated landing emits one fixed pageview through released SDK', async ({ page }) => {
  const writes = await intercept(page);
  await page.goto(origin);
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toEqual({
    type: 'event',
    payload: {
      website: '7e893579-2c58-4528-9e6f-0bc1eeb74390',
      hostname: 'iquit.moket-home.de',
      url: '/',
      title: 'iQuit',
      referrer: '',
    },
  });
  await page.waitForTimeout(1000);
  expect(writes).toHaveLength(1);
});

const expectNoWrites = async (page: Page, writes: Write[]) => {
  await page.waitForTimeout(1800);
  expect(writes).toEqual([]);
};

for (const path of [
  '/room/private-room-token',
  '/invite/private-invite-token',
  '/auth/callback?code=private-auth-token',
  '/account',
  '/share/private-signature',
  '/?invite=private-invite-token',
  '/?frame_id=private-activity-token',
  '/#private-hash-token',
]) {
  test(`sensitive URL ${path} emits zero writes`, async ({ page }) => {
    const writes = await intercept(page);
    await page.goto(origin + path);
    await expectNoWrites(page, writes);
    await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(0);
  });
}

for (const key of [
  'iquit-media-items',
  'iquit-stats',
  'iquit-data-timestamp',
  'iquit-viewing-history',
  'iquit-processed-count',
  'iquit-partial-items',
  'iquit-processing-active',
]) {
  test(`persisted ${key} suppresses landing tracking before hydration`, async ({ page }) => {
    await page.addInitScript(
      (storageKey) => localStorage.setItem(storageKey, 'private-sentinel'),
      key
    );
    const writes = await intercept(page);
    await page.goto(origin);
    await expectNoWrites(page, writes);
  });
}

for (const value of ['1', 'yes']) {
  test(`DNT ${value} emits zero writes`, async ({ page }) => {
    await page.addInitScript(
      (dnt) => Object.defineProperty(navigator, 'doNotTrack', { value: dnt }),
      value
    );
    const writes = await intercept(page);
    await page.goto(origin);
    await expectNoWrites(page, writes);
  });
}

test('umami disabled flag suppresses tracking', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('umami.disabled', 'true'));
  const writes = await intercept(page);
  await page.goto(origin);
  await expectNoWrites(page, writes);
});

for (const alternate of ['https://preview.example.org', 'http://iquit.moket-home.de']) {
  test(`noncanonical origin ${alternate} suppresses tracking`, async ({ page }) => {
    const writes = await intercept(page);
    await page.route(alternate + '/**', async (route) => {
      const response = await route.fetch({
        url: `http://127.0.0.1:4187${new URL(route.request().url()).pathname}`,
      });
      await route.fulfill({ response });
    });
    await page.goto(alternate);
    await expect(page.getByRole('heading', { name: 'iquit', exact: true })).toBeVisible();
    await expectNoWrites(page, writes);
  });
}

test('inaccessible storage fails closed', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage blocked');
      },
    });
  });
  const writes = await intercept(page);
  await page.goto(origin);
  await expectNoWrites(page, writes);
});

test('embedded Activity landing emits zero writes', async ({ page }) => {
  const writes = await intercept(page);
  await page.route(origin + '/embed-test', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<iframe src="${origin}/"></iframe>` })
  );
  await page.goto(origin + '/embed-test');
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'iquit', exact: true })
  ).toBeVisible();
  await expectNoWrites(page, writes);
});

for (const referrer of [
  'https://example.org/private/path?token=secret#hash',
  'https://iquit.moket-home.de/room/private',
  'http://example.org/private',
]) {
  test(`referrer is HTTPS origin only for ${new URL(referrer).origin}`, async ({ page }) => {
    await page.addInitScript(
      (value) => Object.defineProperty(document, 'referrer', { value }),
      referrer
    );
    const writes = await intercept(page);
    await page.goto(origin);
    await expect.poll(() => writes.length).toBe(1);
    expect(writes[0].payload.referrer).toBe(
      referrer.startsWith('https:') ? new URL(referrer).origin : ''
    );
  });
}

const navigate = async (page: Page, path: string) => {
  await page.evaluate((url) => {
    history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, path);
};

const probeForbiddenSdkCalls = async (page: Page) => {
  await page.evaluate(async () => {
    const tracker = (
      window as Window & {
        umami?: {
          track: (name?: string) => Promise<void>;
          identify: (id: string) => Promise<void>;
        };
      }
    ).umami;
    if (!tracker) throw new Error('Released SDK did not load');
    document.title = 'private-user-title';
    await tracker.track('private-custom-event');
    await tracker.identify('private-account-id');
    await tracker.track();
  });
};

test('sensitive transition while SDK loads cancels pending pageview', async ({ page }) => {
  const writes = await intercept(page, 1500);
  await page.goto(origin);
  await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(1);
  await navigate(page, '/room/private-room-token?auth=secret#hash');
  await expectNoWrites(page, writes);
  await probeForbiddenSdkCalls(page);
  await expectNoWrites(page, writes);
});

test('CSV upload while SDK loads cancels pending pageview', async ({ page }) => {
  const writes = await intercept(page, 1500);
  await page.goto(origin);
  await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(1);
  await page.locator('input[type=file]').setInputFiles({
    name: 'private-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('private-invalid-data'),
  });
  await expectNoWrites(page, writes);
  await probeForbiddenSdkCalls(page);
  await expectNoWrites(page, writes);
});

test('public navigation and reset do not double count or enable events', async ({ page }) => {
  const writes = await intercept(page);
  await page.goto(origin);
  await expect.poll(() => writes.length).toBe(1);
  await navigate(page, '/invite/private');
  await navigate(page, '/');
  await probeForbiddenSdkCalls(page);
  await page.route('https://api.themoviedb.org/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await route.abort();
  });
  await page.locator('input[type=file]').setInputFiles({
    name: 'private-history.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Title,Date\nSynthetic Movie,2025-01-01'),
  });
  await page.getByRole('button', { name: 'Start Over' }).click();
  await page.waitForTimeout(1000);
  expect(writes).toHaveLength(1);
});

test('analytics omits credentials and adds no cookies or stored identity', async ({
  page,
  context,
}) => {
  await context.addCookies([
    {
      name: 'existing-session',
      value: 'private-cookie',
      domain: 'stats.mogott.sh',
      path: '/',
      secure: true,
    },
  ]);
  const writes = await intercept(page);
  await page.addInitScript(() => {
    const credentials: ('omit' | 'include' | 'same-origin' | undefined)[] = [];
    Object.defineProperty(window, 'analyticsCredentials', { value: credentials });
    const originalFetch = window.fetch;
    window.fetch = (input, options) => {
      if (String(input) === 'https://stats.mogott.sh/api/send')
        credentials.push(options?.credentials);
      return originalFetch(input, options);
    };
  });
  const requests: Record<string, string>[] = [];
  page.on('request', (request) => {
    if (request.url() === 'https://stats.mogott.sh/api/send' && request.method() === 'POST')
      requests.push(request.headers());
  });
  await page.goto(origin);
  await expect.poll(() => writes.length).toBe(1);
  expect(requests[0]['x-umami-website-id']).toBe('7e893579-2c58-4528-9e6f-0bc1eeb74390');
  expect(requests[0]['x-umami-hostname']).toBe('iquit.moket-home.de');
  expect(requests[0]['content-type']).toBe('application/json');
  expect(requests[0].cookie).toBeUndefined();
  expect(requests[0].authorization).toBeUndefined();
  expect(
    await page.evaluate(
      () => (window as Window & { analyticsCredentials?: string[] }).analyticsCredentials
    )
  ).toEqual(['omit']);
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect((await context.cookies()).map((cookie) => cookie.name)).toEqual(['existing-session']);
});

let harnessBundle = '';
test.beforeAll(async () => {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': JSON.stringify('development') },
    build: {
      write: false,
      minify: false,
      lib: { entry: 'tests/fixtures/landingHarness.ts', formats: ['iife'], name: 'LandingHarness' },
    },
  });
  const outputs = Array.isArray(result) ? result : [result];
  for (const output of outputs) {
    if (!('output' in output)) throw new Error('Expected an in-memory browser bundle');
    for (const chunk of output.output) {
      if (chunk.type === 'chunk') harnessBundle += chunk.code;
    }
  }
});

declare global {
  interface Window {
    landingHarness: {
      effectSetups: () => number;
      hydrate: () => void;
      render: (eligible: boolean) => void;
      unmount: () => void;
      remount: () => void;
    };
    raceProbe: { transitioned: boolean; fetchAfterDenial: boolean[] };
  }
}

type HarnessWindow = Window & {
  umami?: { track: (...args: object[]) => Promise<void> };
};

for (const remount of [false, true]) {
  test(`unhydrated ${remount ? 'real remount stays denied' : 'initial owner may hydrate'}`, async ({
    page,
  }) => {
    await page.addInitScript(() => Object.assign(window, { harnessHydrated: false }));
    const writes = await serveHarness(page);
    await page.goto(origin);
    await expect(page.getByText('Public landing', { exact: true })).toBeVisible();
    await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.landingHarness.effectSetups())).toBe(2);
    await page.evaluate((replace) => {
      if (replace) {
        window.landingHarness.unmount();
        window.landingHarness.remount();
      }
      window.landingHarness.hydrate();
    }, remount);
    if (remount) {
      await expectNoWrites(page, writes);
      await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(0);
    } else {
      await expect.poll(() => writes.length).toBe(1);
      await probeForbiddenSdkCalls(page);
      expect(writes).toHaveLength(1);
    }
  });
}

const serveHarness = async (page: Page, delay = 0) => {
  const writes = await intercept(page, delay);
  await page.route(origin + '/', (route) =>
    route.fulfill({ contentType: 'text/html', body: `<body><script>${harnessBundle}</script>` })
  );
  return writes;
};

type RaceTransition = 'query' | 'cleanup' | 'private-state' | 'disabled';

const installRaceProbe = async (page: Page, transition: RaceTransition) => {
  await page.addInitScript((change) => {
    const browser = window as HarnessWindow;
    const probe = { transitioned: false, fetchAfterDenial: [] as boolean[] };
    browser.raceProbe = probe;
    const fetch = window.fetch;
    window.fetch = (input, options) => {
      if (String(input) === 'https://stats.mogott.sh/api/send')
        probe.fetchAfterDenial.push(probe.transitioned);
      return fetch(input, options);
    };
    const append = Element.prototype.append;
    Element.prototype.append = function (...nodes) {
      for (const node of nodes) {
        if (
          !(node instanceof HTMLScriptElement) ||
          node.src !== 'https://stats.mogott.sh/script.js'
        )
          continue;
        const onload = node.onload;
        node.onload = function (event) {
          const track = browser.umami?.track;
          if (!track) throw new Error('Released SDK track missing');
          browser.umami!.track = (...args) => {
            const result = track(...args);
            probe.transitioned = true;
            if (change === 'query') history.replaceState({}, '', '/?private=secret');
            if (change === 'cleanup') browser.landingHarness.unmount();
            if (change === 'private-state') browser.landingHarness.render(false);
            if (change === 'disabled') localStorage.setItem('umami.disabled', 'true');
            return result;
          };
          onload?.call(this, event);
        };
      }
      append.apply(this, nodes);
    };
  }, transition);
};

for (const transition of ['query', 'cleanup', 'private-state', 'disabled'] as const) {
  test(`last-gate ${transition} race never fetches after denial through actual hook and SDK`, async ({
    page,
  }) => {
    await installRaceProbe(page, transition);
    const writes = await serveHarness(page);
    await page.goto(origin);
    await expect
      .poll(() => page.evaluate(() => (window as HarnessWindow).raceProbe.transitioned))
      .toBe(true);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => (window as HarnessWindow).raceProbe.fetchAfterDenial)).toEqual(
      [false]
    );
    expect(writes).toHaveLength(1);
    await probeForbiddenSdkCalls(page);
    await page.waitForTimeout(100);
    expect(writes).toHaveLength(1);
  });
}

test('native observers preserve app storage and history behavior through development StrictMode replay', async ({
  page,
}) => {
  const writes = await serveHarness(page, 700);
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  expect(await page.evaluate(() => window.landingHarness.effectSetups())).toBe(2);
  const results = await page.evaluate(() => {
    const storageResult = localStorage.setItem('existing-auth', 'private-fixture');
    sessionStorage.setItem('iquit-session-fixture', 'untouched');
    const historyResult = history.replaceState({ existing: 'app-state' }, '', '/');
    let historyError = '';
    let storageError = '';
    try {
      history.pushState({}, '', 'https://foreign.example/');
    } catch (error) {
      historyError = error instanceof DOMException ? error.name : 'wrong-error';
    }
    try {
      Storage.prototype.setItem.call(null, 'key', 'value');
    } catch (error) {
      storageError = error instanceof TypeError ? error.name : 'wrong-error';
    }
    return {
      storageResult,
      historyResult,
      historyError,
      storageError,
      state: history.state,
      auth: localStorage.getItem('existing-auth'),
      session: sessionStorage.getItem('iquit-session-fixture'),
    };
  });
  expect(results).toEqual({
    storageResult: undefined,
    historyResult: undefined,
    historyError: 'SecurityError',
    storageError: 'TypeError',
    state: { existing: 'app-state' },
    auth: 'private-fixture',
    session: 'untouched',
  });
  await expect.poll(() => writes.length).toBe(1);
  await probeForbiddenSdkCalls(page);
  await page.waitForTimeout(200);
  expect(writes).toHaveLength(1);
});

for (const transition of [
  'private-state',
  'cleanup',
  'query',
  'push-query',
  'disabled',
  'saved-storage',
] as const) {
  test(`pending ${transition} transition suppresses tracking permanently`, async ({ page }) => {
    const writes = await serveHarness(page, 700);
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(1);
    await page.evaluate((change) => {
      const browser = window as HarnessWindow;
      if (change === 'private-state') {
        browser.landingHarness.render(false);
        browser.landingHarness.render(true);
      }
      if (change === 'cleanup') {
        browser.landingHarness.unmount();
        browser.landingHarness.remount();
      }
      if (change === 'query') {
        history.replaceState({}, '', '/?private=secret');
        history.replaceState({}, '', '/');
      }
      if (change === 'push-query') {
        history.pushState({}, '', '/?private=secret');
        history.replaceState({}, '', '/');
      }
      if (change === 'disabled') {
        localStorage.setItem('umami.disabled', 'true');
        localStorage.removeItem('umami.disabled');
      }
      if (change === 'saved-storage') {
        localStorage.setItem('iquit-media-items', JSON.stringify([{ title: 'Private fixture' }]));
        localStorage.removeItem('iquit-media-items');
      }
    }, transition);
    await expectNoWrites(page, writes);
    await probeForbiddenSdkCalls(page);
    await expectNoWrites(page, writes);
  });
}

for (const source of ['window', 'navigator', 'ms'] as const) {
  for (const value of ['1', 'yes']) {
    test(`independent ${source} DNT ${value} cannot be masked by another source`, async ({
      page,
    }) => {
      await page.addInitScript(
        ({ source, value }) => {
          Object.defineProperty(window, 'doNotTrack', { value: source === 'window' ? value : '0' });
          Object.defineProperty(navigator, 'doNotTrack', {
            value: source === 'navigator' ? value : '0',
          });
          Object.defineProperty(navigator, 'msDoNotTrack', {
            value: source === 'ms' ? value : '0',
          });
        },
        { source, value }
      );
      const writes = await intercept(page);
      await page.goto(origin);
      await expectNoWrites(page, writes);
      await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(0);
    });
  }
}

const savedItem: MediaItem = {
  id: 'fixture-movie',
  title: 'Private Fixture Movie',
  type: 'movie',
  posterPath: null,
  backdropPath: null,
  overview: 'Synthetic private history fixture',
  watchedDate: '2025-01-01',
  watchCount: 1,
};
const savedStats: StatsData = {
  totalWatched: 1,
  movieCount: 1,
  tvCount: 0,
  watchedByDay: { '2025-01-01': 1 },
  watchedByMonth: { '2025-01': 1 },
  watchedByYear: { '2025': 1 },
  mostWatchedShows: [savedItem],
  continueWatchingShows: [],
};
const resumeHistory: NetflixViewingItem[] = [
  { title: 'Private Fixture Movie', date: '2025-01-01' },
  { title: 'Private Pending Movie', date: '2025-01-02' },
];

const seedPrivateState = async (page: Page, resume: boolean) => {
  await page.addInitScript(
    ({ item, stats, history, resume }) => {
      if (resume) {
        localStorage.setItem('iquit-viewing-history', JSON.stringify(history));
        localStorage.setItem('iquit-processed-count', '1');
        localStorage.setItem('iquit-partial-items', JSON.stringify([item]));
        localStorage.setItem('iquit-processing-active', 'true');
      } else {
        localStorage.setItem('iquit-media-items', JSON.stringify([item]));
        localStorage.setItem('iquit-stats', JSON.stringify(stats));
        localStorage.setItem('iquit-data-timestamp', '1735689600000');
      }
    },
    { item: savedItem, stats: savedStats, history: resumeHistory, resume }
  );
};

for (const resume of [false, true]) {
  test(`valid persisted ${resume ? 'resume' : 'saved results'} hydrate and reset without tracking`, async ({
    page,
  }) => {
    await seedPrivateState(page, resume);
    const writes = await intercept(page);
    if (resume)
      await page.route('https://api.themoviedb.org/**', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        await route.abort();
      });
    await page.goto(origin);
    if (resume) {
      await expect(page.getByText('Processing 1 of 2 items', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Content Discovered So Far (1)' })
      ).toBeVisible();
    } else {
      await expect(page.getByRole('heading', { name: 'Viewing Statistics' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Your Viewing History' })).toBeVisible();
    }
    await expect(page.getByText('Private Fixture Movie', { exact: true }).first()).toBeVisible();
    expect(writes).toEqual([]);
    await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start Over' }).click();
    await expect(page.locator('input[type=file]')).toHaveCount(1);
    await expectNoWrites(page, writes);
    await expect(page.locator('script[src="https://stats.mogott.sh/script.js"]')).toHaveCount(0);
  });
}
