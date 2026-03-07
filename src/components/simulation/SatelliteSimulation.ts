import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EarthScene } from './EarthScene';
import { SatelliteInstancedMesh } from './SatelliteInstancedMesh';
import { GroundStationLayer } from './GroundStationMesh';
import type { SimulatedSatellite } from '../../modules/satellites/types';
import { simulationStore } from '../../stores/simulationStore';

export class SatelliteSimulation {
    private scene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private renderer: THREE.WebGLRenderer;
    private controls: OrbitControls;
    private earth: EarthScene;
    private instancedMesh: SatelliteInstancedMesh | null = null;
    private animationId: number | null = null;
    private raycaster: THREE.Raycaster = new THREE.Raycaster();
    private mouse: THREE.Vector2 = new THREE.Vector2();
    private container: HTMLElement;
    private satelliteIds: string[] = [];
    private focusedModel: THREE.Group | null = null;
    private activeModelSatId: string | null = null;
    private orbitPathLines: Map<string, THREE.Line> = new Map();
    private isZoomed: boolean = false;
    private lastSelectedSatId: string | null = null; // detect satellite change for camera jump
    private defaultCameraDistance = 25000;
    private groundStationLayer: GroundStationLayer | null = null;
    private boundResize: any;
    private boundClick: any;
    private boundMouseMove: any;

