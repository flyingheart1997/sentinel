/**
 * DeckGLMap - WebGL-accelerated map visualization for desktop
 * Uses deck.gl for high-performance rendering of large datasets
 * Mobile devices gracefully degrade to the D3/SVG-based Map component
 */
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Layer, LayersList, PickingInfo } from '@deck.gl/core';
import { GeoJsonLayer, ScatterplotLayer, PathLayer, IconLayer, TextLayer, PolygonLayer, ArcLayer } from '@deck.gl/layers';
import maplibregl from 'maplibre-gl';
import Supercluster from 'supercluster';
import type {
  MapLayers,
  Hotspot,
  NewsItem,
  InternetOutage,
  RelatedAsset,
  AssetType,
  AisDisruptionEvent,
  AisDensityZone,
  CableAdvisory,
  RepairShip,
  SocialUnrestEvent,
  AIDataCenter,
  MilitaryFlight,
  MilitaryVessel,
  MilitaryFlightCluster,
  MilitaryVesselCluster,
  NaturalEvent,
  UcdpGeoEvent,
  MapProtestCluster,
  MapTechHQCluster,
  MapTechEventCluster,
  MapDatacenterCluster,
  CyberThreat,
  CableHealthRecord,
  MilitaryBaseEnriched,
} from '@/types';
import { fetchMilitaryBases, type MilitaryBaseCluster as ServerBaseCluster } from '@/services/military-bases';
import type { AirportDelayAlert, PositionSample } from '@/services/aviation';
import { fetchAircraftPositions } from '@/services/aviation';
import type { IranEvent } from '@/services/conflict';
import { HeatmapLayer } from '@deck.gl/aggregation-layers';
import type { WeatherAlert } from '@/services/weather';
import { escapeHtml } from '@/utils/sanitize';
import { tokenizeForMatch, matchKeyword, matchesAnyKeyword, findMatchingKeywords } from '@/utils/keyword-match';
import { t } from '@/services/i18n';
import { debounce, rafSchedule, getCurrentTheme } from '@/utils/index';
import {
  INTEL_HOTSPOTS,
  CONFLICT_ZONES,

  MILITARY_BASES,
  UNDERSEA_CABLES,
  NUCLEAR_FACILITIES,
  GAMMA_IRRADIATORS,
  PIPELINES,
  PIPELINE_COLORS,
  STRATEGIC_WATERWAYS,
  ECONOMIC_CENTERS,
  AI_DATA_CENTERS,
  SITE_VARIANT,
  STARTUP_HUBS,
  ACCELERATORS,
  TECH_HQS,
  CLOUD_REGIONS,
  PORTS,
  SPACEPORTS,
  APT_GROUPS,
  CRITICAL_MINERALS,
  STOCK_EXCHANGES,
  FINANCIAL_CENTERS,
  CENTRAL_BANKS,
  COMMODITY_HUBS,
  MARITIME_ZONES,
  SANCTIONED_COUNTRIES,
  GULF_INVESTMENTS,
} from '@/config';
import type { GulfInvestment } from '@/types';
import { resolveTradeRouteSegments, TRADE_ROUTES as TRADE_ROUTES_LIST, type TradeRouteSegment } from '@/config/trade-routes';
import { getLayersForVariant, resolveLayerLabel, type MapVariant } from '@/config/map-layer-definitions';
import { MapSidePanel } from './MapSidePanel';
import {
  updateHotspotEscalation,
  getHotspotEscalation,
  setMilitaryData,
  setCIIGetter,
  setGeoAlertGetter,
} from '@/services/hotspot-escalation';
import { getCountryScore } from '@/services/country-instability';
import { getAlertsNearLocation } from '@/services/geo-convergence';
import type { PositiveGeoEvent } from '@/services/positive-events-geo';
import type { KindnessPoint } from '@/services/kindness-data';
import type { HappinessData } from '@/services/happiness-data';
import type { RenewableInstallation } from '@/services/renewable-installations';
import type { SpeciesRecovery } from '@/services/conservation-data';
import { getCountriesGeoJson, getCountryAtCoordinates, getCountryBbox } from '@/services/country-geometry';
import type { FeatureCollection, Geometry } from 'geojson';
import type { PopupType } from './MapPopup';
import type { DisplacementFlow } from '@/services/displacement';
import type { Earthquake } from '@/services/earthquakes';
import type { ClimateAnomaly } from '@/services/climate';
import type { GpsJamHex } from '@/services/gps-interference';

export type TimeRange = '1h' | '6h' | '24h' | '48h' | '7d' | 'all';
export type DeckMapView = 'global' | 'america' | 'mena' | 'eu' | 'asia' | 'latam' | 'africa' | 'oceania';
type MapInteractionMode = 'flat' | '3d';

export interface CountryClickPayload {
  lat: number;
  lon: number;
  code?: string;
  name?: string;
}

interface DeckMapState {
  zoom: number;
  pan: { x: number; y: number };
  view: DeckMapView;
  layers: MapLayers;
  timeRange: TimeRange;
}

interface HotspotWithBreaking extends Hotspot {
  hasBreaking?: boolean;
}

