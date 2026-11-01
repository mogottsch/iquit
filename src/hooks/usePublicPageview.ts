import { useEffect, useRef } from 'react';

const hostname = 'iquit.moket-home.de';
const website = '7e893579-2c58-4528-9e6f-0bc1eeb74390';
const integrity = 'sha384-ZMxgpYfO/phGz4GiYTIZhcauuGKTb2onmOB5gsiigjmBR38DGAmIna5J1Y/dM/13';
type Pageview = { website: string; hostname: string; url: string; title: string; referrer: string };
type TrackerWindow = Window & {
  umami?: { track: (payload: Pageview) => Promise<void>; identify?: () => Promise<void> };
  doNotTrack?: string | number;
};
const trackerWindow = window as TrackerWindow;
let loading: Promise<void> | undefined;
let sdkTrack: ((payload: Pageview) => Promise<void>) | undefined;
let owner: symbol | undefined;
let sent = false;

const isPublicLocation = () =>
  window.self === window.top &&
  location.origin === `https://${hostname}` &&
  location.pathname === '/' &&
  !location.search &&
  !location.hash;

const permitsTracking = () => {
  try {
    const dnt = [
      trackerWindow.doNotTrack,
      navigator.doNotTrack,
      (navigator as Navigator & { msDoNotTrack?: string | number }).msDoNotTrack,
    ];
    return (
      isPublicLocation() &&
      !dnt.some((value) => ['1', 'yes'].includes(String(value))) &&
      !localStorage.getItem('umami.disabled') &&
      !Object.keys(localStorage).some((key) => key.startsWith('iquit-'))
    );
  } catch {
    return false;
  }
};

let blocked = !permitsTracking();

const publicReferrer = () => {
  try {
    const referrer = new URL(document.referrer);
    return referrer.protocol === 'https:' && !referrer.username && !referrer.password
      ? referrer.origin
      : '';
  } catch {
    return '';
  }
};

const loadTracker = () => {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://stats.mogott.sh/script.js';
    script.async = true;
    script.integrity = integrity;
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    const attributes = {
      'website-id': website,
      domains: hostname,
      'auto-track': 'false',
      'auto-pageview': 'false',
      'do-not-track': 'true',
      'exclude-search': 'true',
      'exclude-hash': 'true',
      'fetch-credentials': 'omit',
      performance: 'false',
    };
    Object.entries(attributes).forEach(([key, value]) => script.setAttribute(`data-${key}`, value));
    script.onload = () => {
      sdkTrack = trackerWindow.umami?.track;
      trackerWindow.umami = {
        track: () => Promise.resolve(),
        identify: () => Promise.resolve(),
      };
      resolve();
    };
    script.onerror = () => {
      script.remove();
      loading = undefined;
      reject(new Error('Analytics unavailable'));
    };
    document.head.append(script);
  });
  return loading;
};

const sendPageview = (isPublic: () => boolean) => {
  const payload = { website, hostname, url: '/', title: 'iQuit', referrer: publicReferrer() };
  if (!sdkTrack || sent || blocked || !isPublic() || !permitsTracking()) return;
  sent = true;
  void sdkTrack(payload);
};

const latchPrivateEntry = () => {
  if (!permitsTracking()) blocked = true;
};

const observeHistory = () => {
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (...args: Parameters<History[typeof method]>) {
      const result = original.apply(this, args);
      latchPrivateEntry();
      return result;
    };
  }
};

const observeStorage = () => {
  const original = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...args: Parameters<Storage['setItem']>) {
    const result = original.apply(this, args);
    try {
      if (this === localStorage) latchPrivateEntry();
    } catch {
      blocked = true;
    }
    return result;
  };
};

observeHistory();
observeStorage();

export const usePublicPageview = (isPublic: boolean, hydrated = true) => {
  const instance = useRef(Symbol('public-landing'));
  const publicState = useRef(isPublic);
  publicState.current = isPublic;
  if (hydrated && !isPublic) blocked = true;
  useEffect(() => {
    if (owner && owner !== instance.current) {
      blocked = true;
      return;
    }
    owner = instance.current;
    if (!hydrated || blocked) return;
    let active = true;
    window.addEventListener('popstate', latchPrivateEntry);
    window.addEventListener('hashchange', latchPrivateEntry);
    window.addEventListener('storage', latchPrivateEntry);
    if (isPublic && !sent && permitsTracking()) {
      void loadTracker()
        .then(() => sendPageview(() => active && publicState.current))
        .catch(() => undefined);
    }
    return () => {
      active = false;
      window.removeEventListener('popstate', latchPrivateEntry);
      window.removeEventListener('hashchange', latchPrivateEntry);
      window.removeEventListener('storage', latchPrivateEntry);
    };
  }, [isPublic, hydrated]);
};
