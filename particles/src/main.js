console.log('[main.js] Module execution started (restored, imports initially commented).');

// Original imports - will be uncommented step-by-step for testing
import DebugOverlay from './utils/DebugOverlay.js';
import settings from './config/settings.js';
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'; // Step 2: Uncomment THREE
import SceneManager from './core/SceneManager.js'; // Keep one SceneManager import
import MouseTracker from './utils/MouseTracker.js';
import ParticleSystem from './components/ParticleSystem.js';
import VideoManager from './core/VideoManager.js';
import UIManager from './core/UIManager.js'; // Step 6: Uncomment UIManager
/*
*/

// Make THREE available globally for legacy code
window.THREE = THREE; // Step 2: Uncomment

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
        debug = new DebugOverlay(); // Step 1: Enable DebugOverlay
        window.debug = debug;       // Step 1: Enable DebugOverlay
        debug.log("Initializing application"); // Step 1: Use debug.log
        
        // Get container element
        container = document.getElementById('container');
        if (!container) {
            debug.log('Container element not found', 'error'); // Step 1: Use debug.log
            throw new Error('Container element not found');
        }
        debug.log('Container element found');
        
        // Create scene manager
        debug.log("Creating SceneManager"); // Step 2: Update log message
        sceneManager = new SceneManager(container); // Step 2: Uncomment
        debug.setState('SceneManager', 'initialized');
        
        // Create mouse tracker
        debug.log("Creating MouseTracker"); // Step 3: Update log message
        mouseTracker = new MouseTracker(container); // Step 3: Uncomment
        mouseTracker.setSmoothing(settings.mouse.smoothing); 
        debug.setState('MouseTracker', 'initialized'); 
        
        // Create particle system
        debug.log("Creating ParticleSystem"); // Step 4: Update log message
        particleSystem = new ParticleSystem(sceneManager.scene); // Step 4: Uncomment (sceneManager is available)
        if (!particleSystem.isInitialized()) { // Step 4: Uncomment and use original check
            debug.log('Particle system failed to initialize', 'error'); 
            throw new Error('Particle system failed to initialize');
        }
        particleSystem.prepareForVideoOverlay(); // Step 4: Uncomment
        debug.setState('ParticleSystem', 'initialized');
        
        // Create video manager
        debug.log("Creating VideoManager"); // Step 5: Update log message
        videoManager = new VideoManager(sceneManager.scene); // Step 5: Uncomment (sceneManager is available)
        debug.setState('VideoManager', 'initialized');
        
        // Create UI manager with callbacks
        debug.log("Creating UIManager"); // Step 6: Update log message
        uiManager = new UIManager(container, { // Step 6: Uncomment
            onOpacityChange: (value) => videoManager.setVideoOpacity(value),
            onZoomChange: (value) => videoManager.setVideoScale(value),
            onOffsetXChange: (value) => videoManager.setVideoOffsetX(value),
            onOffsetYChange: (value) => videoManager.setVideoOffsetY(value)
        });
        debug.setState('UIManager', 'initialized');
        
        // Log successful initialization
        debug.log("All components initialized successfully"); 
        debug.setState('Application', 'initialized');
        
        // Start animation loop
        animate(); // Step 7: Uncomment animate call

    } catch (error) {
        if (debug && typeof debug.log === 'function') { // Check if debug was initialized before error
            debug.log(`Error during initialization: ${error.message}`, 'error');
            debug.setState('Application', 'error');
        } else {
            console.error(`Error during initialization (debug not available): ${error.message}`);
        }
        throw error; // Re-throw to be caught by the DOM event listener
    }
}

/**
 * Animation loop
 * @param {number} time - Current time in milliseconds
 */
function animate(time) {
    requestAnimationFrame(animate); // Step 7: Uncomment
    
    // Calculate delta time
    const deltaTime = lastTime === 0 ? 0 : (time - lastTime) / 1000; // Step 7: Uncomment
    lastTime = time; // Step 7: Uncomment
    
    // Update mouse tracker
    if (mouseTracker) mouseTracker.update(); else return; // Step 7: Uncomment and keep guard
    const { x: mouseX, y: mouseY } = mouseTracker.getPosition(); // Step 7: Uncomment
    
    // Update camera position based on mouse
    if (sceneManager) sceneManager.updateCameraPosition(mouseX, mouseY, settings.camera.movementRange); // Step 7: Uncomment and keep guard
    
    // Update particle system
    if (particleSystem) particleSystem.update(time); // Step 7: Uncomment and keep guard
    
    // Apply automatic rotation
    const rotationSpeed = settings.particles.rotationSpeed; // Step 7: Uncomment
    if (particleSystem && rotationSpeed) particleSystem.rotate(rotationSpeed.x, rotationSpeed.y, rotationSpeed.z); // Step 7: Uncomment and keep guard
    
    // Apply mouse-based rotation
    if (particleSystem && settings.mouse) particleSystem.applyMouseRotation(mouseX, mouseY, settings.mouse.influence); // Step 7: Uncomment and keep guard
    
    // Update video manager
    if (videoManager) { // Step 7: Uncomment and keep guard
        videoManager.update(time, deltaTime);
        videoManager.updateParallax(mouseX, mouseY);
        videoManager.updateLookAt(sceneManager.camera);
    }
    
    // Render scene
    if (sceneManager) sceneManager.render(); // Step 7: Uncomment and keep guard
}

// Call init directly now that the module is loaded and parsed.
// The dynamic import in index.html ensures this runs after index.html's script starts.
console.log('[main.js] About to call init() directly.');
init();

// Export for debugging
window.app = { // Step 7: Uncomment
    sceneManager,
    videoManager,
    uiManager,
    particleSystem,
    mouseTracker,
    settings
};
console.log('[main.js] Module execution finished (restored, imports initially commented).');