interface TechEventMarker {
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

// View presets with longitude, latitude, zoom
const VIEW_PRESETS: Record<DeckMapView, { longitude: number; latitude: number; zoom: number }> = {
  global: { longitude: 0, latitude: 20, zoom: 1.5 },
  america: { longitude: -95, latitude: 38, zoom: 3 },
  mena: { longitude: 45, latitude: 28, zoom: 3.5 },
  eu: { longitude: 15, latitude: 50, zoom: 3.5 },
  asia: { longitude: 105, latitude: 35, zoom: 3 },
  latam: { longitude: -60, latitude: -15, zoom: 3 },
  africa: { longitude: 20, latitude: 5, zoom: 3 },
  oceania: { longitude: 135, latitude: -25, zoom: 3.5 },
};

const MAP_INTERACTION_MODE: MapInteractionMode =
  import.meta.env.VITE_MAP_INTERACTION_MODE === 'flat' ? 'flat' : '3d';

const DARK_STYLE = SITE_VARIANT === 'happy'
  ? '/map-styles/happy-dark.json'
  : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const LIGHT_STYLE = SITE_VARIANT === 'happy'
  ? '/map-styles/happy-light.json'
  : 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const FALLBACK_DARK_STYLE = 'https://tiles.openfreemap.org/styles/dark';
const FALLBACK_LIGHT_STYLE = 'https://tiles.openfreemap.org/styles/positron';

// Zoom thresholds for layer visibility and labels (matches old Map.ts)
// Zoom-dependent layer visibility and labels
const LAYER_ZOOM_THRESHOLDS: Partial<Record<keyof MapLayers, { minZoom: number; showLabels?: number }>> = {
  bases: { minZoom: 2, showLabels: 5 },
  nuclear: { minZoom: 3 },
  conflicts: { minZoom: 1, showLabels: 3 },
  economic: { minZoom: 3 },
  natural: { minZoom: 1, showLabels: 2 },
  datacenters: { minZoom: 5 },
  irradiators: { minZoom: 4 },
  spaceports: { minZoom: 3 },
  gulfInvestments: { minZoom: 2, showLabels: 5 },
};
// Export for external use
export { LAYER_ZOOM_THRESHOLDS };

// Theme-aware overlay color function — refreshed each buildLayers() call
function getOverlayColors() {
  return {
    // Threat dots: IDENTICAL in both modes (user locked decision)
    hotspotHigh: [255, 68, 68, 200] as [number, number, number, number],
    hotspotElevated: [255, 165, 0, 200] as [number, number, number, number],
    hotspotLow: [255, 255, 0, 180] as [number, number, number, number],

    // Conflict zone fills: more transparent in light mode
    conflict: [255, 0, 0, 100] as [number, number, number, number],

    // Infrastructure/category markers: darker variants in light mode for map readability
    base: [0, 150, 255, 200] as [number, number, number, number],
    nuclear: [255, 215, 0, 200] as [number, number, number, number],
    datacenter: [0, 255, 200, 180] as [number, number, number, number],
    cable: [0, 200, 255, 150] as [number, number, number, number],
    cableHighlight: [255, 100, 100, 200] as [number, number, number, number],
    cableFault: [255, 50, 50, 220] as [number, number, number, number],
    cableDegraded: [255, 165, 0, 200] as [number, number, number, number],
    earthquake: [255, 100, 50, 200] as [number, number, number, number],
    vesselMilitary: [255, 100, 100, 220] as [number, number, number, number],
    flightMilitary: [255, 50, 50, 220] as [number, number, number, number],
    protest: [255, 150, 0, 200] as [number, number, number, number],
    outage: [255, 50, 50, 180] as [number, number, number, number],
    weather: [100, 150, 255, 180] as [number, number, number, number],
    startupHub: [0, 255, 150, 200] as [number, number, number, number],
    techHQ: [100, 200, 255, 200] as [number, number, number, number],
    accelerator: [255, 200, 0, 200] as [number, number, number, number],
    cloudRegion: [150, 100, 255, 180] as [number, number, number, number],
    stockExchange: [80, 200, 255, 210] as [number, number, number, number],
    financialCenter: [0, 220, 150, 200] as [number, number, number, number],
    centralBank: [255, 210, 80, 210] as [number, number, number, number],
    commodityHub: [255, 150, 80, 200] as [number, number, number, number],
    gulfInvestmentSA: [0, 168, 107, 220] as [number, number, number, number],
    gulfInvestmentUAE: [255, 0, 100, 220] as [number, number, number, number],
    ucdpStateBased: [255, 50, 50, 200] as [number, number, number, number],
    ucdpNonState: [255, 165, 0, 200] as [number, number, number, number],
    ucdpOneSided: [255, 255, 0, 200] as [number, number, number, number],
  };
}
// Initialize and refresh on every buildLayers() call
let COLORS = getOverlayColors();

// SVG icons as data URLs for different marker shapes
const MARKER_ICONS = {
  // Combined atlas for all semantic icons (32x320)
  atlas: 'data:image/svg+xml;base64,' + btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="320" viewBox="0 0 32 320">
      <!-- 0: triangleUp -->
      <g transform="translate(0, 0)"><polygon points="16,2 30,28 2,28" fill="white"/></g>
      <!-- 1: hexagon -->
      <g transform="translate(0, 32)"><polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="white"/></g>
      <!-- 2: square -->
      <g transform="translate(0, 64)"><rect x="2" y="2" width="28" height="28" rx="3" fill="white"/></g>
      <!-- 3: diamond -->
      <g transform="translate(0, 96)"><polygon points="16,2 30,16 16,30 2,16" fill="white"/></g>
      <!-- 4: star -->
      <g transform="translate(0, 128)"><polygon points="16,2 20,12 30,12 22,19 25,30 16,23 7,30 10,19 2,12 12,12" fill="white"/></g>
      <!-- 5: plane -->
      <g transform="translate(0, 160)"><path d="M16 2 L17.5 10 L17 12 L27 17 L27 19 L17 16 L17 24 L20 26.5 L20 28 L16 27 L12 28 L12 26.5 L15 24 L15 16 L5 19 L5 17 L15 12 L14.5 10 Z" fill="white"/></g>
      <!-- 6: anchor -->
      <g transform="translate(0, 192)"><path d="M16 4 L16 8 M12 6 L20 6 M16 8 A8 8 0 0 0 8 16 L4 16 A12 12 0 0 1 16 28 A12 12 0 0 1 28 16 L24 16 A8 8 0 0 0 16 8" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="16" r="3" fill="white"/></g>
      <!-- 7: rocket -->
      <g transform="translate(0, 224)"><path d="M16 2 C12 10 12 18 16 26 L20 30 L16 28 L12 30 L16 26 M10 18 L6 24 L10 22 M22 18 L26 24 L22 22" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="16" cy="12" r="2" fill="white"/></g>
      <!-- 8: radiation -->
      <g transform="translate(0, 256)"><circle cx="16" cy="16" r="3" fill="white"/><path d="M16 10 A6 6 0 0 1 21.2 13 L26.4 10 A12 12 0 0 0 16 4 Z M10.8 19 A6 6 0 0 1 10.8 13 L5.6 10 A12 12 0 0 0 5.6 22 Z M16 22 A6 6 0 0 1 10.8 19 L5.6 22 A12 12 0 0 0 16 28 Z" fill="white"/></g>
      <!-- 9: chip -->
      <g transform="translate(0, 288)"><rect x="8" y="8" width="16" height="16" fill="white"/><path d="M12 4 L12 8 M16 4 L16 8 M20 4 L20 8 M12 24 L12 28 M16 24 L16 28 M20 24 L20 28 M4 12 L8 12 M4 16 L8 16 M4 20 L8 20 M24 12 L28 12 M24 16 L28 16 M24 20 L28 20" stroke="white" stroke-width="2" stroke-linecap="round"/></g>
    </svg>
  `),
};

const GLOBAL_ICON_MAPPING = {
  triangleUp: { x: 0, y: 0, width: 32, height: 32, mask: true },
  hexagon: { x: 0, y: 32, width: 32, height: 32, mask: true },
  square: { x: 0, y: 64, width: 32, height: 32, mask: true },
  diamond: { x: 0, y: 96, width: 32, height: 32, mask: true },
  star: { x: 0, y: 128, width: 32, height: 32, mask: true },
  plane: { x: 0, y: 160, width: 32, height: 32, mask: true },
  anchor: { x: 0, y: 192, width: 32, height: 32, mask: true },
  rocket: { x: 0, y: 224, width: 32, height: 32, mask: true },
  radiation: { x: 0, y: 256, width: 32, height: 32, mask: true },
  chip: { x: 0, y: 288, width: 32, height: 32, mask: true },
};


const CONFLICT_ZONES_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: CONFLICT_ZONES.map(zone => ({
    type: 'Feature' as const,
    properties: { id: zone.id, name: zone.name, intensity: zone.intensity },
    geometry: { type: 'Polygon' as const, coordinates: [zone.coords] },
  })),
};

const MARITIME_ZONES_GEOJSON: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: MARITIME_ZONES.map(zone => ({
    type: 'Feature' as const,
    properties: { id: zone.id, name: zone.name, type: zone.type, description: zone.description },
    geometry: { type: 'Polygon' as const, coordinates: [zone.coords] },
  })),
};



export class DeckGLMap {
  private static readonly MAX_CLUSTER_LEAVES = 200;

  private container: HTMLElement;
  private deckOverlay: MapboxOverlay | null = null;
  private maplibreMap: maplibregl.Map | null = null;
  private state: DeckMapState;
  private sidePanel: MapSidePanel;
  private isResizing = false;
  private savedTopLat: number | null = null;
  private correctingCenter = false;

  // Data stores
  private hotspots: HotspotWithBreaking[];
  private earthquakes: Earthquake[] = [];
  private weatherAlerts: WeatherAlert[] = [];
  private outages: InternetOutage[] = [];
  private cyberThreats: CyberThreat[] = [];
  private iranEvents: IranEvent[] = [];
  private aisDisruptions: AisDisruptionEvent[] = [];
  private aisDensity: AisDensityZone[] = [];
  private cableAdvisories: CableAdvisory[] = [];
  private repairShips: RepairShip[] = [];
  private healthByCableId: Record<string, CableHealthRecord> = {};
  private protests: SocialUnrestEvent[] = [];
  private militaryFlights: MilitaryFlight[] = [];
  private militaryFlightClusters: MilitaryFlightCluster[] = [];
  private militaryVessels: MilitaryVessel[] = [];
  private militaryVesselClusters: MilitaryVesselCluster[] = [];
  private serverBases: MilitaryBaseEnriched[] = [];
  private serverBaseClusters: ServerBaseCluster[] = [];
  private serverBasesLoaded = false;
  private naturalEvents: NaturalEvent[] = [];
  private firmsFireData: Array<{ lat: number; lon: number; brightness: number; frp: number; confidence: number; region: string; acq_date: string; daynight: string }> = [];
  private techEvents: TechEventMarker[] = [];
  private flightDelays: AirportDelayAlert[] = [];
  private aircraftPositions: PositionSample[] = [];
  private aircraftFetchTimer: ReturnType<typeof setInterval> | null = null;
  private news: NewsItem[] = [];
  private newsLocations: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date }> = [];
  private newsLocationFirstSeen = new Map<string, number>();
  private ucdpEvents: UcdpGeoEvent[] = [];
  private displacementFlows: DisplacementFlow[] = [];
  private gpsJammingHexes: GpsJamHex[] = [];
  private climateAnomalies: ClimateAnomaly[] = [];
  private tradeRouteSegments: TradeRouteSegment[] = resolveTradeRouteSegments();
  private positiveEvents: PositiveGeoEvent[] = [];
  private kindnessPoints: KindnessPoint[] = [];

  // Phase 8 overlay data
  private happinessScores: Map<string, number> = new Map();
  private happinessYear = 0;
  private happinessSource = '';
  private speciesRecoveryZones: Array<SpeciesRecovery & { recoveryZone: { name: string; lat: number; lon: number } }> = [];
  private renewableInstallations: RenewableInstallation[] = [];
  private countriesGeoJsonData: FeatureCollection<Geometry> | null = null;

  // CII choropleth data
  private ciiScoresMap: Map<string, { score: number; level: string }> = new Map();
  private ciiScoresVersion = 0;

  // Country highlight state
  private countryGeoJsonLoaded = false;
  private countryHoverSetup = false;
  private highlightedCountryCode: string | null = null;

  // Callbacks
  private onHotspotClick?: (hotspot: Hotspot) => void;
  private onTimeRangeChange?: (range: TimeRange) => void;
  private onCountryClick?: (country: CountryClickPayload) => void;
  private onLayerChange?: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void;
  private onStateChange?: (state: DeckMapState) => void;
  private onAircraftPositionsUpdate?: (positions: PositionSample[]) => void;

  // Highlighted assets
  private highlightedAssets: Record<AssetType, Set<string>> = {
    pipeline: new Set(),
    cable: new Set(),
    datacenter: new Set(),
    base: new Set(),
    nuclear: new Set(),
  };

  private renderScheduled = false;
  private renderPaused = false;
  private renderPending = false;
  private webglLost = false;
  private usedFallbackStyle = false;
  private styleLoadTimeoutId: ReturnType<typeof setTimeout> | null = null;


  private layerCache: Map<string, Layer> = new Map();
  private lastZoomThreshold = 0;
  private protestSC: Supercluster | null = null;
  private techHQSC: Supercluster | null = null;
  private techEventSC: Supercluster | null = null;
  private datacenterSC: Supercluster | null = null;
  private datacenterSCSource: AIDataCenter[] = [];
  private protestClusters: MapProtestCluster[] = [];
  private techHQClusters: MapTechHQCluster[] = [];
  private techEventClusters: MapTechEventCluster[] = [];
  private datacenterClusters: MapDatacenterCluster[] = [];
  private lastSCZoom = -1;
  private lastSCBoundsKey = '';
  private lastSCMask = '';
  private protestSuperclusterSource: SocialUnrestEvent[] = [];
  private newsPulseIntervalId: ReturnType<typeof setInterval> | null = null;
  private dayNightIntervalId: ReturnType<typeof setInterval> | null = null;
  private cachedNightPolygon: [number, number][] | null = null;
  private readonly startupTime = Date.now();
  private lastCableHighlightSignature = '';
  private lastCableHealthSignature = '';
  private lastPipelineHighlightSignature = '';
  private debouncedRebuildLayers: (() => void) & { cancel(): void };
  private debouncedFetchBases: (() => void) & { cancel(): void };
  private debouncedFetchAircraft: (() => void) & { cancel(): void };
  private rafUpdateLayers: (() => void) & { cancel(): void };
  private moveTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastAircraftFetchCenter: [number, number] | null = null;
  private lastAircraftFetchZoom = -1;
  private aircraftFetchSeq = 0;

  constructor(container: HTMLElement, initialState: DeckMapState) {
    this.container = container;
    this.state = initialState;
    this.hotspots = [...INTEL_HOTSPOTS];

    this.debouncedRebuildLayers = debounce(() => {
      if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
      this.maplibreMap.resize();
      try { this.deckOverlay?.setProps({ layers: this.buildLayers() }); } catch { /* map mid-teardown */ }
    }, 150);
    this.debouncedFetchBases = debounce(() => this.fetchServerBases(), 300);
    this.debouncedFetchAircraft = debounce(() => this.fetchViewportAircraft(), 500);
    this.rafUpdateLayers = rafSchedule(() => {
      if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
      try { this.deckOverlay?.setProps({ layers: this.buildLayers() }); } catch { /* map mid-teardown */ }
    });

    this.setupDOM();
    this.sidePanel = new MapSidePanel(container);

    window.addEventListener('theme-changed', (e: Event) => {
      const theme = (e as CustomEvent).detail?.theme as 'dark' | 'light';
      if (theme) {
        this.switchBasemap(theme);
        this.render(); // Rebuilds Deck.GL layers with new theme-aware colors
      }
    });

    this.initMapLibre();

    this.maplibreMap?.on('load', () => {
      this.rebuildTechHQSupercluster();
      this.rebuildDatacenterSupercluster();
      this.initDeck();
      this.loadCountryBoundaries();
      this.fetchServerBases();
      this.render();
    });

    this.createControls();
    this.createTimeSlider();
    this.createLayerToggles();
    this.createLegend();

    // Start day/night timer only if layer is initially enabled
    if (this.state.layers.dayNight) {
      this.startDayNightTimer();
    }
  }

  private startDayNightTimer(): void {
    if (this.dayNightIntervalId) return;
    this.cachedNightPolygon = this.computeNightPolygon();
    this.dayNightIntervalId = setInterval(() => {
      this.cachedNightPolygon = this.computeNightPolygon();
      this.render();
    }, 5 * 60 * 1000);
  }

  private stopDayNightTimer(): void {
    if (this.dayNightIntervalId) {
      clearInterval(this.dayNightIntervalId);
      this.dayNightIntervalId = null;
    }
    this.cachedNightPolygon = null;
  }

  private setupDOM(): void {
    const wrapper = document.createElement('div');
    wrapper.className = 'deckgl-map-wrapper';
    wrapper.id = 'deckglMapWrapper';
    wrapper.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden;';

    // MapLibre container - deck.gl renders directly into MapLibre via MapboxOverlay
    const mapContainer = document.createElement('div');
    mapContainer.id = 'deckgl-basemap';
    mapContainer.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%;';
    wrapper.appendChild(mapContainer);

    // Map attribution (CARTO basemap + OpenStreetMap data)
    // const attribution = document.createElement('div');
    // attribution.className = 'map-attribution';
    // attribution.innerHTML = '© <a href="https://carto.com/attributions" target="_blank" rel="noopener">CARTO</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    // wrapper.appendChild(attribution);

    this.container.appendChild(wrapper);
  }

  private initMapLibre(): void {
    const preset = VIEW_PRESETS[this.state.view];
    this.maplibreMap = new maplibregl.Map({
      container: 'deckgl-basemap',
      style: DARK_STYLE,
      center: [preset.longitude, preset.latitude],
      zoom: preset.zoom,
      renderWorldCopies: false,
      attributionControl: false,
      interactive: true,
      ...(MAP_INTERACTION_MODE === 'flat'
        ? {
          maxPitch: 0,
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
        }
        : {}),
    });

    const switchToFallback = () => {
      if (this.usedFallbackStyle) return;
      this.usedFallbackStyle = true;
      const fallback = FALLBACK_DARK_STYLE;
      console.warn(`[DeckGLMap] Primary basemap failed, switching to fallback: ${fallback}`);
      this.maplibreMap?.setStyle(fallback);
    };

    this.maplibreMap.on('error', (e: { error?: Error; message?: string }) => {
      const msg = e.error?.message ?? e.message ?? '';
      if (msg.includes('Failed to fetch') || msg.includes('AJAXError') || msg.includes('CORS') || msg.includes('NetworkError') || msg.includes('cartocdn.com')) {
        switchToFallback();
      }
    });

    this.styleLoadTimeoutId = setTimeout(() => {
      this.styleLoadTimeoutId = null;
      if (!this.maplibreMap?.isStyleLoaded()) switchToFallback();
    }, 5000);
    this.maplibreMap.once('style.load', () => {
      if (this.styleLoadTimeoutId) {
        clearTimeout(this.styleLoadTimeoutId);
        this.styleLoadTimeoutId = null;
      }
    });

    const canvas = this.maplibreMap.getCanvas();
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.webglLost = true;
      console.warn('[DeckGLMap] WebGL context lost — will restore when browser recovers');
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.webglLost = false;
      console.info('[DeckGLMap] WebGL context restored');
      this.maplibreMap?.triggerRepaint();
    });

    // Pin top edge during drag-resize: correct center shift synchronously
    // inside MapLibre's own resize() call (before it renders the frame).
    this.maplibreMap.on('move', () => {
      if (this.correctingCenter || !this.isResizing || !this.maplibreMap) return;
      if (this.savedTopLat === null) return;

      const w = this.maplibreMap.getCanvas().clientWidth;
      if (w <= 0) return;
      const currentTop = this.maplibreMap.unproject([w / 2, 0]).lat;
      const delta = this.savedTopLat - currentTop;

      if (Math.abs(delta) > 1e-6) {
        this.correctingCenter = true;
        const c = this.maplibreMap.getCenter();
        const clampedLat = Math.max(-90, Math.min(90, c.lat + delta));
        this.maplibreMap.jumpTo({ center: [c.lng, clampedLat] });
        this.correctingCenter = false;
        // Do NOT update savedTopLat — keep the original mousedown position
        // so every frame targets the exact same geographic anchor.
      }
    });
  }

  private initDeck(): void {
    if (!this.maplibreMap) return;
    this.deckOverlay = new MapboxOverlay({
      interleaved: true,
      layers: this.buildLayers(),
      getTooltip: (info: PickingInfo) => {
        return this.getTooltip(info)
      },
      onClick: (info: PickingInfo) => this.handleClick(info),
      pickingRadius: 10,
      useDevicePixels: window.devicePixelRatio > 2 ? 2 : true,
      onError: (error: Error) => console.warn('[DeckGLMap] Render error (non-fatal):', error.message),
    });
    console.log(this.deckOverlay);
    this.maplibreMap.addControl(this.deckOverlay as unknown as maplibregl.IControl);

    this.maplibreMap.on('movestart', () => {
      if (this.moveTimeoutId) {
        clearTimeout(this.moveTimeoutId);
        this.moveTimeoutId = null;
      }
    });

    this.maplibreMap.on('moveend', () => {
      this.lastSCZoom = -1;
      this.rafUpdateLayers();
      this.debouncedFetchBases();
      this.debouncedFetchAircraft();
      this.state.zoom = this.maplibreMap?.getZoom() ?? this.state.zoom;
      this.onStateChange?.(this.state);
    });

    this.maplibreMap.on('move', () => {
      if (this.moveTimeoutId) clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = setTimeout(() => {
        this.lastSCZoom = -1;
        this.rafUpdateLayers();
      }, 100);
    });

    this.maplibreMap.on('zoom', () => {
      if (this.moveTimeoutId) clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = setTimeout(() => {
        this.lastSCZoom = -1;
        this.rafUpdateLayers();
      }, 100);
    });

    this.maplibreMap.on('zoomend', () => {
      const currentZoom = Math.floor(this.maplibreMap?.getZoom() || 2);
      const thresholdCrossed = Math.abs(currentZoom - this.lastZoomThreshold) >= 1;
      if (thresholdCrossed) {
        this.lastZoomThreshold = currentZoom;
        this.debouncedRebuildLayers();
      }
      this.state.zoom = this.maplibreMap?.getZoom() ?? this.state.zoom;
      this.onStateChange?.(this.state);
    });
  }

  public setIsResizing(value: boolean): void {
    this.isResizing = value;
    if (value && this.maplibreMap) {
      const w = this.maplibreMap.getCanvas().clientWidth;
      if (w > 0) {
        this.savedTopLat = this.maplibreMap.unproject([w / 2, 0]).lat;
      }
    } else {
      this.savedTopLat = null;
    }
  }

  public resize(): void {
    this.maplibreMap?.resize();
  }

  private getSetSignature(set: Set<string>): string {
    return [...set].sort().join('|');
  }

  private hasRecentNews(now = Date.now()): boolean {
    for (const ts of this.newsLocationFirstSeen.values()) {
      if (now - ts < 30_000) return true;
    }
    return false;
  }

  private getTimeRangeMs(range: TimeRange = this.state.timeRange): number {
    const ranges: Record<TimeRange, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '48h': 48 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      'all': Infinity,
    };
    return ranges[range];
  }

  private parseTime(value: Date | string | number | undefined | null): number | null {
    if (value == null) return null;
    const ts = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(ts) ? ts : null;
  }

  private filterByTime<T>(
    items: T[],
    getTime: (item: T) => Date | string | number | undefined | null
  ): T[] {
    if (this.state.timeRange === 'all') return items;
    const cutoff = Date.now() - this.getTimeRangeMs();
    return items.filter((item) => {
      const ts = this.parseTime(getTime(item));
      return ts == null ? true : ts >= cutoff;
    });
  }

  private getFilteredProtests(): SocialUnrestEvent[] {
    return this.filterByTime(this.protests, (event) => event.time);
  }

  private filterMilitaryFlightClustersByTime(clusters: MilitaryFlightCluster[]): MilitaryFlightCluster[] {
    return clusters
      .map((cluster) => {
        const flights = this.filterByTime(cluster.flights ?? [], (flight) => flight.lastSeen);
        if (flights.length === 0) return null;
        return {
          ...cluster,
          flights,
          flightCount: flights.length,
        };
      })
      .filter((cluster): cluster is MilitaryFlightCluster => cluster !== null);
  }

  private filterMilitaryVesselClustersByTime(clusters: MilitaryVesselCluster[]): MilitaryVesselCluster[] {
    return clusters
      .map((cluster) => {
        const vessels = this.filterByTime(cluster.vessels ?? [], (vessel) => vessel.lastAisUpdate);
        if (vessels.length === 0) return null;
        return {
          ...cluster,
          vessels,
          vesselCount: vessels.length,
        };
      })
      .filter((cluster): cluster is MilitaryVesselCluster => cluster !== null);
  }

  private rebuildProtestSupercluster(source: SocialUnrestEvent[] = this.getFilteredProtests()): void {
    this.protestSuperclusterSource = source;
    const points = source.map((p, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] as [number, number] },
      properties: {
        index: i,
        country: p.country,
        severity: p.severity,
        eventType: p.eventType,
        sourceType: p.sourceType,
        validated: Boolean(p.validated),
        fatalities: Number.isFinite(p.fatalities) ? Number(p.fatalities) : 0,
        timeMs: p.time.getTime(),
      },
    }));
    this.protestSC = new Supercluster({
      radius: 60,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        country: String(props.country ?? ''),
        maxSeverityRank: props.severity === 'high' ? 2 : props.severity === 'medium' ? 1 : 0,
        riotCount: props.eventType === 'riot' ? 1 : 0,
        highSeverityCount: props.severity === 'high' ? 1 : 0,
        verifiedCount: props.validated ? 1 : 0,
        totalFatalities: Number(props.fatalities ?? 0) || 0,
        riotTimeMs: props.eventType === 'riot' && props.sourceType !== 'gdelt' && Number.isFinite(Number(props.timeMs)) ? Number(props.timeMs) : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.maxSeverityRank = Math.max(Number(acc.maxSeverityRank ?? 0), Number(props.maxSeverityRank ?? 0));
        acc.riotCount = Number(acc.riotCount ?? 0) + Number(props.riotCount ?? 0);
        acc.highSeverityCount = Number(acc.highSeverityCount ?? 0) + Number(props.highSeverityCount ?? 0);
        acc.verifiedCount = Number(acc.verifiedCount ?? 0) + Number(props.verifiedCount ?? 0);
        acc.totalFatalities = Number(acc.totalFatalities ?? 0) + Number(props.totalFatalities ?? 0);
        const accRiot = Number(acc.riotTimeMs ?? 0);
        const propRiot = Number(props.riotTimeMs ?? 0);
        acc.riotTimeMs = Number.isFinite(propRiot) ? Math.max(accRiot, propRiot) : accRiot;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.protestSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildTechHQSupercluster(): void {
    const points = TECH_HQS.map((h, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [h.lon, h.lat] as [number, number] },
      properties: {
        index: i,
        city: h.city,
        country: h.country,
        type: h.type,
      },
    }));
    this.techHQSC = new Supercluster({
      radius: 50,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        city: String(props.city ?? ''),
        country: String(props.country ?? ''),
        faangCount: props.type === 'faang' ? 1 : 0,
        unicornCount: props.type === 'unicorn' ? 1 : 0,
        publicCount: props.type === 'public' ? 1 : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.faangCount = Number(acc.faangCount ?? 0) + Number(props.faangCount ?? 0);
        acc.unicornCount = Number(acc.unicornCount ?? 0) + Number(props.unicornCount ?? 0);
        acc.publicCount = Number(acc.publicCount ?? 0) + Number(props.publicCount ?? 0);
        if (!acc.city && props.city) acc.city = props.city;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.techHQSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildTechEventSupercluster(): void {
    const points = this.techEvents.map((e, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [e.lng, e.lat] as [number, number] },
      properties: {
        index: i,
        location: e.location,
        country: e.country,
        daysUntil: e.daysUntil,
      },
    }));
    this.techEventSC = new Supercluster({
      radius: 50,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => {
        const daysUntil = Number(props.daysUntil ?? Number.MAX_SAFE_INTEGER);
        return {
          index: Number(props.index ?? 0),
          location: String(props.location ?? ''),
          country: String(props.country ?? ''),
          soonestDaysUntil: Number.isFinite(daysUntil) ? daysUntil : Number.MAX_SAFE_INTEGER,
          soonCount: Number.isFinite(daysUntil) && daysUntil <= 14 ? 1 : 0,
        };
      },
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.soonestDaysUntil = Math.min(
          Number(acc.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER),
          Number(props.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER),
        );
        acc.soonCount = Number(acc.soonCount ?? 0) + Number(props.soonCount ?? 0);
        if (!acc.location && props.location) acc.location = props.location;
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.techEventSC.load(points);
    this.lastSCZoom = -1;
  }

  private rebuildDatacenterSupercluster(): void {
    const activeDCs = AI_DATA_CENTERS.filter(dc => dc.status !== 'decommissioned');
    this.datacenterSCSource = activeDCs;
    const points = activeDCs.map((dc, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [dc.lon, dc.lat] as [number, number] },
      properties: {
        index: i,
        country: dc.country,
        chipCount: dc.chipCount,
        powerMW: dc.powerMW ?? 0,
        status: dc.status,
      },
    }));
    this.datacenterSC = new Supercluster({
      radius: 70,
      maxZoom: 14,
      map: (props: Record<string, unknown>) => ({
        index: Number(props.index ?? 0),
        country: String(props.country ?? ''),
        totalChips: Number(props.chipCount ?? 0) || 0,
        totalPowerMW: Number(props.powerMW ?? 0) || 0,
        existingCount: props.status === 'existing' ? 1 : 0,
        plannedCount: props.status === 'planned' ? 1 : 0,
      }),
      reduce: (acc: Record<string, unknown>, props: Record<string, unknown>) => {
        acc.totalChips = Number(acc.totalChips ?? 0) + Number(props.totalChips ?? 0);
        acc.totalPowerMW = Number(acc.totalPowerMW ?? 0) + Number(props.totalPowerMW ?? 0);
        acc.existingCount = Number(acc.existingCount ?? 0) + Number(props.existingCount ?? 0);
        acc.plannedCount = Number(acc.plannedCount ?? 0) + Number(props.plannedCount ?? 0);
        if (!acc.country && props.country) acc.country = props.country;
      },
    });
    this.datacenterSC.load(points);
    this.lastSCZoom = -1;
  }

  private updateClusterData(): void {
    const zoom = Math.floor(this.maplibreMap?.getZoom() ?? 2);
    const bounds = this.maplibreMap?.getBounds();
    if (!bounds) return;
    const bbox: [number, number, number, number] = [
      bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth(),
    ];
    const boundsKey = `${bbox[0].toFixed(4)}:${bbox[1].toFixed(4)}:${bbox[2].toFixed(4)}:${bbox[3].toFixed(4)}`;
    const layers = this.state.layers;
    const useProtests = layers.protests && this.protestSuperclusterSource.length > 0;
    const useTechHQ = SITE_VARIANT === 'tech' && layers.techHQs;
    const useTechEvents = SITE_VARIANT === 'tech' && layers.techEvents && this.techEvents.length > 0;
    const useDatacenterClusters = layers.datacenters && zoom < 5;
    const layerMask = `${Number(useProtests)}${Number(useTechHQ)}${Number(useTechEvents)}${Number(useDatacenterClusters)}`;
    if (zoom === this.lastSCZoom && boundsKey === this.lastSCBoundsKey && layerMask === this.lastSCMask) return;
    this.lastSCZoom = zoom;
    this.lastSCBoundsKey = boundsKey;
    this.lastSCMask = layerMask;

    if (useProtests && this.protestSC) {
      this.protestClusters = this.protestSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const maxSeverityRank = Number(props.maxSeverityRank ?? 0);
          const maxSev = maxSeverityRank >= 2 ? 'high' : maxSeverityRank === 1 ? 'medium' : 0;
          const riotCount = Number(props.riotCount ?? 0);
          const highSeverityCount = Number(props.highSeverityCount ?? 0);
          const verifiedCount = Number(props.verifiedCount ?? 0);
          const totalFatalities = Number(props.totalFatalities ?? 0);
          const clusterCount = Number(f.properties.point_count ?? 0);
          const riotTimeMs = Number(props.riotTimeMs ?? 0);
          return {
            id: `pc-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as SocialUnrestEvent[],
            country: String(props.country ?? ''),
            maxSeverity: maxSev as 'low' | 'medium' | 'high',
            hasRiot: riotCount > 0,
            latestRiotEventTimeMs: riotTimeMs || undefined,
            totalFatalities,
            riotCount,
            highSeverityCount,
            verifiedCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = this.protestSuperclusterSource[f.properties.index]!;
        return {
          id: `pp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], country: item.country,
          maxSeverity: item.severity, hasRiot: item.eventType === 'riot',
          latestRiotEventTimeMs:
            item.eventType === 'riot' && item.sourceType !== 'gdelt' && Number.isFinite(item.time.getTime())
              ? item.time.getTime()
              : undefined,
          totalFatalities: item.fatalities ?? 0,
          riotCount: item.eventType === 'riot' ? 1 : 0,
          highSeverityCount: item.severity === 'high' ? 1 : 0,
          verifiedCount: item.validated ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.protestClusters = [];
    }

    if (useTechHQ && this.techHQSC) {
      this.techHQClusters = this.techHQSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const faangCount = Number(props.faangCount ?? 0);
          const unicornCount = Number(props.unicornCount ?? 0);
          const publicCount = Number(props.publicCount ?? 0);
          const clusterCount = Number(f.properties.point_count ?? 0);
          const primaryType = faangCount >= unicornCount && faangCount >= publicCount
            ? 'faang'
            : unicornCount >= publicCount
              ? 'unicorn'
              : 'public';
          return {
            id: `hc-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as import('@/config/tech-geo').TechHQ[],
            city: String(props.city ?? ''),
            country: String(props.country ?? ''),
            primaryType,
            faangCount,
            unicornCount,
            publicCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = TECH_HQS[f.properties.index]!;
        return {
          id: `hp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], city: item.city, country: item.country,
          primaryType: item.type,
          faangCount: item.type === 'faang' ? 1 : 0,
          unicornCount: item.type === 'unicorn' ? 1 : 0,
          publicCount: item.type === 'public' ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.techHQClusters = [];
    }

    if (useTechEvents && this.techEventSC) {
      this.techEventClusters = this.techEventSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const clusterCount = Number(f.properties.point_count ?? 0);
          const soonestDaysUntil = Number(props.soonestDaysUntil ?? Number.MAX_SAFE_INTEGER);
          const soonCount = Number(props.soonCount ?? 0);
          return {
            id: `ec-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as TechEventMarker[],
            location: String(props.location ?? ''),
            country: String(props.country ?? ''),
            soonestDaysUntil: Number.isFinite(soonestDaysUntil) ? soonestDaysUntil : Number.MAX_SAFE_INTEGER,
            soonCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = this.techEvents[f.properties.index]!;
        return {
          id: `ep-${f.properties.index}`, lat: item.lat, lon: item.lng,
          count: 1, items: [item], location: item.location, country: item.country,
          soonestDaysUntil: item.daysUntil,
          soonCount: item.daysUntil <= 14 ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.techEventClusters = [];
    }

    if (useDatacenterClusters && this.datacenterSC) {
      const activeDCs = this.datacenterSCSource;
      this.datacenterClusters = this.datacenterSC.getClusters(bbox, zoom).map(f => {
        const coords = f.geometry.coordinates as [number, number];
        if (f.properties.cluster) {
          const props = f.properties as Record<string, unknown>;
          const clusterCount = Number(f.properties.point_count ?? 0);
          const existingCount = Number(props.existingCount ?? 0);
          const plannedCount = Number(props.plannedCount ?? 0);
          const totalChips = Number(props.totalChips ?? 0);
          const totalPowerMW = Number(props.totalPowerMW ?? 0);
          return {
            id: `dc-${f.properties.cluster_id}`,
            _clusterId: f.properties.cluster_id!,
            lat: coords[1], lon: coords[0],
            count: clusterCount,
            items: [] as AIDataCenter[],
            region: String(props.country ?? ''),
            country: String(props.country ?? ''),
            totalChips,
            totalPowerMW,
            majorityExisting: existingCount >= Math.max(1, clusterCount / 2),
            existingCount,
            plannedCount,
            sampled: clusterCount > DeckGLMap.MAX_CLUSTER_LEAVES,
          };
        }
        const item = activeDCs[f.properties.index]!;
        return {
          id: `dp-${f.properties.index}`, lat: item.lat, lon: item.lon,
          count: 1, items: [item], region: item.country, country: item.country,
          totalChips: item.chipCount, totalPowerMW: item.powerMW ?? 0,
          majorityExisting: item.status === 'existing',
          existingCount: item.status === 'existing' ? 1 : 0,
          plannedCount: item.status === 'planned' ? 1 : 0,
          sampled: false,
        };
      });
    } else {
      this.datacenterClusters = [];
    }
  }




  private isLayerVisible(layerKey: keyof MapLayers): boolean {
    const threshold = LAYER_ZOOM_THRESHOLDS[layerKey];
    if (!threshold) return true;
    const zoom = this.maplibreMap?.getZoom() || 2;
    return zoom >= threshold.minZoom;
  }

  private buildLayers(): LayersList {
    const startTime = performance.now();
    // Refresh theme-aware overlay colors on each rebuild
    COLORS = getOverlayColors();
    const layers: (Layer | null | false)[] = [];
    const { layers: mapLayers } = this.state;
    const filteredEarthquakes = mapLayers.natural ? this.filterByTime(this.earthquakes, (eq) => eq.occurredAt) : [];
    const filteredNaturalEvents = mapLayers.natural ? this.filterByTime(this.naturalEvents, (event) => event.date) : [];
    const filteredWeatherAlerts = mapLayers.weather ? this.filterByTime(this.weatherAlerts, (alert) => alert.onset) : [];
    const filteredOutages = mapLayers.outages ? this.filterByTime(this.outages, (outage) => outage.pubDate) : [];
    const filteredCableAdvisories = mapLayers.cables ? this.filterByTime(this.cableAdvisories, (advisory) => advisory.reported) : [];
    const filteredFlightDelays = mapLayers.flights ? this.filterByTime(this.flightDelays, (delay) => delay.updatedAt) : [];
    const filteredMilitaryFlights = mapLayers.military ? this.filterByTime(this.militaryFlights, (flight) => flight.lastSeen) : [];
    const filteredMilitaryVessels = mapLayers.military ? this.filterByTime(this.militaryVessels, (vessel) => vessel.lastAisUpdate) : [];
    const filteredMilitaryFlightClusters = mapLayers.military ? this.filterMilitaryFlightClustersByTime(this.militaryFlightClusters) : [];
    const filteredMilitaryVesselClusters = mapLayers.military ? this.filterMilitaryVesselClustersByTime(this.militaryVesselClusters) : [];
    // UCDP is a historical dataset (events aged months); time-range filter always zeroes it out
    const filteredUcdpEvents = mapLayers.ucdpEvents ? this.ucdpEvents : [];

    // Day/night overlay (rendered first as background)
    if (mapLayers.dayNight) {
      if (!this.dayNightIntervalId) this.startDayNightTimer();
      layers.push(this.createDayNightLayer());
    } else {
      if (this.dayNightIntervalId) this.stopDayNightTimer();
      this.layerCache.delete('day-night-layer');
    }

    // Undersea cables layer
    if (mapLayers.cables) {
      layers.push(this.createCablesLayer());
    } else {
      this.layerCache.delete('cables-layer');
    }

    // Pipelines layer
    if (mapLayers.pipelines) {
      layers.push(this.createPipelinesLayer());
    } else {
      this.layerCache.delete('pipelines-layer');
    }

    // Maritime zones layer
    if (mapLayers.maritime) {
      layers.push(this.createMaritimeZonesLayer());
    }

    // Sanctions layer
    if (mapLayers.sanctions) {
      layers.push(this.createSanctionsLayer());
    }


    // Military bases layer — hidden at low zoom (E: progressive disclosure) + clusters
    if (mapLayers.bases && this.isLayerVisible('bases')) {
      const basesLayers = this.createBasesLayer() as unknown as Layer[];
      if (Array.isArray(basesLayers)) {
        layers.push(...basesLayers);
      } else {
        layers.push(basesLayers);
      }
      layers.push(...this.createBasesClusterLayer());
    }
    layers.push(this.createEmptyGhost('bases-layer'));

    // Nuclear facilities layer — hidden at low zoom
    if (mapLayers.nuclear && this.isLayerVisible('nuclear')) {
      layers.push(this.createNuclearLayer());
    }
    layers.push(this.createEmptyGhost('nuclear-layer'));

    // Gamma irradiators layer — hidden at low zoom
    if (mapLayers.irradiators && this.isLayerVisible('irradiators')) {
      layers.push(this.createIrradiatorsLayer());
    }

    // Spaceports layer — hidden at low zoom
    if (mapLayers.spaceports && this.isLayerVisible('spaceports')) {
      layers.push(this.createSpaceportsLayer());
    }

    // Hotspots layer (all hotspots including high/breaking, with pulse + ghost)
    if (mapLayers.hotspots) {
      layers.push(...this.createHotspotsLayers());
    }

    // Datacenters layer - SQUARE icons at zoom >= 5, cluster dots at zoom < 5
    const currentZoom = this.maplibreMap?.getZoom() || 2;
    if (mapLayers.datacenters) {
      if (currentZoom >= 5) {
        layers.push(this.createDatacentersLayer());
      } else {
        layers.push(...this.createDatacenterClusterLayers());
      }
    }

    // Earthquakes layer
    if (mapLayers.natural && filteredEarthquakes.length > 0) {
      layers.push(this.createEarthquakesLayer(filteredEarthquakes));
    }
    layers.push(this.createEmptyGhost('earthquakes-layer'));

    // Natural events layer
    if (mapLayers.natural && filteredNaturalEvents.length > 0) {
      layers.push(this.createNaturalEventsLayer(filteredNaturalEvents));
    }

    // Satellite fires layer (NASA FIRMS)
    if (mapLayers.fires && this.firmsFireData.length > 0) {
      layers.push(this.createFiresLayer());
    }

    // Iran events layer
    if (mapLayers.iranAttacks && this.iranEvents.length > 0) {
      layers.push(this.createIranEventsLayer());
      layers.push(this.createGhostLayer('iran-events-layer', this.iranEvents, d => [d.longitude, d.latitude], { radiusMinPixels: 12 }));
      // Emoji icon overlay
      layers.push(new TextLayer<IranEvent>({
        id: 'iran-events-emoji-layer',
        data: this.iranEvents,
        getPosition: (d: IranEvent) => [d.longitude, d.latitude],
        getText: (d: IranEvent) => d.severity === 'critical' || d.severity === 'high' ? '💥' : '⚠️',
        getSize: 14,
        getColor: [255, 255, 255, 230],
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        billboard: true,
        pickable: false,
      }));
    }

    // Weather alerts layer
    if (mapLayers.weather && filteredWeatherAlerts.length > 0) {
      layers.push(this.createWeatherLayer(filteredWeatherAlerts));
    }

    // Internet outages layer
    if (mapLayers.outages && filteredOutages.length > 0) {
      layers.push(this.createOutagesLayer(filteredOutages));
    }
    layers.push(this.createEmptyGhost('outages-layer'));

    // Cyber threat IOC layer
    if (mapLayers.cyberThreats && this.cyberThreats.length > 0) {
      layers.push(this.createCyberThreatsLayer());
    }
    layers.push(this.createEmptyGhost('cyber-threats-layer'));

    // AIS density layer
    if (mapLayers.ais && this.aisDensity.length > 0) {
      layers.push(this.createAisDensityLayer());
    }

    // AIS disruptions layer (spoofing/jamming)
    if (mapLayers.ais && this.aisDisruptions.length > 0) {
      layers.push(this.createAisDisruptionsLayer());
    }

    // GPS/GNSS jamming layer
    if (mapLayers.gpsJamming && this.gpsJammingHexes.length > 0) {
      layers.push(this.createGpsJammingLayer());
    }

    // Strategic ports layer (shown with AIS)
    if (mapLayers.ais) {
      layers.push(this.createPortsLayer());
    }

    // Cable advisories layer (shown with cables)
    if (mapLayers.cables && filteredCableAdvisories.length > 0) {
      layers.push(this.createCableAdvisoriesLayer(filteredCableAdvisories));
    }

    // Repair ships layer (shown with cables)
    if (mapLayers.cables && this.repairShips.length > 0) {
      layers.push(this.createRepairShipsLayer());
    }

    // Flight delays layer
    if (mapLayers.flights && filteredFlightDelays.length > 0) {
      layers.push(this.createFlightDelaysLayer(filteredFlightDelays));
    }

    // Aircraft positions layer (live tracking, under flights toggle)
    if (mapLayers.flights && this.aircraftPositions.length > 0) {
      layers.push(this.createAircraftPositionsLayer());
    }

    // Protests layer (Supercluster-based deck.gl layers)
    if (mapLayers.protests && this.protests.length > 0) {
      layers.push(...this.createProtestClusterLayers());
    }

    // Military vessels layer
    if (mapLayers.military && filteredMilitaryVessels.length > 0) {
      layers.push(this.createMilitaryVesselsLayer(filteredMilitaryVessels));
    }

    // Military vessel clusters layer
    if (mapLayers.military && filteredMilitaryVesselClusters.length > 0) {
      layers.push(this.createMilitaryVesselClustersLayer(filteredMilitaryVesselClusters));
    }

    // Military flights layer
    if (mapLayers.military && filteredMilitaryFlights.length > 0) {
      layers.push(this.createMilitaryFlightsLayer(filteredMilitaryFlights));
    }

    // Military flight clusters layer
    if (mapLayers.military && filteredMilitaryFlightClusters.length > 0) {
      layers.push(this.createMilitaryFlightClustersLayer(filteredMilitaryFlightClusters));
    }

    // Strategic waterways layer
    if (mapLayers.waterways) {
      layers.push(this.createWaterwaysLayer());
    }

    // Economic centers layer — hidden at low zoom
    if (mapLayers.economic && this.isLayerVisible('economic')) {
      layers.push(this.createEconomicCentersLayer());
    }

    // Finance variant layers
    if (mapLayers.stockExchanges) {
      layers.push(this.createStockExchangesLayer());
    }
    if (mapLayers.financialCenters) {
      layers.push(this.createFinancialCentersLayer());
    }
    if (mapLayers.centralBanks) {
      layers.push(this.createCentralBanksLayer());
    }
    if (mapLayers.commodityHubs) {
      layers.push(this.createCommodityHubsLayer());
    }

    // Critical minerals layer
    if (mapLayers.minerals) {
      layers.push(this.createMineralsLayer());
    }

    // APT Groups layer (geopolitical variant only - always shown, no toggle)
    if (SITE_VARIANT !== 'tech' && SITE_VARIANT !== 'happy') {
      layers.push(this.createAPTGroupsLayer());
    }

    // UCDP georeferenced events layer
    if (mapLayers.ucdpEvents && filteredUcdpEvents.length > 0) {
      layers.push(this.createUcdpEventsLayer(filteredUcdpEvents));
    }

    // Displacement flows arc layer
    if (mapLayers.displacement && this.displacementFlows.length > 0) {
      layers.push(this.createDisplacementArcsLayer());
    }

    // Climate anomalies layers
    if (mapLayers.climate && this.climateAnomalies.length > 0) {
      layers.push(this.createClimateHeatmapLayer());
      layers.push(this.createClimateAnomaliesLayer());
    }

    // Trade routes layer
    if (mapLayers.tradeRoutes) {
      layers.push(this.createTradeRoutesLayer());
      layers.push(this.createTradeChokepointsLayer());
    } else {
      this.layerCache.delete('trade-routes-layer');
      this.layerCache.delete('trade-chokepoints-layer');
    }

    // Tech variant layers (Supercluster-based deck.gl layers for HQs and events)
    if (SITE_VARIANT === 'tech') {
      if (mapLayers.startupHubs) {
        layers.push(this.createStartupHubsLayer());
      }
      if (mapLayers.techHQs) {
        layers.push(...this.createTechHQClusterLayers());
      }
      if (mapLayers.accelerators) {
        layers.push(this.createAcceleratorsLayer());
      }
      if (mapLayers.cloudRegions) {
        layers.push(this.createCloudRegionsLayer());
      }
      if (mapLayers.techEvents && this.techEvents.length > 0) {
        layers.push(...this.createTechEventClusterLayers());
      }
    }

    // Gulf FDI investments layer
    if (mapLayers.gulfInvestments) {
      layers.push(this.createGulfInvestmentsLayer());
    }

    // Positive events layer (happy variant)
    if (mapLayers.positiveEvents && this.positiveEvents.length > 0) {
      layers.push(...this.createPositiveEventsLayers());
    }

    // Kindness layer (happy variant -- green baseline pulses + real kindness events)
    if (mapLayers.kindness && this.kindnessPoints.length > 0) {
      layers.push(...this.createKindnessLayers());
    }

    // Phase 8: Happiness choropleth (rendered below point markers)
    if (mapLayers.happiness) {
      const choropleth = this.createHappinessChoroplethLayer();
      if (choropleth) layers.push(choropleth);
    }
    // CII choropleth (country instability heat-map)
    if (mapLayers.ciiChoropleth) {
      const ciiLayer = this.createCIIChoroplethLayer();
      if (ciiLayer) layers.push(ciiLayer);
    }
    // Phase 8: Species recovery zones
    if (mapLayers.speciesRecovery && this.speciesRecoveryZones.length > 0) {
      layers.push(this.createSpeciesRecoveryLayer());
    }
    // Phase 8: Renewable energy installations
    if (mapLayers.renewableInstallations && this.renewableInstallations.length > 0) {
      layers.push(this.createRenewableInstallationsLayer());
    }

    // News geo-locations (always shown if data exists)
    if (this.newsLocations.length > 0) {
      layers.push(...this.createNewsLocationsLayer());
    }

    // Phase 8: Conflict zones layer (Rendered last to ensure pickability over country choropleths)
    if (mapLayers.conflicts) {
      layers.push(this.createConflictZonesLayer());
    }

    const result = layers.filter(Boolean) as LayersList;
    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(`[DeckGLMap] buildLayers took ${elapsed.toFixed(2)}ms (>16ms budget), ${result.length} layers`);
    }
    return result;
  }

  // Layer creation methods
  private createCablesLayer(): PathLayer {
    const highlightedCables = this.highlightedAssets.cable;
    const cacheKey = 'cables-layer';
    const cached = this.layerCache.get(cacheKey) as PathLayer | undefined;
    const highlightSignature = this.getSetSignature(highlightedCables);
    const healthSignature = Object.keys(this.healthByCableId).sort().join(',');
    if (cached && highlightSignature === this.lastCableHighlightSignature && healthSignature === this.lastCableHealthSignature) return cached;

    const health = this.healthByCableId;
    const layer = new PathLayer({
      id: cacheKey,
      data: UNDERSEA_CABLES,
      getPath: (d) => d.points,
      getColor: (d) => {
        if (highlightedCables.has(d.id)) return COLORS.cableHighlight;
        const h = health[d.id];
        if (h?.status === 'fault') return COLORS.cableFault;
        if (h?.status === 'degraded') return COLORS.cableDegraded;
        return COLORS.cable;
      },
      getWidth: (d) => {
        if (highlightedCables.has(d.id)) return 3;
        const h = health[d.id];
        if (h?.status === 'fault') return 2.5;
        if (h?.status === 'degraded') return 2;
        return 1;
      },
      widthMinPixels: 1,
      widthMaxPixels: 5,
      pickable: true,
      updateTriggers: { highlighted: highlightSignature, health: healthSignature },
    });

    this.lastCableHighlightSignature = highlightSignature;
    this.lastCableHealthSignature = healthSignature;
    this.layerCache.set(cacheKey, layer);
    return layer;
  }

  private createPipelinesLayer(): PathLayer {
    const highlightedPipelines = this.highlightedAssets.pipeline;
    const cacheKey = 'pipelines-layer';
    const cached = this.layerCache.get(cacheKey) as PathLayer | undefined;
    const highlightSignature = this.getSetSignature(highlightedPipelines);
    if (cached && highlightSignature === this.lastPipelineHighlightSignature) return cached;

    const layer = new PathLayer({
      id: cacheKey,
      data: PIPELINES,
      getPath: (d) => d.points,
      getColor: (d) => {
        if (highlightedPipelines.has(d.id)) {
          return [255, 100, 100, 200] as [number, number, number, number];
        }
        const colorKey = d.type as keyof typeof PIPELINE_COLORS;
        const hex = PIPELINE_COLORS[colorKey] || '#666666';
        return this.hexToRgba(hex, 150);
      },
      getWidth: (d) => highlightedPipelines.has(d.id) ? 3 : 1.5,
      widthMinPixels: 1,
      widthMaxPixels: 4,
      pickable: true,
      updateTriggers: { highlighted: highlightSignature },
    });

    this.lastPipelineHighlightSignature = highlightSignature;
    this.layerCache.set(cacheKey, layer);
    return layer;
  }

  private createConflictZonesLayer(): GeoJsonLayer {
    const cacheKey = 'conflict-zones-layer';

    const layer = new GeoJsonLayer({
      id: cacheKey,
      data: CONFLICT_ZONES_GEOJSON,
      filled: true,
      stroked: true,
      getFillColor: () => COLORS.conflict,
      getLineColor: () => [255, 0, 0, 180] as [number, number, number, number],
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 100, 100, 150] as [number, number, number, number],
    });
    return layer;
  }

