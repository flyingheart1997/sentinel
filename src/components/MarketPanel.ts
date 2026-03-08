import { Panel } from './Panel';
import { t } from '@/services/i18n';
import type { MarketData, CryptoData } from '@/types';
import { formatPrice, formatChange, getChangeClass, getHeatmapClass } from '@/utils';
import { escapeHtml } from '@/utils/sanitize';
import { miniSparkline } from '@/utils/sparkline';
import {
  getMarketWatchlistEntries,
  parseMarketWatchlistInput,
  resetMarketWatchlist,
  setMarketWatchlistEntries,
} from '@/services/market-watchlist';

export class MarketPanel extends Panel {
  private settingsBtn: HTMLButtonElement | null = null;
  private overlay: HTMLElement | null = null;

  constructor() {
    super({ id: 'markets', title: t('panels.markets') });
    this.createSettingsButton();
  }

  private createSettingsButton(): void {
    this.settingsBtn = document.createElement('button');
    this.settingsBtn.className = 'live-news-settings-btn';
    this.settingsBtn.title = 'Customize market watchlist';
    this.settingsBtn.textContent = 'Watchlist';
    this.settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openWatchlistModal();
    });
    this.header.appendChild(this.settingsBtn);
  }

  private openWatchlistModal(): void {
    if (this.overlay) return;

    const current = getMarketWatchlistEntries();
    const currentText = current.length
      ? current.map((e) => (e.name ? `${e.symbol}|${e.name}` : e.symbol)).join('\n')
      : '';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.id = 'marketWatchlistModal';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.closeWatchlistModal();
    });

    const modal = document.createElement('div');
    modal.className = 'modal unified-settings-modal cyber-bracket-modal';
    modal.style.maxWidth = '680px';
    modal.style.padding = '24px'; /* Adds more breathing room */

    modal.innerHTML = `
      <div class="modal-header" style="border-bottom:none; margin-bottom: 20px;">
        <span class="modal-title" style="letter-spacing: 1px; color: var(--text-primary);">MARKET WATCHLIST</span>
        <button class="modal-close" aria-label="Close" style="font-size: 24px; line-height: 1; padding: 0 4px; border:none; background:none; cursor:pointer;">&times;</button>
      </div>
      <div style="padding:0px">
        <div style="color:var(--text-dim);font-size:12px;line-height:1.4;margin-bottom:12px">
          Add extra tickers (comma or newline separated). Friendly labels supported: SYMBOL|Label.<br/>
          Example: TSLA|Tesla, AAPL|Apple, ^GSPC|S&P 500<br/>
          Tip: keep it under ~30 unless you enjoy scrolling.
        </div>
        <textarea id="wmMarketWatchlistInput"
          style="width:100%;min-height:140px;resize:vertical;background:var(--overlay-medium);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:12px;font-family:inherit;font-size:13px;outline:none"
          spellcheck="false"></textarea>
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:16px">
          <button type="button" class="panels-reset-layout" id="wmMarketResetBtn">RESET</button>
          <button type="button" class="panels-reset-layout" id="wmMarketCancelBtn">CANCEL</button>
          <button type="button" class="panels-reset-layout" id="wmMarketSaveBtn" style="border-color:var(--text-dim);color:var(--text)">SAVE</button>
        </div>
      </div>
    `;

    const closeBtn = modal.querySelector('.modal-close') as HTMLButtonElement | null;
    closeBtn?.addEventListener('click', () => this.closeWatchlistModal());

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    this.overlay = overlay;

    const input = modal.querySelector<HTMLTextAreaElement>('#wmMarketWatchlistInput');
    if (input) input.value = currentText;

    modal.querySelector<HTMLButtonElement>('#wmMarketCancelBtn')?.addEventListener('click', () => this.closeWatchlistModal());
    modal.querySelector<HTMLButtonElement>('#wmMarketResetBtn')?.addEventListener('click', () => {
      resetMarketWatchlist();
      if (input) input.value = ''; // defaults are always included automatically
      this.closeWatchlistModal();
    });
    modal.querySelector<HTMLButtonElement>('#wmMarketSaveBtn')?.addEventListener('click', () => {
      const raw = input?.value || '';
      const parsed = parseMarketWatchlistInput(raw);
      if (parsed.length === 0) resetMarketWatchlist();
      else setMarketWatchlistEntries(parsed);
      this.closeWatchlistModal();
    });
  }

  private closeWatchlistModal(): void {
    if (!this.overlay) return;
    this.overlay.remove();
    this.overlay = null;
  }

  public renderMarkets(data: MarketData[], rateLimited?: boolean): void {
    if (data.length === 0) {
      this.showError(rateLimited ? t('common.rateLimitedMarket') : t('common.failedMarketData'));
      return;
    }

    const html = data
      .map(
        (stock) => `
      <div class="market-item">
        <div class="market-info">
          <span class="market-name cy-text-highlight">${escapeHtml(stock.name)}</span>
          <span class="market-symbol cy-text-mono">${escapeHtml(stock.display)}</span>
        </div>
        <div class="market-data">
          ${miniSparkline(stock.sparkline, stock.change)}
          <span class="market-price cy-text-mono">${formatPrice(stock.price!)}</span>
          <span class="market-change cy-text-mono ${getChangeClass(stock.change!)}">${formatChange(stock.change!)}</span>
        </div>
      </div>
    `
      )
      .join('');

    this.setContent(html);
  }
}

