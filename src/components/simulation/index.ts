import { render, h } from 'preact';
import { SatelliteSimulation } from './SatelliteSimulation';
import { SimulationDashboard } from './SimulationDashboard';
import { simulationStore } from '../../stores/simulationStore';
import '@/styles/simulation.css';

export class SimulationComponent {
    private container: HTMLElement;
    private simulation: SatelliteSimulation | null = null;
    private dashboardContainer: HTMLElement;
    private threeContainer: HTMLElement;
    private updateInterval: any;

    constructor() {
        this.container = document.createElement('div');
        this.container.className = 'simulation-view-container';
        this.container.style.display = 'none';

        this.threeContainer = document.createElement('div');
        this.threeContainer.style.position = 'absolute';
        this.threeContainer.style.top = '0';
        this.threeContainer.style.left = '0';
        this.threeContainer.style.width = '100%';
        this.threeContainer.style.height = '100%';
        this.threeContainer.style.zIndex = '1';
        this.container.appendChild(this.threeContainer);

        this.dashboardContainer = document.createElement('div');
        this.dashboardContainer.style.position = 'absolute';
        this.dashboardContainer.style.top = '0';
        this.dashboardContainer.style.left = '0';
        this.dashboardContainer.style.width = '100%';
        this.dashboardContainer.style.height = '100%';
        this.dashboardContainer.style.zIndex = '10'; // Dashboard MUST sit above the Map
        this.dashboardContainer.style.pointerEvents = 'none'; // Let clicks pass through except on UI elements
        this.container.appendChild(this.dashboardContainer);

        document.body.appendChild(this.container);

        (window as any).exitSimulation = () => this.hide();
    }

    async show() {
        this.container.style.display = 'flex';
        if (!this.simulation) {
            this.simulation = new SatelliteSimulation(this.threeContainer);
        }

        // 1. Render Dashboard UI FIRST so it can capture the 'isLoading' state visually
        // Force the initial state to loading immediately
        simulationStore.getState().isLoading = true;
        render(h(SimulationDashboard, {}), this.dashboardContainer);

        // Crucial: Wait 1 frame so the browser can physically paint the Loading UI 
        // before the main thread is locked by the intense data fetching/processing
        await new Promise(resolve => setTimeout(resolve, 100));

        // 2. Fetch data (which flips isLoading = true again and tracks progress)
        await simulationStore.init();
        const sats = Array.from(simulationStore.getState().satellites.values());

        // 3. Initialize 3D mesh points once data yields
        if (sats.length > 0) {
            this.simulation.initSatellites(sats);
        }

        this.startUpdateLoop();
    }

    hide() {
        this.container.style.display = 'none';
        this.stopUpdateLoop();
        render(null, this.dashboardContainer);
    }

    private startUpdateLoop() {
        let lastTime = performance.now();
        const loop = (now: number) => {
            const dt = now - lastTime;
            lastTime = now;

            simulationStore.update(dt);
            const sats = Array.from(simulationStore.getState().satellites.values());
            if (this.simulation) {
                this.simulation.updateSatellites(sats);
            }

            this.updateInterval = requestAnimationFrame(loop);
        };
        this.updateInterval = requestAnimationFrame(loop);
    }

    private stopUpdateLoop() {
        if (this.updateInterval) cancelAnimationFrame(this.updateInterval);
    }

    destroy() {
        this.stopUpdateLoop();
        this.simulation?.destroy();
        this.container.remove();
    }
}

let instance: SimulationComponent | null = null;
export function getSimulation(): SimulationComponent {
    if (!instance) instance = new SimulationComponent();
    return instance;
}

export async function toggleSatelliteSimulation() {
    const sim = getSimulation();
    const container = document.querySelector('.simulation-view-container') as HTMLElement;
    if (container?.style.display === 'flex') {
        sim.hide();
    } else {
        await sim.show();
    }
}