  private createMaritimeZonesLayer(): GeoJsonLayer {
    const cacheKey = 'maritime-zones-layer';
    return new GeoJsonLayer({
      id: cacheKey,
      data: MARITIME_ZONES_GEOJSON,
      filled: true,
      stroked: true,
      getFillColor: (d: any) => {
        const type = d.properties.type;
        if (type === 'high-risk') return [255, 80, 0, 40];
        if (type === 'contested') return [255, 200, 0, 30];
        return [0, 200, 255, 25];
      },
      getLineColor: (d: any) => {
        const type = d.properties.type;
        if (type === 'high-risk') return [255, 80, 0, 150];
        if (type === 'contested') return [255, 200, 0, 120];
        return [0, 200, 255, 100];
      },
      getLineWidth: 2,
      lineWidthMinPixels: 1,
      pickable: true,
    });
  }

  private createSanctionsLayer(): GeoJsonLayer | any {
    if (!this.countriesGeoJsonData) return this.createEmptyGhost('sanctions-layer');

    const sanctionColors: Record<string, [number, number, number, number]> = {
      severe: [255, 0, 0, 90],
      high: [255, 100, 0, 70],
      moderate: [255, 200, 0, 50],
    };

    return new GeoJsonLayer({
      id: 'sanctions-layer',
      data: this.countriesGeoJsonData,
      filled: true,
      stroked: true,
      getFillColor: (f: any) => {
        const id = f.id;
        if (id !== undefined && SANCTIONED_COUNTRIES[id]) {
          return sanctionColors[SANCTIONED_COUNTRIES[id]] || [0, 0, 0, 0];
        }
        return [0, 0, 0, 0];
      },
      getLineColor: (f: any) => {
        const id = f.id;
        if (id !== undefined && SANCTIONED_COUNTRIES[id]) {
          return [255, 255, 255, 50];
        }
        return [0, 0, 0, 0];
      },
      getLineWidth: 1,
      pickable: true,
    });
  }


  private getBasesData(): MilitaryBaseEnriched[] {
    return (this.serverBasesLoaded && this.serverBases.length > 0) ? this.serverBases : MILITARY_BASES as MilitaryBaseEnriched[];
  }

  private getBaseColor(type: string, a: number): [number, number, number, number] {
    switch (type) {
      case 'us-nato': return [68, 136, 255, a];
      case 'russia': return [255, 68, 68, a];
      case 'china': return [255, 136, 68, a];
      case 'uk': return [68, 170, 255, a];
      case 'france': return [0, 85, 164, a];
      case 'india': return [255, 153, 51, a];
      case 'japan': return [188, 0, 45, a];
      default: return [136, 136, 136, a];
    }
  }

  private createBasesLayer(): Layer {
    const highlightedBases = this.highlightedAssets.base;
    const zoom = this.maplibreMap?.getZoom() || 3;
    const alphaScale = Math.min(1, (zoom - 2.5) / 2.5);
    const a = Math.round(180 * Math.max(0.3, alphaScale));
    const data = this.getBasesData();

    // Helper to pick emoji icon per base category
    const baseEmoji = (d: MilitaryBaseEnriched) => {
      if (d.catNaval) return '⚓';
      if (d.catAirforce) return '🛩';
      if (d.catSpace) return '🚀';
      if (d.catNuclear) return '☢';
      return '🏛';
    };

    // Background dot for pickability + halo
    const dotLayer = new ScatterplotLayer<MilitaryBaseEnriched>({
      id: 'bases-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => highlightedBases.has(d.id) ? 8000 : 5000,
      getFillColor: (d) => {
        if (highlightedBases.has(d.id)) return [255, 100, 100, 200] as [number, number, number, number];
        return this.getBaseColor(d.type, a);
      },
      stroked: true,
      getLineColor: (d) => {
        const c = this.getBaseColor(d.type, 200);
        return [c[0], c[1], c[2], 120] as [number, number, number, number];
      },
      lineWidthMinPixels: 1,
      radiusMinPixels: 4,
      radiusMaxPixels: 14,
      pickable: true,
    });

    // Emoji label on top
    const textLayer = new TextLayer<MilitaryBaseEnriched>({
      id: 'bases-emoji-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getText: baseEmoji,
      getSize: zoom > 5 ? 16 : 13,
      getColor: [255, 255, 255, Math.round(220 * Math.max(0.5, alphaScale))],
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
      billboard: true,
      pickable: false,
    });

    return [dotLayer, textLayer] as unknown as Layer;
  }

  private createBasesClusterLayer(): Layer[] {
    if (this.serverBaseClusters.length === 0) return [];
    const zoom = this.maplibreMap?.getZoom() || 3;
    const alphaScale = Math.min(1, (zoom - 2.5) / 2.5);
    const a = Math.round(180 * Math.max(0.3, alphaScale));

    const scatterLayer = new ScatterplotLayer<ServerBaseCluster>({
      id: 'bases-cluster-layer',
      data: this.serverBaseClusters,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => Math.max(8000, Math.log2(d.count) * 6000),
      getFillColor: (d) => this.getBaseColor(d.dominantType, a),
      radiusMinPixels: 10,
      radiusMaxPixels: 40,
      pickable: true,
    });

    const textLayer = new TextLayer<ServerBaseCluster>({
      id: 'bases-cluster-text',
      data: this.serverBaseClusters,
      getPosition: (d) => [d.longitude, d.latitude],
      getText: (d) => String(d.count),
      getSize: 12,
      getColor: [255, 255, 255, 220],
      fontWeight: 'bold',
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
    });

    return [scatterLayer, textLayer];
  }

  private createNuclearLayer(): IconLayer {
    const highlightedNuclear = this.highlightedAssets.nuclear;
    const data = NUCLEAR_FACILITIES.filter(f => f.status !== 'decommissioned');

    return new IconLayer({
      id: 'nuclear-layer',
      data,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'radiation',
      iconAtlas: MARKER_ICONS.atlas,
      iconMapping: GLOBAL_ICON_MAPPING,
      getSize: (d) => highlightedNuclear.has(d.id) ? 15 : 11,
      getColor: (d) => {
        if (highlightedNuclear.has(d.id)) {
          return [255, 100, 100, 220] as [number, number, number, number];
        }
        if (d.status === 'contested') {
          return [255, 50, 50, 200] as [number, number, number, number];
        }
        return [255, 220, 0, 200] as [number, number, number, number]; // Semi-transparent yellow
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 15,
      pickable: true,
    });
  }

  private createIrradiatorsLayer(): IconLayer {
    return new IconLayer({
      id: 'irradiators-layer',
      data: GAMMA_IRRADIATORS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'radiation',
      iconAtlas: MARKER_ICONS.atlas,
      iconMapping: GLOBAL_ICON_MAPPING,
      getSize: 10,
      getColor: [255, 100, 255, 180] as [number, number, number, number], // Magenta
      sizeMinPixels: 5,
      sizeMaxPixels: 14,
      pickable: true,
    });
  }

  private createSpaceportsLayer(): IconLayer {
    return new IconLayer({
      id: 'spaceports-layer',
      data: SPACEPORTS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'rocket',
      iconAtlas: MARKER_ICONS.atlas,
      iconMapping: GLOBAL_ICON_MAPPING,
      getSize: 12,
      getColor: [200, 100, 255, 200] as [number, number, number, number], // Purple
      sizeMinPixels: 6,
      sizeMaxPixels: 16,
      pickable: true,
    });
  }

  private createPortsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'ports-layer',
      data: PORTS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 6000,
      getFillColor: (d) => {
        // Color by port type (matching old Map.ts icons)
        switch (d.type) {
          case 'naval': return [100, 150, 255, 200] as [number, number, number, number]; // Blue - ⚓
          case 'oil': return [255, 140, 0, 200] as [number, number, number, number]; // Orange - 🛢️
          case 'lng': return [255, 200, 50, 200] as [number, number, number, number]; // Yellow - 🛢️
          case 'container': return [0, 200, 255, 180] as [number, number, number, number]; // Cyan - 🏭
          case 'mixed': return [150, 200, 150, 180] as [number, number, number, number]; // Green
          case 'bulk': return [180, 150, 120, 180] as [number, number, number, number]; // Brown
          default: return [0, 200, 255, 160] as [number, number, number, number];
        }
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createFlightDelaysLayer(delays: AirportDelayAlert[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'flight-delays-layer',
      data: delays,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => {
        if (d.severity === 'severe') return 15000;
        if (d.severity === 'major') return 12000;
        if (d.severity === 'moderate') return 10000;
        return 8000;
      },
      getFillColor: (d) => {
        if (d.severity === 'severe') return [255, 50, 50, 200] as [number, number, number, number];
        if (d.severity === 'major') return [255, 150, 0, 200] as [number, number, number, number];
        if (d.severity === 'moderate') return [255, 200, 100, 180] as [number, number, number, number];
        return [180, 180, 180, 150] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 15,
      pickable: true,
    });
  }

  private createAircraftPositionsLayer(): IconLayer<PositionSample> {
    return new IconLayer<PositionSample>({
      id: 'aircraft-positions-layer',
      data: this.aircraftPositions,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'plane',
      iconAtlas: MARKER_ICONS.atlas,
      iconMapping: GLOBAL_ICON_MAPPING,
      getSize: (d) => d.onGround ? 14 : 18,
      getColor: (d) => {
        if (d.onGround) return [120, 120, 120, 160] as [number, number, number, number];
        return [160, 100, 255, 220] as [number, number, number, number]; // Purple for all airborne
      },
      getAngle: (d) => -d.trackDeg,
      sizeMinPixels: 8,
      sizeMaxPixels: 28,
      sizeScale: 1,
      pickable: true,
      billboard: false,
    });
  }

  private createGhostLayer<T>(id: string, data: T[], getPosition: (d: T) => [number, number], opts: { radiusMinPixels?: number } = {}): ScatterplotLayer<T> {
    return new ScatterplotLayer<T>({
      id: `${id}-ghost`,
      data,
      getPosition,
      getRadius: 1,
      radiusMinPixels: opts.radiusMinPixels ?? 12,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
    });
  }

  /** Empty sentinel layer — keeps a stable layer ID for deck.gl interleaved mode without rendering anything. */
  private createEmptyGhost(id: string): ScatterplotLayer {
    return new ScatterplotLayer({ id: `${id}-ghost`, data: [], getPosition: () => [0, 0], visible: false });
  }


  private createDatacentersLayer(): IconLayer {
    const highlightedDatacenters = this.highlightedAssets.datacenter;

    return new IconLayer({
      id: 'datacenters-layer',
      data: AI_DATA_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'chip',
      iconAtlas: MARKER_ICONS.atlas,
      iconMapping: GLOBAL_ICON_MAPPING,
      getSize: (d) => highlightedDatacenters.has(d.id) ? 15 : 11,
      getColor: (d) => {
        if (highlightedDatacenters.has(d.id)) {
          return [255, 100, 100, 220] as [number, number, number, number];
        }
        return [0, 255, 200, 180] as [number, number, number, number];
      },
      sizeScale: 1,
      sizeMinPixels: 6,
      sizeMaxPixels: 15,
      pickable: true,
    });
  }

  private createEarthquakesLayer(earthquakes: Earthquake[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'earthquakes-layer',
      data: earthquakes,
      getPosition: (d) => [d.location?.longitude ?? 0, d.location?.latitude ?? 0],
      getRadius: (d) => Math.pow(2, d.magnitude) * 1000,
      getFillColor: (d) => {
        const mag = d.magnitude;
        if (mag >= 6) return [255, 0, 0, 200] as [number, number, number, number];
        if (mag >= 5) return [255, 100, 0, 200] as [number, number, number, number];
        return COLORS.earthquake;
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 30,
      pickable: true,
    });
  }

  private createNaturalEventsLayer(events: NaturalEvent[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'natural-events-layer',
      data: events,
      getPosition: (d: NaturalEvent) => [d.lon, d.lat],
      getRadius: (d: NaturalEvent) => d.title.startsWith('🔴') ? 20000 : d.title.startsWith('🟠') ? 15000 : 8000,
      getFillColor: (d: NaturalEvent) => {
        if (d.title.startsWith('🔴')) return [255, 0, 0, 220] as [number, number, number, number];
        if (d.title.startsWith('🟠')) return [255, 140, 0, 200] as [number, number, number, number];
        return [255, 150, 50, 180] as [number, number, number, number];
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      pickable: true,
    });
  }

  private createFiresLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'fires-layer',
      data: this.firmsFireData,
      getPosition: (d: (typeof this.firmsFireData)[0]) => [d.lon, d.lat],
      getRadius: (d: (typeof this.firmsFireData)[0]) => Math.min(d.frp * 200, 30000) || 5000,
      getFillColor: (d: (typeof this.firmsFireData)[0]) => {
        if (d.brightness > 400) return [255, 30, 0, 220] as [number, number, number, number];
        if (d.brightness > 350) return [255, 140, 0, 200] as [number, number, number, number];
        return [255, 220, 50, 180] as [number, number, number, number];
      },
      radiusMinPixels: 3,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createIranEventsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'iran-events-layer',
      data: this.iranEvents,
      getPosition: (d: IranEvent) => [d.longitude, d.latitude],
      getRadius: (d: IranEvent) => (d.severity === 'high' || d.severity === 'critical') ? 20000 : d.severity === 'medium' ? 15000 : 10000,
      getFillColor: (d: IranEvent) => {
        if (d.severity === 'critical' || d.category === 'military') return [255, 50, 50, 220] as [number, number, number, number];
        if (d.category === 'politics' || d.category === 'diplomacy') return [255, 165, 0, 200] as [number, number, number, number];
        return [255, 255, 0, 180] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 16,
      pickable: true,
    });
  }

