import { SITE_VARIANT } from '@/config/variant';
import {
  getApiBaseUrl,
  isDesktopRuntime,
  getRemoteApiBaseUrl,
  resolveLocalApiPort,
  getLocalApiPort
} from './runtime-env';
import { tryInvokeTauri } from './tauri-bridge';

const KEYED_CLOUD_API_PATTERN = /^\/api\/(?:[^/]+\/v1\/|bootstrap(?:\?|$)|polymarket(?:\?|$)|ais-snapshot(?:\?|$))/;

export { getApiBaseUrl, isDesktopRuntime, getRemoteApiBaseUrl, resolveLocalApiPort, getLocalApiPort };

export function toRuntimeUrl(path: string): string {
  if (!path.startsWith('/')) {
    return path;
  }

  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return path;
  }

  return `${baseUrl}${path}`;
}

function getApiTargetFromRequestInput(input: RequestInfo | URL): string | null {
  if (typeof input === 'string') {
    if (input.startsWith('http')) return null;
    return input;
  }
  if (input instanceof URL) {
    if (input.origin !== window.location.origin) return null;
    return `${input.pathname}${input.search}${input.hash}`;
  }
  if (input instanceof Request) {
    try {
      const url = new URL(input.url);
      if (url.origin !== window.location.origin) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  }
  return null;
}

function isAbortError(error: unknown): boolean {
  return (error as any)?.name === 'AbortError';
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hasVisibilityApi(): boolean {
  return typeof document !== 'undefined' && typeof document.addEventListener === 'function';
}

function isDocumentHidden(): boolean {
  return typeof document !== 'undefined' && document.hidden;
}

export type SmartPollReason = 'startup' | 'interval' | 'manual' | 'resume';

export interface SmartPollOptions {
  intervalMs: number;
  hiddenMultiplier?: number;
  pauseWhenHidden?: boolean;
  refreshOnVisible?: boolean;
  runImmediately?: boolean;
  shouldRun?: () => boolean;
  onError?: (error: unknown) => void;
  maxBackoffMultiplier?: number;
  jitterFraction?: number;
  minIntervalMs?: number;
  hiddenIntervalMs?: number;
  visibilityDebounceMs?: number;
}

export interface SmartPollLoopHandle {
  stop: () => void;
  trigger: () => void;
  isActive: () => boolean;
}

export function startSmartPollLoop(
  poll: (ctx: { signal?: AbortSignal; reason: SmartPollReason; isHidden: boolean }) => Promise<boolean | void>,
  opts: SmartPollOptions,
): SmartPollLoopHandle {
  const intervalMs = Math.max(10, opts.intervalMs);
  const hiddenMultiplier = Math.max(1, opts.hiddenMultiplier ?? 10);
  const pauseWhenHidden = opts.pauseWhenHidden ?? false;
  const refreshOnVisible = opts.refreshOnVisible ?? true;
  const runImmediately = opts.runImmediately ?? false;
  const shouldRun = opts.shouldRun;
  const onError = opts.onError;
  const maxBackoffMultiplier = Math.max(1, opts.maxBackoffMultiplier ?? 4);
  const jitterFraction = Math.max(0, opts.jitterFraction ?? 0.1);
  const minIntervalMs = Math.max(250, opts.minIntervalMs ?? 1_000);
  const hiddenIntervalMs = opts.hiddenIntervalMs !== undefined
    ? Math.max(minIntervalMs, Math.round(opts.hiddenIntervalMs))
    : undefined;

  const visibilityDebounceMs = Math.max(0, opts.visibilityDebounceMs ?? 300);

  let active = true;
  let timerId: any = null;
  let visibilityDebounceTimer: any = null;
  let inFlight = false;
  let backoffMultiplier = 1;
  let activeController: AbortController | null = null;

  const clearTimer = () => {
    if (!timerId) return;
    clearTimeout(timerId);
    timerId = null;
  };

  const scheduleNext = () => {
    if (!active) return;
    clearTimer();
    const base = isDocumentHidden()
      ? (pauseWhenHidden ? null : (hiddenIntervalMs ?? (intervalMs * hiddenMultiplier)))
      : (intervalMs * backoffMultiplier);

    if (base === null) return;
    timerId = setTimeout(() => {
      timerId = null;
      void runOnce('interval');
    }, Math.max(minIntervalMs, Math.round(base + (Math.random() * 2 - 1) * base * jitterFraction)));
  };

  const runOnce = async (reason: SmartPollReason): Promise<void> => {
    if (!active || inFlight) return;
    if (shouldRun && !shouldRun()) { scheduleNext(); return; }

    inFlight = true;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    activeController = controller;

    try {
      const result = await poll({
        signal: controller?.signal,
        reason,
        isHidden: isDocumentHidden(),
      });
      backoffMultiplier = result === false ? Math.min(backoffMultiplier * 2, maxBackoffMultiplier) : 1;
    } catch (error) {
      if (!controller?.signal.aborted && !isAbortError(error)) {
        backoffMultiplier = Math.min(backoffMultiplier * 2, maxBackoffMultiplier);
        if (onError) onError(error);
      }
    } finally {
      if (activeController === controller) activeController = null;
      inFlight = false;
      scheduleNext();
    }
  };

  const onVisibilityChange = () => {
    if (!active) return;
    if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
    visibilityDebounceTimer = setTimeout(() => {
      visibilityDebounceTimer = null;
      if (!isDocumentHidden() && refreshOnVisible) {
        clearTimer();
        void runOnce('resume');
      } else {
        scheduleNext();
      }
    }, visibilityDebounceMs);
  };

  if (hasVisibilityApi()) document.addEventListener('visibilitychange', onVisibilityChange);
  if (runImmediately) void runOnce('startup');
  else scheduleNext();

  return {
    stop: () => {
      active = false;
      clearTimer();
      if (visibilityDebounceTimer) clearTimeout(visibilityDebounceTimer);
      activeController?.abort();
      if (hasVisibilityApi()) document.removeEventListener('visibilitychange', onVisibilityChange);
    },
    trigger: () => { if (active) { clearTimer(); void runOnce('manual'); } },
    isActive: () => active,
  };
}

function isLocalOnlyApiTarget(target: string): boolean {
  return target.startsWith('/api/local-');
}

function isKeyFreeApiTarget(target: string): boolean {
  return target.startsWith('/api/register-interest');
}

async function fetchLocalWithStartupRetry(
  nativeFetch: typeof window.fetch,
  localUrl: string,
  init?: RequestInit,
): Promise<Response> {
  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await nativeFetch(localUrl, init);
    } catch (error) {
      if (init?.signal?.aborted || attempt === maxAttempts) throw error;
      await sleep(125 * attempt);
    }
  }
  throw new Error('Local API unavailable');
}