export class HeatmapPanel extends Panel {
  constructor() {
    super({ id: 'heatmap', title: t('panels.heatmap') });
  }

  public renderHeatmap(data: Array<{ name: string; change: number | null }>): void {
    const validData = data.filter((d) => d.change !== null);

    if (validData.length === 0) {
      this.showError(t('common.failedSectorData'));
      return;
    }

    const html =
      '<div class="heatmap">' +
      validData
        .map(
          (sector) => `
        <div class="heatmap-cell ${getHeatmapClass(sector.change!)}">
          <div class="sector-name cy-text-mono">${escapeHtml(sector.name)}</div>
          <div class="sector-change cy-text-mono ${getChangeClass(sector.change!)}">${formatChange(sector.change!)}</div>
        </div>
      `
        )
        .join('') +
      '</div>';

    this.setContent(html);
  }
}

export class CommoditiesPanel extends Panel {
  constructor() {
    super({ id: 'commodities', title: t('panels.commodities') });
  }

  public renderCommodities(data: Array<{ display: string; price: number | null; change: number | null; sparkline?: number[] }>): void {
    const validData = data.filter((d) => d.price !== null);

    if (validData.length === 0) {
      this.showError(t('common.failedCommodities'));
      return;
    }

    const html =
      '<div class="commodities-grid">' +
      validData
        .map(
          (c) => `
        <div class="commodity-item">
          <div class="commodity-name cy-text-mono">${escapeHtml(c.display)}</div>
          ${miniSparkline(c.sparkline, c.change, 60, 18)}
          <div class="commodity-price cy-text-mono">${formatPrice(c.price!)}</div>
          <div class="commodity-change cy-text-mono ${getChangeClass(c.change!)}">${formatChange(c.change!)}</div>
        </div>
      `
        )
        .join('') +
      '</div>';

    this.setContent(html);
  }
}

export class CryptoPanel extends Panel {
  constructor() {
    super({ id: 'crypto', title: t('panels.crypto') });
  }

  public renderCrypto(data: CryptoData[]): void {
    if (data.length === 0) {
      this.showError(t('common.failedCryptoData'));
      return;
    }

    const html = data
      .map(
        (coin) => `
      <div class="market-item">
        <div class="market-info">
          <span class="market-name cy-text-highlight">${escapeHtml(coin.name)}</span>
          <span class="market-symbol cy-text-mono">${escapeHtml(coin.symbol)}</span>
        </div>
        <div class="market-data">
          ${miniSparkline(coin.sparkline, coin.change)}
          <span class="market-price cy-text-mono">$${coin.price.toLocaleString()}</span>
          <span class="market-change cy-text-mono ${getChangeClass(coin.change)}">${formatChange(coin.change)}</span>
        </div>
      </div>
    `
      )
      .join('');

    this.setContent(html);
  }
}
