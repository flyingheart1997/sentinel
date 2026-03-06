import { App } from './App';
import { SITE_VARIANT, setSiteVariant } from './config/variant';
import { clearChunkReloadGuard } from './bootstrap/chunk-reload';
import { clearCaches as clearBootstrapCaches } from './services/bootstrap';
import { clearCaches as clearLiveNewsCaches } from './services/live-news';
import { clearCaches as clearMarketCaches } from './services/market/index';
import { clearCaches as clearInstabilityCaches } from './services/country-instability';
import { clearCaches as clearGeoConvergenceCaches } from './services/geo-convergence';
import { clearCaches as clearTrendingCaches } from './services/trending-keywords';
import { clearCaches as clearRSSCaches } from './services/rss';
import { clearCaches as clearAdvisoryCaches } from './services/security-advisories';
import { initMetaTags } from './services/meta-tags';
import { clearAllBreakerCaches } from './utils/circuit-breaker';

let currentApp: App | null = null;
let chunkReloadStorageKey: string | null = null;

export function setChunkReloadKey(key: string) {
    chunkReloadStorageKey = key;
}

export function updateVariantUI(variant: string) {
    if (variant && variant !== 'full') {
        document.documentElement.dataset.variant = variant;
    } else {
        document.documentElement.removeAttribute('data-variant');
    }

    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(link => {
        if (!link.id || link.id !== 'favicon') {
            link.href = link.href
                .replace(/\/favico\/(tech|finance|happy|full)\/favicon/g, '/favico/favicon')
                .replace(/\/favico\/favicon/g, `/favico/${variant}/favicon`)
                .replace(/\/favico\/(tech|finance|happy|full)\/apple-touch-icon/g, '/favico/apple-touch-icon')
                .replace(/\/favico\/apple-touch-icon/g, `/favico/${variant}/apple-touch-icon`);
        }
    });
}

export async function bootApp() {
    const urlParams = new URL(location.href).searchParams;
    if (urlParams.get('settings') === '1') {
        void Promise.all([import('./services/i18n'), import('./settings-window')]).then(
            async ([i18n, m]) => {
                await i18n.initI18n();
                m.initSettingsWindow();
            }
        );
    } else if (urlParams.get('live-channels') === '1') {
        void Promise.all([import('./services/i18n'), import('./live-channels-window')]).then(
            async ([i18n, m]) => {
                await i18n.initI18n();
                m.initLiveChannelsWindow();
            }
        );
    } else {
        currentApp = new App('app');
        try {
            await currentApp.init();
            if (chunkReloadStorageKey) {
                clearChunkReloadGuard(chunkReloadStorageKey);
            }
        } catch (err) {
            console.error('[Orchestrator] App init failed:', err);
        }
    }
}

export async function switchVariant(newVariant: string) {
    if (newVariant === SITE_VARIANT) return;

    console.log(`[Orchestrator] Switching variant to: ${newVariant}`);

    if (currentApp) {
        currentApp.destroy();
        currentApp = null;
    }

    // 1. Clear global service caches for a clean state
    resetAllServices();

    // 2. Update config and UI
    // Note: We DO NOT set localStorage 'worldmonitor-variant' here.
    // We let the App constructor detect the mismatch and trigger a settings reset.
    setSiteVariant(newVariant);
    updateVariantUI(newVariant);

    const container = document.getElementById('app');
    if (container) container.innerHTML = '';

    await bootApp();
}

function resetAllServices() {
    clearBootstrapCaches();
    clearLiveNewsCaches();
    clearMarketCaches();
    clearInstabilityCaches();
    clearGeoConvergenceCaches();
    clearTrendingCaches();
    clearRSSCaches();
    clearAdvisoryCaches();
    clearAllBreakerCaches();
    initMetaTags(); // Re-evaluates metadata based on the new SITE_VARIANT
}
