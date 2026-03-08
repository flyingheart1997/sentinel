import { t } from '@/services/i18n';
import { escapeHtml, sanitizeUrl } from '@/utils/sanitize';
import { getCSSColor } from '@/utils';
import {
  Hotspot,
  NewsItem,
  ConflictZone,
  MilitaryBase,
  NaturalEvent,
  NuclearFacility,
  EconomicCenter,
  Pipeline,
  UnderseaCable,
  Port,
  Spaceport,
  Earthquake,
  InternetOutage,
  AIDataCenter,
  AisDisruptionEvent,
  SocialUnrestEvent,
  MilitaryFlight,
  MilitaryVessel,
  MilitaryFlightCluster,
  MilitaryVesselCluster,
  CriticalMineralProject,
  CyberThreat,
  APTGroup,
  StrategicWaterway,
  GammaIrradiator,
} from '@/types';
import { fetchHotspotContext, type GdeltArticle } from '@/services/gdelt-intel';

interface StockExchangePopupData {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  tier: string;
  marketCap?: number;
  tradingHours?: string;
  timezone?: string;
  description?: string;
}

interface FinancialCenterPopupData {
  id: string;
  name: string;
  city: string;
  country: string;
  type: string;
  gfciRank?: number;
  specialties?: string[];
  description?: string;
}

interface CentralBankPopupData {
  id: string;
  name: string;
  shortName: string;
  city: string;
  country: string;
  type: string;
  currency?: string;
  description?: string;
}

interface CommodityHubPopupData {
  id: string;
  name: string;
  city: string;
  country: string;
  type: string;
  commodities?: string[];
  description?: string;
}

interface DatacenterClusterData {
  items: AIDataCenter[];
  region: string;
  country: string;
  count?: number;
  totalChips?: number;
  totalPowerMW?: number;
  existingCount?: number;
  plannedCount?: number;
  sampled?: boolean;
}

interface TechEventPopupData {
  id: string;
  title: string;
  location: string;
  lat: number;
  lng: number;
  country: string;
  startDate: string;
  endDate: string;
  url: string | null;
  daysUntil: number;
}

interface TechHQClusterData {
  items: any[];
  city: string;
  country: string;
  count?: number;
  faangCount?: number;
  unicornCount?: number;
  publicCount?: number;
  sampled?: boolean;
}

interface TechEventClusterData {
  items: TechEventPopupData[];
  location: string;
  country: string;
  count?: number;
  soonCount?: number;
  sampled?: boolean;
}
import type { StartupHub, Accelerator, TechHQ, CloudRegion } from '@/config/tech-geo';
import { getHotspotEscalation } from '@/services/hotspot-escalation';
import type { WeatherAlert } from '@/services/weather';
import { getNaturalEventIcon } from '@/services/eonet';
import type { IranEvent } from '@/services/conflict';
import type { AirportDelayAlert, PositionSample } from '@/services/aviation';
import type { ClimateAnomaly } from '@/services/climate';

export type SidePanelType =
  | 'hotspot'
  | 'conflict'
  | 'base'
  | 'nuclear'
  | 'datacenter'
  | 'cable'
  | 'pipeline'
  | 'protest'
  | 'cyber'
  | 'natural'
  | 'maritime'
  | 'sanctions'
  | 'protestCluster'
  | 'techHQCluster'
  | 'techEventCluster'
  | 'datacenterCluster'
  | 'startupHubCluster'
  | 'cloudRegionCluster'
  | 'acceleratorCluster'
  | 'stockExchangeCluster'
  | 'financialCenterCluster'
  | 'centralBankCluster'
  | 'commodityHubCluster'
  | 'militaryFlightCluster'
  | 'militaryVesselCluster'
  | 'iranEvent'
  | 'militaryVessel'
  | 'militaryFlight'
  | 'satellite'
  | 'earthquake'
  | 'weather'
  | 'outage'
  | 'cyberThreat'
  | 'apt'
  | 'port'
  | 'spaceport'
  | 'economic'
  | 'natEvent'
  | 'gulfInvestment'
  | 'stockExchange'
  | 'financialCenter'
  | 'centralBank'
  | 'commodityHub'
  | 'internetOutage'
  | 'techHQ'
  | 'techEvent'
  | 'accelerator'
  | 'startupHub'
  | 'cloudRegion'
  | 'mineral'
  | 'ais'
  | 'gpsJamming'
  | 'cable-advisory'
  | 'climateAnomaly'
  | 'repair-ship'
  | 'irradiator'
  | 'waterway'
  | 'flight'
  | 'aircraft'
  | 'techActivity'
  | 'geoActivity'
  | 'fire'
  | 'ucdp'
  | 'displacement'
  | 'tradeRoute'
  | 'tradeChokepoint'
  | 'positiveEvent'
  | 'kindness'
  | 'happiness'
  | 'cii'
  | 'species'
  | 'renewable'
  | 'news'
  | 'feedPanel';

interface GpsJammingPopupData {
  h3: string;
  lat: number;
  lon: number;
  level: 'medium' | 'high';
  pct: number;
  good: number;
  bad: number;
  total: number;
}

// Consolidated clusters

export interface SidePanelData {
  type: SidePanelType;
  data: any;
  relatedNews?: NewsItem[];
  onFocus?: () => void;
  renderCallback?: (contentEl: HTMLElement, footerEl: HTMLElement) => void;
  onClose?: () => void;
}

export class MapSidePanel {
  private container: HTMLElement;
  private panel: HTMLElement | null = null;
  private isOpen = false;
  private currentData: SidePanelData | null = null;
  private boundFeedPanelHandler!: EventListener;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init(): void {
    this.panel = document.createElement('div');
    this.panel.className = 'map-side-panel cy-panel';
    this.panel.innerHTML = `
      <div class="map-side-panel-header cy-panel-header">
        <div class="map-side-panel-title-area">
          <span class="map-side-panel-type cy-badge" id="side-panel-type"></span>
          <h2 class="map-side-panel-title cy-panel-title" id="side-panel-title"></h2>
        </div>
        <button class="map-side-panel-close" id="side-panel-close" aria-label="Close">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="map-side-panel-content cy-panel-body cy-scrollable" id="side-panel-content"></div>
      <div class="map-side-panel-footer" id="side-panel-footer"></div>
    `;

    this.container.appendChild(this.panel);
    this.panel.querySelector('#side-panel-close')?.addEventListener('click', () => this.hide());

    this.boundFeedPanelHandler = ((e: CustomEvent<SidePanelData>) => {
      this.show(e.detail);
    }) as EventListener;
    window.addEventListener('wm:open-feed-panel', this.boundFeedPanelHandler);
  }

  public show(data: SidePanelData): void {
    console.log('data', data);

    // Only open the panel if there's meaningful data to display
    if (!this.hasEnoughData(data)) return;

    // IMPORTANT: If we are replacing an existing panel that had an onClose (like a teleported feed), invoke it now!
    if (this.currentData && this.currentData.onClose && this.currentData !== data) {
      this.currentData.onClose();
    }

    this.currentData = data;
    this.updateContent();

    if (!this.isOpen) {
      this.panel?.classList.add('visible');
      this.isOpen = true;
    }
  }

  /** Returns true only if the entity has enough data to justify opening a detail panel */
  private hasEnoughData(data: SidePanelData): boolean {
    const d = data.data;
    if (!d) return false;

    const isCluster = data.type.toLowerCase().includes('cluster');
    const isClimate = data.type === 'climateAnomaly';
    const isEvent = data.type === 'natEvent' || data.type === 'weather' || data.type === 'fire' || data.type === 'ucdp' || data.type === 'positiveEvent' || data.type === 'kindness' || data.type === 'news' || data.type === 'earthquake' || data.type === 'maritime' || data.type === 'conflict' || data.type === 'feedPanel';

    // Must have a name or title as the minimum (or region for clusters/climate)
    // Or company/provider for tech layers, or city for clusters
    if (!d.name && !d.title && !d.region && !d.company && !d.provider && !d.city && !d.place && !d.magnitude && !isClimate && !isEvent && data.type !== 'happiness' && data.type !== 'cii') return false;

    // For cluster types with count, only open if count === 1 (single item), UNLESS it's a cluster type
    if (
      'count' in d &&
      typeof d.count === 'number' &&
      d.count > 1 &&
      !isCluster &&
      !isEvent &&
      data.type !== 'techEvent' // TechEvents might have count: 1 from cluster logic
    ) {
      return false;
    }

    // Check if there is any meaningful body content beyond just the name
    const hasBodyData =
      !!(d.description || d.subtext || d.whyItMatters ||
        d.country || d.type || d.severity || d.status ||
        d.items || d.tempDelta || d.company || d.provider || d.city ||
        d.capacityTbps || d.owners || d.rfsYear || d.operator || d.capacity ||
        d.magnitude || d.depth || d.deaths_best || d.place ||
        isCluster || isClimate || isEvent);

    return hasBodyData;

    return hasBodyData;
  }

  public hide(): void {
    if (this.isOpen) {
      if (this.currentData?.onClose) {
        this.currentData.onClose();
      }
      this.panel?.classList.remove('visible');
      this.isOpen = false;
      this.currentData = null;
    }
  }

  public destroy(): void {
    this.hide();
    window.removeEventListener('wm:open-feed-panel', this.boundFeedPanelHandler);
    if (this.panel) {
      this.panel.remove();
      this.panel = null;
    }
  }

  public isVisible(): boolean {
    return this.isOpen;
  }

  public getSelectedId(): string | null {
    if (!this.currentData?.data) return null;
    const id = this.currentData.data.id || this.currentData.data._id || this.currentData.data.code;
    if (!id) return null;
    return `${this.currentData.type}:${id}`;
  }

  private getElements(): { titleEl: HTMLElement; typeEl: HTMLElement; contentEl: HTMLElement; footerEl: HTMLElement } {
    return {
      titleEl: this.panel!.querySelector('#side-panel-title') as HTMLElement,
      typeEl: this.panel!.querySelector('#side-panel-type') as HTMLElement,
      contentEl: this.panel!.querySelector('#side-panel-content') as HTMLElement,
      footerEl: this.panel!.querySelector('#side-panel-footer') as HTMLElement,
    };
  }

  /** Generate a simulation-style badge pill for severity/status/category */
  private badge(text: string, forcedVariant?: string): string {
    const val = (text || 'unknown').toLowerCase().trim();
    const variant = forcedVariant || (
      val === 'critical' || val === 'extreme' ? 'critical' :
        val === 'high' || val === 'severe' || val === 'major' ? 'high' :
          val === 'medium' || val === 'moderate' || val === 'elevated' ? 'medium' :
            val === 'low' || val === 'minor' ? 'low' :
              val === 'active' || val === 'operational' || val === 'online' ? 'active' :
                val === 'inactive' || val === 'decommissioned' || val === 'offline' || val === 'closed' ? 'inactive' :
                  'default'
    );
    return `<span class="sp-badge cy-badge cy-badge-${variant}">${escapeHtml(text.toUpperCase())}</span>`;
  }

