import { h, Component } from 'preact';
import { simulationStore } from '../../stores/simulationStore';
import { TleLoader } from '../../services/orbit/TleLoader';
import '../../styles/sim-dashboard-modern.css'; // Import the new modern styles

export class SimulationDashboard extends Component<any, { dragSpeed: number | null, collapsedPanels: Record<string, boolean> }> {
    state = {
        dragSpeed: null,
        collapsedPanels: { left: false, right: false } as Record<string, boolean>
    };

    private togglePanel = (panel: string) => {
        this.setState(prev => ({
            collapsedPanels: { ...prev.collapsedPanels, [panel]: !prev.collapsedPanels[panel] }
        }));
    };

    private unsub: (() => void) | null = null;
    private searchInput: string = '';

    componentDidMount() {
        this.unsub = simulationStore.subscribe(() => this.forceUpdate());
    }

    componentWillUnmount() {
        this.unsub?.();
    }

    private handleSearch = (e: Event) => {
        this.searchInput = (e.target as HTMLInputElement).value.toLowerCase();
        this.forceUpdate();
    };

    render() {
        const state = simulationStore.getState();
        const selectedSat = state.selectedSatelliteId ? state.satellites.get(state.selectedSatelliteId) : null;
        const selectedGs = state.selectedGroundStationId ? (state as any).groundStations?.find((g: any) => g.id === state.selectedGroundStationId) : null;

        if (state.isLoading) {
            // Keep the existing loading screen
            const progress = state.loadingProgress || 0;
            const isCountryChange = (state as any).loadingContext === 'country-change';
            const countryLabels: Record<string, string> = {
                'GLOBAL': 'GLOBAL', 'US': 'UNITED STATES', 'PRC': 'CHINA',
                'CIS': 'RUSSIA', 'IND': 'INDIA', 'ESA': 'EUROPE', 'JPN': 'JAPAN'
            };
            const countryLabel = countryLabels[(state as any).selectedCountry] || (state as any).selectedCountry;
            const loadingTitle = isCountryChange
                ? `Switching to ${countryLabel}`
                : 'Initializing Orbital Tracking';
            const loadingSub = isCountryChange
                ? `${progress}% Target data acquisition...`
                : `${progress}% Synchronizing telemetry streams...`;

            return h('div', { class: 'loading-overlay' },
                h('div', { class: 'loading-content' },
                    h('div', { class: 'spinner-orbital' }),
                    h('h2', { class: 'loading-title', style: { fontFamily: "'Aldrich', sans-serif" } }, loadingTitle),
                    h('p', { class: 'loading-sub', style: { color: '#00ffff' } }, loadingSub),
                    h('div', { class: 'sim-heartbeat-container' },
                        h('svg', { class: 'sim-heartbeat-svg', viewBox: "0 0 400 60", preserveAspectRatio: "none" },
                            // Path data for a professional ECG/Heartbeat
                            h('path', {
                                class: 'sim-heartbeat-bg',
                                d: "M 0 30 L 80 30 L 90 20 L 100 40 L 110 30 L 140 30 L 150 10 L 160 55 L 170 30 L 200 30 L 210 20 L 220 40 L 230 30 L 260 30 L 270 10 L 280 55 L 290 30 L 320 30 L 330 20 L 340 40 L 350 30 L 400 30"
                            }),
                            h('path', {
                                class: 'sim-heartbeat-progress',
                                d: "M 0 30 L 80 30 L 90 20 L 100 40 L 110 30 L 140 30 L 150 10 L 160 55 L 170 30 L 200 30 L 210 20 L 220 40 L 230 30 L 260 30 L 270 10 L 280 55 L 290 30 L 320 30 L 330 20 L 340 40 L 350 30 L 400 30",
                                style: {
                                    strokeDasharray: 1000,
                                    strokeDashoffset: (1000 - (1000 * (progress / 100)))
                                }
                            }),
                            // The pulse dot follows the horizontal progress
                            h('circle', {
                                class: 'sim-heartbeat-dot',
                                cx: (progress / 100) * 400,
                                cy: 30,
                                r: 4
                            })
                        )
                    )
                )
            );
        }

        // Prepare data for UI
        const activeCount = state.satellites.size;
        const debrisCount = Math.floor(activeCount * 0.7); // Simulated stat
        const trackedCount = activeCount + debrisCount + 1245; // Simulated stat

        // Filter catalog based on search
        const catalogList = Array.from(state.satellites.values())
            .filter(sat => sat.name.toLowerCase().includes(this.searchInput))
            .slice(0, 50); // Limit to top 50 for performance

        // Central coordinate display
        let centerLat = 0, centerLon = 0, centerAlt = 0;
        if (state.hoveredSatelliteId) {
            const hSat = state.satellites.get(state.hoveredSatelliteId);
            if (hSat) {
                centerLat = hSat.position.lat; centerLon = hSat.position.lon; centerAlt = hSat.position.alt;
            }
        } else if (selectedSat) {
            centerLat = selectedSat.position.lat; centerLon = selectedSat.position.lon; centerAlt = selectedSat.position.alt;
        }

        return h('div', { class: 'sim-ui-modern' },
            // ─────────────────────────────────────────────────────────
            // TOP BAR
            // ─────────────────────────────────────────────────────────
            h('div', { class: 'sim-top-bar' },
                h('div', { class: 'sim-brand', style: { flex: 1 } },
                    h('div', { class: 'sim-brand-icon' },
                        h('svg', {
                            viewBox: "0 0 24 24",
                            width: "100%",
                            height: "100%",
                            stroke: "var(--sim-accent-cyan)",
                            strokeWidth: "1.5",
                            fill: "none",
                            class: 'sim-logo-spin',
                            style: { filter: 'drop-shadow(0 0 5px var(--sim-accent-cyan))', position: 'absolute', zIndex: 2 }
                        },
                            h('path', { d: "M12 2a10 10 0 0 0-10 10c0 5.523 4.477 10 10 10s10-4.477 10-10A10 10 0 0 0 12 2Z" }),
                            h('path', { d: "M2 12h20" }),
                            h('path', { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })
                        )
                    ),
                    h('div', { class: 'sim-brand-text' },
                        h('h1', null, 'EYES ON EARTH'),
                        h('p', null, `ORBITAL SIMULATION DASHBOARD`)
                    )
                ),

                h('div', { class: 'sim-top-mid', style: { display: 'flex', justifyContent: 'center', flex: 1 } },
                    h('div', { class: 'sim-global-stats' },
                        h('div', { class: 'sim-stat-item' }, h('span', { class: 'sim-stat-val', style: { color: 'var(--sim-accent-cyan)' } }, trackedCount.toLocaleString()), h('span', { class: 'sim-stat-lbl' }, 'TRACKED')),
                        h('div', { class: 'sim-stat-item' }, h('span', { class: 'sim-stat-val', style: { color: 'var(--sim-accent-orange)' } }, debrisCount.toLocaleString()), h('span', { class: 'sim-stat-lbl' }, 'DEBRIS')),
                        h('div', { class: 'sim-stat-item' }, h('span', { class: 'sim-stat-val', style: { color: 'var(--sim-accent-green)' } }, activeCount.toLocaleString()), h('span', { class: 'sim-stat-lbl' }, 'ACTIVE'))
                    )
                ),

                h('div', { class: 'sim-controls-right', style: { flex: 1, display: 'flex', justifyContent: 'flex-end' } },
                    // Country Selection
                    h('div', { class: 'sim-modern-btn-wrap' },
                        h('div', { class: 'sim-modern-content', style: { padding: '0px' } },
                            h('select', {
                                class: 'sim-modern-select',
                                value: state.selectedCountry,
                                onChange: (e: any) => simulationStore.setCountry(e.target.value)
                            },
                                Object.entries(TleLoader.COUNTRY_LABELS).map(([code, label]) =>
                                    h('option', { value: code }, label + (code === 'GLOBAL' ? ' (500)' : ''))
                                )
                            )
                        )
                    ),
                    // Exit Button
                    h('div', {
                        class: 'sim-modern-btn-wrap exit-theme',
                        onClick: () => { if (typeof (window as any).exitSimulation === 'function') (window as any).exitSimulation(); }
                    },
                        h('div', { class: 'sim-modern-content' },
                            h('button', { class: 'sim-modern-btn' }, 'EXIT')
                        )
                    )
                )
            ),

            // ─────────────────────────────────────────────────────────
            // MAIN AREA (Left & Right Panels)
            // ─────────────────────────────────────────────────────────
            h('div', { class: 'sim-main-area' },

                // LEFT PANEL
                h('div', { class: 'sim-side-panel left-panel', style: { height: this.state.collapsedPanels.left ? '40px' : 'auto' } },
                    // GLOBAL LEFT PANEL HEADER
                    h('div', { class: 'sim-panel-header', onClick: () => this.togglePanel('left'), style: { cursor: 'pointer', flexShrink: 0 } },
                        h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'SATELLITE CATALOG'),
                        h('div', { class: 'sim-collapse-arrow', style: { marginLeft: '10px', transform: this.state.collapsedPanels.left ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.3s' } }, '▼')
                    ),
                    h('div', { style: { overflow: 'hidden', transition: 'all 0.3s ease-in-out', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 } },
                        // SATELLITE CATALOG BODY
                        h('div', { class: 'sim-panel-section', style: { flex: 1, display: 'flex', flexDirection: 'column', transition: 'flex 0.3s', border: 'none', paddingTop: 0 } },
                            h('input', {
                                class: 'sim-search-input',
                                placeholder: 'SEARCH SATELLITES...',
                                onInput: this.handleSearch,
                                value: this.searchInput
                            }),
                            h('div', { class: 'sim-catalog-list' },
                                catalogList.map(sat => {
                                    const isSelected = state.selectedSatelliteId === sat.id;
                                    // Generate a color based on category/name
                                    const catColor = sat.category === 'military' ? '#ef4444' :
                                        sat.category === 'weather' ? '#f97316' :
                                            sat.category === 'communication' ? '#3b82f6' : '#eab308';

                                    return h('div', {
                                        class: `sim-catalog-item ${isSelected ? 'active' : ''} `,
                                        onClick: () => simulationStore.selectSatellite(sat.id),
                                        onMouseEnter: () => simulationStore.hoverSatellite(sat.id),
                                        onMouseLeave: () => simulationStore.hoverSatellite(null)
                                    },
                                        h('div', { class: 'sim-cat-info' },
                                            h('div', { class: 'sim-cat-dot', style: { backgroundColor: catColor, color: catColor } }),
                                            h('div', { class: 'sim-cat-details' },
                                                h('h4', null, sat.name),
                                                h('p', null, `${sat.category.toUpperCase()} · LEO`)
                                            )
                                        ),
                                        h('div', { class: 'sim-cat-alt' }, `${sat.position.alt.toFixed(0)} km`)
                                    );
                                })
                            )
                        ),

                        // DATA LAYERS
                        h('div', { class: 'sim-panel-section', style: { flexShrink: 0 } },
                            h('div', { class: 'sim-panel-header', style: { marginBottom: '10px' } },
                                h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'DATA LAYERS')
                            ),
                            h('div', { class: 'sim-data-layers-wrapper' },
                                h('div', { class: 'sim-data-layers' },
                                    this.renderDataToggle('🌡️', 'Temperature', state.visibleLayers?.includes('temperature') ?? false, 'temperature'),
                                    this.renderDataToggle('☁️', 'CO2 Levels', state.visibleLayers?.includes('co2') ?? false, 'co2'),
                                    this.renderDataToggle('🌊', 'Ocean Heat', state.visibleLayers?.includes('ocean') ?? false, 'ocean'),
                                    this.renderDataToggle('📊', 'Sea Level', state.visibleLayers?.includes('sealevel') ?? false, 'sealevel'),
                                    this.renderDataToggle('❄️', 'Ice Coverage', state.visibleLayers?.includes('ice') ?? false, 'ice'),
                                    this.renderDataToggle('🧲', 'Gravity Field', state.visibleLayers?.includes('gravity') ?? false, 'gravity')
                                )
                            )
                        )
                    )
                ),

                // RIGHT PANEL
                h('div', { class: 'sim-side-panel right-panel', style: { height: this.state.collapsedPanels.right ? '40px' : 'auto' } },
                    (selectedSat || selectedGs) ? this.renderIntelPanel(selectedSat, selectedGs, state) : this.renderGlobalRightPanel(state)
                )
            ),

            // ─────────────────────────────────────────────────────────
            // BOTTOM BAR (Controls & Coordinates)
            // ─────────────────────────────────────────────────────────
            h('div', { class: 'sim-bottom-bar' },
                // NEW Curved Speed Controller
                (() => {
                    const displaySpeed = this.state.dragSpeed !== null ? this.state.dragSpeed : state.speed;

                    const speedToSlider = (s: number) => {
                        if (s > 60) return 60 + (s - 60) / 60;
                        if (s < -60) return -60 + (s + 60) / 60;
                        return s;
                    };
                    const sliderToSpeed = (v: number) => {
                        if (v > 60) return 60 + (v - 60) * 60;
                        if (v < -60) return -60 + (v + 60) * 60;
                        return v;
                    };

                    const sliderVal = speedToSlider(displaySpeed);
                    const t = (sliderVal + 69) / 138;
                    const cx = 3 * Math.pow(1 - t, 2) * t * 56 + 3 * (1 - t) * Math.pow(t, 2) * 504 + Math.pow(t, 3) * 560;
                    const cy = 3 * Math.pow(1 - t, 2) * t * 50 + 3 * (1 - t) * Math.pow(t, 2) * 50;

                    return h('div', { class: 'sim-speed-controller' },
                        // MIDDLE ROW: Date, Central Button, Time
                        h('div', { class: 'sim-speed-mid-row' },
                            h('span', { class: 'sim-speed-date' },
                                new Date(state.simulationTime).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: '2-digit', year: 'numeric' }).toUpperCase()
                            ),
                            h('button', {
                                class: 'sim-live-button',
                                onClick: () => {
                                    simulationStore.setSpeed(1);
                                    if (!state.isPlaying) simulationStore.togglePlay();
                                },
                                title: 'Return to LIVE'
                            },
                                displaySpeed === 1 && state.isPlaying ? h('span', { class: 'sim-blink-dot' }) : null,
                                h('span', {
                                    style: { color: !state.isPlaying || displaySpeed === 0 ? 'var(--sim-accent-red)' : (displaySpeed === 1 ? 'var(--sim-accent-green)' : 'var(--sim-accent-cyan)') }
                                },
                                    (() => {
                                        if (!state.isPlaying || displaySpeed === 0) return 'PAUSED';
                                        if (displaySpeed === 1) return 'LIVE';
                                        const abs = Math.abs(displaySpeed);
                                        const m = Math.floor(abs / 60);
                                        const s = abs % 60;
                                        let str = '';
                                        if (m > 0) str += `${m} MIN`;
                                        if (s > 0) str += (str ? ` ${s} SEC` : `${s} SEC`);
                                        return displaySpeed > 0 ? `${str} FASTER` : `${str} SLOWER`;
                                    })()
                                )
                            ),
                            h('span', { class: 'sim-speed-time' },
                                new Date(state.simulationTime).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
                            )
                        ),
                        // BOTTOM ROW: Exact Cubic Bezier Track
                        h('div', { class: 'sim-speed-track-container', style: { position: 'relative', width: '560px', height: '50px' } },
                            h('svg', {
                                viewBox: '0 0 560 50',
                                style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'visible' }
                            },
                                h('path', { d: 'M0,0 C56,50 504,50 560,0', fill: 'none', stroke: 'rgba(255,255,255,0.3)', strokeWidth: '2', strokeOpacity: '0.5', strokeLinecap: 'round' }),
                                h('circle', {
                                    cx: cx,
                                    cy: cy,
                                    r: 20,
                                    fill: 'rgba(37,37,39,0.85)',
                                    stroke: 'rgba(255, 255, 255, 0.1)',
                                    strokeWidth: '1',
                                    style: { transition: this.state.dragSpeed !== null ? 'none' : 'cx 0.1s linear, cy 0.1s linear' }
                                }),
                                h('circle', {
                                    cx: cx,
                                    cy: cy,
                                    r: 10,
                                    fill: displaySpeed === 0 ? 'var(--sim-accent-red)' : 'var(--sim-accent-green)',
                                    style: {
                                        filter: `drop - shadow(0 0 10px ${displaySpeed === 0 ? 'var(--sim-accent-red)' : 'var(--sim-accent-green)'})`,
                                        transition: this.state.dragSpeed !== null ? 'none' : 'cx 0.1s linear, cy 0.1s linear, fill 0.2s'
                                    }
                                })
                            ),
                            h('input', {
                                type: 'range',
                                min: -69, max: 69, step: 1,
                                value: sliderVal,
                                style: {
                                    position: 'absolute',
                                    top: 0, left: 0,
                                    width: '100%', height: '100%',
                                    margin: 0, padding: 0,
                                    opacity: 0,
                                    cursor: 'pointer',
                                    zIndex: 10
                                },
                                onInput: (e: any) => {
                                    const val = parseInt(e.target.value);
                                    this.setState({ dragSpeed: sliderToSpeed(val) });
                                },
                                onChange: (e: any) => {
                                    const val = parseInt(e.target.value);
                                    const finalSpeed = sliderToSpeed(val);
                                    simulationStore.setSpeed(finalSpeed);
                                    if (finalSpeed === 0 && state.isPlaying) {
                                        simulationStore.togglePlay();
                                    } else if (finalSpeed !== 0 && !state.isPlaying) {
                                        simulationStore.togglePlay();
                                    }
                                    this.setState({ dragSpeed: null });
                                }
                            })
                        )
                    );
                })(),
                // Coordinates Display
                h('div', { class: 'sim-coordinates', style: { pointerEvents: 'auto' } },
                    h('span', null, h('span', { class: 'sim-coord-lbl' }, 'LAT:'), h('span', { class: 'sim-coord-val' }, centerLat.toFixed(3) + '°')),
                    h('span', null, h('span', { class: 'sim-coord-lbl' }, 'LON:'), h('span', { class: 'sim-coord-val' }, centerLon.toFixed(3) + '°')),
                    h('span', null, h('span', { class: 'sim-coord-lbl' }, 'ALT:'), h('span', { class: 'sim-coord-val' }, centerAlt.toFixed(0) + ' km'))
                )
            ),

