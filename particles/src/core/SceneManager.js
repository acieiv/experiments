/**
 * SceneManager.js
 * Responsible for managing the Three.js scene, camera, and renderer
 */

import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Color,
    AmbientLight,
    DirectionalLight,
    Object3D
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../config/settings.js';

class SceneManager {
    /**
     * Create a new SceneManager
     * @param {HTMLElement} container - The DOM element to render into
     */
    constructor(container = document.getElementById('container')) {
        this.container = container;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this._observer = null; // For ResizeObserver

        try {
            // Create scene
            window.debug.log("Creating scene");
            this.scene = new Scene();
            this.scene.background = new Color(0x000814);

            // Create camera
            window.debug.log("Creating camera");
            const aspect = this.container.clientWidth / this.container.clientHeight || 1;
            this.camera = new PerspectiveCamera(
                settings.camera.fov,
                aspect, 
                settings.camera.near,
                settings.camera.far
            );
            this.camera.position.set(
                settings.camera.position.x,
                settings.camera.position.y,
                settings.camera.position.z
            );
            window.debug.log(`Camera position set to (${this.camera.position.x}, ${this.camera.position.y}, ${this.camera.position.z})`);
            
            // Create renderer
            window.debug.log("Creating renderer");
            this.renderer = new WebGLRenderer({ 
                antialias: true,
                alpha: true,
                premultipliedAlpha: false, 
                powerPreference: "high-performance"
            });
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            this.renderer.sortObjects = true;
            this.renderer.setClearColor(0x000814, 1);
            
            // Initial resize using the new helper
            this._resizeRenderer(); 
            
            if (!this.renderer.domElement) {
                throw new Error('Failed to create WebGL renderer');
            }
            this.container.innerHTML = ''; // Clear any existing content (like test messages)
            this.container.appendChild(this.renderer.domElement);
            window.debug.log("Renderer added to container");
            
            // Setup lighting
            this.setupLighting();
            
            // Resize observer setup
            this._observer = new ResizeObserver(() => this._resizeRenderer());
            this._observer.observe(this.container);
            
            window.debug.log("Scene initialization complete");
            window.debug.setState('Scene', 'initialized');
        } catch (error) {
            window.debug.log(`Scene initialization failed: ${error.message}`, 'error');
            window.debug.setState('Scene', 'error');
            throw error;
        }
    }
    
    
    /**
     * Set up scene lighting
     */
    setupLighting() {
        window.debug.log("Setting up lighting");
        
        // Add ambient light
        const ambientLight = new AmbientLight(0x222233);
        this.scene.add(ambientLight);
        
        // Add directional light for subtle highlights
        const directionalLight = new DirectionalLight(0x8888ff, 0.5);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
    }
    
    _resizeRenderer () {
      const { clientWidth: w, clientHeight: h } = this.container;
      this.renderer.setSize( w, h, false ); // false to avoid canvas style overwrite
      this.camera.aspect = w / h || 1;      // guard against zero height
      this.camera.updateProjectionMatrix();
    }
    
    /**
     * Add an object to the scene
     * @param {THREE.Object3D} object - The object to add to the scene
     */
    add(object) {
        this.scene.add(object);
    }
    
    /**
     * Remove an object from the scene
     * @param {THREE.Object3D} object - The object to remove from the scene
     */
    remove(object) {
        this.scene.remove(object);
    }
    
    /**
     * Render the scene
     */
    render() {
        this.renderer.render(this.scene, this.camera);
    }
    
    /**
     * Update camera position based on mouse coordinates
     * @param {number} mouseX - Normalized mouse X position (-1 to 1)
     * @param {number} mouseY - Normalized mouse Y position (-1 to 1)
     * @param {number} movementRange - How much the camera should move
     */
    updateCameraPosition(mouseX, mouseY, movementRange = 0.3) {
        this.camera.position.x = movementRange * mouseX;
        this.camera.position.y = movementRange * mouseY;
        this.camera.lookAt(this.scene.position); // Always look at the center
    }
}

export default SceneManager;
