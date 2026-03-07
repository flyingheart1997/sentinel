/**
 * Client-side initialization logic moved from index.html to avoid CSP violations.
 */

export function initClient() {
    if (typeof window === 'undefined') return;

    // 1. Theme and Variant Initialization
    try {
        const h = window.location.hostname;
        let v: string | null = null;
        if (h.startsWith('happy.')) v = 'happy';
        else if (h.startsWith('tech.')) v = 'tech';
        else if (h.startsWith('finance.')) v = 'finance';

        if (!v && (h === 'localhost' || h === '127.0.0.1' || ('__TAURI_INTERNALS__' in window) || ('__TAURI__' in window))) {
            v = localStorage.getItem('worldmonitor-variant');
        }

        if (v) document.documentElement.dataset.variant = v;
        else document.documentElement.removeAttribute('data-variant');

        let t = localStorage.getItem('worldmonitor-theme');
        if (t === 'dark' || t === 'light') {
            document.documentElement.dataset.theme = t;
        } else if (v === 'happy') {
            document.documentElement.dataset.theme = 'light';
        }
    } catch (e) {
        console.error('[init] Theme initialization failed:', e);
    }
    document.documentElement.classList.add('no-transition');

    // 2. Favicon Animation
    (function () {
        const favicon = document.getElementById('favicon') as HTMLLinkElement;
        if (!favicon) return;

        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let angle = 0;

        function animate() {
            if (document.hidden) {
                setTimeout(() => requestAnimationFrame(animate), 1000);
                return;
            }

            if (!ctx) return;
            ctx.clearRect(0, 0, 32, 32);
            ctx.save();
            ctx.translate(16, 16);
            ctx.rotate((angle * Math.PI) / 180);
            ctx.font = '24px serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('🌍', 0, 2);
            ctx.restore();

            favicon.href = canvas.toDataURL('image/png');
            angle = (angle + 2) % 360;
            setTimeout(() => requestAnimationFrame(animate), 100);
        }

        setTimeout(animate, 1000);
    })();
}