            // ─────────────────────────────────────────────────────────
            // TOOLTIP FOR SATELLITES & GS
            // ─────────────────────────────────────────────────────────
            this.renderTooltips(state)

        );
    }

    private renderGlobalRightPanel(state: any) {
        // Generate pseudo-random, slowly fluctuating telemetry data based on simulation time
        const timeOffset = state.simulationTime.getTime() / 1000;

        const tempBase = 14.8;
        const tempOscillation = Math.sin(timeOffset / 100) * 0.3 + Math.sin(timeOffset / 15) * 0.1;
        const surfaceTemp = tempBase + tempOscillation;

        const co2Base = 421.4;
        const co2Oscillation = Math.cos(timeOffset / 120) * 1.5 + Math.sin(timeOffset / 20) * 0.5;
        const co2Conc = co2Base + co2Oscillation;

        const oceanTempBase = 0.93;
        const oceanOscillation = Math.sin(timeOffset / 200) * 0.05 + Math.cos(timeOffset / 50) * 0.02;
        const oceanTemp = oceanTempBase + oceanOscillation;

        const iceBase = 4.92;
        const iceOscillation = Math.cos(timeOffset / 300) * 0.08 + Math.sin(timeOffset / 60) * 0.03;
        const seaIce = Math.max(0, iceBase + iceOscillation);

        const gravityBase = -20;
        const gravityOscillation = Math.sin(timeOffset / 50) * 2;
        const gravity = gravityBase + gravityOscillation;

        const ozoneBase = 287;
        const ozoneOscillation = Math.cos(timeOffset / 80) * 5;
        const ozone = Math.round(ozoneBase + ozoneOscillation);

        // Dynamic Mission Alerts
        const allAlerts = [
            { icon: '⚠️', color: 'var(--sim-accent-orange)', text: 'GRACE-FO: gravity anomaly over Greenland', offset: 120 },
            { icon: '●', color: 'var(--sim-accent-green)', text: 'ICESat-2: Antarctic Peninsula pass complete', offset: 245 },
            { icon: '⚠️', color: 'var(--sim-accent-red)', text: 'Debris collision warning: LEO Sector 4', offset: 50 },
            { icon: '●', color: 'var(--sim-accent-cyan)', text: 'Sentinel-6 telemetry downlink nominal', offset: 8 },
            { icon: '⚠️', color: 'var(--sim-accent-yellow)', text: 'Solar flare detected: Expect minor comms interference', offset: 310 },
            { icon: '●', color: 'var(--sim-accent-green)', text: 'Hubble Space Telescope re-orientation complete', offset: 420 }
        ];

        // Pick a dynamic number of alerts based on a slow wave, between 2 and 5
        const activeCount = 2 + Math.floor((Math.sin(timeOffset / 100) + 1) * 1.5);
        const activeAlerts = allAlerts.slice(0, activeCount);

        return h('div', { class: 'sim-right-global-container', style: { display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', paddingRight: '5px' } },
            // GLOBAL RIGHT PANEL HEADER
            h('div', { class: 'sim-panel-header', onClick: () => this.togglePanel('right'), style: { cursor: 'pointer', flexShrink: 0 } },
                h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'TELEMETRY'),
                h('div', { class: 'sim-collapse-arrow', style: { transform: this.state.collapsedPanels.right ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.3s' } }, '▼')
            ),
            h('div', { style: { opacity: this.state.collapsedPanels.right ? 0 : 1, overflow: 'hidden', transition: 'all 0.3s ease-in-out', display: 'flex', flexDirection: 'column', gap: '40px', flex: 1 } },
                h('div', { class: 'sim-panel-section', style: { flexShrink: 0, border: 'none', paddingTop: 0 } },
                    h('div', { class: 'sim-telemetry-list' },
                        this.renderTelemetryBar('SURFACE TEMP', `+ ${surfaceTemp.toFixed(2)}°C`, 65 + (tempOscillation > 0 ? 5 : -5), 'orange'),
                        this.renderTelemetryBar('CO2 CONC.', `${co2Conc.toFixed(1)} PPM`, 85 + (co2Oscillation > 0 ? 3 : -3), 'red'),
                        this.renderTelemetryBar('OCEAN TEMP', `+ ${oceanTemp.toFixed(2)}°C`, 45 + (oceanOscillation > 0 ? 5 : -5), 'cyan'),
                        this.renderTelemetryBar('SEA ICE', `${seaIce.toFixed(2)}M KM²`, 30 + (iceOscillation > 0 ? 2 : -2), 'cyan'),
                        this.renderTelemetryBar('GRAVITY', `${gravity.toFixed(0)} MGAL`, 50 + (gravityOscillation > 0 ? 4 : -4), 'cyan'),
                        this.renderTelemetryBar('OZONE', `${ozone} DU`, 75 + (ozoneOscillation > 0 ? 3 : -3), 'green')
                    )
                ),
                h('div', { class: 'sim-panel-section', style: { flexShrink: 0 } },
                    h('div', { class: 'sim-panel-header', style: { marginBottom: '10px' } },
                        h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'MISSION ALERTS'),
                        h('div', { class: 'sim-panel-badge' }, `${activeCount} ACTIVE`)
                    ),
                    h('div', { class: 'sim-alert-list' },
                        ...activeAlerts.map(alert => {
                            // Calculate a relative past time for the alert purely for display
                            const alertTime = new Date(state.simulationTime.getTime() - alert.offset * 1000);
                            const timeStr = alertTime.toISOString().substr(11, 8) + ' UTC';
                            return h('div', { class: 'sim-alert-row' },
                                h('div', { class: 'sim-alert-icon', style: { color: alert.color } }, alert.icon),
                                h('div', { class: 'sim-alert-content' },
                                    h('p', null, alert.text),
                                    h('span', null, timeStr)
                                )
                            );
                        })
                    )
                )
            )
        );
    }

    private renderIntelPanel(sat: any, gs: any, state: any) {
        if (sat) {
            // Parse some dynamic values from actual TLE or simulation time
            const timeOffset = state.simulationTime.getTime() / 1000;
            const satIdNum = parseInt(sat.noradId) || 12345;

            // TLE line2 format: 2 25544  51.6406 148.0682 ...
            let inclination = '97.8°';
            let period = '98.8 min';

            if (sat.line2) {
                const incMatch = sat.line2.substr(8, 8).trim();
                const mmMatch = sat.line2.substr(52, 11).trim(); // Mean motion (rev/day)
                if (incMatch) inclination = `${parseFloat(incMatch).toFixed(1)}°`;
                if (mmMatch) {
                    const revsPerDay = parseFloat(mmMatch);
                    if (revsPerDay > 0) {
                        period = `${(1440 / revsPerDay).toFixed(1)} min`;
                    }
                }
            }

            // Pseudo-random but stable health metrics based on ID and Time
            const powerHealth = Math.min(100, Math.max(0, 85 + Math.sin(timeOffset / 300 + satIdNum) * 12));
            const thermalHealth = Math.min(100, Math.max(0, 75 + Math.cos(timeOffset / 400 - satIdNum) * 15));
            const commsHealth = Math.min(100, Math.max(0, 92 + Math.sin(timeOffset / 100 * satIdNum) * 5));

            return h('div', { class: 'sim-intel-panel', style: { display: 'flex', flexDirection: 'column', height: '100%' } },
                h('div', { class: 'intel-panel-header' },
                    h('div', { style: { flex: 1 } },
                        h('h2', null, sat.name),
                        h('div', { class: 'intel-sub-title' }, `${sat.category.toUpperCase()} · TRACKED OBJECT`),
                    ),
                ),
                h('div', { style: { overflow: 'hidden', transition: 'all 0.3s ease-in-out', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 } },
                    h('div', { class: 'sim-panel-section', style: { border: 'none', paddingTop: 0 } },
                        h('div', { class: 'sim-panel-header', style: { marginBottom: '5px' } },
                            h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'ORBITAL PARAMETERS')
                        ),
                        h('div', { class: 'stat-group' },
                            this.renderStatRow('NORAD ID', sat.noradId || 'UNKNOWN'),
                            this.renderStatRow('LATITUDE', `${sat.position.lat.toFixed(3)}°`),
                            this.renderStatRow('LONGITUDE', `${sat.position.lon.toFixed(3)}°`),
                            this.renderStatRow('ALTITUDE', `${sat.position.alt.toFixed(0)} km`),
                            this.renderStatRow('INCLINATION', inclination),
                            this.renderStatRow('PERIOD', period),
                            this.renderStatRow('VELOCITY', `${sat.velocity ? Math.sqrt(sat.velocity.x ** 2 + sat.velocity.y ** 2 + sat.velocity.z ** 2).toFixed(2) : '7.67'} km / s`)
                        )
                    ),
                    h('div', { class: 'sim-panel-section' },
                        h('div', { class: 'sim-panel-header', style: { marginBottom: '5px' } },
                            h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'SYSTEM HEALTH')
                        ),
                        h('div', { class: 'stat-group' },
                            this.renderHealthLine('POWER', Math.round(powerHealth), powerHealth > 50 ? 'var(--sim-accent-green)' : 'var(--sim-accent-orange)'),
                            this.renderHealthLine('THERMAL', Math.round(thermalHealth), thermalHealth > 60 ? (thermalHealth > 80 ? 'var(--sim-accent-green)' : 'var(--sim-accent-orange)') : 'var(--sim-accent-red)'),
                            this.renderHealthLine('COMMS', Math.round(commsHealth), commsHealth > 80 ? 'var(--sim-accent-cyan)' : 'var(--sim-accent-orange)')
                        )
                    )
                )
            );
        } else if (gs) {
            // Dynamic GS stats based on simulation time
            const timeOffset = state.simulationTime.getTime() / 1000;
            // Generate some random signal strength for the GS connection
            const signalStr = Math.round(80 + Math.sin(timeOffset / 50 + gs.lat) * 18);

            return h('div', { class: 'sim-intel-panel', style: { display: 'flex', flexDirection: 'column', height: '100%' } },
                h('div', { class: 'intel-panel-header' },
                    h('div', { style: { flex: 1 } },
                        h('h2', null, gs.name),
                        h('div', { class: 'intel-sub-title' }, `${gs.agency} · ${gs.country} `),
                    )
                ),
                h('div', { style: { overflow: 'hidden', transition: 'all 0.3s ease-in-out', display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 } },
                    h('div', { class: 'sim-panel-section', style: { border: 'none', paddingTop: 0 } },
                        h('div', { class: 'sim-panel-header', style: { marginBottom: '5px' } },
                            h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'STATION INFO')
                        ),
                        h('div', { class: 'stat-group' },
                            this.renderStatRow('COORD', `${gs.lat?.toFixed(2)}°, ${gs.lon?.toFixed(2)}°`),
                            this.renderStatRow('ELEVATION', `${gs.elevation ?? '—'} m`),
                            this.renderStatRow('ANTENNAS', `${gs.antennas ?? '—'} UNITS`),
                            this.renderStatRow('DOWNTIME', `0.2 % `),
                            this.renderStatRow('R. FREQ', `S / X / Ka Band`)
                        )
                    ),
                    h('div', { class: 'sim-panel-section' },
                        h('div', { class: 'sim-panel-header', style: { marginBottom: '5px' } },
                            h('div', { class: 'sim-panel-title', style: { flex: 1 } }, 'STATION STATUS')
                        ),
                        h('div', { class: 'stat-group' },
                            this.renderHealthLine('SIGNAL', signalStr, signalStr > 50 ? 'var(--sim-accent-green)' : 'var(--sim-accent-orange)'),
                            this.renderHealthLine('POWER', 95, 'var(--sim-accent-green)'),
                            this.renderStatRow('LATENCY', `${Math.round(40 + Math.random() * 20)} ms`, false)
                        )
                    )
                )
            );
        }
        return null;
    }

    private renderStatRow(lbl: string, val: string, isGreen: boolean = false) {
        return h('div', { class: 'stat-row' },
            h('span', { class: 'stat-lbl' }, lbl),
            h('span', { class: `stat-val ${isGreen ? 'green' : 'white'}` }, val)
        );
    }

    private renderHealthLine(label: string, value: number, color: string) {
        return h('div', { class: 'sim-telemetry-row' },
            h('div', { class: 'sim-tel-header' }, h('span', null, label), h('span', { style: { color } }, `${value}%`)),
            h('div', { class: 'sim-tel-bar' }, h('div', { class: 'sim-tel-fill', style: { width: `${value}%`, background: color, boxShadow: `0 0 5px ${color}` } }))
        );
    }

    private renderTooltips(state: any) {
        if (state.hoveredSatelliteId && state.tooltipPos && state.satellites.has(state.hoveredSatelliteId)) {
            const sat = state.satellites.get(state.hoveredSatelliteId)!;
            return this.renderTooltipBase(state.tooltipPos, sat.name, `${sat.category.toUpperCase()} · ${sat.position.alt.toFixed(0)} km`);
        }
        if ((state as any).hoveredGroundStationId && (state as any).gsTooltipPos) {
            const gs = (state as any).groundStations?.find((g: any) => g.id === (state as any).hoveredGroundStationId);
            if (gs) return this.renderTooltipBase((state as any).gsTooltipPos, gs.name, `GROUND STATION · ${gs.country}`);
        }
        return null;
    }

    private renderTooltipBase(pos: { x: number, y: number }, title: string, sub: string) {
        const TW = 150, TH = 50;
        const tx = pos.x + 15 + TW > window.innerWidth ? pos.x - TW - 5 : pos.x + 15;
        const ty = pos.y + 15 + TH > window.innerHeight ? pos.y - TH - 5 : pos.y + 15;
        return h('div', { class: 'sat-intel-tooltip-modern', style: { left: `${tx}px`, top: `${ty}px` } },
            h('div', { class: 'tt-title' }, title),
            h('div', { class: 'tt-sub' }, sub)
        );
    }

    private renderDataToggle(icon: string, label: string, checked: boolean, layerId: string) {
        return h('div', { class: 'sim-toggle-row' },
            h('div', { class: 'sim-toggle-label' },
                h('span', { class: 'sim-toggle-icon' }, icon),
                h('span', null, label)
            ),
            h('label', { class: 'sim-switch' },
                h('input', {
                    type: 'checkbox',
                    checked,
                    onChange: () => simulationStore.toggleLayer(layerId)
                }),
                h('span', { class: 'sim-slider' })
            )
        );
    }

    private renderTelemetryBar(label: string, valueStr: string, percentage: number, colorClass: string = 'cyan') {
        const trueColorClass = colorClass === 'cyan' ? '' : colorClass;
        return h('div', { class: 'sim-telemetry-row' },
            h('div', { class: 'sim-tel-header' },
                h('span', null, label),
                h('span', { class: `sim-tel-val ${trueColorClass}` }, valueStr)
            ),
            h('div', { class: 'sim-tel-bar' },
                h('div', { class: `sim-tel-fill ${trueColorClass}`, style: { width: `${percentage}%` } })
            )
        );
    }
}
