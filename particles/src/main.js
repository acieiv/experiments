/**
 * main.js
 * Entry point for the Crystal Ball Particle Animation
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import SceneManager from './core/SceneManager.js';
import VideoManager from './core/VideoManager.js';
import UIManager from './core/UIManager.js';
import ParticleSystem from './components/ParticleSystem.js';
import MouseTracker from './utils/MouseTracker.js';
import DebugOverlay from './utils/DebugOverlay.js';
import settings from './config/settings.js';

// Make THREE available globally for legacy code
window.THREE = THREE;

// Global variables
let sceneManager;
let videoManager;
let uiManager;
let particleSystem;
let mouseTracker;
let container;
let lastTime = 0;
let debug;

/**
 * Initialize the application
 */
function init() {
    try {
        // Initialize debug overlay and make it globally available
        debug = new DebugOverlay();
        window.debug = debug;
        debug.log("Initializing application");
        
        // Get container element
        container = document.getElementById('container');
        if (!container) {
            debug.log('Container element not found', 'error');
            throw new Error('Container element not found');
        }
        debug.log('Container element found');
        
        // Create scene manager
        debug.log("Creating scene manager");
        sceneManager = new SceneManager(container);
        debug.setState('SceneManager', 'initialized');
        
        // Create mouse tracker
        debug.log("Creating mouse tracker");
        mouseTracker = new MouseTracker(container);
        mouseTracker.setSmoothing(settings.mouse.smoothing);
        debug.setState('MouseTracker', 'initialized');
        
        // Create particle system
        debug.log("Creating particle system");
        particleSystem = new ParticleSystem(sceneManager.scene);
        if (!particleSystem.isInitialized()) {
            debug.log('Particle system failed to initialize', 'error');
            throw new Error('Particle system failed to initialize');
        }
        particleSystem.prepareForVideoOverlay();
        debug.setState('ParticleSystem', 'initialized');
        
        // Create video manager
        debug.log("Setting up videos");
        videoManager = new VideoManager(sceneManager.scene);
        debug.setState('VideoManager', 'initialized');
        
        // Create UI manager with callbacks
        debug.log("Setting up UI controls");
        uiManager = new UIManager(container, {
            onOpacityChange: (value) => videoManager.setVideoOpacity(value),
            onZoomChange: (value) => videoManager.setVideoScale(value),
            onOffsetXChange: (value) => videoManager.setVideoOffsetX(value),
            onOffsetYChange: (value) => videoManager.setVideoOffsetY(value)
        });
        
        // Log successful initialization
        debug.log("All components initialized successfully");
        debug.setState('Application', 'initialized');
        
        // Start animation loop
        animate();
    } catch (error) {
        debug.log(`Error during initialization: ${error.message}`, 'error');
        debug.setState('Application', 'error');
        throw error; // Re-throw to be caught by the DOM event listener
    }
}

/**
 * Animation loop
 * @param {number} time - Current time in milliseconds
 */
function animate(time) {
    requestAnimationFrame(animate);
    
    // Calculate delta time
    const deltaTime = lastTime === 0 ? 0 : (time - lastTime) / 1000;
    lastTime = time;
    
    // Update mouse tracker
    mouseTracker.update();
    const { x: mouseX, y: mouseY } = mouseTracker.getPosition();
    
    // Update camera position based on mouse
    sceneManager.updateCameraPosition(mouseX, mouseY, settings.camera.movementRange);
    
    // Update particle system
    particleSystem.update(time);
    
    // Apply automatic rotation
    const rotationSpeed = settings.particles.rotationSpeed;
    particleSystem.rotate(rotationSpeed.x, rotationSpeed.y, rotationSpeed.z);
    
    // Apply mouse-based rotation
    particleSystem.applyMouseRotation(mouseX, mouseY, settings.mouse.influence);
    
    // Update video manager
    videoManager.update(time, deltaTime);
    videoManager.updateParallax(mouseX, mouseY);
    videoManager.updateLookAt(sceneManager.camera);
    
    // Render scene
    sceneManager.render();
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    try {
        init();
    } catch (error) {
        console.error('Failed to initialize application:', error);
        // Display error message on page
        const container = document.getElementById('container');
        if (container) {
            container.innerHTML = `
                <div style="color: red; padding: 20px;">
                    Error initializing application: ${error.message}
                </div>
            `;
        }
    }
});

// Export for debugging
window.app = {
    sceneManager,
    videoManager,
    uiManager,
    particleSystem,
    mouseTracker,
    settings
};