    private latLonToCartesian(lat: number, lon: number, alt: number): THREE.Vector3 {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        const r = 6371 + alt;
        return new THREE.Vector3(
            -r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    constructor(container: HTMLElement) {
        this.container = container;
        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 10, 2000000);
        this.camera.position.set(0, 15000, 30000);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(container.clientWidth, container.clientHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        // minDistance must be < satellite zoom target (~7321 = Earth 6371 + 550alt + 400 cam offset)
        this.controls.minDistance = 7500;
        this.controls.maxDistance = 500000;

        const ambientLight = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 2);
        sunLight.position.set(5, 3, 5).normalize();
        this.scene.add(sunLight);

        this.earth = new EarthScene(this.scene);
        this.scene.add(this.earth.getGroup());

        this.boundResize = this.onResize.bind(this);
        this.boundClick = this.onClick.bind(this);
        this.boundMouseMove = this.onMouseMove.bind(this);

        window.addEventListener('resize', this.boundResize);
        this.renderer.domElement.addEventListener('click', this.boundClick);
        this.renderer.domElement.addEventListener('mousemove', this.boundMouseMove);

        // Initialize Ground Station layer
        this.groundStationLayer = new GroundStationLayer(
            this.scene, this.camera, this.controls, this.renderer
        );
        const filteredGs = simulationStore.getFilteredGroundStations();
        this.groundStationLayer.updateStations(filteredGs);

        this.animate();
    }

    initSatellites(satellites: SimulatedSatellite[]): void {
        this.satelliteIds = satellites.map(s => s.id);
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh.mesh);
            this.instancedMesh.destroy();
        }
        this.instancedMesh = new SatelliteInstancedMesh(satellites.length);
        this.scene.add(this.instancedMesh.mesh);
    }

    updateSatellites(satellites: SimulatedSatellite[]): void {
        const state = simulationStore.getState();
        const hoveredId = state.hoveredSatelliteId;
        const selectedId = state.selectedSatelliteId;

        // Dynamically recreate the WebGL attributes if Country filter alters the total count
        if (!this.instancedMesh || this.satelliteIds.length !== satellites.length) {
            if (satellites.length > 0) {
                this.initSatellites(satellites);
            }
        }

        if (this.instancedMesh && satellites.length > 0) {
            this.instancedMesh.updatePositions(satellites);

            // ── Orbit paths: show both hovered and selected satellites ──
            const activeOrbitIds = new Set<string>();
            if (selectedId) activeOrbitIds.add(selectedId);
            if (hoveredId) activeOrbitIds.add(hoveredId);

            activeOrbitIds.forEach(id => {
                const pathSat = satellites.find(s => s.id === id);
                if (pathSat && pathSat.orbitPath && pathSat.orbitPath.length > 0) {
                    this.updateOrbitPath(pathSat);
                }
            });

            for (const [id, line] of this.orbitPathLines.entries()) {
                if (!activeOrbitIds.has(id)) {
                    this.scene.remove(line);
                    line.geometry.dispose();
                    (line.material as THREE.Material).dispose();
                    this.orbitPathLines.delete(id);
                }
            }



            // ── 3D Model + camera: only for selected satellite ──────────────────
            if (selectedId) {
                const sat = satellites.find(s => s.id === selectedId);
                if (sat && sat.position) {
                    const pos = this.latLonToCartesian(sat.position.lat, sat.position.lon, sat.position.alt);
                    // Per-satellite unique color from ID hash
                    const satColor = this.getSatelliteColor(sat.id);
                    // Calculate velocity vector for orientation
                    let velocity = new THREE.Vector3(1, 0, 0); // Default direction
                    if ((sat as any).velocity) {
                        // Using the velocity vector from the satellite data if available
                        const vel = (sat as any).velocity;
                        velocity = new THREE.Vector3(vel.x, vel.y, vel.z).normalize();
                    } else if (sat.orbitPath && sat.orbitPath.length > 1) {
                        // Fallback to estimating direction based on the first two path points
                        const p1 = this.latLonToCartesian(sat.position.lat, sat.position.lon, sat.position.alt);
                        const nextPos = sat.orbitPath[0]; // Assuming orbitPath points forward
                        if (nextPos) {
                            const p2 = this.latLonToCartesian(nextPos.lat, nextPos.lon, nextPos.alt);

                            // If p1 and p2 are too close, it might not be a good direction vector, but it's an estimate
                            velocity = p2.clone().sub(p1).normalize();
                        }
                    }

                    this.updateFocusedModel(pos, velocity, sat.id, satColor);

                    // Smoothly interpolate the controls target towards the satellite
                    this.controls.target.lerp(pos, 0.08);

                    // Reset isZoomed when switching to a DIFFERENT satellite
                    if (this.lastSelectedSatId !== selectedId) {
                        this.isZoomed = false;
                        this.lastSelectedSatId = selectedId;
                    }

                    // On first selection, move the camera to a comfortable view distance
                    if (!this.isZoomed) {
                        const upDir = pos.clone().normalize();
                        const targetPos = pos.clone().add(upDir.multiplyScalar(10000));

                        // Perform a smooth camera position transition
                        this.camera.position.lerp(targetPos, 0.05);

                        // If we are close enough to the target, mark as zoomed
                        if (this.camera.position.distanceTo(targetPos) < 100) {
                            this.isZoomed = true;
                            this.controls.minDistance = 500;
                        }
                    }
                }
            } else {
                this.controls.minDistance = 7500;
                this.removeFocusedModel();
                this.resetCameraZoom();
            }
        }
    }


    private resetCameraZoom() {
        if (this.isZoomed) {
            this.lastSelectedSatId = null;
            // Smoothly ease target back to Earth core
            this.controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.05);

            // Smoothly ease camera to global view distance from any direction
            const currentDist = this.camera.position.length();
            const diff = Math.abs(currentDist - this.defaultCameraDistance);
            if (diff > 200) {
                // Camera is either too close OR too far — lerp to correct distance
                const globalPos = this.camera.position.clone().setLength(this.defaultCameraDistance);
                this.camera.position.lerp(globalPos, 0.05);
            } else if (this.controls.target.lengthSq() < 500) {
                this.isZoomed = false; // finished resetting
                this.controls.minDistance = 7500;
            }
        }
    }

    private updateFocusedModel(pos: THREE.Vector3, velocity: THREE.Vector3, satId: string, color: THREE.Color) {
        if (!this.focusedModel || this.activeModelSatId !== satId) {
            this.removeFocusedModel();
            this.focusedModel = this.createSatelliteModel(color);
            this.activeModelSatId = satId;
            this.scene.add(this.focusedModel);
        }
        this.focusedModel.position.copy(pos);

        // Point the satellite in the direction of travel (velocity vector)
        // We use lookAt to point the local Z axis in the direction of velocity
        // The instruments were built facing -Z, so pointing +Z forward means instruments point backwards.
        // Let's make the front of the bus (+Z) face the velocity direction.
        const targetPos = pos.clone().add(velocity);
        this.focusedModel.lookAt(targetPos);

        // Orient the "bottom" (-Y) towards Earth
        // Create an "up" vector pointing away from Earth
        const upVector = pos.clone().normalize();

        // Calculate the a quaternion that rotates the model so its local Y axis aligns with upVector
        // while trying to keep its local Z axis aligned with velocity.
        // lookAt already aligns Z with targetPos. We just need to roll it so Y points UP.
        this.focusedModel.up.copy(upVector);
        this.focusedModel.lookAt(targetPos);
    }

    /**
     * Deterministic per-satellite color from ID hash.
     * Maps each unique satellite ID to a consistent HSL hue,
     * ensuring icon, orbit path, and 3D model all share the same color.
     */
    private getSatelliteColor(id: string): THREE.Color {
        // Simple djb2-style hash of the satellite ID string
        let hash = 5381;
        for (let i = 0; i < id.length; i++) {
            hash = ((hash << 5) + hash) + id.charCodeAt(i);
            hash = hash & hash; // keep 32-bit integer
        }
        // Spread across the full hue wheel (0–360), avoid near-white yellows (50-70°)
        // by remapping: use 120° of meaningful hue range spread across satellites
        const hue = Math.abs(hash % 360);
        // Clamp saturation/lightness for vivid but not washed out
        const color = new THREE.Color();
        color.setHSL(hue / 360, 0.9, 0.55);
        return color;
    }

    private createSatelliteModel(color: THREE.Color): THREE.Group {
        const group = new THREE.Group();

        // Materials for a realistic look

        // Gold Foil for the main body (Multi-layer insulation)
        const foilMat = new THREE.MeshStandardMaterial({
            color: 0xffaa00,
            roughness: 0.4,
            metalness: 0.8,
            bumpScale: 0.02
        });

        // Dark blueish metallic for solar panels
        const solarPanelMat = new THREE.MeshStandardMaterial({
            color: 0x051024,
            roughness: 0.2,
            metalness: 0.9,
            side: THREE.FrontSide
        });

        // Grey/silver metal for struts and instruments
        const silverMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            roughness: 0.4,
            metalness: 0.7
        });

        // Colored indicator/badge based on satellite category/id
        const indicatorMat = new THREE.MeshBasicMaterial({ color: color });

        // 1. Main Body (Bus)
        const bodyGeo = new THREE.BoxGeometry(180, 180, 180);
        const body = new THREE.Mesh(bodyGeo, foilMat);
        group.add(body);

        // Colored stripe to identify the satellite
        const stripeGeo = new THREE.BoxGeometry(190, 30, 190);
        const stripe = new THREE.Mesh(stripeGeo, indicatorMat);
        group.add(stripe);

        // 2. Solar Panels
        // Segments to make it look detailed
        const panW = 100, panH = 260, gap = 8;
        const numPanels = 3;

        [-1, 1].forEach(side => {
            // Main strut holding panels
            const strutLength = 100 + (panW + gap) * numPanels;
            const strutGeo = new THREE.CylinderGeometry(8, 8, strutLength);
            const strut = new THREE.Mesh(strutGeo, silverMat);
            strut.rotation.z = Math.PI / 2;
            strut.position.x = side * (strutLength / 2 + 80);
            group.add(strut);

            // Solar panel segments
            for (let i = 0; i < numPanels; i++) {
                const panelGeo = new THREE.BoxGeometry(panW, 4, panH);
                const panel = new THREE.Mesh(panelGeo, solarPanelMat);

                // Silver backing for panel to make it realistic from behind
                const backMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.8, metalness: 0.5 });
                const backPanelGeo = new THREE.BoxGeometry(panW, 1, panH);
                const backPanel = new THREE.Mesh(backPanelGeo, backMat);
                backPanel.position.y = -2.5;
                panel.add(backPanel);

                panel.position.x = side * (160 + i * (panW + gap) + panW / 2);

                // Tilt the panels slightly relative to the body for a dynamic look
                panel.rotation.x = Math.PI / 12;

                group.add(panel);
            }
        });

        // 3. Communications Dish
        const dishGroup = new THREE.Group();
        // Place on top (Y-axis)
        dishGroup.position.set(0, 90, 0);

        const mastGeo = new THREE.CylinderGeometry(10, 10, 50);
        const mast = new THREE.Mesh(mastGeo, silverMat);
        mast.position.y = 25;
        dishGroup.add(mast);

        // The dish shape
        const dishGeo = new THREE.SphereGeometry(60, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2.5);
        const dish = new THREE.Mesh(dishGeo, silverMat);
        dish.position.y = 60;
        dish.rotation.x = Math.PI; // bowl facing upwards
        dishGroup.add(dish);

        // Dish antenna feed in the center
        const feedGeo = new THREE.CylinderGeometry(2, 2, 40);
        const feed = new THREE.Mesh(feedGeo, silverMat);
        feed.position.y = 60;
        dishGroup.add(feed);

        group.add(dishGroup);

        // 4. Earth-facing Instruments (cameras, sensors)
        // lookAt(0,0,0) makes negative Z axis point to Earth.
        // So we add instruments on the -Z face of the satellite body.
        const instrumentGroup = new THREE.Group();
        instrumentGroup.position.set(0, 0, -90); // front face towards Earth

        const cameraBox = new THREE.Mesh(new THREE.BoxGeometry(50, 50, 40), silverMat);
        cameraBox.position.set(30, -30, -20);
        instrumentGroup.add(cameraBox);

        const lensGeo = new THREE.CylinderGeometry(15, 15, 20);
        const lens = new THREE.Mesh(lensGeo, new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.1 }));
        lens.rotation.x = Math.PI / 2; // point lens towards -Z
        lens.position.set(30, -30, -40);
        instrumentGroup.add(lens);

        const sensorGeo = new THREE.CylinderGeometry(20, 20, 30);
        const sensor = new THREE.Mesh(sensorGeo, silverMat);
        sensor.rotation.x = Math.PI / 2;
        sensor.position.set(-30, 20, -15);
        instrumentGroup.add(sensor);

        group.add(instrumentGroup);

        // Scale up the entire model for better visibility
        group.scale.set(1.5, 1.5, 1.5);

        return group;
    }

    private updateOrbitPath(sat: SimulatedSatellite) {
        if (!sat.orbitPath) return;

        // If orbit line already exists for this satellite, keep it
        if (this.orbitPathLines.has(sat.id)) {
            return;
        }

        const points = sat.orbitPath.map(p => this.latLonToCartesian(p.lat, p.lon, p.alt));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Use per-satellite dynamic color — same hash as icon and orbit path
        const color = this.getSatelliteColor(sat.id);
        const material = new THREE.LineBasicMaterial({
            color: color.getHex(),
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending
        });

        const orbitLine = new THREE.Line(geometry, material);
        this.orbitPathLines.set(sat.id, orbitLine);
        this.scene.add(orbitLine);
    }

    private removeFocusedModel() {
        if (this.focusedModel) {
            this.scene.remove(this.focusedModel);
            this.focusedModel = null;
        }
    }



    private onClick(event: MouseEvent) {
        const id = this.getIntersectedSatelliteId(event);
        simulationStore.selectSatellite(id);
    }

    private onMouseMove(event: MouseEvent) {
        const id = this.getIntersectedSatelliteId(event);
        simulationStore.hoverSatellite(id);

        if (id) {
            simulationStore.setTooltipPos({ x: event.clientX, y: event.clientY });
            this.renderer.domElement.style.cursor = 'pointer';
        } else {
            simulationStore.setTooltipPos(null);
            this.renderer.domElement.style.cursor = 'default';
        }
    }

    private getIntersectedSatelliteId(event: MouseEvent): string | null {
        if (!this.instancedMesh) return null;

        const rect = this.renderer.domElement.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        this.raycaster.params.Line = { threshold: 50 };
        // Dynamic threshold: scales with camera distance to match visual icon size at all zoom levels
        const camDist = this.camera.position.length();
        this.raycaster.params.Points = { threshold: Math.max(20, camDist / 120) };

        const intersects = this.raycaster.intersectObject(this.instancedMesh.mesh);

        if (intersects && intersects.length > 0) {
            const first = intersects[0];
            // Three.js Points intersections use .index instead of .instanceId
            if (first && first.index !== undefined) {
                return this.satelliteIds[first.index] || null;
            }
        }

        return null;
    }

    private onResize(): void {
        this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }

    private animate(): void {
        this.animationId = requestAnimationFrame(this.animate.bind(this));
        this.controls.update();

        const state = simulationStore.getState();
        this.earth.update(this.camera.position, state.visibleLayers);

        // Tick the ground station layer (updates zoom and dish model)
        this.groundStationLayer?.tick();
        this.renderer.render(this.scene, this.camera);
    }

    destroy(): void {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        window.removeEventListener('resize', this.boundResize);
        this.renderer.domElement.removeEventListener('click', this.boundClick);
        this.renderer.domElement.removeEventListener('mousemove', this.boundMouseMove);
        this.renderer.dispose();
        this.renderer.domElement.remove();
    }
}