  private updateContent(): void {
    if (!this.panel || !this.currentData) return;

    // Fast track reset - if an old Feed Panel is currently occupying contentEl, we must reset it.
    // wait, we handled it when hiding. However, if a user clicks another map entity while feed is open,
    // updateContent is called directly without hide()!
    // We handled that by calling onClose from the PREVIOUS data if we had it but wait, in show() we overwrite this.currentData!
    const { type, data, relatedNews } = this.currentData;
    const { typeEl, titleEl, contentEl, footerEl } = this.getElements();

    // Reset content
    contentEl.innerHTML = '';
    footerEl.innerHTML = '';

    // Ensure visibility of elements (some cases might hide them)
    typeEl.style.display = '';
    typeEl.className = 'map-side-panel-type cy-badge'; // Restore default class
    footerEl.style.display = '';

    switch (type) {
      case 'feedPanel':
        this.renderFeedPanel(data, contentEl, footerEl, this.currentData.renderCallback);
        break;
      case 'hotspot':
        this.renderHotspot(data, relatedNews);
        break;
      case 'conflict':
        this.renderConflict(data);
        break;
      case 'base':
        this.renderBase(data);
        break;
      case 'cable':
        this.renderCable(data);
        break;
      case 'pipeline':
        this.renderPipeline(data);
        break;
      case 'natural':
      case 'natEvent':
        this.renderNaturalEvent(data);
        break;
      case 'earthquake':
        this.renderEarthquake(data);
        break;
      case 'weather':
        this.renderWeather(data);
        break;
      case 'outage':
        this.renderOutage(data);
        break;
      case 'cyberThreat':
        this.renderCyberThreat(data);
        break;
      case 'apt':
        this.renderAPT(data);
        break;
      case 'protest':
        this.renderProtest(data);
        break;
      case 'protestCluster':
        this.renderProtestCluster(data);
        break;
      case 'iranEvent':
        this.renderIranEvent(data);
        break;
      case 'nuclear':
        this.renderNuclear(data);
        break;
      case 'economic':
        this.renderEconomic(data);
        break;
      case 'port':
        this.renderPort(data);
        break;
      case 'spaceport':
        this.renderSpaceport(data);
        break;
      case 'stockExchange':
        this.renderStockExchange(data);
        break;
      case 'stockExchangeCluster':
        this.renderGenericCluster(data, 'EXCHANGE CLUSTER');
        break;
      case 'financialCenter':
        this.renderFinancialCenter(data);
        break;
      case 'financialCenterCluster':
        this.renderGenericCluster(data, 'FINANCIAL CLUSTER');
        break;
      case 'centralBank':
        this.renderCentralBank(data);
        break;
      case 'centralBankCluster':
        this.renderGenericCluster(data, 'BANK CLUSTER');
        break;
      case 'commodityHub':
        this.renderCommodityHub(data);
        break;
      case 'commodityHubCluster':
        this.renderGenericCluster(data, 'COMMODITY CLUSTER');
        break;
      case 'climateAnomaly':
        this.renderClimateAnomaly(data);
        break;
      case 'datacenter':
        this.renderDatacenter(data);
        break;
      case 'datacenterCluster':
        this.renderDatacenterCluster(data);
        break;
      case 'startupHub':
        this.renderStartupHub(data);
        break;
      case 'startupHubCluster':
        this.renderStartupHubCluster(data);
        break;
      case 'cloudRegion':
        this.renderCloudRegion(data);
        break;
      case 'cloudRegionCluster':
        this.renderGenericCluster(data, 'CLOUD CLUSTER');
        break;
      case 'techHQ':
        this.renderTechHQ(data);
        break;
      case 'techHQCluster':
        this.renderTechHQCluster(data);
        break;
      case 'accelerator':
        this.renderAccelerator(data);
        break;
      case 'acceleratorCluster':
        this.renderGenericCluster(data, 'ACCELERATOR CLUSTER');
        break;
      case 'techEvent':
        this.renderTechEvent(data);
        break;
      case 'techEventCluster':
        this.renderTechEventCluster(data);
        break;
      case 'militaryFlight':
        this.renderMilitaryFlight(data);
        break;
      case 'militaryFlightCluster':
        this.renderMilitaryFlightCluster(data);
        break;
      case 'militaryVessel':
        this.renderMilitaryVessel(data);
        break;
      case 'militaryVesselCluster':
        this.renderMilitaryVesselCluster(data);
        break;
      case 'techActivity':
        this.renderTechActivity(data);
        break;
      case 'geoActivity':
        this.renderGeoActivity(data);
        break;
      case 'maritime':
        this.renderMaritime(data);
        break;
      case 'internetOutage':
        this.renderInternetOutage(data);
        break;
      case 'waterway':
        this.renderWaterway(data);
        break;
      case 'ais':
        this.renderAisDisruption(data);
        break;
      case 'gpsJamming':
        this.renderGpsJamming(data);
        break;
      case 'satellite':
        this.renderSatellite(data);
        break;
      case 'irradiator':
        this.renderIrradiator(data);
        break;
      case 'cable-advisory':
        this.renderCableAdvisory(data);
        break;
      case 'repair-ship':
        this.renderRepairShip(data);
        break;
      case 'mineral':
        this.renderMineral(data);
        break;
      case 'fire':
        this.renderFire(data);
        break;
      case 'flight':
        this.renderFlightDelay(data);
        break;
      case 'aircraft':
        this.renderAircraft(data);
        break;
      default:
        typeEl.textContent = (type || 'INFO').toUpperCase();
        titleEl.textContent = data.name || data.title || 'Details';
        contentEl.innerHTML = `<div class="map-side-panel-section"><p class="map-side-panel-description">${escapeHtml(data.description || data.subtext || '')}</p></div>`;
    }
  }

  private renderFeedPanel(data: any, contentEl: HTMLElement, footerEl: HTMLElement, renderCallback?: Function): void {
    const { typeEl, titleEl } = this.getElements();

    // Show descriptive text instead of a strict badge
    typeEl.style.display = '';
    typeEl.className = 'map-side-panel-type text-muted';
    typeEl.textContent = 'DASHBOARD PANEL';

    footerEl.style.display = 'none';

    titleEl.textContent = data.title;
    contentEl.classList.add('map-side-panel-feed-content');
    if (renderCallback) {
      renderCallback(contentEl, footerEl);
    } else {
      contentEl.innerHTML = data.html || '';
    }
  }

  private renderHotspot(hotspot: Hotspot, relatedNews?: NewsItem[]): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'HOTSPOT';
    titleEl.textContent = hotspot.name;

    const dynamicScore = getHotspotEscalation(hotspot.id);
    const displayScore = dynamicScore?.combinedScore ?? hotspot.escalationScore ?? 3;

    const color = displayScore >= 4 ? getCSSColor('--semantic-critical') :
      displayScore >= 3 ? getCSSColor('--semantic-high') :
        getCSSColor('--semantic-normal');

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <p class="map-side-panel-description">${escapeHtml(hotspot.description || hotspot.subtext || '')}</p>
      </div>

      <div class="map-side-panel-section">
        <div class="map-side-panel-tel-row">
          <div class="map-side-panel-tel-header">
            <span>Escalation Index</span>
            <span style="color: ${color}">${displayScore.toFixed(1)} / 5.0</span>
          </div>
          <div class="map-side-panel-tel-bar">
            <div class="map-side-panel-tel-fill" style="width: ${(displayScore / 5) * 100}%; background: ${color}; box-shadow: 0 0 8px ${color}"></div>
          </div>
        </div>
      </div>

      ${dynamicScore ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Factor Breakdown</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${this.renderEscalationBar('News Activity', dynamicScore.components.newsActivity ?? 0, '#ef4444')}
          ${this.renderEscalationBar('CII Impact', dynamicScore.components.ciiContribution ?? 0, '#f97316')}
          ${this.renderEscalationBar('Geo-Convergence', dynamicScore.components.geoConvergence ?? 0, '#3b82f6')}
          ${this.renderEscalationBar('Military Activity', dynamicScore.components.militaryActivity ?? 0, '#ef4444')}
        </div>
      </div>
      ` : ''}

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Critical Indicators</h3>
        <ul class="map-side-panel-list">
          ${(hotspot.escalationIndicators || []).map((ind: string) => `<li>${escapeHtml(ind)}</li>`).join('')}
        </ul>
      </div>

      ${hotspot.history ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Historical Context</h3>
        <div class="map-side-panel-meta-grid">
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Last Major Event</span>
            <span class="map-side-panel-meta-value">${escapeHtml(hotspot.history.lastMajorEvent || 'N/A')}</span>
          </div>
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Date</span>
            <span class="map-side-panel-meta-value">${escapeHtml(hotspot.history.lastMajorEventDate || 'N/A')}</span>
          </div>
          <div class="map-side-panel-meta-item" style="grid-column: span 2;">
            <span class="map-side-panel-meta-label">Cyclical Risk</span>
            <span class="map-side-panel-meta-value">${escapeHtml(hotspot.history.cyclicalRisk || 'None noted')}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Why It Matters</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(hotspot.whyItMatters || '')}</p>
      </div>

      ${hotspot.agencies ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Active Agencies</h3>
        <div class="sp-badge-row">
          ${hotspot.agencies.map((a: string) => this.badge(a, 'info')).join('')}
        </div>
      </div>
      ` : ''}

      <div class="map-side-panel-section hotspot-gdelt-context">
        <h3 class="map-side-panel-section-title">Live Intel</h3>
        <div class="map-side-panel-loading">${t('common.loading')}...</div>
      </div>
      
