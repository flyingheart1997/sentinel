import { t } from '@/services/i18n';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { formatTime } from '@/utils';
import type { ClusteredEvent } from '@/types';

let modalEl: HTMLElement | null = null;

function escHandler(e: KeyboardEvent): void {
    if (e.key === 'Escape') closeNewsDetailModal();
}

export function openNewsDetailModal(cluster: ClusteredEvent): void {
    closeNewsDetailModal();

    modalEl = document.createElement('div');
    // Initially no active class so we can smoothly animate it in
    modalEl.className = 'modal-overlay news-detail-modal-overlay active';

    const topSourcesHtml = cluster.topSources
        .map(s => `<li class="news-detail-source"><strong>${escapeHtml(s.name)}</strong> (Tier ${s.tier})</li>`)
        .join('');

    const catLabel = cluster.threat?.category && cluster.threat.category !== 'general'
        ? `<span class="category-tag">${cluster.threat.category.toUpperCase()}</span>`
        : '';

    modalEl.innerHTML = `
    <div class="modal news-detail-modal">
      <div class="modal-header">
        <span class="modal-title">${t('modals.newsDetail.title') || 'News Details'}</span>
        <button class="modal-close" aria-label="Close">×</button>
      </div>
      <div class="news-detail-content">
        <h2 class="news-detail-title">${escapeHtml(cluster.primaryTitle)}</h2>
        <div class="news-detail-meta">
          <span>${formatTime(cluster.lastUpdated)}</span>
          ${cluster.lang ? `<span> • ${cluster.lang.toUpperCase()}</span>` : ''}
          ${catLabel}
        </div>
        <div class="news-detail-body">
          <p>This event is reported by <strong>${cluster.sourceCount}</strong> source(s).</p>
          <ul class="news-detail-sources-list">
            ${topSourcesHtml}
          </ul>
        </div>
      </div>
      <div class="news-detail-actions">
        <a href="${sanitizeUrl(cluster.primaryLink)}" target="_blank" rel="noopener" class="news-detail-source-btn">
          ${t('modals.newsDetail.openSource') || 'Open Original Source'}
        </a>
      </div>
    </div>
  `;

    modalEl.addEventListener('click', (e) => {
        if (e.target === modalEl) closeNewsDetailModal();
    });
    document.addEventListener('keydown', escHandler);
    modalEl.querySelector('.modal-close')?.addEventListener('click', closeNewsDetailModal);

    document.body.appendChild(modalEl);
}

export function closeNewsDetailModal(): void {
    if (modalEl) {
        modalEl.remove();
        modalEl = null;
        document.removeEventListener('keydown', escHandler);
    }
}
