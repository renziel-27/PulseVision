/**
 * PulseVision 3D Beating Heart Visualizer
 * Procedural cardiac mesh with real-time physiological rhythm synchronization
 */

class Heart3DVisualizer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container || typeof THREE === 'undefined') {
      return;
    }

    this.bpm = 72;
    this.animationId = null;
    this.clock = new THREE.Clock();

    this.initScene();
    this.createHeartMesh();
    this.createParticleGlow();
    this.setupLights();
    this.onWindowResize = this.onWindowResize.bind(this);
    window.addEventListener('resize', this.onWindowResize);
    this.animate = this.animate.bind(this);
    this.animate();
  }

  initScene() {
    const width = this.container.clientWidth || 300;
    const height = this.container.clientHeight || 260;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.set(0, 0, 32);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);
  }

  createHeartMesh() {
    const heartShape = new THREE.Shape();
    // Mathematical heart contour
    const x = 0, y = 0;
    heartShape.moveTo(x + 2.5, y + 2.5);
    heartShape.bezierCurveTo(x + 2.5, y + 2.5, x + 2.0, y, x, y);
    heartShape.bezierCurveTo(x - 3.0, y, x - 3.0, y + 3.5, x - 3.0, y + 3.5);
    heartShape.bezierCurveTo(x - 3.0, y + 5.5, x - 1.0, y + 7.7, x + 2.5, y + 9.5);
    heartShape.bezierCurveTo(x + 6.0, y + 7.7, x + 8.0, y + 5.5, x + 8.0, y + 3.5);
    heartShape.bezierCurveTo(x + 8.0, y + 3.5, x + 8.0, y, x + 5.0, y);
    heartShape.bezierCurveTo(x + 3.5, y, x + 2.5, y + 2.5, x + 2.5, y + 2.5);

    const extrudeSettings = {
      depth: 2.2,
      bevelEnabled: true,
      bevelSegments: 5,
      steps: 2,
      bevelSize: 1.2,
      bevelThickness: 1.2
    };

    const geometry = new THREE.ExtrudeGeometry(heartShape, extrudeSettings);
    geometry.center();

    const material = new THREE.MeshPhongMaterial({
      color: 0xff1744,
      emissive: 0x4a0012,
      specular: 0xff80ab,
      shininess: 90,
      wireframe: false,
      transparent: true,
      opacity: 0.95
    });

    this.heartMesh = new THREE.Mesh(geometry, material);
    this.heartMesh.rotation.z = Math.PI;
    this.scene.add(this.heartMesh);
  }

  createParticleGlow() {
    const particleCount = 120;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 22;
      positions[i + 1] = (Math.random() - 0.5) * 22;
      positions[i + 2] = (Math.random() - 0.5) * 12;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.45,
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xff3366, 1.2);
    dirLight.position.set(5, 10, 15);
    this.scene.add(dirLight);

    const cyanLight = new THREE.PointLight(0x00ffff, 1.5, 30);
    cyanLight.position.set(-8, -5, 10);
    this.scene.add(cyanLight);
  }

  setBPM(bpm) {
    if (bpm && bpm > 30 && bpm < 240) {
      this.bpm = bpm;
    }
  }

  animate() {
    this.animationId = requestAnimationFrame(this.animate);
    const elapsedTime = this.clock.getElapsedTime();
    const freq = (this.bpm / 60) * 2 * Math.PI;

    // Physiological cardiac contraction curve (sharp systole + elastic recoil)
    const systolicPulse = Math.pow(Math.sin(elapsedTime * freq), 6) * 0.18;
    const scale = 1.0 + systolicPulse;

    if (this.heartMesh) {
      this.heartMesh.scale.set(scale, scale, scale);
      this.heartMesh.rotation.y = Math.sin(elapsedTime * 0.5) * 0.25;
      this.heartMesh.rotation.x = Math.sin(elapsedTime * 0.3) * 0.12;
    }

    if (this.particles) {
      this.particles.rotation.y = elapsedTime * 0.05;
      this.particles.rotation.x = elapsedTime * 0.03;
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  onWindowResize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (width && height) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    }
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer && this.renderer.domElement && this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}

window.Heart3DVisualizer = Heart3DVisualizer;