      ${this.renderNewsSection(relatedNews)}
    `;

    void this.loadHotspotGdeltContext(hotspot);
  }

  private renderEscalationBar(label: string, value: number, color: string): string {
    const pct = Math.min(100, Math.max(0, value));
    return `
      <div class="map-side-panel-tel-row">
        <div class="map-side-panel-tel-header">
          <span>${escapeHtml(label)}</span>
          <span style="color: ${color}">${Math.round(pct)}%</span>
        </div>
        <div class="map-side-panel-tel-bar">
          <div class="map-side-panel-tel-fill" style="width: ${pct}%; background: ${color}; box-shadow: 0 0 5px ${color}"></div>
        </div>
      </div>
    `;
  }

  private renderConflict(zone: ConflictZone): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'CONFLICT ZONE';
    titleEl.textContent = zone.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(zone.intensity || 'medium', zone.intensity === 'high' ? 'critical' : 'medium')}
          ${this.badge('active')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(zone.description || 'Regional conflict monitoring.')}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Casualties</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-critical)">${escapeHtml(zone.casualties || 'Unknown')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Displaced</span>
          <span class="map-side-panel-meta-value">${escapeHtml(zone.displaced || 'Unknown')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Started</span>
          <span class="map-side-panel-meta-value">${escapeHtml(zone.startDate || 'Unknown')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(zone.location || 'N/A')}</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Active Parties</h3>
        <div class="sp-badge-row">
          ${(zone.parties || []).map(p => this.badge(p, 'default')).join('')}
        </div>
      </div>

      ${zone.keyDevelopments ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Key Developments</h3>
        <ul class="map-side-panel-list">
          ${zone.keyDevelopments.map(d => `<li>${escapeHtml(d)}</li>`).join('')}
        </ul>
      </div>
      ` : ''}
    `;
  }

  private renderBase(base: MilitaryBase): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'MILITARY BASE';
    titleEl.textContent = base.name;

    const enriched = base as any;
    const categories: string[] = [];
    if (enriched.catAirforce) categories.push('Air Force');
    if (enriched.catNaval) categories.push('Naval');
    if (enriched.catNuclear) categories.push('Nuclear');
    if (enriched.catSpace) categories.push('Space');
    if (enriched.catTraining) categories.push('Training');

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Operational Brief</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(base.description || 'Strategic military installation.')}</p>
        ${enriched.kind ? `<p class="map-side-panel-description" style="opacity:0.7;font-size:0.9em;margin-top:4px">${escapeHtml(enriched.kind.replace(/_/g, ' '))}</p>` : ''}
        <div class="sp-badge-row">
          ${base.type ? this.badge(base.type, 'info') : ''}
          ${base.country ? this.badge(base.country, 'default') : ''}
        </div>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(base.country || 'International')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Type</span>
          <span class="map-side-panel-meta-value">${this.badge(base.type || 'Facility', 'info')}</span>
        </div>
        ${base.arm ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Branch</span>
          <span class="map-side-panel-meta-value">${escapeHtml(base.arm)}</span>
        </div>` : ''}
        ${categories.length > 0 ? `
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Capabilities</span>
          <span class="map-side-panel-meta-value">${escapeHtml(categories.join(', '))}</span>
        </div>` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Coordinates</span>
          <span class="map-side-panel-meta-value">${base.lat.toFixed(3)}°, ${base.lon.toFixed(3)}°</span>
        </div>
      </div>
    `;
  }

  private renderCable(cable: UnderseaCable): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'UNDERSEA CABLE';
    titleEl.textContent = cable.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Global Connectivity Backbone</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(cable.name)} is a major subsea telecommunications link.</p>
        <div class="sp-badge-row">
          ${this.badge('active')}
          ${cable.major ? this.badge('critical-path', 'critical') : ''}
        </div>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Capacity</span>
          <span class="map-side-panel-meta-value">${cable.capacityTbps} Tbps</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">RFS Year</span>
          <span class="map-side-panel-meta-value">${cable.rfsYear || 'Unknown'}</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Owners & Consortium</h3>
        <ul class="map-side-panel-list">
          ${(Array.isArray(cable.owners) ? cable.owners : [cable.owners || 'Global Consortium']).map(o => `<li>${escapeHtml(String(o))}</li>`).join('')}
        </ul>
      </div>

      ${cable.landingPoints ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Strategic Landing Points</h3>
        <ul class="map-side-panel-list">
          ${cable.landingPoints.map(lp => `<li><strong>${escapeHtml(lp.city || 'Unknown')}</strong>, ${escapeHtml(lp.countryName)}</li>`).join('')}
        </ul>
      </div>
      ` : ''}

      ${cable.countriesServed ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Bandwidth Allocation</h3>
        <div class="map-side-panel-tel-list">
          ${cable.countriesServed.sort((a, b) => b.capacityShare - a.capacityShare).map(cs => `
            <div class="map-side-panel-tel-row">
              <div class="map-side-panel-tel-header">
                <span>${escapeHtml(cs.country)}</span>
                <span style="color: var(--loader-cyan)">${(cs.capacityShare * 100).toFixed(1)}%</span>
              </div>
              <div class="map-side-panel-tel-bar" style="height: 4px;">
                <div class="map-side-panel-tel-fill" style="width: ${cs.capacityShare * 100}%; background: var(--loader-cyan);"></div>
              </div>
              ${cs.isRedundant ? '<span style="font-size: 0.7em; opacity: 0.6; margin-top: 2px;">Redundant Connection</span>' : ''}
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    `;
  }

  private renderPipeline(pipeline: Pipeline): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'ENERGY PIPELINE';
    titleEl.textContent = pipeline.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Pipeline Overview</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">Critical energy transport infrastructure.</p>
        <div class="sp-badge-row">
          ${this.badge(pipeline.type || 'Oil/Gas', 'info')}
          ${this.badge(String(pipeline.status || 'unknown'))}
        </div>
        <h3 class="map-side-panel-section-title">Critical Energy Node</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">Major ${escapeHtml(pipeline.type || 'energy')} transport link.</p>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Status</span>
          <span class="map-side-panel-meta-value">${this.badge(String(pipeline.status || 'Unknown'))}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Fuel Type</span>
          <span class="map-side-panel-meta-value">${escapeHtml(pipeline.type || 'Unknown')}</span>
        </div>
        ${pipeline.capacityMbpd ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Capacity (Oil)</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${pipeline.capacityMbpd} Mbpd</span>
        </div>
        ` : ''}
        ${pipeline.capacityBcmY ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Capacity (Gas)</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${pipeline.capacityBcmY} Bcm/y</span>
        </div>
        ` : ''}
        ${pipeline.transitCountries?.length ? `
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Transit Network</span>
          <span class="map-side-panel-meta-value">${pipeline.transitCountries.join(' → ')}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  private renderNaturalEvent(event: NaturalEvent): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    const icon = getNaturalEventIcon(event.category || '');
    typeEl.textContent = 'NATURAL EVENT';
    titleEl.textContent = event.title;

    const timeAgo = this.getTimeAgo(event.date);

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div style="font-size: 48px; margin-bottom: 16px; text-align: center; filter: drop-shadow(0 0 10px rgba(0,255,255,0.3))">${icon}</div>
        <div class="sp-badge-row" style="justify-content: center; margin-bottom: 16px;">
          ${this.badge(event.closed ? 'closed' : 'active')}
          ${this.badge(event.categoryTitle || 'EVENT', 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(event.description || '')}</p>
      </div>
      
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Reported</span>
          <span class="map-side-panel-meta-value">${timeAgo}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Coordinates</span>
          <span class="map-side-panel-meta-value">${event.lat.toFixed(2)}°, ${event.lon.toFixed(2)}°</span>
        </div>
        ${event.magnitude ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Magnitude</span>
          <span class="map-side-panel-meta-value">${event.magnitude}${event.magnitudeUnit ? ` ${escapeHtml(event.magnitudeUnit)}` : ''}</span>
        </div>
        ` : ''}
        ${event.sourceName ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Source</span>
          <span class="map-side-panel-meta-value">${escapeHtml(event.sourceName)}</span>
        </div>
        ` : ''}
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Analysis</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml((event as any).whyItMatters || event.description || 'Global monitoring of this active region.')}</p>
      </div>

      ${event.sourceUrl ? `
      <div class="map-side-panel-section">
        <a href="${sanitizeUrl(event.sourceUrl)}" target="_blank" class="map-side-panel-btn map-side-panel-btn-primary">View Source ${escapeHtml(event.sourceName || '')}</a>
      </div>
      ` : ''}
    `;
  }

  private renderEarthquake(eq: Earthquake): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'SEISMIC EVENT';
    titleEl.textContent = eq.place;

    const severity = eq.magnitude >= 6 ? 'critical' : eq.magnitude >= 5 ? 'high' : 'medium';
    const timeAgo = this.getTimeAgo(eq.time);

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div style="font-size: 32px; font-weight: 800; color: var(--semantic-critical); text-align: center; margin-bottom: 8px;">M${eq.magnitude.toFixed(1)}</div>
        <div class="sp-badge-row" style="justify-content: center; margin-bottom: 16px;">
          ${this.badge(severity)}
          <span class="sp-badge cy-badge cy-badge-info">EARTHQUAKE</span>
        </div>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Time</span>
          <span class="map-side-panel-meta-value">${timeAgo}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Depth</span>
          <span class="map-side-panel-meta-value">${eq.depth.toFixed(1)} km</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Latitude</span>
          <span class="map-side-panel-meta-value">${eq.lat.toFixed(3)}°</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Longitude</span>
          <span class="map-side-panel-meta-value">${eq.lon.toFixed(3)}°</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Geological Context</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">Significant seismic activity detected at a depth of ${eq.depth.toFixed(1)}km. Monitoring for aftershocks and secondary risks.</p>
      </div>

      <div class="map-side-panel-section">
        <a href="${sanitizeUrl(eq.url)}" target="_blank" class="map-side-panel-btn map-side-panel-btn-primary">View USGS Details</a>
      </div>
    `;
  }

  private renderWeather(alert: WeatherAlert): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'WEATHER ALERT';
    titleEl.textContent = alert.event;

    const severity = alert.severity.toLowerCase();
    const expires = this.getTimeUntil(alert.expires);
    const alertAny = alert as any;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(severity)}
          ${alertAny.urgency ? this.badge(alertAny.urgency.toUpperCase(), 'info') : ''}
          ${alertAny.certainty ? this.badge(alertAny.certainty.toUpperCase(), 'default') : ''}
        </div>
        <p class="map-side-panel-title" style="font-size: 16px; margin-bottom: 8px;">${escapeHtml(alert.headline)}</p>
        <p class="map-side-panel-description">${escapeHtml(alert.description)}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Expires In</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${expires}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Affected Area</span>
          <span class="map-side-panel-meta-value">${escapeHtml(alert.areaDesc)}</span>
        </div>
      </div>

      ${alertAny.instruction ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Emergency Instructions</h3>
        <p class="map-side-panel-description" style="color: #facc15; border-left: 2px solid #facc15; padding-left: 10px;">${escapeHtml(alertAny.instruction)}</p>
      </div>
      ` : ''}
    `;
  }

  private renderOutage(outage: InternetOutage): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'INTERNET OUTAGE';
    titleEl.textContent = outage.country;

    const severity = outage.severity.toLowerCase();
    const timeAgo = this.getTimeAgo(outage.pubDate);

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(severity)}
          ${this.badge('DISRUPTION', 'info')}
        </div>
        <p class="map-side-panel-title" style="font-size: 16px; margin-bottom: 8px;">${escapeHtml(outage.title)}</p>
        <p class="map-side-panel-description">${escapeHtml(outage.description)}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Reported</span>
          <span class="map-side-panel-meta-value">${timeAgo}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Cause</span>
          <span class="map-side-panel-meta-value">${escapeHtml(outage.cause || 'Under investigation')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Status</span>
          <span class="map-side-panel-meta-value">${this.badge(outage.endDate ? 'resolved' : 'active')}</span>
        </div>
      </div>

      ${outage.categories?.length ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Categories</h3>
        <div class="sp-badge-row">
          ${outage.categories.map(c => this.badge(c, 'default')).join('')}
        </div>
      </div>
      ` : ''}

      <div class="map-side-panel-section">
        <a href="${sanitizeUrl(outage.link)}" target="_blank" class="map-side-panel-btn map-side-panel-btn-primary">Read Full Report</a>
      </div>
    `;
  }

  private renderCyberThreat(threat: CyberThreat): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'CYBER THREAT';
    titleEl.textContent = threat.indicator;

    const severity = threat.severity.toLowerCase();
    const typeLabel = threat.type.replace(/_/g, ' ').toUpperCase();
    const sourceLabels: Record<string, string> = {
      feodo: 'Feodo Tracker',
      urlhaus: 'URLhaus',
      c2intel: 'C2 Intel Feeds',
      otx: 'AlienVault OTX',
      abuseipdb: 'AbuseIPDB',
    };

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(severity)}
          ${this.badge(threat.indicatorType.toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-title" style="font-size: 16px; margin-bottom: 8px;">${escapeHtml(typeLabel)}</p>
        <p class="map-side-panel-description">Malicious activity detected targeting global infrastructure. Source: ${sourceLabels[threat.source] || threat.source}.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Indicator</span>
          <span class="map-side-panel-meta-value" style="font-family: monospace; color: var(--semantic-high)">${escapeHtml(threat.indicator)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Country</span>
          <span class="map-side-panel-meta-value">${escapeHtml(threat.country || 'Unknown')}</span>
        </div>
        ${threat.malwareFamily ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Malware</span>
          <span class="map-side-panel-meta-value">${escapeHtml(threat.malwareFamily)}</span>
        </div>
        ` : ''}
        ${threat.lastSeen ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Last Seen</span>
          <span class="map-side-panel-meta-value">${this.getTimeAgo(threat.lastSeen)}</span>
        </div>
        ` : ''}
      </div>

      ${threat.tags?.length ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Threat Tags</h3>
        <div class="sp-badge-row">
          ${threat.tags.map(tag => `<span class="sp-badge cy-badge cy-badge-default">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      ` : ''}
    `;
  }

  private renderAPT(apt: APTGroup): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'APT GROUP';
    titleEl.textContent = apt.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('critical')}
          ${this.badge('NATION STATE', 'info')}
        </div>
        <p class="map-side-panel-title" style="font-size: 16px; margin-bottom: 8px;">Alias: ${escapeHtml(apt.aka)}</p>
        <p class="map-side-panel-description">Advanced Persistent Threat (APT) group with suspected nation-state sponsorship. Known for high-complexity cyber operations.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Sponsor</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${escapeHtml(apt.sponsor)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Operating Origin</span>
          <span class="map-side-panel-meta-value">${apt.lat.toFixed(1)}°, ${apt.lon.toFixed(1)}°</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Strategic Assessment</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">Persistent monitoring of infrastructure targets and infiltration patterns associated with this entity. Extreme caution advised for critical systems.</p>
      </div>
    `;
  }

  private renderProtest(event: SocialUnrestEvent): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'SOCIAL UNREST';
    titleEl.textContent = event.eventType.replace(/_/g, ' ').toUpperCase();

    const severity = event.severity.toLowerCase();
    const timeAgo = this.getTimeAgo(event.time);
    const icon = event.eventType === 'riot' ? '🔥' : event.eventType === 'strike' ? '✊' : '📢';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div style="font-size: 48px; margin-bottom: 16px; text-align: center;">${icon}</div>
        <div class="sp-badge-row" style="justify-content: center; margin-bottom: 16px;">
          ${this.badge(severity)}
          ${event.validated ? `<span class="sp-badge cy-badge cy-badge-success">VERIFIED</span>` : ''}
        </div>
        <p class="map-side-panel-title" style="font-size: 16px; margin-bottom: 8px; text-align: center;">${event.city ? `${escapeHtml(event.city)}, ` : ''}${escapeHtml(event.country)}</p>
        <p class="map-side-panel-description">${escapeHtml(event.title)}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Date</span>
          <span class="map-side-panel-meta-value">${timeAgo}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Source</span>
          <span class="map-side-panel-meta-value">${event.sourceType.toUpperCase()}</span>
        </div>
        ${event.fatalities ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Fatalities</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-critical)">${event.fatalities}</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Status</span>
          <span class="map-side-panel-meta-value">${this.badge(event.validated ? 'active' : 'unverified')}</span>
        </div>
      </div>

      ${event.actors?.length ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Involved Actors</h3>
        <p class="map-side-panel-description">${event.actors.map(a => escapeHtml(a)).join(', ')}</p>
      </div>
      ` : ''}

      ${event.tags?.length ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Context Tags</h3>
        <div class="sp-badge-row">
          ${event.tags.map(t => `<span class="sp-badge cy-badge cy-badge-default">${escapeHtml(t)}</span>`).join('')}
        </div>
      </div>
      ` : ''}
    `;
  }

  private renderGenericCluster(data: any, label: string = 'CLUSTER'): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = label;
    titleEl.textContent = data.city || data.country || data.location || 'Multiple Locations';

    const items = data.items || [];
    const totalCount = data.count || items.length;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          <span class="sp-badge cy-badge cy-badge-info">${totalCount} ${label}</span>
        </div>
        <p class="map-side-panel-description">Multiple entities detected in this vicinity.</p>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Encountered Items</h3>
        <div class="cluster-list">
          ${items.slice(0, 15).map((item: any) => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(item.name || item.title || item.company || 'Unknown')}</div>
              <div class="cluster-item-meta">${escapeHtml(item.city || item.country || item.region || '')}</div>
            </div>
          `).join('')}
          ${totalCount > 15 ? `<p class="cluster-more">+ ${totalCount - 15} more items in cluster</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderTechActivity(data: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();
    typeEl.textContent = 'TECH ACTIVITY';
    titleEl.textContent = data.name || data.city || 'Strategic Insight';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(data.type?.toUpperCase() || 'INSIGHT', 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(data.description || 'Monitoring regional technology trends, investments, and ecosystem growth.')}</p>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Category</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.category || 'Technology')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.city || data.country || 'Global')}</span>
        </div>
      </div>
    `;
  }

  private renderGeoActivity(data: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();
    typeEl.textContent = 'GEO ACTIVITY';
    titleEl.textContent = data.title || data.name || 'Alert Context';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(data.severity || 'medium')}
          ${this.badge('GEOPOLITICAL', 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(data.description || 'Geopolitical and geographic activity alert affecting regional stability.')}</p>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Alert Type</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.type || 'Activity')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Status</span>
          <span class="map-side-panel-meta-value">${this.badge(data.status || 'Active')}</span>
        </div>
      </div>
    `;
  }

  private renderMaritime(data: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();
    typeEl.textContent = 'MARITIME ALERT';
    titleEl.textContent = data.name || data.title || 'Marine Tracking';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(data.severity || 'medium')}
          <span class="sp-badge cy-badge cy-badge-info">AIS TRACKING</span>
        </div>
        <p class="map-side-panel-description">${escapeHtml(data.description || 'Monitoring maritime traffic, AIS disruptions, and navigation alerts.')}</p>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Vessel Class</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.vesselClass || 'Merchant')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Anomaly</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${escapeHtml(data.anomaly || 'None')}</span>
        </div>
      </div>
    `;
  }

  private renderInternetOutage(data: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();
    typeEl.textContent = 'NETWORK OUTAGE';
    titleEl.textContent = data.country || data.location || 'Global Internet';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(data.status === 'down' ? 'critical' : 'medium')}
          <span class="sp-badge cy-badge cy-badge-info">CABLE HEALTH</span>
        </div>
        <p class="map-side-panel-description">${escapeHtml(data.description || 'Internet connectivity disruption detected via global monitoring probes.')}</p>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Impact Score</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-critical)">${data.impactScore}%</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.location || 'Multiple')}</span>
        </div>
      </div>
    `;
  }

  private renderStartupHubCluster(data: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'TECH HUB CLUSTER';
    titleEl.textContent = data.country || 'Global Tech Hubs';

    const items = data.items || [];
    const totalCount = data.count || items.length;
    const megaCount = items.filter((h: any) => h.tier === 'mega').length;
    const majorCount = items.filter((h: any) => h.tier === 'major').length;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          <span class="sp-badge cy-badge cy-badge-info">${totalCount} HUBS</span>
          ${megaCount > 0 ? `<span class="sp-badge cy-badge cy-badge-warning">${megaCount} MEGA</span>` : ''}
        </div>
        <p class="map-side-panel-description">Aggregated data for ${totalCount} technology startup hubs across the region.</p>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Hub Distribution</h3>
        <div class="map-side-panel-meta-grid">
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Mega Hubs (🦄)</span>
            <span class="map-side-panel-meta-value" style="color: var(--semantic-warning)">${megaCount}</span>
          </div>
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Major Hubs (🚀)</span>
            <span class="map-side-panel-meta-value" style="color: var(--semantic-info)">${majorCount}</span>
          </div>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Hubs in Cluster</h3>
        <div class="cluster-list">
          ${items.slice(0, 15).map((h: any) => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(h.name)}</div>
              <div class="cluster-item-meta">${escapeHtml(h.city || h.country)} • ${h.tier.toUpperCase()}</div>
            </div>
          `).join('')}
          ${totalCount > 15 ? `<p class="cluster-more">+ ${totalCount - 15} more hubs in cluster</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderProtestCluster(data: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'EVENT CLUSTER';
    titleEl.textContent = data.country || 'Regional Events';

    const items = data.items || [];
    const totalCount = data.count || items.length;
    const highSeverity = data.highSeverityCount || items.filter((e: any) => e.severity === 'high').length;
    const totalFatalities = data.totalFatalities || items.reduce((sum: number, e: any) => sum + (e.fatalities || 0), 0);

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(highSeverity > 0 ? 'high' : 'medium')}
          <span class="sp-badge cy-badge cy-badge-info">${totalCount} EVENTS</span>
        </div>
        <p class="map-side-panel-description">${totalCount} active social unrest events detected in this region.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">High Severity</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${highSeverity}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Total Fatalities</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-critical)">${totalFatalities}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Region</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.region || data.country)}</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Recent Events</h3>
        <div class="cluster-list">
          ${items.slice(0, 15).map((e: any) => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(e.title || e.event_type || 'Social Unrest')}</div>
              <div class="cluster-item-meta">${escapeHtml(e.city || e.location || e.country)} • ${this.getTimeAgo(e.time)}</div>
            </div>
          `).join('')}
          ${totalCount > 15 ? `<p class="cluster-more">+ ${totalCount - 15} more events in region</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderIranEvent(ev: IranEvent): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'INTEL ALERT';
    titleEl.textContent = ev.title;

    const timeAgo = this.getTimeAgo(ev.timestamp);
    const severity = ev.severity?.toLowerCase() || 'medium';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(severity)}
          ${ev.category ? this.badge(ev.category, 'info') : ''}
        </div>
        <p class="map-side-panel-description">${escapeHtml(ev.category || 'Strategic event monitoring.')}</p>
      </div>
      
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(ev.locationName)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Time</span>
          <span class="map-side-panel-meta-value">${timeAgo}</span>
        </div>
      </div>
      
      ${(ev as any).relatedEvents?.length ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Related Activity</h3>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(ev as any).relatedEvents.slice(0, 5).map((r: any) => `
            <div style="background: rgba(255, 255, 255, 0.03); padding: 8px; border-radius: 4px; border-left: 2px solid var(--border-strong);">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                <span class="cy-badge cy-badge-${r.severity === 'high' ? 'high' : 'medium'}" style="font-size: 9px;">${r.severity.toUpperCase()}</span>
                <span style="font-size: 10px; opacity: 0.6;">${this.getTimeAgo(r.timestamp)}</span>
              </div>
              <div style="font-size: 12px; line-height: 1.3;">${escapeHtml(r.title)}</div>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      ${ev.sourceUrl ? `
        <div class="map-side-panel-section">
          <a href="${sanitizeUrl(ev.sourceUrl)}" target="_blank" class="map-side-panel-btn map-side-panel-btn-primary">View Source Intelligence</a>
        </div>
      ` : ''}
    `;
  }

  private renderNuclear(facility: NuclearFacility): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'NUCLEAR FACILITY';
    titleEl.textContent = facility.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Facility Overview</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(facility.operator || 'Strategic Nuclear Site')} · ${escapeHtml(facility.type?.toUpperCase() || 'INFRASTRUCTURE')}</p>
        <div class="sp-badge-row">
          ${this.badge(facility.status || 'unknown')}
          ${facility.type ? this.badge(facility.type, 'info') : ''}
        </div>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Status</span>
          <span class="map-side-panel-meta-value">${this.badge(facility.status || 'unknown')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Operator</span>
          <span class="map-side-panel-meta-value">${escapeHtml(facility.operator || 'Unknown')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml((facility as any).country || 'Regional')}</span>
        </div>
      </div>
    `;
  }

  private renderEconomic(center: EconomicCenter): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'ECONOMIC HUB';
    titleEl.textContent = center.name;

    const marketStatus = center.marketHours ? this.getMarketStatus(center.marketHours) : null;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('strategic')}
          ${this.badge(center.country.toUpperCase(), 'info')}
          ${marketStatus ? this.badge(marketStatus.toUpperCase(), marketStatus === 'open' ? 'active' : 'low') : ''}
        </div>
        <h3 class="map-side-panel-section-title">Economic Overview</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(center.description || 'Key global economic driver and strategic trade node.')}</p>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Country</span>
          <span class="map-side-panel-meta-value">${escapeHtml(center.country || 'International')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Importance</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-success)">STRATEGIC</span>
        </div>
        ${center.marketHours ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Trading Hours</span>
          <span class="map-side-panel-meta-value">${escapeHtml(center.marketHours.open)} - ${escapeHtml(center.marketHours.close)}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  private renderMilitaryFlightCluster(cluster: MilitaryFlightCluster): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'FLIGHT CLUSTER';
    titleEl.textContent = cluster.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(cluster.activityType || 'patrol')}
          <span class="sp-badge cy-badge cy-badge-info">${cluster.flightCount} AIRCRAFT</span>
        </div>
        <p class="map-side-panel-description">Strategic military aviation cluster detected. Activity: ${escapeHtml(cluster.activityType?.toUpperCase() || 'UNKNOWN')}.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Primary Operator</span>
          <span class="map-side-panel-meta-value">${cluster.dominantOperator?.toUpperCase() || 'MULTI-NATIONAL'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Asset Count</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${cluster.flightCount}</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Tracked Assets</h3>
        <div class="cluster-list">
          ${cluster.flights.slice(0, 15).map(f => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(f.callsign)}</div>
              <div class="cluster-item-meta">${escapeHtml(f.aircraftType)} • ${escapeHtml(f.operator)}</div>
            </div>
          `).join('')}
          ${cluster.flightCount > 15 ? `<p class="cluster-more">+ ${cluster.flightCount - 15} more aircraft</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderMilitaryVesselCluster(cluster: MilitaryVesselCluster): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'VESSEL CLUSTER';
    titleEl.textContent = cluster.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(cluster.activityType || 'transit')}
          <span class="sp-badge cy-badge cy-badge-info">${cluster.vesselCount} VESSELS</span>
        </div>
        <p class="map-side-panel-description">Naval formation or task force group. Zone: ${escapeHtml(cluster.region || 'INTERNATIONAL WATERS')}.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Activity Type</span>
          <span class="map-side-panel-meta-value">${cluster.activityType?.toUpperCase() || 'UNKNOWN'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Asset Count</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${cluster.vesselCount}</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Formation Assets</h3>
        <div class="cluster-list">
          ${cluster.vessels.slice(0, 15).map(v => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(v.name)}</div>
              <div class="cluster-item-meta">${escapeHtml(v.vesselType)} • ${escapeHtml(v.operator)}</div>
            </div>
          `).join('')}
          ${cluster.vesselCount > 15 ? `<p class="cluster-more">+ ${cluster.vesselCount - 15} more vessels</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderPort(port: Port): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'MARITIME PORT';
    titleEl.textContent = port.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(port.type.toUpperCase(), 'info')}
          ${port.rank ? this.badge('RANK #' + port.rank, 'high') : ''}
        </div>
        <h3 class="map-side-panel-section-title">Port Overview</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">Critical maritime logistics hub specializing in ${escapeHtml(port.type)} operations.</p>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Classification</span>
          <span class="map-side-panel-meta-value">${port.type.toUpperCase()}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Country</span>
          <span class="map-side-panel-meta-value">${escapeHtml(port.country || 'Unknown')}</span>
        </div>
        ${port.rank ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">World Rank</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">#${port.rank}</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Operational Notes</span>
          <span class="map-side-panel-meta-value">${escapeHtml(port.note || 'Nominal status.')}</span>
        </div>
      </div>
    `;
  }

  private renderSpaceport(port: Spaceport): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'SPACEPORT';
    titleEl.textContent = port.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(port.status)}
          ${this.badge(port.country.toUpperCase(), 'info')}
          ${this.badge(port.launches.toUpperCase() + ' ACTIVITY', 'default')}
        </div>
        <h3 class="map-side-panel-section-title">Orbital Facility Profile</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">Strategic space access facility operated by ${escapeHtml(port.operator)}.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Operator</span>
          <span class="map-side-panel-meta-value">${escapeHtml(port.operator)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Launch Frequency</span>
          <span class="map-side-panel-meta-value">${port.launches.toUpperCase()}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Status</span>
          <span class="map-side-panel-meta-value">${this.badge(port.status)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Missions</span>
          <span class="map-side-panel-meta-value">${escapeHtml(port.launches.charAt(0).toUpperCase() + port.launches.slice(1))} Launch Cadence</span>
        </div>
      </div>
    `;
  }

  private renderStockExchange(data: StockExchangePopupData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'STOCK EXCHANGE';
    titleEl.textContent = data.name;

    const parts = (data.tradingHours || '09:00-16:00').split('-');
    const openHours: string = parts[0] || '09:00';
    const closeHours: string = parts[1] || '16:00';

    const status = data.tradingHours ? this.getMarketStatus({
      open: openHours,
      close: closeHours,
      timezone: data.timezone || 'UTC'
    }) : 'unknown';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(status.toUpperCase(), status === 'open' ? 'active' : 'low')}
          ${this.badge(data.tier.toUpperCase() + ' TIER', 'info')}
        </div>
        <h3 class="map-side-panel-section-title">Global Securities Venue</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(data.description || 'Major global securities and derivatives marketplace.')}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Symbol</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${escapeHtml(data.shortName)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Market Status</span>
          <span class="map-side-panel-meta-value">${this.badge(status.toUpperCase(), status === 'open' ? 'active' : 'low')}</span>
        </div>
        ${data.marketCap ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Market Cap (USD)</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-success)">$${(data.marketCap / 1e12).toFixed(1)}T</span>
        </div>
        ` : ''}
        ${data.tradingHours ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Session</span>
          <span class="map-side-panel-meta-value">${data.tradingHours} (${data.timezone})</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Base Currency</span>
          <span class="map-side-panel-meta-value">${escapeHtml((data as any).currency || 'USD')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">City</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.city)}</span>
        </div>
      </div>
    `;
  }

  private renderFinancialCenter(data: FinancialCenterPopupData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'FINANCIAL HUB';
    titleEl.textContent = data.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('strategic')}
          ${this.badge(data.type.toUpperCase(), 'info')}
          ${data.gfciRank ? this.badge('GFCI #' + data.gfciRank, 'high') : ''}
        </div>
        <h3 class="map-side-panel-section-title">Strategic Financial Hub</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(data.description || 'Primary global node for capital markets and financial services.')}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        ${data.gfciRank ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Global Rank</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">#${data.gfciRank} (GFCI)</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Primary Class</span>
          <span class="map-side-panel-meta-value">${data.type.toUpperCase()}</span>
        </div>
        ${data.specialties?.length ? `
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Domain Specialties</span>
          <span class="map-side-panel-meta-value">${data.specialties.join(' • ')}</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Operational Center</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.city)}, ${escapeHtml(data.country)}</span>
        </div>
      </div>
    `;
  }

  private renderCentralBank(data: CentralBankPopupData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'CENTRAL BANK';
    titleEl.textContent = data.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('sovereign')}
          ${this.badge(data.currency || 'FX', 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(data.description || 'Monetary authority and central financial regulator.')}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Currency</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.currency || 'N/A')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Headquarters</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.city)}, ${escapeHtml(data.country)}</span>
        </div>
      </div>
    `;
  }

  private renderCommodityHub(data: CommodityHubPopupData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'COMMODITY HUB';
    titleEl.textContent = data.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge('COMMODITIES', 'info')}
        </div>
        <h3 class="map-side-panel-section-title">Resource Trading Hub</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">${escapeHtml(data.description || 'Major global center for physical and derivative commodity trading.')}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Primary Commodities</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${data.commodities?.join(', ') || 'Various Global Commodities'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Market Center</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.city)}, ${escapeHtml(data.country)}</span>
        </div>
      </div>
    `;
  }

  private renderDatacenter(dc: AIDataCenter): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'DATA CENTER';
    titleEl.textContent = dc.name;

    const statusBadge = dc.status === 'existing' ? 'active' : dc.status === 'planned' ? 'elevated' : 'inactive';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(statusBadge)}
          ${this.badge((dc.owner || 'Unknown').toUpperCase(), 'info')}
          ${dc.sector ? this.badge(dc.sector, 'default') : ''}
        </div>
        <p class="map-side-panel-description">${dc.note ? escapeHtml(dc.note) : 'High-performance computing and AI infrastructure site.'}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Owner</span>
          <span class="map-side-panel-meta-value">${escapeHtml(dc.owner || 'Unknown')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(dc.country)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Accelerator</span>
          <span class="map-side-panel-meta-value" style="color: var(--loader-cyan)">${escapeHtml(dc.chipType || 'Unknown')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Chip Count</span>
          <span class="map-side-panel-meta-value" style="color: var(--loader-cyan)">${dc.chipCount?.toLocaleString() || 'N/A'}</span>
        </div>
        ${dc.powerMW ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Power Profile</span>
          <span class="map-side-panel-meta-value">${dc.powerMW} MW</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Status</span>
          <span class="map-side-panel-meta-value">${dc.status?.toUpperCase() || 'UNKNOWN'}</span>
        </div>
      </div>
    `;
  }

  private renderDatacenterCluster(data: DatacenterClusterData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = t('modals.search.types.datacenter') + ' ' + t('components.deckgl.tooltip.flightCluster').toUpperCase().split(' ')[1]; // Extract 'CLUSTER' if possible or just use 'CLUSTER'
    titleEl.textContent = data.region;

    const totalCount = data.count || data.items.length;
    const totalChips = data.totalChips || data.items.reduce((sum: number, item: AIDataCenter) => sum + item.chipCount, 0);

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(totalCount + ' ' + t('countryBrief.infra.datacenter').toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">${t('modals.story.generating') === 'Generating story...' ? 'Regional cluster of high-density data centers supporting global compute demand.' : 'Regional cluster of high-density data centers.'}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Aggregate Compute</span>
          <span class="map-side-panel-meta-value">${(totalChips / 1e6).toFixed(1)}M H100 Eq.</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Regional Power</span>
          <span class="map-side-panel-meta-value">${data.totalPowerMW?.toFixed(0) || 'N/A'} MW</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Facilities in Cluster</h3>
        <div class="cluster-list">
          ${data.items.slice(0, 15).map((item: any) => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(item.name)}</div>
              <div class="cluster-item-meta">${escapeHtml(item.city || item.country)} • ${item.chipCount.toLocaleString()} H100s</div>
            </div>
          `).join('')}
          ${totalCount > 15 ? `<p class="cluster-more">+ ${totalCount - 15} more facilities in cluster</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderStartupHub(hub: StartupHub): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'STARTUP HUB';
    titleEl.textContent = hub.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(hub.tier === 'mega' ? 'high' : 'medium')}
          ${this.badge(hub.tier.toUpperCase() + ' HUB', 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(hub.description || 'Vibrant ecosystem for technology innovation and venture capital.')}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">City</span>
          <span class="map-side-panel-meta-value">${escapeHtml(hub.city)}</span>
        </div>
        ${hub.unicorns ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Unicorns</span>
          <span class="map-side-panel-meta-value" style="color: var(--loader-cyan)">${hub.unicorns}+</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Tier</span>
          <span class="map-side-panel-meta-value">${hub.tier.toUpperCase()}</span>
        </div>
      </div>
    `;
  }

  private renderCloudRegion(region: CloudRegion): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'CLOUD REGION';
    titleEl.textContent = region.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(region.provider.toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">Major public cloud infrastructure deployment node. Supporting global software-as-a-service availability.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Availability Zones</span>
          <span class="map-side-panel-meta-value">${region.zones || 'N/A'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(region.city)}, ${escapeHtml(region.country)}</span>
        </div>
      </div>
    `;
  }

  private renderTechHQ(hq: TechHQ): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'TECH HQ';
    titleEl.textContent = hq.company;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(hq.type.toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">Corporate headquarters for a major technology enterprise.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Market Cap</span>
          <span class="map-side-panel-meta-value" style="color: var(--loader-cyan)">${hq.marketCap || 'N/A'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Employees</span>
          <span class="map-side-panel-meta-value">${hq.employees?.toLocaleString() || 'N/A'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Headquarters</span>
          <span class="map-side-panel-meta-value">${escapeHtml(hq.city)}, ${escapeHtml(hq.country)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Type</span>
          <span class="map-side-panel-meta-value">${hq.type.toUpperCase()}</span>
        </div>
      </div>
    `;
  }

  private renderTechHQCluster(data: TechHQClusterData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'HQ CLUSTER';
    titleEl.textContent = data.city;

    const totalCount = data.count || data.items.length;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(totalCount + ' ENTITIES', 'info')}
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Major HQs</h3>
        <div class="cluster-list">
          ${data.items.slice(0, 15).map(hq => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(hq.company)}</div>
              <div class="cluster-item-meta">${hq.type.toUpperCase()} • ${escapeHtml(hq.city)}</div>
            </div>
          `).join('')}
          ${totalCount > 15 ? `<p class="cluster-more">+ ${totalCount - 15} more entities in cluster</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderAccelerator(acc: Accelerator): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'ACCELERATOR';
    titleEl.textContent = acc.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(acc.type.toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">Strategic early-stage venture catalyst and mentorship hub.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Founded</span>
          <span class="map-side-panel-meta-value">${acc.founded || 'N/A'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(acc.city)}, ${escapeHtml(acc.country)}</span>
        </div>
        ${acc.notable?.length ? `
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Notable Alumni</span>
          <span class="map-side-panel-meta-value">${acc.notable.slice(0, 5).join(', ')}</span>
        </div>
        ` : ''}
      </div>
    `;
  }

  private renderTechEvent(event: TechEventPopupData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'TECH EVENT';
    titleEl.textContent = event.title;

    const urgency = event.daysUntil <= 7 ? 'critical' : event.daysUntil <= 30 ? 'high' : 'medium';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(urgency === 'critical' ? 'critical' : 'active')}
          <span class="sp-badge cy-badge cy-badge-info">IN ${event.daysUntil} DAYS</span>
        </div>
        <p class="map-side-panel-description">Major technology industry event, conference, or summit.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Date</span>
          <span class="map-side-panel-meta-value">${new Date(event.startDate).toLocaleDateString()}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(event.location)}, ${escapeHtml(event.country)}</span>
        </div>
      </div>

      ${event.url ? `
      <div class="map-side-panel-section">
        <a href="${sanitizeUrl(event.url)}" target="_blank" class="map-side-panel-btn map-side-panel-btn-primary">Event Intelligence</a>
      </div>
      ` : ''}
    `;
  }

  private renderTechEventCluster(data: TechEventClusterData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'EVENT CLUSTER';
    titleEl.textContent = data.location;

    const totalCount = data.count || data.items.length;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge(totalCount + ' EVENTS', 'info')}
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Timeline</h3>
        <div class="cluster-list">
          ${data.items.slice(0, 15).map(ev => `
            <div class="cluster-item">
              <div class="cluster-item-name">${escapeHtml(ev.title)}</div>
              <div class="cluster-item-meta">${new Date(ev.startDate).toLocaleDateString()} • D-${ev.daysUntil}</div>
            </div>
          `).join('')}
          ${totalCount > 15 ? `<p class="cluster-more">+ ${totalCount - 15} more events in cluster</p>` : ''}
        </div>
      </div>
    `;
  }

  private renderMilitaryFlight(flight: MilitaryFlight): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'MILITARY FLIGHT';
    titleEl.textContent = flight.callsign || 'UNCALID';

    const confidenceClass = flight.confidence === 'high' ? 'active' : 'medium';
    const enriched = flight.enriched || {};
    const model = flight.aircraftModel || enriched.typeCode || 'UNKNOWN';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(confidenceClass)}
          ${this.badge(flight.operator.toUpperCase(), 'info')}
          ${enriched.confirmedMilitary ? this.badge('CONFIRMED', 'critical') : ''}
        </div>
        <p class="map-side-panel-description" style="color: #ef4444;">
          ${flight.note ? escapeHtml(flight.note) : `Active ${escapeHtml(flight.operatorCountry)} military aerospace operation: ${escapeHtml(model)}.`}
        </p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Aircraft Type</span>
          <span class="map-side-panel-meta-value">${flight.aircraftType.toUpperCase()}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Model</span>
          <span class="map-side-panel-meta-value">${escapeHtml(model)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Altitude</span>
          <span class="map-side-panel-meta-value">${flight.altitude > 0 ? flight.altitude.toLocaleString() + ' ft' : 'Ground'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Velocity</span>
          <span class="map-side-panel-meta-value">${flight.speed} kts</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Heading</span>
          <span class="map-side-panel-meta-value">${Math.round(flight.heading)}°</span>
        </div>
        ${flight.verticalRate ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">V-Rate</span>
          <span class="map-side-panel-meta-value">${flight.verticalRate > 0 ? '+' : ''}${flight.verticalRate} fpm</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Hex Code</span>
          <span class="map-side-panel-meta-value">${flight.hexCode.toUpperCase()}</span>
        </div>
        ${flight.registration ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Tail Number</span>
          <span class="map-side-panel-meta-value">${flight.registration.toUpperCase()}</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Squawk</span>
          <span class="map-side-panel-meta-value">${flight.squawk || 'NONE'}</span>
        </div>
        ${flight.origin ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Origin</span>
          <span class="map-side-panel-meta-value">${flight.origin.toUpperCase()}</span>
        </div>
        ` : ''}
        ${flight.destination ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Dest.</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${flight.destination.toUpperCase()}</span>
        </div>
        ` : ''}
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Signals Intel (SIGINT)</h3>
        <div class="map-side-panel-meta-grid">
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">First Seen</span>
            <span class="map-side-panel-meta-value">${flight.firstSeen ? new Date(flight.firstSeen).toLocaleTimeString() : 'N/A'}</span>
          </div>
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Last Ping</span>
            <span class="map-side-panel-meta-value">${new Date(flight.lastSeen).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      ${enriched.manufacturer || enriched.owner || enriched.militaryBranch ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Asset Profile</h3>
        <div class="map-side-panel-meta-grid">
           ${enriched.manufacturer ? `
           <div class="map-side-panel-meta-item">
             <span class="map-side-panel-meta-label">OEM</span>
             <span class="map-side-panel-meta-value">${escapeHtml(enriched.manufacturer)}</span>
           </div>` : ''}
           ${enriched.militaryBranch ? `
           <div class="map-side-panel-meta-item">
             <span class="map-side-panel-meta-label">Branch</span>
             <span class="map-side-panel-meta-value">${escapeHtml(enriched.militaryBranch)}</span>
           </div>` : ''}
           ${enriched.owner ? `
           <div class="map-side-panel-meta-item">
             <span class="map-side-panel-meta-label">Owner</span>
             <span class="map-side-panel-meta-value">${escapeHtml(enriched.owner)}</span>
           </div>` : ''}
           ${enriched.operatorName ? `
           <div class="map-side-panel-meta-item">
             <span class="map-side-panel-meta-label">Operator</span>
             <span class="map-side-panel-meta-value">${escapeHtml(enriched.operatorName)}</span>
           </div>` : ''}
           ${enriched.builtYear ? `
           <div class="map-side-panel-meta-item">
             <span class="map-side-panel-meta-label">Built</span>
             <span class="map-side-panel-meta-value">${escapeHtml(enriched.builtYear)}</span>
           </div>` : ''}
        </div>
      </div>
      ` : ''}

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Operational Intel</h3>
        <p class="map-side-panel-description" style="color: #7dd3fc;">Real-time tracking of mission-critical assets via Wingbits SIGINT network. Tactical evaluation: Monitoring.</p>
      </div>
    `;
  }

  private renderMilitaryVessel(vessel: MilitaryVessel): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'MILITARY VESSEL';
    titleEl.textContent = vessel.name || 'UNKNOWN CONTACT';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(vessel.isDark ? 'critical' : 'active')}
          ${this.badge(vessel.operator.toUpperCase(), 'info')}
          ${vessel.usniDeploymentStatus ? this.badge(vessel.usniDeploymentStatus.toUpperCase(), vessel.usniDeploymentStatus === 'deployed' ? 'critical' : 'medium') : ''}
        </div>
        <p class="map-side-panel-description" style="color: #ef4444;">
          ${vessel.note ? escapeHtml(vessel.note) : `Sovereign ${escapeHtml(vessel.operatorCountry)} naval asset categorized as ${escapeHtml(vessel.vesselType.toUpperCase())}.`}
        </p>
        ${vessel.isDark ? `<p class="map-side-panel-description" style="color: #ef4444; font-weight: bold;">[AIS DARK WARNING]: Contact is not broadcasting position. Tactical tracking active.</p>` : ''}
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Classification</span>
          <span class="map-side-panel-meta-value">${vessel.vesselType.toUpperCase()}</span>
        </div>
        ${vessel.hullNumber ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Hull No.</span>
          <span class="map-side-panel-meta-value">${vessel.hullNumber.toUpperCase()}</span>
        </div>
        ` : ''}
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">MMSI</span>
          <span class="map-side-panel-meta-value">${vessel.mmsi || 'N/A'}</span>
        </div>
        ${vessel.speed ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Velocity</span>
          <span class="map-side-panel-meta-value">${vessel.speed} kts</span>
        </div>
        ` : ''}
        ${vessel.heading ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Heading</span>
          <span class="map-side-panel-meta-value">${Math.round(vessel.heading)}°</span>
        </div>
        ` : ''}
        ${vessel.course ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Course</span>
          <span class="map-side-panel-meta-value">${Math.round(vessel.course)}°</span>
        </div>
        ` : ''}
        ${vessel.destination ? `
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Dest.</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${escapeHtml(vessel.destination)}</span>
        </div>
        ` : ''}
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">AIS Telemetry</h3>
        <div class="map-side-panel-meta-grid">
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Update</span>
            <span class="map-side-panel-meta-value">${new Date(vessel.lastAisUpdate).toLocaleTimeString()}</span>
          </div>
          ${vessel.aisGapMinutes ? `
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Signal Gap</span>
            <span class="map-side-panel-meta-value" style="color: ${vessel.aisGapMinutes > 30 ? 'var(--semantic-critical)' : 'inherit'}">${vessel.aisGapMinutes}m</span>
          </div>` : ''}
          ${vessel.aisShipType ? `
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Type</span>
            <span class="map-side-panel-meta-value">${escapeHtml(vessel.aisShipType)}</span>
          </div>` : ''}
        </div>
      </div>

      ${vessel.nearChokepoint || vessel.nearBase ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Tactical Proximity</h3>
        <div class="map-side-panel-meta-grid">
           ${vessel.nearChokepoint ? `
           <div class="map-side-panel-meta-item">
             <span class="map-side-panel-meta-label">Chokepoint</span>
             <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${escapeHtml(vessel.nearChokepoint)}</span>
           </div>` : ''}
           ${vessel.nearBase ? `
           <div class="map-side-panel-meta-item">
             <span class="map-side-panel-meta-label">Naval Base</span>
             <span class="map-side-panel-meta-value">${escapeHtml(vessel.nearBase)}</span>
           </div>` : ''}
        </div>
      </div>
      ` : ''}

      ${vessel.usniRegion || vessel.usniStrikeGroup || vessel.usniActivityDescription ? `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">USNI Fleet Intel</h3>
        <div class="map-side-panel-meta-grid">
          ${vessel.usniRegion ? `
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">AOR</span>
            <span class="map-side-panel-meta-value">${escapeHtml(vessel.usniRegion)}</span>
          </div>` : ''}
          ${vessel.usniStrikeGroup ? `
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">Strike Group</span>
            <span class="map-side-panel-meta-value">${escapeHtml(vessel.usniStrikeGroup)}</span>
          </div>` : ''}
          ${vessel.usniDeploymentStatus ? `
          <div class="map-side-panel-meta-item">
            <span class="map-side-panel-meta-label">AOR Status</span>
            <span class="map-side-panel-meta-value">${vessel.usniDeploymentStatus.toUpperCase()}</span>
          </div>` : ''}
        </div>
        ${vessel.usniActivityDescription ? `<p class="map-side-panel-description" style="margin-top: 10px; font-style: italic;">"${escapeHtml(vessel.usniActivityDescription)}"</p>` : ''}
      </div>
      ` : ''}
    `;
  }

  public async loadHotspotGdeltContext(hotspot: Hotspot): Promise<void> {
    if (!this.panel) return;

    const container = this.panel.querySelector('.hotspot-gdelt-context');
    if (!container) return;

    try {
      const articles = await fetchHotspotContext(hotspot);

      if (!this.panel || !container.isConnected) return;

      if (articles.length === 0) {
        container.innerHTML = `
          <h3 class="map-side-panel-section-title">Live Intel</h3>
          <div class="map-side-panel-description">${t('popups.noCoverage')}</div>
        `;
        return;
      }

      container.innerHTML = `
        <h3 class="map-side-panel-section-title">Live Intel</h3>
        <div class="map-side-panel-news-list">
          ${articles.slice(0, 5).map(article => this.renderGdeltArticle(article)).join('')}
        </div>
      `;
    } catch (error) {
      if (container.isConnected) {
        container.innerHTML = `
          <h3 class="map-side-panel-section-title">Live Intel</h3>
          <div class="map-side-panel-description">${t('common.error')}</div>
        `;
      }
    }
  }

  private renderGdeltArticle(article: GdeltArticle): string {
    return `
      <div class="map-side-panel-news-item">
        <a href="${sanitizeUrl(article.url || '')}" target="_blank" style="text-decoration: none; color: inherit;">
          <div class="map-side-panel-news-title">${escapeHtml(article.title)}</div>
          <div class="map-side-panel-news-meta">${escapeHtml(article.source || '')} • ${article.date ? new Date(article.date).toLocaleDateString() : ''}</div>
        </a>
      </div>
    `;
  }

  private renderNewsSection(news?: NewsItem[]): string {
    if (!news || news.length === 0) return '';

    return `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">${t('modals.story.topNews')}</h3>
        <div class="map-side-panel-news-list">
          ${news.slice(0, 5).map(n => `
            <div class="map-side-panel-news-item">
               <a href="${sanitizeUrl(n.link || '')}" target="_blank" style="text-decoration: none; color: inherit;">
                <div class="map-side-panel-news-title">${escapeHtml(n.title)}</div>
                <div class="map-side-panel-news-meta">${escapeHtml(n.source || '')} • ${n.pubDate ? new Date(n.pubDate).toLocaleDateString() : ''}</div>
              </a>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Compatibility stubs for legacy Map component
  public setCableActivity(_advisories: any[], _repairShips: any[]): void { }
  public setCableHealth(_cableId: string, _health: any): void { }

  // --- Helpers ---

  private getTimeAgo(date: Date | string | number): string {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
    if (seconds < 60) return t('popups.timeAgo.s', { count: seconds });
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t('popups.timeAgo.m', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('popups.timeAgo.h', { count: hours });
    const days = Math.floor(hours / 24);
    return t('popups.timeAgo.d', { count: days });
  }

  private getTimeUntil(date: Date | string | number): string {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    const ms = d.getTime() - Date.now();
    if (ms <= 0) return t('popups.expired');
    const hours = Math.floor(ms / (1000 * 60 * 60));
    if (hours < 1) return `${Math.floor(ms / (1000 * 60))}${t('popups.timeUnits.m')} `;
    if (hours < 24) return `${hours}${t('popups.timeUnits.h')} `;
    return `${Math.floor(hours / 24)}${t('popups.timeUnits.d')} `;
  }

  private getMarketStatus(hours: { open: string; close: string; timezone: string }): 'open' | 'closed' | 'unknown' {
    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: hours.timezone,
      });
      const currentTime = formatter.format(now);
      const [openH = 0, openM = 0] = hours.open.split(':').map(Number);
      const [closeH = 0, closeM = 0] = hours.close.split(':').map(Number);
      const [currH = 0, currM = 0] = currentTime.split(':').map(Number);

      const openMins = openH * 60 + openM;
      const closeMins = closeH * 60 + closeM;
      const currMins = currH * 60 + currM;

      if (currMins >= openMins && currMins < closeMins) return 'open';
      return 'closed';
    } catch {
      return 'unknown';
    }
  }

  private renderWaterway(waterway: StrategicWaterway): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'STRATEGIC WATERWAY';
    titleEl.textContent = waterway.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('critical')}
          ${this.badge(waterway.type || 'CHOKEPOINT', 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(waterway.description || 'Critical maritime chokepoint and global trade artery.')}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Daily Vessel Traffic</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${waterway.vesselsPerDay || 'N/A'}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Global Trade %</span>
          <span class="map-side-panel-meta-value">${waterway.globalTradePct || 'N/A'}%</span>
        </div>
      </div>
    `;
  }

  private renderClimateAnomaly(data: ClimateAnomaly): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = t('components.deckgl.tooltip.climateAnomaly').toUpperCase();
    titleEl.textContent = data.zone;

    const tempColor = data.tempDelta > 0 ? 'var(--semantic-high)' : data.tempDelta < 0 ? 'var(--semantic-info)' : 'var(--text-secondary)';
    const precipColor = data.precipDelta > 0 ? 'var(--semantic-info)' : data.precipDelta < 0 ? 'var(--semantic-warning)' : 'var(--text-secondary)';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(data.severity)}
          ${this.badge(data.type.toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">Significant deviation from historical baseline detected for the period: <strong>${escapeHtml(data.period)}</strong>.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">${t('components.deckgl.tooltip.tempDelta')}</span>
          <span class="map-side-panel-meta-value" style="color: ${tempColor}">${data.tempDelta > 0 ? '+' : ''}${data.tempDelta.toFixed(1)}°C</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">${t('components.deckgl.tooltip.precipDelta')}</span>
          <span class="map-side-panel-meta-value" style="color: ${precipColor}">${data.precipDelta > 0 ? '+' : ''}${data.precipDelta.toFixed(1)}%</span>
        </div>
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Analysis Period</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.period)}</span>
        </div>
      </div>

      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">Regional Impact</h3>
        <p class="map-side-panel-description">
          ${this.getClimateImpactDescription(data)}
        </p>
      </div>
    `;
  }

  private getClimateImpactDescription(data: ClimateAnomaly): string {
    const isExtreme = data.severity === 'extreme';
    if (data.type === 'warm') {
      return isExtreme ? 'Severe heat stress detected. High risk to agriculture and public health infrastructure.' : 'Above-average temperatures recorded. Monitoring potential drought conditions.';
    }
    if (data.type === 'wet') {
      return isExtreme ? 'Extreme precipitation event. High flash flood risk and potential infrastructure damage.' : 'Increased rainfall levels. Monitoring regional water table and runoff.';
    }
    if (data.type === 'dry') {
      return isExtreme ? 'Critical drought severity. Significant impact on crop yields and water reserves.' : 'Reduced precipitation levels. Potential impact on local agriculture.';
    }
    return 'Regional ecological baseline shift detected. Monitoring long-term environmental impacts.';
  }

  private renderAisDisruption(event: AisDisruptionEvent): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'AIS DISRUPTION';
    titleEl.textContent = event.name;

    const typeLabel = event.type === 'gap_spike' ? t('popups.aisGapSpike') : t('popups.chokepointCongestion');
    const changeLabel = event.type === 'gap_spike' ? t('popups.darkening') : t('popups.density');
    const countLabel = event.type === 'gap_spike' ? t('popups.darkShips') : t('popups.vesselCount');
    const countValue = event.type === 'gap_spike' ? event.darkShips?.toString() || '—' : event.vesselCount?.toString() || '—';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <h3 class="map-side-panel-section-title">${typeLabel}</h3>
        <p class="map-side-panel-description">${escapeHtml(event.description)}</p>
        <div class="sp-badge-row">
          ${this.badge(event.severity)}
          ${event.region ? this.badge(event.region, 'info') : ''}
        </div>
      </div>
      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">${changeLabel}</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${event.changePct}% ↑</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">${countLabel}</span>
          <span class="map-side-panel-meta-value">${countValue}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Window</span>
          <span class="map-side-panel-meta-value">${event.windowHours} H</span>
        </div>
      </div>
    `;
  }

  private renderIrradiator(data: GammaIrradiator): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'GAMMA IRRADIATOR';
    titleEl.textContent = data.name || data.city;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('monitored')}
          ${this.badge((data.isotope || 'Co-60').toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">Industrial sterilization facility utilizing high-activity radioactive isotopes.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Isotope Source</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${escapeHtml(data.isotope || 'Co-60')}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Activity Level</span>
          <span class="map-side-panel-meta-value">${data.activityMCi ? data.activityMCi + ' MCi' : t('common.classified')}</span>
        </div>
        <div class="map-side-panel-meta-item" style="grid-column: span 2;">
          <span class="map-side-panel-meta-label">Operator</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.operator || 'N/A')}</span>
        </div>
      </div>
    `;
  }

  private renderRepairShip(ship: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'REPAIR VESSEL';
    titleEl.textContent = ship.name;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(ship.status)}
          ${this.badge('MARITIME', 'info')}
        </div>
        <p class="map-side-panel-description">Strategic cable maintenance and repair vessel deployed in active monitoring zones.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Speed</span>
          <span class="map-side-panel-meta-value">${ship.speedKnots} kn</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Course</span>
          <span class="map-side-panel-meta-value">${ship.course}°</span>
        </div>
      </div>
    `;
  }

  private renderCableAdvisory(advisory: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'CABLE ADVISORY';
    titleEl.textContent = advisory.cableId;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(advisory.severity)}
          ${this.badge('INFRASTRUCTURE', 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(advisory.description)}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Reported</span>
          <span class="map-side-panel-meta-value">${this.getTimeAgo(advisory.reported)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Impact Level</span>
          <span class="map-side-panel-meta-value">${advisory.severity.toUpperCase()}</span>
        </div>
      </div>
    `;
  }

  private renderMineral(mine: CriticalMineralProject): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'CRITICAL MINERAL';
    titleEl.textContent = mine.name;

    const statusBadge = mine.status === 'producing' ? 'active' : mine.status === 'development' ? 'high' : 'low';
    const icon = mine.mineral === 'Lithium' ? '🔋' : mine.mineral === 'Rare Earths' ? '🧲' : '💎';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div style="font-size: 32px; margin-bottom: 8px;">${icon}</div>
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(statusBadge)}
          ${this.badge(mine.mineral.toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">${escapeHtml(mine.significance)}</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Mineral</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${escapeHtml(mine.mineral)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Operator</span>
          <span class="map-side-panel-meta-value">${escapeHtml(mine.operator)}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Location</span>
          <span class="map-side-panel-meta-value">${escapeHtml(mine.country)}</span>
        </div>
      </div>
    `;
  }

  private renderFire(fire: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'SATELLITE FIRE';
    titleEl.textContent = 'Active Thermal Anomaly';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          ${this.badge('FIRMS DATA', 'info')}
        </div>
        <p class="map-side-panel-description">High-confidence thermal anomaly detected via MODIS/VIIRS satellite instruments.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Brightness</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-critical)">${fire.brightness} K</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Scan / Track</span>
          <span class="map-side-panel-meta-value">${fire.scan} / ${fire.track}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Coordinates</span>
          <span class="map-side-panel-meta-value">${fire.lat.toFixed(3)}, ${fire.lon.toFixed(3)}</span>
        </div>
      </div>
    `;
  }

  private renderFlightDelay(data: AirportDelayAlert): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'FLIGHT DELAY';
    titleEl.textContent = data.iata || data.icao;

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(data.severity)}
          <span class="sp-badge cy-badge cy-badge-info">${data.avgDelayMinutes} MIN DELAY</span>
        </div>
        <p class="map-side-panel-description">Significant operational disruption detected at ${data.iata || data.icao}. Monitoring flow controls and ground stops.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Delay Time</span>
          <span class="map-side-panel-meta-value" style="color: var(--semantic-high)">${data.avgDelayMinutes} Minutes</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Reason</span>
          <span class="map-side-panel-meta-value">${escapeHtml(data.reason || 'Volume / Traffic')}</span>
        </div>
      </div>
    `;
  }

  private renderAircraft(data: PositionSample): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'CIVILIAN AIRCRAFT';
    titleEl.textContent = data.callsign || 'N/A';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('airborne')}
          ${this.badge(data.icao24.toUpperCase(), 'info')}
        </div>
        <p class="map-side-panel-description">Live flight tracking for civilian transponder ${data.icao24}.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Altitude</span>
          <span class="map-side-panel-meta-value">${data.altitudeFt} ft</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Velocity</span>
          <span class="map-side-panel-meta-value">${data.groundSpeedKts} kt</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Heading</span>
          <span class="map-side-panel-meta-value">${data.trackDeg}°</span>
        </div>
      </div>
    `;
  }

  private renderGpsJamming(data: GpsJammingPopupData): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'GPS INTERFERENCE';
    titleEl.textContent = 'Signal Degradation';

    const isHigh = data.level === 'high';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge(data.level)}
          <span class="sp-badge cy-badge cy-badge-info">${data.pct}% IMPACT</span>
        </div>
        <p class="map-side-panel-description">Strategic GNSS interference detected. Affecting aviation and maritime navigation systems in this sector.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Interference</span>
          <span class="map-side-panel-meta-value" style="color: ${isHigh ? 'var(--semantic-critical)' : 'var(--semantic-high)'}">${data.pct}%</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Affected Assets</span>
          <span class="map-side-panel-meta-value">${data.bad} / ${data.total}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Normal Signal</span>
          <span class="map-side-panel-meta-value">${data.good}</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">H3 Hex ID</span>
          <span class="map-side-panel-meta-value" style="font-size: 10px;">${escapeHtml(data.h3)}</span>
        </div>
      </div>
    `;
  }

  private renderSatellite(data: any): void {
    const { titleEl, typeEl, contentEl } = this.getElements();

    typeEl.textContent = 'SATELLITE';
    titleEl.textContent = data.name || 'Orbital Asset';

    contentEl.innerHTML = `
      <div class="map-side-panel-section">
        <div class="sp-badge-row" style="margin-bottom: 12px;">
          ${this.badge('active')}
          <span class="sp-badge cy-badge cy-badge-info">NORAD ${data.noradId || 'N/A'}</span>
        </div>
        <p class="map-side-panel-description">Active orbital monitoring. Providing strategic signal intelligence and earth observation.</p>
      </div>

      <div class="map-side-panel-meta-grid">
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Altitude</span>
          <span class="map-side-panel-meta-value">${data.altitude?.toFixed(1) || 'N/A'} km</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Velocity</span>
          <span class="map-side-panel-meta-value">${data.velocity?.toFixed(2) || 'N/A'} km/s</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Inclination</span>
          <span class="map-side-panel-meta-value">${data.inclination?.toFixed(2) || 'N/A'}°</span>
        </div>
        <div class="map-side-panel-meta-item">
          <span class="map-side-panel-meta-label">Period</span>
          <span class="map-side-panel-meta-value">${data.period?.toFixed(1) || 'N/A'} min</span>
        </div>
      </div>
    `;
  }
}
