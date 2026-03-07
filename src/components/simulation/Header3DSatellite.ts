import { h, Component } from 'preact';
import * as THREE from 'three';

export class Header3DSatellite extends Component {
    private mountNode: HTMLDivElement | null = null;
    private scene: THREE.Scene | null = null;
    private camera: THREE.PerspectiveCamera | null = null;
    private renderer: THREE.WebGLRenderer | null = null;
    private satGroup: THREE.Group | null = null;
    private animationId: number = 0;

    componentDidMount() {
        this.initThreeJS();
    }

    componentWillUnmount() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        if (this.renderer) {
            this.renderer.dispose();
            this.renderer.forceContextLoss();
        }
    }

    private initThreeJS() {
        if (!this.mountNode) return;

        const width = 48;
        const height = 48;

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
        this.camera.position.z = 5;

        this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
        this.renderer.setSize(width, height);
        this.mountNode.appendChild(this.renderer.domElement);

        this.satGroup = new THREE.Group();

        // Main Body (Silver/Gold Box)
        const bodyGeo = new THREE.BoxGeometry(0.8, 0.8, 1);
        const bodyMat = new THREE.MeshPhongMaterial({ color: 0xcccccc, specular: 0x111111, shininess: 100 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        this.satGroup.add(body);

        // Solar Panel Left
        const panelGeo = new THREE.BoxGeometry(2, 0.05, 0.6);
        const panelMat = new THREE.MeshPhongMaterial({ color: 0x0f2a4a, specular: 0x111111, shininess: 50 });
        const panelL = new THREE.Mesh(panelGeo, panelMat);
        panelL.position.x = -1.4;
        this.satGroup.add(panelL);

        // Solar Panel Right
        const panelR = new THREE.Mesh(panelGeo, panelMat);
        panelR.position.x = 1.4;
        this.satGroup.add(panelR);

        // Antenna
        const antennaGeo = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
        const antennaMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
        const antenna = new THREE.Mesh(antennaGeo, antennaMat);
        antenna.position.set(0, 0.7, 0);
        this.satGroup.add(antenna);

        this.scene.add(this.satGroup);

        const light1 = new THREE.DirectionalLight(0xffffff, 1.5);
        light1.position.set(2, 2, 5);
        this.scene.add(light1);

        const light2 = new THREE.AmbientLight(0x404040, 2);
        this.scene.add(light2);

        this.animate();
    }

    private animate = () => {
        this.animationId = requestAnimationFrame(this.animate);

        if (this.satGroup) {
            this.satGroup.rotation.x += 0.005;
            this.satGroup.rotation.y += 0.01;
            this.satGroup.rotation.z += 0.002;
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    };

    render() {
        return h('div', {
            ref: (ref: any) => this.mountNode = ref,
            style: { width: '48px', height: '48px', position: 'relative', zIndex: 3 }
        });
    }
}