  private createWeatherLayer(alerts: WeatherAlert[]): ScatterplotLayer {
    // Filter weather alerts that have centroid coordinates
    const alertsWithCoords = alerts.filter(a => a.centroid && a.centroid.length === 2);

    return new ScatterplotLayer({
      id: 'weather-layer',
      data: alertsWithCoords,
      getPosition: (d) => d.centroid as [number, number], // centroid is [lon, lat]
      getRadius: 25000,
      getFillColor: (d) => {
        if (d.severity === 'Extreme') return [255, 0, 0, 200] as [number, number, number, number];
        if (d.severity === 'Severe') return [255, 100, 0, 180] as [number, number, number, number];
        if (d.severity === 'Moderate') return [255, 170, 0, 160] as [number, number, number, number];
        return COLORS.weather;
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 20,
      pickable: true,
    });
  }

  private createOutagesLayer(outages: InternetOutage[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'outages-layer',
      data: outages,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 20000,
      getFillColor: COLORS.outage,
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      pickable: true,
    });
  }

  private createCyberThreatsLayer(): ScatterplotLayer<CyberThreat> {
    return new ScatterplotLayer<CyberThreat>({
      id: 'cyber-threats-layer',
      data: this.cyberThreats,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => {
        switch (d.severity) {
          case 'critical': return 22000;
          case 'high': return 17000;
          case 'medium': return 13000;
          default: return 9000;
        }
      },
      getFillColor: (d) => {
        switch (d.severity) {
          case 'critical': return [255, 61, 0, 225] as [number, number, number, number];
          case 'high': return [255, 102, 0, 205] as [number, number, number, number];
          case 'medium': return [255, 176, 0, 185] as [number, number, number, number];
          default: return [255, 235, 59, 170] as [number, number, number, number];
        }
      },
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 160] as [number, number, number, number],
      lineWidthMinPixels: 1,
    });
  }

  private createAisDensityLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'ais-density-layer',
      data: this.aisDensity,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 4000 + d.intensity * 8000,
      getFillColor: (d) => {
        const intensity = Math.min(Math.max(d.intensity, 0.15), 1);
        const isCongested = (d.deltaPct || 0) >= 15;
        const alpha = Math.round(40 + intensity * 160);
        // Orange for congested areas, cyan for normal traffic
        if (isCongested) {
          return [255, 183, 3, alpha] as [number, number, number, number]; // #ffb703
        }
        return [0, 209, 255, alpha] as [number, number, number, number]; // #00d1ff
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createGpsJammingLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'gps-jamming-layer',
      data: this.gpsJammingHexes,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.level === 'high' ? 15000 : 10000,
      getFillColor: (d) => {
        if (d.level === 'high') return [255, 80, 80, 200] as [number, number, number, number];
        return [255, 180, 50, 180] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 14,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 100] as [number, number, number, number],
      lineWidthMinPixels: 1,
    });
  }

  private createAisDisruptionsLayer(): ScatterplotLayer {
    // AIS spoofing/jamming events
    return new ScatterplotLayer({
      id: 'ais-disruptions-layer',
      data: this.aisDisruptions,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: (d) => {
        // Color by severity/type
        if (d.severity === 'high' || d.type === 'spoofing') {
          return [255, 50, 50, 220] as [number, number, number, number]; // Red
        }
        if (d.severity === 'medium') {
          return [255, 150, 0, 200] as [number, number, number, number]; // Orange
        }
        return [255, 200, 100, 180] as [number, number, number, number]; // Yellow
      },
      radiusMinPixels: 6,
      radiusMaxPixels: 14,
      pickable: true,
      stroked: true,
      getLineColor: [255, 255, 255, 150] as [number, number, number, number],
      lineWidthMinPixels: 1,
    });
  }

  private createCableAdvisoriesLayer(advisories: CableAdvisory[]): ScatterplotLayer {
    // Cable fault/maintenance advisories
    return new ScatterplotLayer({
      id: 'cable-advisories-layer',
      data: advisories,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 10000,
      getFillColor: (d) => {
        if (d.severity === 'fault') {
          return [255, 50, 50, 220] as [number, number, number, number]; // Red for faults
        }
        return [255, 200, 0, 200] as [number, number, number, number]; // Yellow for maintenance
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
      stroked: true,
      getLineColor: [0, 200, 255, 200] as [number, number, number, number], // Cyan outline (cable color)
      lineWidthMinPixels: 2,
    });
  }

  private createRepairShipsLayer(): ScatterplotLayer {
    // Cable repair ships
    return new ScatterplotLayer({
      id: 'repair-ships-layer',
      data: this.repairShips,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: [0, 255, 200, 200] as [number, number, number, number], // Teal
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createMilitaryVesselsLayer(vessels: MilitaryVessel[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'military-vessels-layer',
      data: vessels,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 6000,
      getFillColor: (d) => {
        if (d.usniSource) return [255, 160, 60, 160] as [number, number, number, number]; // Orange, lower alpha for USNI-only
        return COLORS.vesselMilitary;
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
      stroked: true,
      getLineColor: (d) => {
        if (d.usniSource) return [255, 180, 80, 200] as [number, number, number, number]; // Orange outline
        return [0, 0, 0, 0] as [number, number, number, number]; // No outline for AIS
      },
      lineWidthMinPixels: 2,
    });
  }

  private createMilitaryVesselClustersLayer(clusters: MilitaryVesselCluster[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'military-vessel-clusters-layer',
      data: clusters,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 15000 + (d.vesselCount || 1) * 3000,
      getFillColor: (d) => {
        // Vessel types: 'exercise' | 'deployment' | 'transit' | 'unknown'
        const activity = d.activityType || 'unknown';
        if (activity === 'exercise' || activity === 'deployment') return [255, 100, 100, 200] as [number, number, number, number];
        if (activity === 'transit') return [255, 180, 100, 180] as [number, number, number, number];
        return [200, 150, 150, 160] as [number, number, number, number];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      pickable: true,
    });
  }

  private createMilitaryFlightsLayer(flights: MilitaryFlight[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'military-flights-layer',
      data: flights,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: COLORS.flightMilitary,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createMilitaryFlightClustersLayer(clusters: MilitaryFlightCluster[]): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'military-flight-clusters-layer',
      data: clusters,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => 15000 + (d.flightCount || 1) * 3000,
      getFillColor: (d) => {
        const activity = d.activityType || 'unknown';
        if (activity === 'exercise' || activity === 'patrol') return [100, 150, 255, 200] as [number, number, number, number];
        if (activity === 'transport') return [255, 200, 100, 180] as [number, number, number, number];
        return [150, 150, 200, 160] as [number, number, number, number];
      },
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      pickable: true,
    });
  }

  private createWaterwaysLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'waterways-layer',
      data: STRATEGIC_WATERWAYS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 10000,
      getFillColor: [100, 150, 255, 180] as [number, number, number, number],
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createEconomicCentersLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'economic-centers-layer',
      data: ECONOMIC_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: [255, 215, 0, 180] as [number, number, number, number],
      radiusMinPixels: 4,
      radiusMaxPixels: 10,
      pickable: true,
    });
  }

  private createStockExchangesLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'stock-exchanges-layer',
      data: STOCK_EXCHANGES,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.tier === 'mega' ? 18000 : d.tier === 'major' ? 14000 : 11000,
      getFillColor: (d) => {
        if (d.tier === 'mega') return [255, 215, 80, 220] as [number, number, number, number];
        if (d.tier === 'major') return COLORS.stockExchange;
        return [140, 210, 255, 190] as [number, number, number, number];
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 14,
      pickable: true,
    });
  }

  private createFinancialCentersLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'financial-centers-layer',
      data: FINANCIAL_CENTERS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.type === 'global' ? 17000 : d.type === 'regional' ? 13000 : 10000,
      getFillColor: (d) => {
        if (d.type === 'global') return COLORS.financialCenter;
        if (d.type === 'regional') return [0, 190, 130, 185] as [number, number, number, number];
        return [0, 150, 110, 165] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createCentralBanksLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'central-banks-layer',
      data: CENTRAL_BANKS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.type === 'major' ? 15000 : d.type === 'supranational' ? 17000 : 12000,
      getFillColor: (d) => {
        if (d.type === 'major') return COLORS.centralBank;
        if (d.type === 'supranational') return [255, 235, 140, 220] as [number, number, number, number];
        return [235, 180, 80, 185] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createCommodityHubsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'commodity-hubs-layer',
      data: COMMODITY_HUBS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => d.type === 'exchange' ? 14000 : d.type === 'port' ? 12000 : 10000,
      getFillColor: (d) => {
        if (d.type === 'exchange') return COLORS.commodityHub;
        if (d.type === 'port') return [80, 170, 255, 190] as [number, number, number, number];
        return [255, 110, 80, 185] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: 11,
      pickable: true,
    });
  }

  private createAPTGroupsLayer(): ScatterplotLayer {
    // APT Groups - cyber threat actor markers (geopolitical variant only)
    // Made subtle to avoid visual clutter - small orange dots
    return new ScatterplotLayer({
      id: 'apt-groups-layer',
      data: APT_GROUPS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 6000,
      getFillColor: [255, 140, 0, 140] as [number, number, number, number], // Subtle orange
      radiusMinPixels: 4,
      radiusMaxPixels: 8,
      pickable: true,
      stroked: false, // No outline - cleaner look
    });
  }

  private createMineralsLayer(): ScatterplotLayer {
    // Critical minerals projects
    return new ScatterplotLayer({
      id: 'minerals-layer',
      data: CRITICAL_MINERALS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 8000,
      getFillColor: (d) => {
        // Color by mineral type
        switch (d.mineral) {
          case 'Lithium': return [0, 200, 255, 200] as [number, number, number, number]; // Cyan
          case 'Cobalt': return [100, 100, 255, 200] as [number, number, number, number]; // Blue
          case 'Rare Earths': return [255, 100, 200, 200] as [number, number, number, number]; // Pink
          case 'Nickel': return [100, 255, 100, 200] as [number, number, number, number]; // Green
          default: return [200, 200, 200, 200] as [number, number, number, number]; // Gray
        }
      },
      radiusMinPixels: 5,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  // Tech variant layers
  private createStartupHubsLayer(): IconLayer {
    return new IconLayer({
      id: 'startup-hubs-layer',
      data: STARTUP_HUBS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'chip',
      iconAtlas: MARKER_ICONS.atlas,
      iconMapping: GLOBAL_ICON_MAPPING,
      getSize: 12,
      getColor: COLORS.startupHub,
      sizeMinPixels: 5,
      sizeMaxPixels: 14,
      pickable: true,
    });
  }

  private createAcceleratorsLayer(): IconLayer {
    return new IconLayer({
      id: 'accelerators-layer',
      data: ACCELERATORS,
      getPosition: (d) => [d.lon, d.lat],
      getIcon: () => 'chip',
      iconAtlas: MARKER_ICONS.atlas,
      iconMapping: GLOBAL_ICON_MAPPING,
      getSize: 10,
      getColor: COLORS.accelerator,
      sizeMinPixels: 4,
      sizeMaxPixels: 10,
      pickable: true,
    });
  }

  private createCloudRegionsLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'cloud-regions-layer',
      data: CLOUD_REGIONS,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: COLORS.cloudRegion,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  private createProtestClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new ScatterplotLayer<MapProtestCluster>({
      id: 'protest-clusters-layer',
      data: this.protestClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 15000 + d.count * 2000,
      radiusMinPixels: 6,
      radiusMaxPixels: 22,
      getFillColor: d => {
        if (d.hasRiot) return [220, 40, 40, 200] as [number, number, number, number];
        if (d.maxSeverity === 'high') return [255, 80, 60, 180] as [number, number, number, number];
        if (d.maxSeverity === 'medium') return [255, 160, 40, 160] as [number, number, number, number];
        return [255, 220, 80, 140] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom, getFillColor: this.lastSCZoom },
    }));

    const multiClusters = this.protestClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapProtestCluster>({
        id: 'protest-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    const pulseClusters = this.protestClusters.filter(c => c.maxSeverity === 'high' || c.hasRiot);
    if (pulseClusters.length > 0) {
      const pulse = 1.0 + 0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(new ScatterplotLayer<MapProtestCluster>({
        id: 'protest-clusters-pulse',
        data: pulseClusters,
        getPosition: d => [d.lon, d.lat],
        getRadius: d => 15000 + d.count * 2000,
        radiusScale: pulse,
        radiusMinPixels: 8,
        radiusMaxPixels: 30,
        stroked: true,
        filled: false,
        getLineColor: d => d.hasRiot ? [220, 40, 40, 120] as [number, number, number, number] : [255, 80, 60, 100] as [number, number, number, number],
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));
    }

    layers.push(this.createEmptyGhost('protest-clusters-layer'));
    return layers;
  }

  private createTechHQClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];
    const zoom = this.maplibreMap?.getZoom() || 2;

    layers.push(new ScatterplotLayer<MapTechHQCluster>({
      id: 'tech-hq-clusters-layer',
      data: this.techHQClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 10000 + d.count * 1500,
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      getFillColor: d => {
        if (d.primaryType === 'faang') return [0, 220, 120, 200] as [number, number, number, number];
        if (d.primaryType === 'unicorn') return [255, 100, 200, 180] as [number, number, number, number];
        return [80, 160, 255, 180] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom },
    }));

    const multiClusters = this.techHQClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapTechHQCluster>({
        id: 'tech-hq-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    if (zoom >= 3) {
      const singles = this.techHQClusters.filter(c => c.count === 1);
      if (singles.length > 0) {
        layers.push(new TextLayer<MapTechHQCluster>({
          id: 'tech-hq-clusters-label',
          data: singles,
          getText: d => d.items[0]?.company ?? '',
          getPosition: d => [d.lon, d.lat],
          getSize: 11,
          getColor: [220, 220, 220, 200],
          getPixelOffset: [0, 12],
          pickable: false,
          fontFamily: 'system-ui, sans-serif',
        }));
      }
    }

    layers.push(this.createEmptyGhost('tech-hq-clusters-layer'));
    return layers;
  }

  private createTechEventClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new ScatterplotLayer<MapTechEventCluster>({
      id: 'tech-event-clusters-layer',
      data: this.techEventClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 10000 + d.count * 1500,
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      getFillColor: d => {
        if (d.soonestDaysUntil <= 14) return [255, 220, 50, 200] as [number, number, number, number];
        return [80, 140, 255, 180] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom },
    }));

    const multiClusters = this.techEventClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapTechEventCluster>({
        id: 'tech-event-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    layers.push(this.createEmptyGhost('tech-event-clusters-layer'));
    return layers;
  }

  private createDatacenterClusterLayers(): Layer[] {
    this.updateClusterData();
    const layers: Layer[] = [];

    layers.push(new ScatterplotLayer<MapDatacenterCluster>({
      id: 'datacenter-clusters-layer',
      data: this.datacenterClusters,
      getPosition: d => [d.lon, d.lat],
      getRadius: d => 15000 + d.count * 2000,
      radiusMinPixels: 6,
      radiusMaxPixels: 20,
      getFillColor: d => {
        if (d.majorityExisting) return [160, 80, 255, 180] as [number, number, number, number];
        return [80, 160, 255, 180] as [number, number, number, number];
      },
      pickable: true,
      updateTriggers: { getRadius: this.lastSCZoom },
    }));

    const multiClusters = this.datacenterClusters.filter(c => c.count > 1);
    if (multiClusters.length > 0) {
      layers.push(new TextLayer<MapDatacenterCluster>({
        id: 'datacenter-clusters-badge',
        data: multiClusters,
        getText: d => String(d.count),
        getPosition: d => [d.lon, d.lat],
        background: true,
        getBackgroundColor: [0, 0, 0, 180],
        backgroundPadding: [4, 2, 4, 2],
        getColor: [255, 255, 255, 255],
        getSize: 12,
        getPixelOffset: [0, -14],
        pickable: false,
        fontFamily: 'system-ui, sans-serif',
        fontWeight: 700,
      }));
    }

    layers.push(this.createEmptyGhost('datacenter-clusters-layer'));
    return layers;
  }

  private createHotspotsLayers(): Layer[] {
    const zoom = this.maplibreMap?.getZoom() || 2;
    const zoomScale = Math.min(1, (zoom - 1) / 3);
    const maxPx = 6 + Math.round(14 * zoomScale);
    const baseOpacity = zoom < 2.5 ? 0.5 : zoom < 4 ? 0.7 : 1.0;
    const layers: Layer[] = [];

    layers.push(new ScatterplotLayer({
      id: 'hotspots-layer',
      data: this.hotspots,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: (d) => {
        const score = d.escalationScore || 1;
        return 10000 + score * 5000;
      },
      getFillColor: (d) => {
        const score = d.escalationScore || 1;
        const a = Math.round((score >= 4 ? 200 : score >= 2 ? 200 : 180) * baseOpacity);
        if (score >= 4) return [255, 68, 68, a] as [number, number, number, number];
        if (score >= 2) return [255, 165, 0, a] as [number, number, number, number];
        return [255, 255, 0, a] as [number, number, number, number];
      },
      radiusMinPixels: 4,
      radiusMaxPixels: maxPx,
      pickable: true,
      stroked: true,
      getLineColor: (d) =>
        d.hasBreaking ? [255, 255, 255, 255] as [number, number, number, number] : [0, 0, 0, 0] as [number, number, number, number],
      lineWidthMinPixels: 2,
    }));

    const highHotspots = this.hotspots.filter(h => h.level === 'high' || h.hasBreaking);
    if (highHotspots.length > 0) {
      const pulse = 1.0 + 0.8 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 400));
      layers.push(new ScatterplotLayer({
        id: 'hotspots-pulse',
        data: highHotspots,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: (d) => {
          const score = d.escalationScore || 1;
          return 10000 + score * 5000;
        },
        radiusScale: pulse,
        radiusMinPixels: 6,
        radiusMaxPixels: 30,
        stroked: true,
        filled: false,
        getLineColor: (d) => {
          const a = Math.round(120 * baseOpacity);
          return d.hasBreaking ? [255, 50, 50, a] as [number, number, number, number] : [255, 165, 0, a] as [number, number, number, number];
        },
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));

    }

    layers.push(this.createEmptyGhost('hotspots-layer'));
    return layers;
  }

  private createGulfInvestmentsLayer(): ScatterplotLayer {
    return new ScatterplotLayer<GulfInvestment>({
      id: 'gulf-investments-layer',
      data: GULF_INVESTMENTS,
      getPosition: (d: GulfInvestment) => [d.lon, d.lat],
      getRadius: (d: GulfInvestment) => {
        if (!d.investmentUSD) return 20000;
        if (d.investmentUSD >= 50000) return 70000;
        if (d.investmentUSD >= 10000) return 55000;
        if (d.investmentUSD >= 1000) return 40000;
        return 25000;
      },
      getFillColor: (d: GulfInvestment) =>
        d.investingCountry === 'SA' ? COLORS.gulfInvestmentSA : COLORS.gulfInvestmentUAE,
      getLineColor: [255, 255, 255, 80] as [number, number, number, number],
      lineWidthMinPixels: 1,
      radiusMinPixels: 5,
      radiusMaxPixels: 28,
      pickable: true,
    });
  }

  private pulseTime = 0;

  private canPulse(now = Date.now()): boolean {
    return now - this.startupTime > 60_000;
  }

  private hasRecentRiot(now = Date.now(), windowMs = 2 * 60 * 60 * 1000): boolean {
    const hasRecentClusterRiot = this.protestClusters.some(c =>
      c.hasRiot && c.latestRiotEventTimeMs != null && (now - c.latestRiotEventTimeMs) < windowMs
    );
    if (hasRecentClusterRiot) return true;

    // Fallback to raw protests because syncPulseAnimation can run before cluster data refreshes.
    return this.protests.some((p) => {
      if (p.eventType !== 'riot' || p.sourceType === 'gdelt') return false;
      const ts = p.time.getTime();
      return Number.isFinite(ts) && (now - ts) < windowMs;
    });
  }

  private needsPulseAnimation(now = Date.now()): boolean {
    return this.hasRecentNews(now)
      || this.hasRecentRiot(now)
      || this.hotspots.some(h => h.hasBreaking)
      || this.positiveEvents.some(e => e.count > 10)
      || this.kindnessPoints.some(p => p.type === 'real');
  }

  private syncPulseAnimation(now = Date.now()): boolean {
    if (this.renderPaused) {
      if (this.newsPulseIntervalId !== null) this.stopPulseAnimation();
      return false;
    }
    const shouldPulse = this.canPulse(now) && this.needsPulseAnimation(now);
    if (shouldPulse && this.newsPulseIntervalId === null) {
      this.startPulseAnimation();
    } else if (!shouldPulse && this.newsPulseIntervalId !== null) {
      this.stopPulseAnimation();
    }
    return shouldPulse;
  }

  private startPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) return;
    const PULSE_UPDATE_INTERVAL_MS = 500;

    this.newsPulseIntervalId = setInterval(() => {
      const now = Date.now();
      if (!this.needsPulseAnimation(now)) {
        this.pulseTime = now;
        this.stopPulseAnimation();
        this.rafUpdateLayers();
        return;
      }
      this.pulseTime = now;
      this.rafUpdateLayers();
    }, PULSE_UPDATE_INTERVAL_MS);
  }

  private stopPulseAnimation(): void {
    if (this.newsPulseIntervalId !== null) {
      clearInterval(this.newsPulseIntervalId);
      this.newsPulseIntervalId = null;
    }
  }

  private createNewsLocationsLayer(): ScatterplotLayer[] {
    const zoom = this.maplibreMap?.getZoom() || 2;
    const alphaScale = zoom < 2.5 ? 0.4 : zoom < 4 ? 0.7 : 1.0;
    const filteredNewsLocations = this.filterByTime(this.newsLocations, (location) => location.timestamp);
    const THREAT_RGB: Record<string, [number, number, number]> = {
      critical: [239, 68, 68],
      high: [249, 115, 22],
      medium: [234, 179, 8],
      low: [34, 197, 94],
      info: [59, 130, 246],
    };
    const THREAT_ALPHA: Record<string, number> = {
      critical: 220,
      high: 190,
      medium: 160,
      low: 120,
      info: 80,
    };

    const now = this.pulseTime || Date.now();
    const PULSE_DURATION = 30_000;

    const layers: ScatterplotLayer[] = [
      new ScatterplotLayer({
        id: 'news-locations-layer',
        data: filteredNewsLocations,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 18000,
        getFillColor: (d) => {
          const rgb = THREAT_RGB[d.threatLevel] || [59, 130, 246];
          const a = Math.round((THREAT_ALPHA[d.threatLevel] || 120) * alphaScale);
          return [...rgb, a] as [number, number, number, number];
        },
        radiusMinPixels: 3,
        radiusMaxPixels: 12,
        pickable: true,
      }),
    ];

    const recentNews = filteredNewsLocations.filter(d => {
      const firstSeen = this.newsLocationFirstSeen.get(d.title);
      return firstSeen && (now - firstSeen) < PULSE_DURATION;
    });

    if (recentNews.length > 0) {
      const pulse = 1.0 + 1.5 * (0.5 + 0.5 * Math.sin(now / 318));

      layers.push(new ScatterplotLayer({
        id: 'news-pulse-layer',
        data: recentNews,
        getPosition: (d) => [d.lon, d.lat],
        getRadius: 18000,
        radiusScale: pulse,
        radiusMinPixels: 6,
        radiusMaxPixels: 30,
        pickable: false,
        stroked: true,
        filled: false,
        getLineColor: (d) => {
          const rgb = THREAT_RGB[d.threatLevel] || [59, 130, 246];
          const firstSeen = this.newsLocationFirstSeen.get(d.title) || now;
          const age = now - firstSeen;
          const fadeOut = Math.max(0, 1 - age / PULSE_DURATION);
          const a = Math.round(150 * fadeOut * alphaScale);
          return [...rgb, a] as [number, number, number, number];
        },
        lineWidthMinPixels: 1.5,
        updateTriggers: { pulseTime: now },
      }));
    }

    return layers;
  }

  private createPositiveEventsLayers(): Layer[] {
    const layers: Layer[] = [];

    const getCategoryColor = (category: string): [number, number, number, number] => {
      switch (category) {
        case 'nature-wildlife':
        case 'humanity-kindness':
          return [34, 197, 94, 200]; // green
        case 'science-health':
        case 'innovation-tech':
        case 'climate-wins':
          return [234, 179, 8, 200]; // gold
        case 'culture-community':
          return [139, 92, 246, 200]; // purple
        default:
          return [34, 197, 94, 200]; // green default
      }
    };

    // Dot layer (tooltip on hover via getTooltip)
    layers.push(new ScatterplotLayer({
      id: 'positive-events-layer',
      data: this.positiveEvents,
      getPosition: (d: PositiveGeoEvent) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: (d: PositiveGeoEvent) => getCategoryColor(d.category),
      radiusMinPixels: 5,
      radiusMaxPixels: 10,
      pickable: true,
    }));

    // Gentle pulse ring for significant events (count > 8)
    const significantEvents = this.positiveEvents.filter(e => e.count > 8);
    if (significantEvents.length > 0) {
      const pulse = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 800));
      layers.push(new ScatterplotLayer({
        id: 'positive-events-pulse',
        data: significantEvents,
        getPosition: (d: PositiveGeoEvent) => [d.lon, d.lat],
        getRadius: 15000,
        radiusScale: pulse,
        radiusMinPixels: 8,
        radiusMaxPixels: 24,
        stroked: true,
        filled: false,
        getLineColor: (d: PositiveGeoEvent) => getCategoryColor(d.category),
        lineWidthMinPixels: 1.5,
        pickable: false,
        updateTriggers: { radiusScale: this.pulseTime },
      }));
    }

    return layers;
  }

  private createKindnessLayers(): Layer[] {
    const layers: Layer[] = [];
    if (this.kindnessPoints.length === 0) return layers;

    // Dot layer (tooltip on hover via getTooltip)
    layers.push(new ScatterplotLayer<KindnessPoint>({
      id: 'kindness-layer',
      data: this.kindnessPoints,
      getPosition: (d: KindnessPoint) => [d.lon, d.lat],
      getRadius: 12000,
      getFillColor: [74, 222, 128, 200] as [number, number, number, number],
      radiusMinPixels: 5,
      radiusMaxPixels: 10,
      pickable: true,
    }));

    // Pulse for real events
    const pulse = 1.0 + 0.4 * (0.5 + 0.5 * Math.sin((this.pulseTime || Date.now()) / 800));
    layers.push(new ScatterplotLayer<KindnessPoint>({
      id: 'kindness-pulse',
      data: this.kindnessPoints,
      getPosition: (d: KindnessPoint) => [d.lon, d.lat],
      getRadius: 14000,
      radiusScale: pulse,
      radiusMinPixels: 6,
      radiusMaxPixels: 18,
      stroked: true,
      filled: false,
      getLineColor: [74, 222, 128, 80] as [number, number, number, number],
      lineWidthMinPixels: 1,
      pickable: false,
      updateTriggers: { radiusScale: this.pulseTime },
    }));

    return layers;
  }

  private createHappinessChoroplethLayer(): GeoJsonLayer | null {
    if (!this.countriesGeoJsonData || this.happinessScores.size === 0) return null;
    const scores = this.happinessScores;
    return new GeoJsonLayer({
      id: 'happiness-choropleth-layer',
      data: this.countriesGeoJsonData,
      filled: true,
      stroked: true,
      getFillColor: (feature: { properties?: Record<string, unknown> }) => {
        const code = feature.properties?.['ISO3166-1-Alpha-2'] as string | undefined;
        const score = code ? scores.get(code) : undefined;
        if (score == null) return [0, 0, 0, 0] as [number, number, number, number];
        const t = score / 10;
        return [
          Math.round(40 + (1 - t) * 180),
          Math.round(180 + t * 60),
          Math.round(40 + (1 - t) * 100),
          140,
        ] as [number, number, number, number];
      },
      getLineColor: [100, 100, 100, 60] as [number, number, number, number],
      getLineWidth: 1,
      lineWidthMinPixels: 0.5,
      pickable: true,
      updateTriggers: { getFillColor: [scores.size] },
    });
  }

  private static readonly CII_LEVEL_COLORS: Record<string, [number, number, number, number]> = {
    low: [40, 180, 60, 130],
    normal: [220, 200, 50, 135],
    elevated: [240, 140, 30, 145],
    high: [220, 50, 20, 155],
    critical: [140, 10, 0, 170],
  };

  private createCIIChoroplethLayer(): GeoJsonLayer | null {
    if (!this.countriesGeoJsonData || this.ciiScoresMap.size === 0) return null;
    const scores = this.ciiScoresMap;
    const colors = DeckGLMap.CII_LEVEL_COLORS;
    return new GeoJsonLayer({
      id: 'cii-choropleth-layer',
      data: this.countriesGeoJsonData,
      filled: true,
      stroked: true,
      getFillColor: (feature: { properties?: Record<string, unknown> }) => {
        const code = feature.properties?.['ISO3166-1-Alpha-2'] as string | undefined;
        const entry = code ? scores.get(code) : undefined;
        return entry ? (colors[entry.level] ?? [0, 0, 0, 0]) : [0, 0, 0, 0];
      },
      getLineColor: [80, 80, 80, 80] as [number, number, number, number],
      getLineWidth: 1,
      lineWidthMinPixels: 0.5,
      pickable: true,
      updateTriggers: { getFillColor: [this.ciiScoresVersion] },
    });
  }

  private createSpeciesRecoveryLayer(): ScatterplotLayer {
    return new ScatterplotLayer({
      id: 'species-recovery-layer',
      data: this.speciesRecoveryZones,
      getPosition: (d: (typeof this.speciesRecoveryZones)[number]) => [d.recoveryZone.lon, d.recoveryZone.lat],
      getRadius: 50000,
      radiusMinPixels: 8,
      radiusMaxPixels: 25,
      getFillColor: [74, 222, 128, 120] as [number, number, number, number],
      stroked: true,
      getLineColor: [74, 222, 128, 200] as [number, number, number, number],
      lineWidthMinPixels: 1.5,
      pickable: true,
    });
  }

  private createRenewableInstallationsLayer(): ScatterplotLayer {
    const typeColors: Record<string, [number, number, number, number]> = {
      solar: [255, 200, 50, 200],
      wind: [100, 200, 255, 200],
      hydro: [0, 180, 180, 200],
      geothermal: [255, 150, 80, 200],
    };
    const typeLineColors: Record<string, [number, number, number, number]> = {
      solar: [255, 200, 50, 255],
      wind: [100, 200, 255, 255],
      hydro: [0, 180, 180, 255],
      geothermal: [255, 150, 80, 255],
    };
    return new ScatterplotLayer({
      id: 'renewable-installations-layer',
      data: this.renewableInstallations,
      getPosition: (d: RenewableInstallation) => [d.lon, d.lat],
      getRadius: 30000,
      radiusMinPixels: 5,
      radiusMaxPixels: 18,
      getFillColor: (d: RenewableInstallation) => typeColors[d.type] ?? [200, 200, 200, 200] as [number, number, number, number],
      stroked: true,
      getLineColor: (d: RenewableInstallation) => typeLineColors[d.type] ?? [200, 200, 200, 255] as [number, number, number, number],
      lineWidthMinPixels: 1,
      pickable: true,
    });
  }

  private getTooltip(info: PickingInfo): { html: string } | null {
    if (!info.object) return null;

    const text = (value: unknown): string => escapeHtml(String(value ?? ''));
    // Helper: generate simulation-style tooltip html
    const tip = (title: string, ...subs: string[]) => ({
      html: `<div class="deckgl-tooltip"><div class="tt-title">${title}</div>${subs.filter(Boolean).map(s => `<div class="tt-sub">${s}</div>`).join('')}</div>`,
    });

    const rawLayerId = info.layer?.id || '';
    const layerId = rawLayerId.endsWith('-ghost') ? rawLayerId.slice(0, -6) : rawLayerId;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj = info.object as any;

    switch (layerId) {
      case 'hotspots-layer':
        return tip(text(obj.name), text(obj.subtext));
      case 'earthquakes-layer':
        return tip(`M${(obj.magnitude || 0).toFixed(1)} ${t('components.deckgl.tooltip.earthquake')}`, text(obj.place));
      case 'military-vessels-layer':
        return tip(text(obj.name), text(obj.operatorCountry));
      case 'military-flights-layer':
        return tip(text(obj.callsign || obj.registration || t('components.deckgl.tooltip.militaryAircraft')), text(obj.type));
      case 'military-vessel-clusters-layer':
        return tip(text(obj.name || t('components.deckgl.tooltip.vesselCluster')), `${obj.vesselCount || 0} ${t('components.deckgl.tooltip.vessels')}`, text(obj.activityType));
      case 'military-flight-clusters-layer':
        return tip(text(obj.name || t('components.deckgl.tooltip.flightCluster')), `${obj.flightCount || 0} ${t('components.deckgl.tooltip.aircraft')}`, text(obj.activityType));
      case 'protests-layer':
        return tip(text(obj.title), text(obj.country));
      case 'protest-clusters-layer': {
        if (obj.count === 1) {
          const item = obj.items?.[0];
          return tip(text(item?.title || t('components.deckgl.tooltip.protest')), text(item?.city || item?.country || ''));
        }
        return tip(t('components.deckgl.tooltip.protestsCount', { count: String(obj.count) }), text(obj.country));
      }
      case 'tech-hq-clusters-layer': {
        if (obj.count === 1) {
          const hq = obj.items?.[0];
          return tip(text(hq?.company || ''), text(hq?.city || ''));
        }
        return tip(t('components.deckgl.tooltip.techHQsCount', { count: String(obj.count) }), text(obj.city));
      }
      case 'tech-event-clusters-layer': {
        if (obj.count === 1) {
          const ev = obj.items?.[0];
          return tip(text(ev?.title || ''), text(ev?.location || ''));
        }
        return tip(t('components.deckgl.tooltip.techEventsCount', { count: String(obj.count) }), text(obj.location));
      }
      case 'datacenter-clusters-layer': {
        if (obj.count === 1) {
          const dc = obj.items?.[0];
          return tip(text(dc?.name || ''), text(dc?.owner || ''));
        }
        return tip(t('components.deckgl.tooltip.dataCentersCount', { count: String(obj.count) }), text(obj.country));
      }
      case 'bases-layer':
        return tip(text(obj.name), text(obj.country) + (obj.kind ? ` · ${text(obj.kind)}` : ''));
      case 'bases-cluster-layer':
        return tip(`${obj.count} bases`);
      case 'nuclear-layer':
        return tip(text(obj.name), text(obj.type));
      case 'datacenters-layer':
        return tip(text(obj.name), text(obj.owner));
      case 'cables-layer':
        return tip(text(obj.name), t('components.deckgl.tooltip.underseaCable'));
      case 'pipelines-layer': {
        const pipelineType = String(obj.type || '').toLowerCase();
        const pipelineTypeLabel = pipelineType === 'oil'
          ? t('popups.pipeline.types.oil')
          : pipelineType === 'gas'
            ? t('popups.pipeline.types.gas')
            : pipelineType === 'products'
              ? t('popups.pipeline.types.products')
              : `${text(obj.type)} ${t('components.deckgl.tooltip.pipeline')}`;
        return tip(text(obj.name), pipelineTypeLabel);
      }
      case 'conflict-zones-layer': {
        const props = obj.properties || obj;
        return tip(text(props.name), t('components.deckgl.tooltip.conflictZone'));
      }
      case 'maritime-zones-layer': {
        const props = obj.properties || obj;
        return tip(text(props.name), `${text(props.type)} ${t('components.deckgl.tooltip.maritimeZone')}`);
      }
      case 'sanctions-layer': {
        const props = obj.properties || obj;
        const sLevel = SANCTIONED_COUNTRIES[obj.id];
        return tip(text(props.name), `${t('components.deckgl.layerHelp.labels.sanctions')}: ${text(sLevel)}`);
      }
      case 'natural-events-layer':
        return tip(text(obj.title), text(obj.category || t('components.deckgl.tooltip.naturalEvent')));
      case 'ais-density-layer':
        return tip(t('components.deckgl.layers.shipTraffic'), `${t('popups.intensity')}: ${text(obj.intensity)}`);
      case 'waterways-layer':
        return tip(text(obj.name), t('components.deckgl.layers.strategicWaterways'));
      case 'economic-centers-layer':
        return tip(text(obj.name), text(obj.country));
      case 'stock-exchanges-layer':
        return tip(text(obj.shortName), `${text(obj.city)}, ${text(obj.country)}`);
      case 'financial-centers-layer':
        return tip(text(obj.name), `${text(obj.type)} ${t('components.deckgl.tooltip.financialCenter')}`);
      case 'central-banks-layer':
        return tip(text(obj.shortName), `${text(obj.city)}, ${text(obj.country)}`);
      case 'commodity-hubs-layer':
        return tip(text(obj.name), `${text(obj.type)} · ${text(obj.city)}`);
      case 'startup-hubs-layer':
        return tip(text(obj.city), text(obj.country));
      case 'tech-hqs-layer':
        return tip(text(obj.company), text(obj.city));
      case 'accelerators-layer':
        return tip(text(obj.name), text(obj.city));
      case 'cloud-regions-layer':
        return tip(text(obj.provider), text(obj.region));
      case 'tech-events-layer':
        return tip(text(obj.title), text(obj.location));
      case 'irradiators-layer':
        return tip(text(obj.name), text(obj.type || t('components.deckgl.layers.gammaIrradiators')));
      case 'spaceports-layer':
        return tip(text(obj.name), text(obj.country || t('components.deckgl.layers.spaceports')));
      case 'ports-layer': {
        const typeIcon = obj.type === 'naval' ? '⚓' : obj.type === 'oil' || obj.type === 'lng' ? '🛢️' : '🏭';
        return tip(`${typeIcon} ${text(obj.name)}`, `${text(obj.type || t('components.deckgl.tooltip.port'))} · ${text(obj.country)}`);
      }
      case 'flight-delays-layer':
        return tip(`${text(obj.name)} (${text(obj.iata)})`, `${text(obj.severity)}: ${text(obj.reason)}`);
      case 'aircraft-positions-layer':
        return tip(text(obj.callsign || obj.icao24), `${obj.altitudeFt?.toLocaleString() ?? 0} ft · ${obj.groundSpeedKts ?? 0} kts · ${Math.round(obj.trackDeg ?? 0)}°`);
      case 'apt-groups-layer':
        return tip(text(obj.name), text(obj.aka), `${t('popups.sponsor')}: ${text(obj.sponsor)}`);
      case 'minerals-layer':
        return tip(text(obj.name), `${text(obj.mineral)} — ${text(obj.country)}`, text(obj.operator));
      case 'ais-disruptions-layer':
        return tip(`AIS ${text(obj.type || t('components.deckgl.tooltip.disruption'))}`, `${text(obj.severity)} ${t('popups.severity')}`, text(obj.description));
      case 'gps-jamming-layer':
        return tip('GPS Jamming', `${text(obj.level)} interference (${obj.pct}%)`, `H3: ${text(obj.h3)}`);
      case 'cable-advisories-layer': {
        const cableName = UNDERSEA_CABLES.find(c => c.id === obj.cableId)?.name || obj.cableId;
        return tip(text(cableName), text(obj.severity || t('components.deckgl.tooltip.advisory')), text(obj.description));
      }
      case 'repair-ships-layer':
        return tip(text(obj.name || t('components.deckgl.tooltip.repairShip')), text(obj.status));
      case 'climate-anomalies-layer':
        return tip(text(obj.zone), `${text(obj.severity.toUpperCase())} ${text(obj.type.toUpperCase())}`, `${text(t('components.deckgl.tooltip.tempDelta'))}: ${obj.tempDelta > 0 ? '+' : ''}${obj.tempDelta.toFixed(1)}°C`);
      case 'weather-layer': {
        const areaDesc = typeof obj.areaDesc === 'string' ? obj.areaDesc : '';
        const area = areaDesc ? areaDesc.slice(0, 50) + (areaDesc.length > 50 ? '...' : '') : '';
        return tip(text(obj.event || t('components.deckgl.layers.weatherAlerts')), text(obj.severity), area);
      }
      case 'outages-layer':
        return tip(text(obj.asn || t('components.deckgl.tooltip.internetOutage')), text(obj.country));
      case 'cyber-threats-layer':
        return tip(t('popups.cyberThreat.title'), `${text(obj.severity || t('components.deckgl.tooltip.medium'))} · ${text(obj.country || t('popups.unknown'))}`);
      case 'iran-events-layer':
        return tip(`${t('components.deckgl.layers.iranAttacks')}: ${text(obj.category || '')}`, text((obj.title || '').slice(0, 80)));
      case 'ucdp-events-layer':
        return tip(text(obj.conflict_name || t('components.deckgl.tooltip.conflict')), `${text(obj.type_of_violence)} · ${obj.deaths_best} deaths`, text(obj.date_start));
      case 'displacement-arcs-layer':
        return tip(`${text(obj.originName)} → ${text(obj.asylumName)}`, `${obj.refugees?.toLocaleString() ?? 0} ${t('components.deckgl.tooltip.refugees')}`);
      case 'trade-routes-layer':
        return tip(text(obj.name || obj.routeName), `Status: ${text(obj.status)}`, `Category: ${text(obj.category)}`, text(obj.volumeDesc));
      case 'trade-chokepoints-layer':
        return tip(text(obj.name), t('components.deckgl.tooltip.tradeChokepoint'));
      case 'fires-layer':
        return tip(t('components.deckgl.layers.fires'), `${text(obj.brightness)} K`, `FRP: ${text(obj.frp.toFixed(1))}`);
      case 'news-locations-layer':
        return tip(`📰 ${t('components.deckgl.tooltip.news')}`, text(obj.title?.slice(0, 80) || ''));
      case 'positive-events-layer': {
        const catLabel = obj.category ? obj.category.replace(/-/g, ' & ') : 'Positive Event';
        const countInfo = obj.count > 1 ? `${obj.count} sources` : '';
        return tip(text(obj.name), text(catLabel), countInfo);
      }
      case 'kindness-layer':
        return tip(text(obj.name));
      case 'happiness-choropleth-layer': {
        const hcName = obj.properties?.name ?? 'Unknown';
        const hcCode = obj.properties?.['ISO3166-1-Alpha-2'];
        const hcScore = hcCode ? this.happinessScores.get(hcCode as string) : undefined;
        const hcScoreStr = hcScore != null ? hcScore.toFixed(1) : 'No data';
        return tip(text(hcName), `Happiness: ${hcScoreStr}/10`, hcScore != null ? `${text(this.happinessSource)} (${this.happinessYear})` : '');
      }
      case 'cii-choropleth-layer': {
        const ciiName = obj.properties?.name ?? 'Unknown';
        const ciiCode = obj.properties?.['ISO3166-1-Alpha-2'];
        const ciiEntry = ciiCode ? this.ciiScoresMap.get(ciiCode as string) : undefined;
        if (!ciiEntry) return tip(text(ciiName), 'No CII data');
        return tip(text(ciiName), `CII: ${ciiEntry.score}/100`, text(ciiEntry.level));
      }
      case 'species-recovery-layer': {
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.commonName)}</strong><br/>${text(obj.recoveryZone?.name ?? obj.region)}<br/><span style="opacity:.7">Status: ${text(obj.recoveryStatus)}</span></div>` };
      }
      case 'renewable-installations-layer': {
        const riTypeLabel = obj.type ? String(obj.type).charAt(0).toUpperCase() + String(obj.type).slice(1) : 'Renewable';
        return { html: `<div class="deckgl-tooltip"><strong>${text(obj.name)}</strong><br/>${riTypeLabel} &middot; ${obj.capacityMW?.toLocaleString() ?? '?'} MW<br/><span style="opacity:.7">${text(obj.country)} &middot; ${obj.year}</span></div>` };
      }
      case 'gulf-investments-layer': {
        const inv = obj as GulfInvestment;
        const flag = inv.investingCountry === 'SA' ? '🇸🇦' : '🇦🇪';
        const usd = inv.investmentUSD != null
          ? (inv.investmentUSD >= 1000 ? `$${(inv.investmentUSD / 1000).toFixed(1)}B` : `$${inv.investmentUSD}M`)
          : t('components.deckgl.tooltip.undisclosed');
        const stake = inv.stakePercent != null ? `<br/>${text(String(inv.stakePercent))}% ${t('components.deckgl.tooltip.stake')}` : '';
        return {
          html: `<div class="deckgl-tooltip">
            <strong>${flag} ${text(inv.assetName)}</strong><br/>
            <em>${text(inv.investingEntity)}</em><br/>
            ${text(inv.targetCountry)} · ${text(inv.sector)}<br/>
            <strong>${usd}</strong>${stake}<br/>
            <span style="text-transform:capitalize">${text(inv.status)}</span>
          </div>`,
        };
      }
      default:
        return null;
    }
  }

  private handleClick(info: PickingInfo): void {
    // Note: MapboxOverlay doesn't expose the internal deck instance directly easily in this version.
    // We'll rely on pickingRadius: 10 in constructor to catch nearby items,
    // and if we need to handle multi-picking, we'd typically look at info.layer.props.data
    // or use a custom picking implementation. For now, let's fix the TS errors.

    if (!info.object) {
      this.sidePanel.hide();
      // Empty map click → country detection
      if (info.coordinate && this.onCountryClick) {
        const [lon, lat] = info.coordinate as [number, number];
        const country = this.resolveCountryFromCoordinate(lon, lat);
        this.onCountryClick({
          lat,
          lon,
          ...(country ? { code: country.code, name: country.name } : {}),
        });
      }
      return;
    }

    const rawClickLayerId = info.layer?.id || '';
    const layerId = rawClickLayerId.endsWith('-ghost')
      ? rawClickLayerId.slice(0, -6)
      : rawClickLayerId.endsWith('-badge')
        ? rawClickLayerId.slice(0, -6)
        : rawClickLayerId;

    // Hotspots show popup with related news
    if (layerId === 'hotspots-layer') {
      const hotspot = info.object as Hotspot;
      const relatedNews = this.getRelatedNews(hotspot);
      this.sidePanel.show({
        type: 'hotspot',
        data: hotspot,
        relatedNews,
        onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
      });
      this.sidePanel.loadHotspotGdeltContext(hotspot);
      this.onHotspotClick?.(hotspot);
      return;
    }

    // Handle cluster layers with single/multi logic
    // Special handling for multi-picking if requested (e.g. for overlapping pipelines/cables)
    // But cables/pipelines are lines. If they overlap, we'll just take the top one unless we implement a picker.
    // The user wants "data center layer jaise handled ha", which implies a list if multiple are there.

    // Handle cluster layers with single/multi logic
    if (layerId === 'protest-clusters-layer') {
      const cluster = info.object as MapProtestCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.protestSC) {
        try {
          const leaves = this.protestSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => this.protestSuperclusterSource[l.properties.index]).filter((x): x is SocialUnrestEvent => !!x);
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale protest cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items?.[0]) {
        const item = cluster.items[0];
        this.sidePanel.show({
          type: 'protest',
          data: item,
          onFocus: () => this.focusOnObject(item.lon, item.lat)
        });
      } else {
        this.sidePanel.show({
          type: 'protestCluster',
          data: {
            items: cluster.items,
            country: cluster.country,
            count: cluster.count,
            riotCount: cluster.riotCount,
            highSeverityCount: cluster.highSeverityCount,
            verifiedCount: cluster.verifiedCount,
            sampled: cluster.sampled,
          },
          onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
        });
      }
      return;
    }

    if (layerId === 'climate-anomalies-layer') {
      this.sidePanel.show({
        type: 'climateAnomaly',
        data: info.object as ClimateAnomaly,
        onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
      });
      return;
    }

    if (layerId === 'maritime-zones-layer') {
      const props = (info.object as any).properties;
      this.sidePanel.show({
        type: 'maritime',
        data: {
          id: props.id,
          name: props.name,
          subtext: props.type,
          description: props.description,
          lat: (info.object as any).center?.[1] || info.coordinate?.[1],
          lon: (info.object as any).center?.[0] || info.coordinate?.[0],
          keywords: ['maritime', props.type],
        } as any,
        onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
      });
      return;
    }

    if (layerId === 'sanctions-layer') {
      const props = (info.object as any).properties;
      const code = props?.['ISO3166-1-Alpha-2'] || props?.ISO_A2 || (info.object as any).id;
      if (this.onCountryClick && code) {
        this.onCountryClick({
          lat: info.coordinate?.[1] || 0,
          lon: info.coordinate?.[0] || 0,
          code: String(code),
          name: props?.name || String(code),
        });
      }
      return;
    }
    if (layerId === 'tech-hq-clusters-layer' || layerId === 'tech-hqs-layer') {
      const cluster = info.object as MapTechHQCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.techHQSC) {
        try {
          const leaves = this.techHQSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => TECH_HQS[l.properties.index]).filter(Boolean) as typeof TECH_HQS;
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale techHQ cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items?.[0]) {
        const item = { ...cluster.items[0] } as any;
        if (!item.name) item.name = item.company || 'Tech HQ';
        this.sidePanel.show({
          type: 'techHQ',
          data: item,
          onFocus: () => this.focusOnObject(item.lon, item.lat)
        });
      } else {
        this.sidePanel.show({
          type: 'techHQCluster',
          data: {
            items: cluster.items,
            city: cluster.city,
            country: cluster.country,
            count: cluster.count,
            faangCount: cluster.faangCount,
            unicornCount: cluster.unicornCount,
            publicCount: cluster.publicCount,
            sampled: cluster.sampled,
          },
          onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
        });
      }
      return;
    }
    if (layerId === 'tech-event-clusters-layer') {
      const cluster = info.object as MapTechEventCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.techEventSC) {
        try {
          const leaves = this.techEventSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => this.techEvents[l.properties.index]).filter((x): x is TechEventMarker => !!x);
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale techEvent cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items?.[0]) {
        const item = cluster.items[0];
        this.sidePanel.show({
          type: 'techEvent',
          data: item,
          onFocus: () => this.focusOnObject(item.lng, item.lat)
        });
      } else {
        this.sidePanel.show({
          type: 'techEventCluster',
          data: {
            items: cluster.items,
            location: cluster.location,
            country: cluster.country,
            count: cluster.count,
            soonCount: cluster.soonCount,
            sampled: cluster.sampled,
          },
          onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
        });
      }
      return;
    }
    if (layerId === 'datacenter-clusters-layer') {
      const cluster = info.object as MapDatacenterCluster;
      if (cluster.items.length === 0 && cluster._clusterId != null && this.datacenterSC) {
        try {
          const leaves = this.datacenterSC.getLeaves(cluster._clusterId, DeckGLMap.MAX_CLUSTER_LEAVES);
          cluster.items = leaves.map(l => this.datacenterSCSource[l.properties.index]).filter((x): x is AIDataCenter => !!x);
          cluster.sampled = cluster.items.length < cluster.count;
        } catch (e) {
          console.warn('[DeckGLMap] stale datacenter cluster', cluster._clusterId, e);
          return;
        }
      }
      if (cluster.count === 1 && cluster.items?.[0]) {
        const item = cluster.items[0];
        this.sidePanel.show({
          type: 'datacenter',
          data: item,
          onFocus: () => this.focusOnObject(item.lon, item.lat)
        });
      } else {
        this.sidePanel.show({
          type: 'datacenterCluster',
          data: {
            items: cluster.items,
            region: cluster.region || cluster.country,
            country: cluster.country,
            count: cluster.count,
            totalChips: cluster.totalChips,
            totalPowerMW: cluster.totalPowerMW,
            existingCount: cluster.existingCount,
            plannedCount: cluster.plannedCount,
            sampled: cluster.sampled,
          },
          onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
        });
      }
      return;
    }

    // Map layer IDs to popup types
    const layerToPopupType: Record<string, PopupType> = {
      'conflict-zones-layer': 'conflict',

      'bases-layer': 'base',
      'nuclear-layer': 'nuclear',
      'irradiators-layer': 'irradiator',
      'datacenters-layer': 'datacenter',
      'cables-layer': 'cable',
      'cable-layer': 'cable', // Potential alias
      'pipelines-layer': 'pipeline',
      'pipeline-layer': 'pipeline',
      'earthquakes-layer': 'earthquake',
      'weather-layer': 'weather',
      'outages-layer': 'outage',
      'cyber-threats-layer': 'cyberThreat',
      'iran-events-layer': 'iranEvent',
      'protests-layer': 'protest',
      'military-flights-layer': 'militaryFlight',
      'military-vessels-layer': 'militaryVessel',
      'military-vessel-clusters-layer': 'militaryVesselCluster',
      'military-flight-clusters-layer': 'militaryFlightCluster',
      'natural-events-layer': 'natEvent',
      'nat-event-layer': 'natEvent',
      'fires-layer': 'fire',
      'waterways-layer': 'waterway',
      'economic-centers-layer': 'economic',
      'stock-exchanges-layer': 'stockExchange',
      'financial-centers-layer': 'financialCenter',
      'central-banks-layer': 'centralBank',
      'commodity-hubs-layer': 'commodityHub',
      'spaceports-layer': 'spaceport',
      'ports-layer': 'port',
      'flight-delays-layer': 'flight',
      'aircraft-positions-layer': 'aircraft',
      'startup-hubs-layer': 'startupHub',
      'tech-hqs-layer': 'techHQ',
      'accelerators-layer': 'accelerator',
      'cloud-regions-layer': 'cloudRegion',
      'tech-events-layer': 'techEvent',
      'apt-groups-layer': 'apt',
      'minerals-layer': 'mineral',
      'ais-disruptions-layer': 'ais',
      'ais-density-layer': 'ais',
      'gps-jamming-layer': 'gpsJamming',
      'cable-advisories-layer': 'cable-advisory',
      'repair-ships-layer': 'repair-ship',
      'ucdp-events-layer': 'ucdp',
      'displacement-arcs-layer': 'displacement',
      'trade-routes-layer': 'tradeRoute',
      'trade-chokepoints-layer': 'tradeChokepoint',
      'positive-events-layer': 'positiveEvent',
      'kindness-layer': 'kindness',
      'happiness-choropleth-layer': 'happiness',
      'cii-choropleth-layer': 'cii',
      'species-recovery-layer': 'species',
      'renewable-installations-layer': 'renewable',
      'news-locations-layer': 'news',
    };

    const popupType = layerToPopupType[layerId];
    if (!popupType) return;

    // For GeoJSON layers, the data is in properties
    let data = info.object;
    if (layerId === 'conflict-zones-layer' && info.object.properties) {
      // Find the full conflict zone data from config
      const conflictId = info.object.properties.id;
      const fullConflict = CONFLICT_ZONES.find(c => c.id === conflictId);
      if (fullConflict) data = fullConflict;
    }

    // Enrich iran events with related events from same location
    if (popupType === 'iranEvent' && data.locationName) {
      const clickedId = data.id;
      const normalizedLoc = data.locationName.trim().toLowerCase();
      const related = this.iranEvents
        .filter(e => e.id !== clickedId && e.locationName && e.locationName.trim().toLowerCase() === normalizedLoc)
        .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
        .slice(0, 5);
      data = { ...data, relatedEvents: related };
    }

    // Data mapping fixes for Tech HQs and Cloud Regions which use different field names
    if (popupType === 'techHQ' && data && !data.name) {
      data = { ...data, name: data.company || 'Tech HQ' };
    }
    if (popupType === 'cloudRegion' && data && !data.name) {
      data = { ...data, name: `${data.provider?.toUpperCase()} ${data.city}` };
    }
    if (popupType === 'techEvent' && data && !data.title && data.name) {
      data = { ...data, title: data.name };
    }

    // Seismic event normalization
    if (popupType === 'earthquake' && data && data.location) {
      data = {
        ...data,
        lat: data.location.latitude,
        lon: data.location.longitude,
        depth: data.depthKm,
        time: new Date(data.occurredAt),
        url: data.sourceUrl
      };
    }

    this.sidePanel.show({
      type: popupType as any,
      data: data,
      onFocus: () => this.focusOnObject(info.coordinate?.[0] || 0, info.coordinate?.[1] || 0),
    });
  }

  // Utility methods
  private hexToRgba(hex: string, alpha: number): [number, number, number, number] {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result && result[1] && result[2] && result[3]) {
      return [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16),
        alpha,
      ];
    }
    return [100, 100, 100, alpha];
  }

  // UI Creation methods
  private createControls(): void {
    const controls = document.createElement('div');
    controls.className = 'map-controls deckgl-controls';
    controls.innerHTML = `
      <div class="zoom-controls">
        <button class="map-btn zoom-in" title="${t('components.deckgl.zoomIn')}">+</button>
        <button class="map-btn zoom-out" title="${t('components.deckgl.zoomOut')}">-</button>
        <button class="map-btn zoom-reset" title="${t('components.deckgl.resetView')}">&#8962;</button>
      </div>
      <div class="view-selector">
        <select class="view-select">
          <option value="global">${t('components.deckgl.views.global')}</option>
          <option value="america">${t('components.deckgl.views.americas')}</option>
          <option value="mena">${t('components.deckgl.views.mena')}</option>
          <option value="eu">${t('components.deckgl.views.europe')}</option>
          <option value="asia">${t('components.deckgl.views.asia')}</option>
          <option value="latam">${t('components.deckgl.views.latam')}</option>
          <option value="africa">${t('components.deckgl.views.africa')}</option>
          <option value="oceania">${t('components.deckgl.views.oceania')}</option>
        </select>
      </div>
    `;

    this.container.appendChild(controls);

    // Bind events - use event delegation for reliability
    controls.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('zoom-in')) this.zoomIn();
      else if (target.classList.contains('zoom-out')) this.zoomOut();
      else if (target.classList.contains('zoom-reset')) this.resetView();
    });

    const viewSelect = controls.querySelector('.view-select') as HTMLSelectElement;
    viewSelect.value = this.state.view;
    viewSelect.addEventListener('change', () => {
      this.setView(viewSelect.value as DeckMapView);
    });
  }

  private createTimeSlider(): void {
    const slider = document.createElement('div');
    slider.className = 'time-slider deckgl-time-slider';
    slider.innerHTML = `
      <div class="time-options">
        <button class="time-btn ${this.state.timeRange === '1h' ? 'active' : ''}" data-range="1h">1h</button>
        <button class="time-btn ${this.state.timeRange === '6h' ? 'active' : ''}" data-range="6h">6h</button>
        <button class="time-btn ${this.state.timeRange === '24h' ? 'active' : ''}" data-range="24h">24h</button>
        <button class="time-btn ${this.state.timeRange === '48h' ? 'active' : ''}" data-range="48h">48h</button>
        <button class="time-btn ${this.state.timeRange === '7d' ? 'active' : ''}" data-range="7d">7d</button>
        <button class="time-btn ${this.state.timeRange === 'all' ? 'active' : ''}" data-range="all">${t('components.deckgl.timeAll')}</button>
      </div>
    `;

    this.container.appendChild(slider);

    slider.querySelectorAll('.time-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const range = (btn as HTMLElement).dataset.range as TimeRange;
        this.setTimeRange(range);
      });
    });
  }

  private updateTimeSliderButtons(): void {
    const slider = this.container.querySelector('.deckgl-time-slider');
    if (!slider) return;
    slider.querySelectorAll('.time-btn').forEach((btn) => {
      const range = (btn as HTMLElement).dataset.range as TimeRange | undefined;
      btn.classList.toggle('active', range === this.state.timeRange);
    });
  }

  private createLayerToggles(): void {
    const toggles = document.createElement('div');
    toggles.className = 'layer-toggles deckgl-layer-toggles';

    const layerDefs = getLayersForVariant((SITE_VARIANT || 'full') as MapVariant, 'flat');
    const layerConfig = layerDefs.map(def => ({
      key: def.key,
      label: resolveLayerLabel(def, t),
      icon: def.icon,
    }));

    toggles.innerHTML = `
      <div class="toggle-header">
        <span>${t('components.deckgl.layersTitle')}</span>
        <button class="layer-help-btn" title="${t('components.deckgl.layerGuide')}">?</button>
        <button class="toggle-collapse">&#9660;</button>
      </div>
      <div class="toggle-list" style="max-height: 32vh; overflow-y: auto; scrollbar-width: thin;">
        ${layerConfig.map(({ key, label, icon }) => {
      const isActive = this.state.layers[key as keyof MapLayers];
      return `
          <label class="layer-toggle ${isActive ? 'active' : ''}" data-layer="${key}">
            <input type="checkbox" ${isActive ? 'checked' : ''}>
            <span class="toggle-icon">${icon}</span>
            <span class="toggle-label">${label}</span>
          </label>
        `;
    }).join('')}
      </div>
    `;

    this.container.appendChild(toggles);

    // Bind toggle events
    toggles.querySelectorAll('.layer-toggle input').forEach(input => {
      input.addEventListener('change', () => {
        const checkbox = input as HTMLInputElement;
        const layer = checkbox.closest('.layer-toggle')?.getAttribute('data-layer') as keyof MapLayers;
        if (layer) {
          const isChecked = checkbox.checked;
          this.state.layers[layer] = isChecked;
          checkbox.closest('.layer-toggle')?.classList.toggle('active', isChecked);

          if (layer === 'flights') this.manageAircraftTimer(isChecked);
          this.render();
          this.onLayerChange?.(layer, isChecked, 'user');
          if (layer === 'ciiChoropleth') {
            const ciiLeg = this.container.querySelector('#ciiChoroplethLegend') as HTMLElement | null;
            if (ciiLeg) ciiLeg.style.display = (input as HTMLInputElement).checked ? 'block' : 'none';
          }
          this.createLegend(); // Update legend items
        }
      });
    });

    // Help button
    const helpBtn = toggles.querySelector('.layer-help-btn');
    helpBtn?.addEventListener('click', () => this.showLayerHelp());

    // Collapse toggle
    const collapseBtn = toggles.querySelector('.toggle-collapse');
    const toggleList = toggles.querySelector('.toggle-list');

    // Manual scroll: intercept wheel, prevent map zoom, scroll the list ourselves
    if (toggleList) {
      toggles.addEventListener('wheel', (e) => {
        e.stopPropagation();
        e.preventDefault();
        toggleList.scrollTop += e.deltaY;
      }, { passive: false });
      toggles.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    }
    collapseBtn?.addEventListener('click', () => {
      toggleList?.classList.toggle('collapsed');
      if (collapseBtn) collapseBtn.innerHTML = toggleList?.classList.contains('collapsed') ? '&#9654;' : '&#9660;';
    });
  }

  /** Show layer help popup explaining each layer */
  private showLayerHelp(): void {
    const existing = this.container.querySelector('.layer-help-popup');
    if (existing) {
      existing.remove();
      return;
    }

    const popup = document.createElement('div');
    popup.className = 'layer-help-popup';

    const label = (layerKey: string): string => t(`components.deckgl.layers.${layerKey}`).toUpperCase();
    const staticLabel = (labelKey: string): string => t(`components.deckgl.layerHelp.labels.${labelKey}`).toUpperCase();
    const helpItem = (layerLabel: string, descriptionKey: string): string =>
      `<div class="layer-help-item"><span>${layerLabel}</span> ${t(`components.deckgl.layerHelp.descriptions.${descriptionKey}`)}</div>`;
    const helpSection = (titleKey: string, items: string[], noteKey?: string): string => `
      <div class="layer-help-section">
        <div class="layer-help-title">${t(`components.deckgl.layerHelp.sections.${titleKey}`)}</div>
        ${items.join('')}
        ${noteKey ? `<div class="layer-help-note">${t(`components.deckgl.layerHelp.notes.${noteKey}`)}</div>` : ''}
      </div>
    `;
    const helpHeader = `
      <div class="layer-help-header">
        <span>${t('components.deckgl.layerHelp.title')}</span>
        <button class="layer-help-close" aria-label="Close">×</button>
      </div>
    `;

    const techHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('techEcosystem', [
      helpItem(label('startupHubs'), 'techStartupHubs'),
      helpItem(label('cloudRegions'), 'techCloudRegions'),
      helpItem(label('techHQs'), 'techHQs'),
      helpItem(label('accelerators'), 'techAccelerators'),
      helpItem(label('techEvents'), 'techEvents'),
    ])}
        ${helpSection('infrastructure', [
      helpItem(label('underseaCables'), 'infraCables'),
      helpItem(label('aiDataCenters'), 'infraDatacenters'),
      helpItem(label('internetOutages'), 'infraOutages'),
      helpItem(label('cyberThreats'), 'techCyberThreats'),
    ])}
        ${helpSection('naturalEconomic', [
      helpItem(label('naturalEvents'), 'naturalEventsTech'),
      helpItem(label('fires'), 'techFires'),
      helpItem(staticLabel('countries'), 'countriesOverlay'),
      helpItem(label('dayNight'), 'dayNight'),
    ])}
      </div>
    `;

    const financeHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('financeCore', [
      helpItem(label('stockExchanges'), 'financeExchanges'),
      helpItem(label('financialCenters'), 'financeCenters'),
      helpItem(label('centralBanks'), 'financeCentralBanks'),
      helpItem(label('commodityHubs'), 'financeCommodityHubs'),
      helpItem(label('gulfInvestments'), 'financeGulfInvestments'),
    ])}
        ${helpSection('infrastructureRisk', [
      helpItem(label('underseaCables'), 'financeCables'),
      helpItem(label('pipelines'), 'financePipelines'),
      helpItem(label('internetOutages'), 'financeOutages'),
      helpItem(label('cyberThreats'), 'financeCyberThreats'),
      helpItem(label('tradeRoutes'), 'tradeRoutes'),
    ])}
        ${helpSection('macroContext', [
      helpItem(label('economicCenters'), 'economicCenters'),
      helpItem(label('strategicWaterways'), 'macroWaterways'),
      helpItem(label('weatherAlerts'), 'weatherAlertsMarket'),
      helpItem(label('naturalEvents'), 'naturalEventsMacro'),
      helpItem(label('dayNight'), 'dayNight'),
    ])}
      </div>
    `;

    const fullHelpContent = `
      ${helpHeader}
      <div class="layer-help-content">
        ${helpSection('timeFilter', [
      helpItem(staticLabel('timeRecent'), 'timeRecent'),
      helpItem(staticLabel('timeExtended'), 'timeExtended'),
    ], 'timeAffects')}
        ${helpSection('geopolitical', [
      helpItem(label('conflictZones'), 'geoConflicts'),

      helpItem(label('intelHotspots'), 'geoHotspots'),
      helpItem(staticLabel('sanctions'), 'geoSanctions'),
      helpItem(label('protests'), 'geoProtests'),
      helpItem(label('ucdpEvents'), 'geoUcdpEvents'),
      helpItem(label('displacementFlows'), 'geoDisplacement'),
    ])}
        ${helpSection('militaryStrategic', [
      helpItem(label('militaryBases'), 'militaryBases'),
      helpItem(label('nuclearSites'), 'militaryNuclear'),
      helpItem(label('gammaIrradiators'), 'militaryIrradiators'),
      helpItem(label('militaryActivity'), 'militaryActivity'),
      helpItem(label('spaceports'), 'militarySpaceports'),
    ])}
        ${helpSection('infrastructure', [
      helpItem(label('underseaCables'), 'infraCablesFull'),
      helpItem(label('pipelines'), 'infraPipelinesFull'),
      helpItem(label('internetOutages'), 'infraOutages'),
      helpItem(label('aiDataCenters'), 'infraDatacentersFull'),
      helpItem(label('cyberThreats'), 'infraCyberThreats'),
    ])}
        ${helpSection('transport', [
      helpItem(label('shipTraffic'), 'transportShipping'),
      helpItem(label('tradeRoutes'), 'tradeRoutes'),
      helpItem(label('flightDelays'), 'transportDelays'),
    ])}
        ${helpSection('naturalEconomic', [
      helpItem(label('naturalEvents'), 'naturalEventsFull'),
      helpItem(label('fires'), 'firesFull'),
      helpItem(label('weatherAlerts'), 'weatherAlerts'),
      helpItem(label('climateAnomalies'), 'climateAnomalies'),
      helpItem(label('economicCenters'), 'economicCenters'),
      helpItem(label('criticalMinerals'), 'mineralsFull'),
    ])}
        ${helpSection('overlays', [
      helpItem(label('dayNight'), 'dayNight'),
      helpItem(staticLabel('countries'), 'countriesOverlay'),
      helpItem(label('strategicWaterways'), 'waterwaysLabels'),
    ])}
      </div>
    `;

    popup.innerHTML = SITE_VARIANT === 'tech'
      ? techHelpContent
      : SITE_VARIANT === 'finance'
        ? financeHelpContent
        : fullHelpContent;

    popup.querySelector('.layer-help-close')?.addEventListener('click', () => popup.remove());

    // Prevent scroll events from propagating to map
    const content = popup.querySelector('.layer-help-content');
    if (content) {
      content.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
      content.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });
    }

    // Close on click outside
    setTimeout(() => {
      const closeHandler = (e: MouseEvent) => {
        if (!popup.contains(e.target as Node)) {
          popup.remove();
          document.removeEventListener('click', closeHandler);
        }
      };
      document.addEventListener('click', closeHandler);
    }, 100);

    this.container.appendChild(popup);
  }

  private createLegend(): void {
    let legend = this.container.querySelector('.map-legend.deckgl-legend') as HTMLElement | null;
    if (!legend) {
      legend = document.createElement('div');
      legend.className = 'map-legend deckgl-legend';
      this.container.appendChild(legend);
    }

    // SVG shapes for different marker types
    const shapes = {
      circle: (color: string) => `<svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="${color}"/></svg>`,
      triangle: (color: string) => `<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 11,10 1,10" fill="${color}"/></svg>`,
      square: (color: string) => `<svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="10" height="10" rx="1" fill="${color}"/></svg>`,
      hexagon: (color: string) => `<svg width="12" height="12" viewBox="0 0 12 12"><polygon points="6,1 10.5,3.5 10.5,8.5 6,11 1.5,8.5 1.5,3.5" fill="${color}"/></svg>`,
    };

    const commonItems = [];
    if (this.state.layers.natural) commonItems.push({ shape: shapes.circle('rgb(255, 100, 50)'), label: t('components.deckgl.layers.naturalEvents') });
    if (this.state.layers.fires) commonItems.push({ shape: shapes.circle('rgb(255, 80, 0)'), label: t('components.deckgl.layers.fires') });
    if (this.state.layers.weather) commonItems.push({ shape: shapes.circle('rgb(100, 150, 255)'), label: t('components.deckgl.layers.weather') });

    const variantItems = SITE_VARIANT === 'tech'
      ? [
        { shape: shapes.circle('rgb(0, 255, 150)'), label: t('components.deckgl.legend.startupHub') },
        { shape: shapes.circle('rgb(100, 200, 255)'), label: t('components.deckgl.legend.techHQ') },
        { shape: shapes.circle('rgb(255, 200, 0)'), label: t('components.deckgl.legend.accelerator') },
        { shape: shapes.circle('rgb(150, 100, 255)'), label: t('components.deckgl.legend.cloudRegion') },
        { shape: shapes.square('rgb(136, 68, 255)'), label: t('components.deckgl.legend.datacenter') },
      ]
      : SITE_VARIANT === 'finance'
        ? [
          { shape: shapes.circle('rgb(255, 215, 80)'), label: t('components.deckgl.legend.stockExchange') },
          { shape: shapes.circle('rgb(0, 220, 150)'), label: t('components.deckgl.legend.financialCenter') },
          { shape: shapes.hexagon('rgb(255, 210, 80)'), label: t('components.deckgl.legend.centralBank') },
          { shape: shapes.square('rgb(255, 150, 80)'), label: t('components.deckgl.legend.commodityHub') },
          { shape: shapes.triangle('rgb(80, 170, 255)'), label: t('components.deckgl.legend.waterway') },
        ]
        : SITE_VARIANT === 'happy'
          ? [
            { shape: shapes.circle('rgb(34, 197, 94)'), label: 'Positive Event' },
            { shape: shapes.circle('rgb(234, 179, 8)'), label: 'Breakthrough' },
            { shape: shapes.circle('rgb(74, 222, 128)'), label: 'Act of Kindness' },
            { shape: shapes.square('rgb(34, 180, 100)'), label: 'Happy Country' },
            { shape: shapes.circle('rgb(74, 222, 128)'), label: 'Species Recovery Zone' },
            { shape: shapes.circle('rgb(255, 200, 50)'), label: 'Renewable Installation' },
          ]
          : [
            { shape: shapes.circle('rgb(255, 68, 68)'), label: t('components.deckgl.legend.highAlert') },
            { shape: shapes.circle('rgb(255, 165, 0)'), label: t('components.deckgl.legend.elevated') },
            { shape: shapes.circle('rgb(255, 255, 0)'), label: t('components.deckgl.legend.monitoring') },
            { shape: shapes.triangle('rgb(68, 136, 255)'), label: t('components.deckgl.legend.base') },
            { shape: shapes.hexagon('rgb(255, 220, 0)'), label: t('components.deckgl.legend.nuclear') },
            { shape: shapes.square('rgb(136, 68, 255)'), label: t('components.deckgl.legend.datacenter') },
          ];

    const legendItems = [...variantItems, ...commonItems].slice(0, 8); // Keep it compact

    legend.innerHTML = `
      <span class="legend-label-title">${t('components.deckgl.legend.title')}</span>
      ${legendItems.map(({ shape, label }) => `<span class="legend-item">${shape}<span class="legend-label">${label}</span></span>`).join('')}
    `;

    // CII choropleth gradient legend (shown when layer is active)
    const ciiLegend = document.createElement('div');
    ciiLegend.className = 'cii-choropleth-legend';
    ciiLegend.id = 'ciiChoroplethLegend';
    ciiLegend.style.display = this.state.layers.ciiChoropleth ? 'block' : 'none';
    ciiLegend.innerHTML = `
      <span class="legend-label-title" style="font-size:9px;letter-spacing:0.5px;">CII SCALE</span>
      <div style="display:flex;align-items:center;gap:2px;margin-top:2px;">
        <div style="width:100%;height:8px;border-radius:3px;background:linear-gradient(to right,#28b33e,#dcc030,#e87425,#dc2626,#7f1d1d);"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:8px;opacity:0.7;margin-top:1px;">
        <span>0</span><span>31</span><span>51</span><span>66</span><span>81</span><span>100</span>
      </div>
    `;
    legend.appendChild(ciiLegend);

    this.container.appendChild(legend);
  }

  // Public API methods (matching MapComponent interface)
  public render(): void {
    if (this.renderPaused) {
      this.renderPending = true;
      return;
    }
    if (this.renderScheduled) return;
    this.renderScheduled = true;

    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.updateLayers();
    });
  }

  public setRenderPaused(paused: boolean): void {
    if (this.renderPaused === paused) return;
    this.renderPaused = paused;
    if (paused) {
      this.stopPulseAnimation();
      this.stopDayNightTimer();
      return;
    }

    this.syncPulseAnimation();
    if (this.state.layers.dayNight) this.startDayNightTimer();
    if (!paused && this.renderPending) {
      this.renderPending = false;
      this.render();
    }
  }

  private updateLayers(): void {
    if (this.renderPaused || this.webglLost || !this.maplibreMap) return;
    const startTime = performance.now();
    try {
      this.deckOverlay?.setProps({ layers: this.buildLayers() });
    } catch { /* map may be mid-teardown (null.getProjection) */ }
    const elapsed = performance.now() - startTime;
    if (import.meta.env.DEV && elapsed > 16) {
      console.warn(`[DeckGLMap] updateLayers took ${elapsed.toFixed(2)}ms (>16ms budget)`);
    }
    this.updateZoomHints();
  }

  private updateZoomHints(): void {
    const toggleList = this.container.querySelector('.deckgl-layer-toggles .toggle-list');
    if (!toggleList) return;
    for (const [key, enabled] of Object.entries(this.state.layers)) {
      const toggle = toggleList.querySelector(`.layer-toggle[data-layer="${key}"]`) as HTMLElement | null;
      if (!toggle) continue;
      const zoomHidden = !!enabled && !this.isLayerVisible(key as keyof MapLayers);
      toggle.classList.toggle('zoom-hidden', zoomHidden);
    }
  }

  public setView(view: DeckMapView): void {
    const preset = VIEW_PRESETS[view];
    if (!preset) return;
    this.state.view = view;

    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [preset.longitude, preset.latitude],
        zoom: preset.zoom,
        duration: 1000,
      });
    }

    const viewSelect = this.container.querySelector('.view-select') as HTMLSelectElement;
    if (viewSelect) viewSelect.value = view;

    this.onStateChange?.(this.state);
  }

  public setZoom(zoom: number): void {
    this.state.zoom = zoom;
    if (this.maplibreMap) {
      this.maplibreMap.setZoom(zoom);
    }
  }

  public setCenter(lat: number, lon: number, zoom?: number): void {
    if (this.maplibreMap) {
      this.maplibreMap.flyTo({
        center: [lon, lat],
        ...(zoom != null && { zoom }),
        duration: 500,
      });
    }
  }

  public fitCountry(code: string): void {
    const bbox = getCountryBbox(code);
    if (!bbox || !this.maplibreMap) return;
    const [minLon, minLat, maxLon, maxLat] = bbox;
    this.maplibreMap.fitBounds([[minLon, minLat], [maxLon, maxLat]], {
      padding: 40,
      duration: 800,
      maxZoom: 8,
    });
  }

  /** Project geographic coordinates to screen pixel position */
  public projectToScreen(lat: number, lon: number): { x: number; y: number } | null {
    if (!this.maplibreMap) return null;
    try {
      const point = this.maplibreMap.project([lon, lat]);
      return { x: Math.round(point.x), y: Math.round(point.y) };
    } catch {
      return null;
    }
  }

  public setTimeRange(range: TimeRange): void {
    this.state.timeRange = range;
    this.rebuildProtestSupercluster();
    this.onTimeRangeChange?.(range);
    this.updateTimeSliderButtons();
    this.render(); // Debounced
  }

  public getTimeRange(): TimeRange {
    return this.state.timeRange;
  }

  public setLayers(layers: MapLayers): void {
    this.state.layers = layers;
    this.manageAircraftTimer(layers.flights);
    this.render(); // Debounced

    // Update toggle checkboxes
    Object.entries(layers).forEach(([key, value]) => {
      const toggle = this.container.querySelector(`.layer-toggle[data-layer="${key}"] input`) as HTMLInputElement;
      if (toggle) toggle.checked = value;
    });
  }

  public getState(): DeckMapState {
    return { ...this.state };
  }

  // Zoom controls - public for external access
  public zoomIn(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomIn();
    }
  }

  public zoomOut(): void {
    if (this.maplibreMap) {
      this.maplibreMap.zoomOut();
    }
  }

  private resetView(): void {
    this.setView('global');
  }

  private createUcdpEventsLayer(events: UcdpGeoEvent[]): ScatterplotLayer<UcdpGeoEvent> {
    return new ScatterplotLayer<UcdpGeoEvent>({
      id: 'ucdp-events-layer',
      data: events,
      getPosition: (d) => [d.longitude, d.latitude],
      getRadius: (d) => Math.max(4000, Math.sqrt(d.deaths_best || 1) * 3000),
      getFillColor: (d) => {
        switch (d.type_of_violence) {
          case 'state-based': return COLORS.ucdpStateBased;
          case 'non-state': return COLORS.ucdpNonState;
          case 'one-sided': return COLORS.ucdpOneSided;
          default: return COLORS.ucdpStateBased;
        }
      },
      radiusMinPixels: 3,
      radiusMaxPixels: 20,
      pickable: true,
    });
  }

  private createDisplacementArcsLayer(): ArcLayer<DisplacementFlow> {
    const withCoords = this.displacementFlows.filter(f => f.originLat != null && f.asylumLat != null);
    const top50 = withCoords.slice(0, 50);
    const maxCount = Math.max(1, ...top50.map(f => f.refugees));
    return new ArcLayer<DisplacementFlow>({
      id: 'displacement-arcs-layer',
      data: top50,
      getSourcePosition: (d) => [d.originLon!, d.originLat!],
      getTargetPosition: (d) => [d.asylumLon!, d.asylumLat!],
      getSourceColor: [100, 150, 255, 180],
      getTargetColor: [100, 255, 200, 180],
      getWidth: (d) => Math.max(1, (d.refugees / maxCount) * 8),
      widthMinPixels: 1,
      widthMaxPixels: 8,
      pickable: true,
    });
  }

  private createClimateHeatmapLayer(): HeatmapLayer<ClimateAnomaly> {
    return new HeatmapLayer<ClimateAnomaly>({
      id: 'climate-heatmap-layer',
      data: this.climateAnomalies,
      getPosition: (d) => [d.lon, d.lat],
      getWeight: (d) => Math.abs(d.tempDelta) + Math.abs(d.precipDelta) * 0.1,
      radiusPixels: 40,
      intensity: 0.6,
      threshold: 0.15,
      opacity: 0.45,
      colorRange: [
        [68, 136, 255],
        [100, 200, 255],
        [255, 255, 100],
        [255, 200, 50],
        [255, 100, 50],
        [255, 50, 50],
      ],
      pickable: false,
    });
  }

  private createClimateAnomaliesLayer(): ScatterplotLayer<ClimateAnomaly> {
    return new ScatterplotLayer<ClimateAnomaly>({
      id: 'climate-anomalies-layer',
      data: this.climateAnomalies,
      getPosition: (d) => [d.lon, d.lat],
      getRadius: 150000,
      radiusMinPixels: 4,
      radiusMaxPixels: 15,
      getFillColor: (d) => {
        if (d.type === 'warm') return [255, 100, 50, 180];
        if (d.type === 'cold') return [100, 150, 255, 180];
        if (d.type === 'wet') return [50, 200, 255, 180];
        if (d.type === 'dry') return [255, 200, 50, 180];
        return [200, 200, 200, 180];
      },
      stroked: true,
      lineWidthMinPixels: 1,
      getLineColor: [255, 255, 255, 120],
      pickable: true,
    });
  }

  private createTradeRoutesLayer(): ArcLayer<TradeRouteSegment> {
    const active: [number, number, number, number] = [100, 200, 255, 160];
    const disrupted: [number, number, number, number] = [255, 80, 80, 200];
    const highRisk: [number, number, number, number] = [255, 180, 50, 180];
    const colorFor = (status: string): [number, number, number, number] =>
      status === 'disrupted' ? disrupted : status === 'high_risk' ? highRisk : active;

    return new ArcLayer<TradeRouteSegment>({
      id: 'trade-routes-layer',
      data: this.tradeRouteSegments,
      getSourcePosition: (d) => d.sourcePosition,
      getTargetPosition: (d) => d.targetPosition,
      getSourceColor: (d) => colorFor(d.status),
      getTargetColor: (d) => colorFor(d.status),
      getWidth: (d) => d.category === 'energy' ? 3 : 2,
      widthMinPixels: 1,
      widthMaxPixels: 6,
      greatCircle: true,
      pickable: true,
    });
  }

  private createTradeChokepointsLayer(): ScatterplotLayer {
    const routeWaypointIds = new Set<string>();
    for (const seg of this.tradeRouteSegments) {
      const route = TRADE_ROUTES_LIST.find(r => r.id === seg.routeId);
      if (route) for (const wp of route.waypoints) routeWaypointIds.add(wp);
    }
    const chokepoints = STRATEGIC_WATERWAYS.filter(w => routeWaypointIds.has(w.id));


    return new ScatterplotLayer({
      id: 'trade-chokepoints-layer',
      data: chokepoints,
      getPosition: (d: { lon: number; lat: number }) => [d.lon, d.lat],
      getFillColor: [255, 180, 50, 180],
      getLineColor: [255, 220, 120, 255],
      getRadius: 30000,
      stroked: true,
      lineWidthMinPixels: 1,
      radiusMinPixels: 4,
      radiusMaxPixels: 12,
      pickable: true,
    });
  }

  /**
   * Compute the solar terminator polygon (night side of the Earth).
   * Uses standard astronomical formulas to find the subsolar point,
   * then traces the terminator line and closes around the dark pole.
   */
  private computeNightPolygon(): [number, number][] {
    const now = new Date();
    const JD = now.getTime() / 86400000 + 2440587.5;
    const D = JD - 2451545.0; // Days since J2000.0

    // Solar mean anomaly (radians)
    const g = ((357.529 + 0.98560028 * D) % 360) * Math.PI / 180;

    // Solar ecliptic longitude (degrees)
    const q = (280.459 + 0.98564736 * D) % 360;
    const L = q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g);
    const LRad = L * Math.PI / 180;

    // Obliquity of ecliptic (radians)
    const eRad = (23.439 - 0.00000036 * D) * Math.PI / 180;

    // Solar declination (radians)
    const decl = Math.asin(Math.sin(eRad) * Math.sin(LRad));

    // Solar right ascension (radians)
    const RA = Math.atan2(Math.cos(eRad) * Math.sin(LRad), Math.cos(LRad));

    // Greenwich Mean Sidereal Time (degrees)
    const GMST = ((18.697374558 + 24.06570982441908 * D) % 24) * 15;

    // Sub-solar longitude (degrees, normalized to [-180, 180])
    let sunLng = RA * 180 / Math.PI - GMST;
    sunLng = ((sunLng % 360) + 540) % 360 - 180;

    // Trace terminator line (1° steps for smooth curve at high zoom)
    const tanDecl = Math.tan(decl);
    const points: [number, number][] = [];

    // Near equinox (|tanDecl| ≈ 0), the terminator is nearly a great circle
    // through the poles — use a vertical line at the subsolar meridian ±90°
    if (Math.abs(tanDecl) < 1e-6) {
      for (let lat = -90; lat <= 90; lat += 1) {
        points.push([sunLng + 90, lat]);
      }
      for (let lat = 90; lat >= -90; lat -= 1) {
        points.push([sunLng - 90, lat]);
      }
      return points;
    }

    for (let lng = -180; lng <= 180; lng += 1) {
      const ha = (lng - sunLng) * Math.PI / 180;
      const lat = Math.atan(-Math.cos(ha) / tanDecl) * 180 / Math.PI;
      points.push([lng, lat]);
    }

    // Close polygon around the dark pole
    const darkPoleLat = decl > 0 ? -90 : 90;
    points.push([180, darkPoleLat]);
    points.push([-180, darkPoleLat]);

    return points;
  }

  private createDayNightLayer(): PolygonLayer {
    const nightPolygon = this.cachedNightPolygon ?? (this.cachedNightPolygon = this.computeNightPolygon());


    return new PolygonLayer({
      id: 'day-night-layer',
      data: [{ polygon: nightPolygon }],
      getPolygon: (d: { polygon: [number, number][] }) => d.polygon,
      getFillColor: [0, 0, 20, 55],
      filled: true,
      stroked: true,
      getLineColor: [200, 200, 255, 25],
      getLineWidth: 1,
      lineWidthUnits: 'pixels' as const,
      pickable: false,
    });
  }

  // Data setters - all use render() for debouncing
  public setEarthquakes(earthquakes: Earthquake[]): void {
    this.earthquakes = earthquakes;
    this.render();
  }

  public setWeatherAlerts(alerts: WeatherAlert[]): void {
    this.weatherAlerts = alerts;
    this.render();
  }

  public setOutages(outages: InternetOutage[]): void {
    this.outages = outages;
    this.render();
  }

  public setCyberThreats(threats: CyberThreat[]): void {
    this.cyberThreats = threats;
    this.render();
  }

  public setIranEvents(events: IranEvent[]): void {
    this.iranEvents = events;
    this.render();
  }

  public setAisData(disruptions: AisDisruptionEvent[], density: AisDensityZone[]): void {
    this.aisDisruptions = disruptions;
    this.aisDensity = density;
    this.render();
  }

  public setCableActivity(advisories: CableAdvisory[], repairShips: RepairShip[]): void {
    this.cableAdvisories = advisories;
    this.repairShips = repairShips;
    this.render();
  }

  public setCableHealth(healthMap: Record<string, CableHealthRecord>): void {
    this.healthByCableId = healthMap;
    this.layerCache.delete('cables-layer');
    this.render();
  }

  public setProtests(events: SocialUnrestEvent[]): void {
    this.protests = events;
    this.rebuildProtestSupercluster();
    this.render();
    this.syncPulseAnimation();
  }

  public setFlightDelays(delays: AirportDelayAlert[]): void {
    this.flightDelays = delays;
    this.render();
  }

  public setAircraftPositions(positions: PositionSample[]): void {
    this.aircraftPositions = positions;
    this.render();
  }

  public setMilitaryFlights(flights: MilitaryFlight[], clusters: MilitaryFlightCluster[] = []): void {
    this.militaryFlights = flights;
    this.militaryFlightClusters = clusters;
    this.render();
  }

  public setMilitaryVessels(vessels: MilitaryVessel[], clusters: MilitaryVesselCluster[] = []): void {
    this.militaryVessels = vessels;
    this.militaryVesselClusters = clusters;
    this.render();
  }

  private fetchServerBases(): void {
    if (!this.maplibreMap) return;
    const mapLayers = this.state.layers;
    if (!mapLayers.bases) return;
    const zoom = this.maplibreMap.getZoom();
    if (zoom < 2) return; // Matches new threshold
    const bounds = this.maplibreMap.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();

    // Explicitly handle antimeridian wrapping if necessary, though MapLibre bounds usually handle it
    fetchMilitaryBases(sw.lat, sw.lng, ne.lat, ne.lng, zoom).then((result) => {
      if (!result) {
        console.warn('[bases] No result returned from service');
        return;
      }
      this.serverBases = result.bases || [];
      this.serverBaseClusters = result.clusters || [];
      this.serverBasesLoaded = true;
      this.render();
    }).catch((err) => {
      console.error('[bases] fetch error', err);
      // Fallback or user notification could go here if critical
    });
  }

  private manageAircraftTimer(enabled: boolean): void {
    if (enabled) {
      if (!this.aircraftFetchTimer) {
        this.aircraftFetchTimer = setInterval(() => {
          this.lastAircraftFetchCenter = null; // force refresh on poll
          this.fetchViewportAircraft();
        }, 120_000); // Match server cache TTL (120s anonymous OpenSky tier)
        this.debouncedFetchAircraft();
      }
    } else {
      if (this.aircraftFetchTimer) {
        clearInterval(this.aircraftFetchTimer);
        this.aircraftFetchTimer = null;
      }
      this.aircraftPositions = [];
    }
  }

  private hasAircraftViewportChanged(): boolean {
    if (!this.maplibreMap) return false;
    if (!this.lastAircraftFetchCenter) return true;
    const center = this.maplibreMap.getCenter();
    const zoom = this.maplibreMap.getZoom();
    if (Math.abs(zoom - this.lastAircraftFetchZoom) >= 1) return true;
    const [prevLng, prevLat] = this.lastAircraftFetchCenter;
    // Threshold scales with zoom — higher zoom = smaller movement triggers fetch
    const threshold = Math.max(0.1, 2 / Math.pow(2, Math.max(0, zoom - 3)));
    return Math.abs(center.lat - prevLat) > threshold || Math.abs(center.lng - prevLng) > threshold;
  }

  private fetchViewportAircraft(): void {
    if (!this.maplibreMap) return;
    if (!this.state.layers.flights) return;
    const zoom = this.maplibreMap.getZoom();
    if (zoom < 2) {
      if (this.aircraftPositions.length > 0) {
        this.aircraftPositions = [];
        this.render();
      }
      return;
    }
    if (!this.hasAircraftViewportChanged()) return;
    const bounds = this.maplibreMap.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const seq = ++this.aircraftFetchSeq;

    fetchAircraftPositions({
      swLat: sw.lat, swLon: sw.lng,
      neLat: ne.lat, neLon: ne.lng,
    }).then((positions) => {
      if (seq !== this.aircraftFetchSeq) return; // discard stale response
      if (!positions) {
        console.warn('[aircraft] No positions returned');
        return;
      }
      this.aircraftPositions = positions;
      this.onAircraftPositionsUpdate?.(positions);
      const center = this.maplibreMap?.getCenter();
      if (center) {
        this.lastAircraftFetchCenter = [center.lng, center.lat];
        this.lastAircraftFetchZoom = this.maplibreMap!.getZoom();
      }
      this.render();
    }).catch((err) => {
      console.error('[aircraft] fetch error', err);
    });
  }

  public setNaturalEvents(events: NaturalEvent[]): void {
    this.naturalEvents = events;
    this.render();
  }

  public setFires(fires: Array<{ lat: number; lon: number; brightness: number; frp: number; confidence: number; region: string; acq_date: string; daynight: string }>): void {
    this.firmsFireData = fires;
    this.render();
  }

  public setTechEvents(events: TechEventMarker[]): void {
    this.techEvents = events;
    this.rebuildTechEventSupercluster();
    this.render();
  }

  public setUcdpEvents(events: UcdpGeoEvent[]): void {
    this.ucdpEvents = events;
    this.render();
  }

  public setDisplacementFlows(flows: DisplacementFlow[]): void {
    this.displacementFlows = flows;
    this.render();
  }

  public setClimateAnomalies(anomalies: ClimateAnomaly[]): void {
    this.climateAnomalies = anomalies;
    this.render();
  }

  public setGpsJamming(hexes: GpsJamHex[]): void {
    this.gpsJammingHexes = hexes;
    this.render();
  }

  public setNewsLocations(data: Array<{ lat: number; lon: number; title: string; threatLevel: string; timestamp?: Date }>): void {
    const now = Date.now();
    for (const d of data) {
      if (!this.newsLocationFirstSeen.has(d.title)) {
        this.newsLocationFirstSeen.set(d.title, now);
      }
    }
    for (const [key, ts] of this.newsLocationFirstSeen) {
      if (now - ts > 60_000) this.newsLocationFirstSeen.delete(key);
    }
    this.newsLocations = data;
    this.render();

    this.syncPulseAnimation(now);
  }

  public setPositiveEvents(events: PositiveGeoEvent[]): void {
    this.positiveEvents = events;
    this.syncPulseAnimation();
    this.render();
  }

  public setKindnessData(points: KindnessPoint[]): void {
    this.kindnessPoints = points;
    this.syncPulseAnimation();
    this.render();
  }

  public setHappinessScores(data: HappinessData): void {
    this.happinessScores = data.scores;
    this.happinessYear = data.year;
    this.happinessSource = data.source;
    this.render();
  }

  public setCIIScores(scores: Array<{ code: string; score: number; level: string }>): void {
    this.ciiScoresMap = new Map(scores.map(s => [s.code, { score: s.score, level: s.level }]));
    this.ciiScoresVersion++;
    this.render();
  }

  public setSpeciesRecoveryZones(species: SpeciesRecovery[]): void {
    this.speciesRecoveryZones = species.filter(
      (s): s is SpeciesRecovery & { recoveryZone: { name: string; lat: number; lon: number } } =>
        s.recoveryZone != null
    );
    this.render();
  }

  public setRenewableInstallations(installations: RenewableInstallation[]): void {
    this.renewableInstallations = installations;
    this.render();
  }

  public updateHotspotActivity(news: NewsItem[]): void {
    this.news = news; // Store for related news lookup

    // Update hotspot "breaking" indicators based on recent news
    const breakingKeywords = new Set<string>();
    const recentNews = news.filter(n =>
      Date.now() - n.pubDate.getTime() < 2 * 60 * 60 * 1000 // Last 2 hours
    );

    // Count matches per hotspot for escalation tracking
    const matchCounts = new Map<string, number>();

    recentNews.forEach(item => {
      const tokens = tokenizeForMatch(item.title);
      this.hotspots.forEach(hotspot => {
        if (matchesAnyKeyword(tokens, hotspot.keywords)) {
          breakingKeywords.add(hotspot.id);
          matchCounts.set(hotspot.id, (matchCounts.get(hotspot.id) || 0) + 1);
        }
      });
    });

    this.hotspots.forEach(h => {
      h.hasBreaking = breakingKeywords.has(h.id);
      const matchCount = matchCounts.get(h.id) || 0;
      // Calculate a simple velocity metric (matches per hour normalized)
      const velocity = matchCount > 0 ? matchCount / 2 : 0; // 2 hour window
      updateHotspotEscalation(h.id, matchCount, h.hasBreaking || false, velocity);
    });

    this.render();
    this.syncPulseAnimation();
  }

  /** Get news items related to a hotspot by keyword matching */
  private getRelatedNews(hotspot: Hotspot): NewsItem[] {
    const conflictTopics = ['gaza', 'ukraine', 'ukrainian', 'russia', 'russian', 'israel', 'israeli', 'iran', 'iranian', 'india', 'bangladesh', 'pakistan', 'china', 'chinese', 'taiwan', 'taiwanese', 'korea', 'korean', 'syria', 'syrian'];

    return this.news
      .map((item) => {
        const tokens = tokenizeForMatch(item.title);
        const matchedKeywords = findMatchingKeywords(tokens, hotspot.keywords);

        if (matchedKeywords.length === 0) return null;

        const conflictMatches = conflictTopics.filter(t =>
          matchKeyword(tokens, t) && !hotspot.keywords.some(k => k.toLowerCase().includes(t))
        );

        if (conflictMatches.length > 0) {
          const strongLocalMatch = matchedKeywords.some(kw =>
            kw.toLowerCase() === hotspot.name.toLowerCase() ||
            hotspot.agencies?.some(a => matchKeyword(tokens, a))
          );
          if (!strongLocalMatch) return null;
        }

        const score = matchedKeywords.length;
        return { item, score };
      })
      .filter((x): x is { item: NewsItem; score: number } => x !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(x => x.item);
  }

  public updateMilitaryForEscalation(flights: MilitaryFlight[], vessels: MilitaryVessel[]): void {
    setMilitaryData(flights, vessels);
  }

  public getHotspotDynamicScore(hotspotId: string) {
    return getHotspotEscalation(hotspotId);
  }

  /** Get military flight clusters for rendering/analysis */
  public getMilitaryFlightClusters(): MilitaryFlightCluster[] {
    return this.militaryFlightClusters;
  }

  /** Get military vessel clusters for rendering/analysis */
  public getMilitaryVesselClusters(): MilitaryVesselCluster[] {
    return this.militaryVesselClusters;
  }

  public highlightAssets(assets: RelatedAsset[] | null): void {
    // Clear previous highlights
    Object.values(this.highlightedAssets).forEach(set => set.clear());

    if (assets) {
      assets.forEach(asset => {
        if (asset?.type && this.highlightedAssets[asset.type]) {
          this.highlightedAssets[asset.type].add(asset.id);
        }
      });
    }

    this.render(); // Debounced
  }

  public setOnHotspotClick(callback: (hotspot: Hotspot) => void): void {
    this.onHotspotClick = callback;
  }

  public setOnTimeRangeChange(callback: (range: TimeRange) => void): void {
    this.onTimeRangeChange = callback;
  }

  public setOnLayerChange(callback: (layer: keyof MapLayers, enabled: boolean, source: 'user' | 'programmatic') => void): void {
    this.onLayerChange = callback;
  }

  public setOnStateChange(callback: (state: DeckMapState) => void): void {
    this.onStateChange = callback;
  }

  public setOnAircraftPositionsUpdate(callback: (positions: PositionSample[]) => void): void {
    this.onAircraftPositionsUpdate = callback;
  }

  public getHotspotLevels(): Record<string, string> {
    const levels: Record<string, string> = {};
    this.hotspots.forEach(h => {
      levels[h.name] = h.level || 'low';
    });
    return levels;
  }

  public setHotspotLevels(levels: Record<string, string>): void {
    this.hotspots.forEach(h => {
      if (levels[h.name]) {
        h.level = levels[h.name] as 'low' | 'elevated' | 'high';
      }
    });
    this.render(); // Debounced
  }

  public initEscalationGetters(): void {
    setCIIGetter(getCountryScore);
    setGeoAlertGetter(getAlertsNearLocation);
  }

  // UI visibility methods
  public hideLayerToggle(layer: keyof MapLayers): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (toggle) (toggle as HTMLElement).style.display = 'none';
  }

  public setLayerLoading(layer: keyof MapLayers, loading: boolean): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (toggle) toggle.classList.toggle('loading', loading);
  }

  public setLayerReady(layer: keyof MapLayers, hasData: boolean): void {
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"]`);
    if (!toggle) return;

    toggle.classList.remove('loading');
    // Match old Map.ts behavior: set 'active' only when layer enabled AND has data
    if (this.state.layers[layer] && hasData) {
      toggle.classList.add('active');
    } else {
      toggle.classList.remove('active');
    }
  }

  public flashAssets(assetType: AssetType, ids: string[]): void {
    if (!this.highlightedAssets[assetType]) return;
    ids.forEach(id => this.highlightedAssets[assetType].add(id));
    this.render();

    setTimeout(() => {
      ids.forEach(id => this.highlightedAssets[assetType]?.delete(id));
      this.render();
    }, 3000);
  }

  // Enable layer programmatically
  public enableLayer(layer: keyof MapLayers): void {
    if (!this.state.layers[layer]) {
      this.state.layers[layer] = true;
      const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"] input`) as HTMLInputElement;
      if (toggle) toggle.checked = true;
      this.render();
      this.onLayerChange?.(layer, true, 'programmatic');
    }
  }

  // Toggle layer on/off programmatically
  public toggleLayer(layer: keyof MapLayers): void {
    this.state.layers[layer] = !this.state.layers[layer];
    const toggle = this.container.querySelector(`.layer-toggle[data-layer="${layer}"] input`) as HTMLInputElement;
    if (toggle) toggle.checked = this.state.layers[layer];
    this.render();
    this.onLayerChange?.(layer, this.state.layers[layer], 'programmatic');
  }

  // Get center coordinates for programmatic popup positioning
  public getCenter(): [number, number] {
    if (!this.maplibreMap) return [0, 0];
    const center = this.maplibreMap.getCenter();
    return [center.lng, center.lat];
  }

  private focusOnObject(lon: number, lat: number, zoom = 8): void {
    if (!this.maplibreMap) return;

    // Side panel is 400px wide. Shift the center 200px right so the point
    // appears visually centered in the remaining (left) map area.
    this.maplibreMap.flyTo({
      center: [lon, lat],
      zoom,
      essential: true,
      duration: 1500,
      offset: [200, 0]
    });
  }

  // Trigger click methods - show side panel at item location
  public triggerHotspotClick(id: string): void {
    const hotspot = this.hotspots.find(h => h.id === id);
    if (!hotspot) return;

    // Get related news and show side panel
    const relatedNews = this.getRelatedNews(hotspot);
    this.sidePanel.show({
      type: 'hotspot',
      data: hotspot,
      relatedNews
    });
    this.focusOnObject(hotspot.lon, hotspot.lat, 7);
    this.onHotspotClick?.(hotspot);
  }

  public triggerConflictClick(id: string): void {
    const conflict = CONFLICT_ZONES.find(c => c.id === id);
    if (conflict) {
      this.sidePanel.show({
        type: 'conflict',
        data: conflict
      });
      this.focusOnObject(conflict.center[0], conflict.center[1], 6);
    }
  }

  public triggerBaseClick(id: string): void {
    const base = this.serverBases.find(b => b.id === id) || MILITARY_BASES.find(b => b.id === id);
    if (base) {
      this.sidePanel.show({
        type: 'base',
        data: base
      });
      this.focusOnObject(base.lon, base.lat, 8);
    }
  }

  public triggerPipelineClick(id: string): void {
    const pipeline = PIPELINES.find(p => p.id === id);
    if (pipeline && pipeline.points.length > 0) {
      const midIdx = Math.floor(pipeline.points.length / 2);
      const midPoint = pipeline.points[midIdx];
      if (midPoint) {
        this.sidePanel.show({
          type: 'pipeline',
          data: pipeline
        });
        this.focusOnObject(midPoint[0], midPoint[1], 8);
      }
    }
  }

  public triggerCableClick(id: string): void {
    const cable = UNDERSEA_CABLES.find(c => c.id === id);
    if (cable && cable.points.length > 0) {
      const midIdx = Math.floor(cable.points.length / 2);
      const midPoint = cable.points[midIdx];
      if (midPoint) {
        this.sidePanel.show({
          type: 'cable',
          data: cable,
          onFocus: () => this.focusOnObject(midPoint[0], midPoint[1], 8)
        });
      }
    }
  }

  public triggerDatacenterClick(id: string): void {
    const dc = AI_DATA_CENTERS.find(d => d.id === id);
    if (dc) {
      this.sidePanel.show({
        type: 'datacenter',
        data: dc,
        onFocus: () => this.focusOnObject(dc.lon, dc.lat)
      });
    }
  }

  public triggerNuclearClick(id: string): void {
    const facility = NUCLEAR_FACILITIES.find(n => n.id === id);
    if (facility) {
      this.sidePanel.show({
        type: 'nuclear',
        data: facility,
        onFocus: () => this.focusOnObject(facility.lon, facility.lat)
      });
    }
  }

  public triggerIrradiatorClick(id: string): void {
    const irradiator = GAMMA_IRRADIATORS.find(i => i.id === id);
    if (irradiator) {
      this.sidePanel.show({
        type: 'irradiator',
        data: irradiator,
        onFocus: () => this.focusOnObject(irradiator.lon, irradiator.lat)
      });
    }
  }

  public flashLocation(lat: number, lon: number, durationMs = 2000): void {
    // Don't pan - project coordinates to screen position
    const screenPos = this.projectToScreen(lat, lon);
    if (!screenPos) return;

    // Flash effect by temporarily adding a highlight at the location
    const flashMarker = document.createElement('div');
    flashMarker.className = 'flash-location-marker';
    flashMarker.style.cssText = `
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      border: 2px solid #fff;
      animation: flash-pulse 0.5s ease-out infinite;
      pointer-events: none;
      z-index: 1000;
      left: ${screenPos.x}px;
      top: ${screenPos.y}px;
      transform: translate(-50%, -50%);
    `;

    // Add animation keyframes if not present
    if (!document.getElementById('flash-animation-styles')) {
      const style = document.createElement('style');
      style.id = 'flash-animation-styles';
      style.textContent = `
        @keyframes flash-pulse {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(2); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
    }

    const wrapper = this.container.querySelector('.deckgl-map-wrapper');
    if (wrapper) {
      wrapper.appendChild(flashMarker);
      setTimeout(() => flashMarker.remove(), durationMs);
    }
  }

  // --- Country click + highlight ---

  public setOnCountryClick(cb: (country: CountryClickPayload) => void): void {
    this.onCountryClick = cb;
  }

  private resolveCountryFromCoordinate(lon: number, lat: number): { code: string; name: string } | null {
    const fromGeometry = getCountryAtCoordinates(lat, lon);
    if (fromGeometry) return fromGeometry;
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return null;
    try {
      const point = this.maplibreMap.project([lon, lat]);
      const features = this.maplibreMap.queryRenderedFeatures(point, { layers: ['country-interactive'] });
      const properties = (features?.[0]?.properties ?? {}) as Record<string, unknown>;
      const code = typeof properties['ISO3166-1-Alpha-2'] === 'string'
        ? properties['ISO3166-1-Alpha-2'].trim().toUpperCase()
        : '';
      const name = typeof properties.name === 'string'
        ? properties.name.trim()
        : '';
      if (!code || !name) return null;
      return { code, name };
    } catch {
      return null;
    }
  }

  private loadCountryBoundaries(): void {
    if (!this.maplibreMap || this.countryGeoJsonLoaded) return;
    this.countryGeoJsonLoaded = true;

    getCountriesGeoJson()
      .then((geojson) => {
        if (!this.maplibreMap || !geojson) return;
        this.countriesGeoJsonData = geojson;
        this.maplibreMap.addSource('country-boundaries', {
          type: 'geojson',
          data: geojson,
        });
        this.maplibreMap.addLayer({
          id: 'country-interactive',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0,
          },
        });
        this.maplibreMap.addLayer({
          id: 'country-hover-fill',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.06,
          },
          filter: ['==', ['get', 'name'], ''],
        });
        this.maplibreMap.addLayer({
          id: 'country-highlight-fill',
          type: 'fill',
          source: 'country-boundaries',
          paint: {
            'fill-color': '#3b82f6',
            'fill-opacity': 0.12,
          },
          filter: ['==', ['get', 'ISO3166-1-Alpha-2'], ''],
        });
        this.maplibreMap.addLayer({
          id: 'country-highlight-border',
          type: 'line',
          source: 'country-boundaries',
          paint: {
            'line-color': '#3b82f6',
            'line-width': 1.5,
            'line-opacity': 0.5,
          },
          filter: ['==', ['get', 'ISO3166-1-Alpha-2'], ''],
        });

        if (!this.countryHoverSetup) this.setupCountryHover();
        this.updateCountryLayerPaint(getCurrentTheme());
        if (this.highlightedCountryCode) this.highlightCountry(this.highlightedCountryCode);
      })
      .catch((err) => console.warn('[DeckGLMap] Failed to load country boundaries:', err));
  }

  private setupCountryHover(): void {
    if (!this.maplibreMap || this.countryHoverSetup) return;
    this.countryHoverSetup = true;
    const map = this.maplibreMap;
    let hoveredName: string | null = null;

    map.on('mousemove', (e) => {
      if (!this.onCountryClick) return;
      const features = map.queryRenderedFeatures(e.point, { layers: ['country-interactive'] });
      const name = features?.[0]?.properties?.name as string | undefined;

      try {
        if (name && name !== hoveredName) {
          hoveredName = name;
          map.setFilter('country-hover-fill', ['==', ['get', 'name'], name]);
          map.getCanvas().style.cursor = 'pointer';
        } else if (!name && hoveredName) {
          hoveredName = null;
          map.setFilter('country-hover-fill', ['==', ['get', 'name'], '']);
          map.getCanvas().style.cursor = '';
        }
      } catch { /* style not done loading during theme switch */ }
    });

    map.on('mouseout', () => {
      if (hoveredName) {
        hoveredName = null;
        try {
          map.setFilter('country-hover-fill', ['==', ['get', 'name'], '']);
        } catch { /* style not done loading */ }
        map.getCanvas().style.cursor = '';
      }
    });
  }

  public highlightCountry(code: string): void {
    this.highlightedCountryCode = code;
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return;
    const filter = ['==', ['get', 'ISO3166-1-Alpha-2'], code] as maplibregl.FilterSpecification;
    try {
      this.maplibreMap.setFilter('country-highlight-fill', filter);
      this.maplibreMap.setFilter('country-highlight-border', filter);
    } catch { /* layer not ready yet */ }
  }

  public clearCountryHighlight(): void {
    this.highlightedCountryCode = null;
    if (!this.maplibreMap) return;
    const noMatch = ['==', ['get', 'ISO3166-1-Alpha-2'], ''] as maplibregl.FilterSpecification;
    try {
      this.maplibreMap.setFilter('country-highlight-fill', noMatch);
      this.maplibreMap.setFilter('country-highlight-border', noMatch);
    } catch { /* layer not ready */ }
  }

  private switchBasemap(theme: 'dark' | 'light'): void {
    if (!this.maplibreMap) return;
    const primary = theme === 'light' ? LIGHT_STYLE : DARK_STYLE;
    const fallback = theme === 'light' ? FALLBACK_LIGHT_STYLE : FALLBACK_DARK_STYLE;
    this.maplibreMap.setStyle(this.usedFallbackStyle ? fallback : primary);
    // setStyle() replaces all sources/layers — reset guard so country layers are re-added
    this.countryGeoJsonLoaded = false;
    this.maplibreMap.once('style.load', () => {
      this.loadCountryBoundaries();
      this.updateCountryLayerPaint(theme);
      // Re-render deck.gl overlay after style swap — interleaved layers need
      // the new MapLibre style to be loaded before they can re-insert.
      this.render();
    });
  }

  private updateCountryLayerPaint(theme: 'dark' | 'light'): void {
    if (!this.maplibreMap || !this.countryGeoJsonLoaded) return;
    const hoverOpacity = theme === 'light' ? 0.10 : 0.06;
    const highlightOpacity = theme === 'light' ? 0.18 : 0.12;
    try {
      this.maplibreMap.setPaintProperty('country-hover-fill', 'fill-opacity', hoverOpacity);
      this.maplibreMap.setPaintProperty('country-highlight-fill', 'fill-opacity', highlightOpacity);
    } catch { /* layers may not be ready */ }
  }

  public destroy(): void {
    this.debouncedRebuildLayers.cancel();
    this.debouncedFetchBases.cancel();
    this.debouncedFetchAircraft.cancel();
    this.rafUpdateLayers.cancel();

    if (this.moveTimeoutId) {
      clearTimeout(this.moveTimeoutId);
      this.moveTimeoutId = null;
    }

    if (this.styleLoadTimeoutId) {
      clearTimeout(this.styleLoadTimeoutId);
      this.styleLoadTimeoutId = null;
    }
    this.stopPulseAnimation();
    this.stopDayNightTimer();
    if (this.aircraftFetchTimer) {
      clearInterval(this.aircraftFetchTimer);
      this.aircraftFetchTimer = null;
    }
    this.layerCache.clear();
    this.sidePanel?.destroy();

    this.deckOverlay?.finalize();
    this.deckOverlay = null;
    this.maplibreMap?.remove();
    this.maplibreMap = null;

    this.container.innerHTML = '';
  }
}
