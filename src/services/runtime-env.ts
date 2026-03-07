/**
 * Core environment detection and API URL logic to avoid circular dependencies.
 */
import { SITE_VARIANT } from '@/config/variant';

const WS_API_URL = import.meta.env.VITE_WS_API_URL || '';
const DEFAULT_LOCAL_API_PORT = 46123;
const FORCE_DESKTOP_RUNTIME = import.meta.env.VITE_DESKTOP_RUNTIME === '1';

const DEFAULT_REMOTE_HOSTS: Record<string, string> = {
    tech: WS_API_URL,
    full: WS_API_URL,
    finance: WS_API_URL,
    world: WS_API_URL,
    happy: WS_API_URL,
};

let _resolvedPort: number | null = null;
let _portPromise: Promise<number> | null = null;

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/\/$/, '');
}

type RuntimeProbe = {
    hasTauriGlobals: boolean;
    userAgent: string;
    locationProtocol: string;
    locationHost: string;
    locationOrigin: string;
};

export function detectDesktopRuntime(probe: RuntimeProbe): boolean {
    const tauriInUserAgent = probe.userAgent.includes('Tauri');
    const secureLocalhostOrigin = (
        probe.locationProtocol === 'https:' && (
            probe.locationHost === 'localhost' ||
            probe.locationHost.startsWith('localhost:') ||
            probe.locationHost === '127.0.0.1' ||
            probe.locationHost.startsWith('127.0.0.1:')
        )
    );

    const tauriLikeLocation = (
        probe.locationProtocol === 'tauri:' ||
        probe.locationProtocol === 'asset:' ||
        probe.locationHost === 'tauri.localhost' ||
        probe.locationHost.endsWith('.tauri.localhost') ||
        probe.locationOrigin.startsWith('tauri://') ||
        secureLocalhostOrigin
    );

    return probe.hasTauriGlobals || tauriInUserAgent || tauriLikeLocation;
}

export function isDesktopRuntime(): boolean {
    if (FORCE_DESKTOP_RUNTIME) return true;
    if (typeof window === 'undefined') return false;

    return detectDesktopRuntime({
        hasTauriGlobals: '__TAURI_INTERNALS__' in window || '__TAURI__' in window,
        userAgent: window.navigator?.userAgent ?? '',
        locationProtocol: window.location?.protocol ?? '',
        locationHost: window.location?.host ?? '',
        locationOrigin: window.location?.origin ?? '',
    });
}

export async function resolveLocalApiPort(): Promise<number> {
    if (_resolvedPort !== null) return _resolvedPort;
    if (_portPromise) return _portPromise;

    _portPromise = (async () => {
        try {
            const { tryInvokeTauri } = await import('./tauri-bridge');
            const port = await tryInvokeTauri<number>('get_local_api_port');
            if (port && port > 0) {
                _resolvedPort = port;
                return port;
            }
        } catch {
            // Ignore
        } finally {
            _portPromise = null;
        }
        return DEFAULT_LOCAL_API_PORT;
    })();
    return _portPromise;
}

export function getLocalApiPort(): number {
    return _resolvedPort ?? DEFAULT_LOCAL_API_PORT;
}

export function getApiBaseUrl(): string {
    if (!isDesktopRuntime()) {
        return '';
    }

    const configuredBaseUrl = import.meta.env.VITE_TAURI_API_BASE_URL;
    if (configuredBaseUrl) {
        return normalizeBaseUrl(configuredBaseUrl);
    }

    return `http://127.0.0.1:${getLocalApiPort()}`;
}

export function getRemoteApiBaseUrl(): string {
    const configuredRemoteBase = import.meta.env.VITE_TAURI_REMOTE_API_BASE_URL;
    if (configuredRemoteBase) {
        return normalizeBaseUrl(configuredRemoteBase);
    }

    const fromHosts = DEFAULT_REMOTE_HOSTS[SITE_VARIANT] ?? DEFAULT_REMOTE_HOSTS.full ?? '';
    if (fromHosts) return fromHosts;

    // Desktop builds may not set VITE_WS_API_URL; default to production.
    if (isDesktopRuntime()) return 'https://worldmonitor.app';
    return '';
}