const TOKEN_TTL_MS = 5 * 60 * 1000;

export function installRuntimeFetchPatch(): void {
  if (!isDesktopRuntime() || typeof window === 'undefined' || (window as any).__wmFetchPatched) {
    return;
  }

  const nativeFetch = window.fetch.bind(window);
  let localApiToken: string | null = null;
  let tokenFetchedAt = 0;
  let authRetryCooldownUntil = 0;

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const target = getApiTargetFromRequestInput(input);
    if (!target?.startsWith('/api/')) return nativeFetch(input, init);

    const debug = localStorage.getItem('wm-debug-log') === '1';

    // Refresh token if needed
    if (!localApiToken || (Date.now() - tokenFetchedAt > TOKEN_TTL_MS)) {
      try {
        localApiToken = await tryInvokeTauri<string>('get_local_api_token');
        tokenFetchedAt = Date.now();
      } catch {
        localApiToken = null;
        tokenFetchedAt = 0;
      }
    }

    const headers = new Headers(init?.headers);
    if (localApiToken) headers.set('Authorization', `Bearer ${localApiToken}`);

    const localUrl = `${getApiBaseUrl()}${target}`;
    let allowCloudFallback = !isLocalOnlyApiTarget(target);

    if (allowCloudFallback && !isKeyFreeApiTarget(target)) {
      try {
        const { getSecretState, secretsReady } = await import('./runtime-config');
        await Promise.race([secretsReady, new Promise<void>(r => setTimeout(r, 2000))]);
        const wmKeyState = getSecretState('WORLDMONITOR_API_KEY');
        if (!wmKeyState.present || !wmKeyState.valid) allowCloudFallback = false;
      } catch {
        allowCloudFallback = false;
      }
    }

    const cloudFallback = async () => {
      if (!allowCloudFallback) throw new Error(`Cloud fallback blocked for ${target}`);
      const cloudUrl = `${getRemoteApiBaseUrl()}${target}`;
      const cloudHeaders = new Headers(init?.headers);
      if (KEYED_CLOUD_API_PATTERN.test(target)) {
        const { getRuntimeConfigSnapshot } = await import('./runtime-config');
        const wmKeyValue = getRuntimeConfigSnapshot().secrets['WORLDMONITOR_API_KEY']?.value;
        if (wmKeyValue) cloudHeaders.set('X-WorldMonitor-Key', wmKeyValue);
      }
      return nativeFetch(cloudUrl, { ...init, headers: cloudHeaders });
    };

    try {
      let response = await fetchLocalWithStartupRetry(nativeFetch, localUrl, { ...init, headers });
      if (response.status === 401 && localApiToken && Date.now() > authRetryCooldownUntil) {
        try {
          localApiToken = await tryInvokeTauri<string>('get_local_api_token');
          tokenFetchedAt = Date.now();
        } catch { /* ignore */ }
        if (localApiToken) {
          const retryHeaders = new Headers(init?.headers);
          retryHeaders.set('Authorization', `Bearer ${localApiToken}`);
          response = await fetchLocalWithStartupRetry(nativeFetch, localUrl, { ...init, headers: retryHeaders });
          if (response.status === 401) authRetryCooldownUntil = Date.now() + 60_000;
        }
      }
      if (!response.ok && allowCloudFallback) return cloudFallback();
      return response;
    } catch (error) {
      if (!allowCloudFallback) throw error;
      return cloudFallback();
    }
  };

  (window as any).__wmFetchPatched = true;
}

export function installWebApiRedirect(): void {
  if (isDesktopRuntime() || typeof window === 'undefined' || (window as any).__wmWebRedirectPatched) return;
  const API_BASE = getRemoteApiBaseUrl();
  if (!API_BASE) return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let target: string | null = null;
    if (typeof input === 'string' && input.startsWith('/api/')) target = input;
    else if (input instanceof URL && input.origin === window.location.origin && input.pathname.startsWith('/api/')) target = `${input.pathname}${input.search}`;
    else if (input instanceof Request) {
      const u = new URL(input.url);
      if (u.origin === window.location.origin && u.pathname.startsWith('/api/')) target = `${u.pathname}${u.search}`;
    }

    if (target) {
      try {
        const resp = await nativeFetch(`${API_BASE}${target}`, init);
        if (![404, 405, 501, 502, 503].includes(resp.status)) return resp;
      } catch { /* ignore and fallback */ }
    }
    return nativeFetch(input, init);
  };

  (window as any).__wmWebRedirectPatched = true;
}
