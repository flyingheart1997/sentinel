import * as THREE from 'three';

export class EarthScene {

    private earth: THREE.Group;
    private sphere: THREE.Mesh;
    private readonly RADIUS = 6371; // Earth radius in km
    private dataLayers: Map<string, THREE.Mesh> = new Map();

    constructor(scene: THREE.Scene) {
        this.earth = new THREE.Group();
        const textureLoader = new THREE.TextureLoader();
        // Earth textures
        const dayTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-night.jpg');
        const bumpTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-topology.png');
        const waterTexture = textureLoader.load('https://unpkg.com/three-globe/example/img/earth-water.png');

        // Earth Geometry
        const geometry = new THREE.SphereGeometry(this.RADIUS, 128, 128);
        const material = new THREE.MeshPhongMaterial({
            map: dayTexture,
            bumpMap: bumpTexture,
            bumpScale: 5,
            specularMap: waterTexture,
            specular: new THREE.Color(0x333333),
            shininess: 15,
            emissive: new THREE.Color(0x222222),
            emissiveMap: dayTexture,
            emissiveIntensity: 0.6
        });

        this.sphere = new THREE.Mesh(geometry, material);
        this.earth.add(this.sphere);

        // ⭐ STAR BACKGROUND (FIXED VERSION)

        const starsTexture = textureLoader.load('/textures/night-sky.png');
        scene.background = starsTexture;


        // ⭐ DATA LAYERS

        this.dataLayers.set('temperature', this.createDataLayer(0xff3300, 30, 0.2, true));
        this.dataLayers.set('co2', this.createDataLayer(0x00ffaa, 40, 0.1, true));
        this.dataLayers.set('ocean', this.createDataLayer(0x0066ff, 15, 0.35, true));
        this.dataLayers.set('sealevel', this.createDataLayer(0x00ffff, 25, 0.2, true));
        this.dataLayers.set('ice', this.createDataLayer(0xffffff, 20, 0.4, false));
        this.dataLayers.set('gravity', this.createDataLayer(0x9900ff, 50, 0.15, true));
    }


    private createDataLayer(
        color: number,
        radiusOffset: number,
        opacity: number,
        additive: boolean
    ): THREE.Mesh {

        const geometry = new THREE.SphereGeometry(this.RADIUS + radiusOffset, 128, 128);
        const material = new THREE.MeshBasicMaterial({
            color,
            transparent: true,
            opacity,
            blending: additive
                ? THREE.AdditiveBlending
                : THREE.NormalBlending,
            depthWrite: false,
            side: THREE.FrontSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.visible = false;
        this.earth.add(mesh);

        return mesh;
    }


    getGroup(): THREE.Group {
        return this.earth;
    }


    update(_viewVector: THREE.Vector3, visibleLayers: string[] = []): void {

        // Earth rotation
        this.sphere.rotation.y += 0.00005;

        // Data layers rotation
        this.dataLayers.forEach((mesh, id) => {
            mesh.visible = visibleLayers.includes(id);
            if (mesh.visible) {
                mesh.rotation.y += 0.0001;
            }

        });

    }

}