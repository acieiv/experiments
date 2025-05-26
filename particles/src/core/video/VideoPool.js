/**
 * VideoPool.js
 * Manages a collection of videos and handles transitions between them
 */

import { PlaneGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../../config/settings.js';
// import DebugOverlay from '../../utils/DebugOverlay.js'; // DebugOverlay is not directly used here anymore
// import VideoState from './VideoState.js'; // VideoState is used by Initializer and Advancer
import MaterialFactory from '../MaterialFactory.js';
import VideoPoolInitializer from './VideoPoolInitializer.js';
import VideoPoolAdvancer from './VideoPoolAdvancer.js';

class VideoPool {
    /**
     * Create a new VideoPool
     * @param {string[]} sources - Array of video source URLs
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {Object} options - Configuration options
     */
    constructor(sources, scene, options) {
        this.sources = sources;
        this.scene = scene;
        this.options = options;
        
        // Video state management
        this.states = new Map(); // source -> VideoState
        this.activeState = null;
        this.nextState = null;
        this.planeGeometry = null; // Will be created by Initializer
        this.initializationPromise = null;
        
        this.initializer = new VideoPoolInitializer(this);
        this.advancer = new VideoPoolAdvancer(this);

        // Store the promise so it can be awaited by VideoManager if needed
        this.initializationPromise = this.initializer.initializePoolAsync();
        // Catching errors from initializePoolAsync should be handled by the caller (e.g., VideoManager)
    }

    /**
     * Create material for video planes
     * @private
     * @param {THREE.VideoTexture} videoTexture - The video texture
     * @param {number} initialOpacity - Initial opacity value
     * @returns {Promise<THREE.ShaderMaterial>}
     */
    async createMaterial(videoTexture, initialOpacity) {
        return await MaterialFactory.createVideoMaterial(
            videoTexture,
            initialOpacity,
            this.options.shaders.video
        );
    }

    /**
     * Advance to the next video asynchronously
     */
    async advance() {
        // Delegate to the advancer instance
        return await this.advancer.advance();
    }
    
    /**
     * Update active states
     * @param {Object} params - Update parameters (time, mousePosition, mouseX, mouseY, lookAtTarget)
     */
    updateStates(params) {
        // Update all VideoState instances currently managed by the pool.
        // This ensures that even preloading videos (not just active and next)
        // have their PlaybackManager updated for accurate readiness checks.
        this.states.forEach(state => {
            if (state) { // Ensure state exists
                state.update({
                    ...params,
                    parallaxAmount: this.options.parallaxAmount
                });
            }
        });
    }
    
    /**
     * Clean up all resources
     */
    cleanup() {
        this.states.forEach(state => {
            this.scene.remove(state.mesh);
            state.cleanup();
        });
        
        this.states.clear();
        this.activeState = null;
        this.nextState = null;
        
        if (this.planeGeometry) {
            this.planeGeometry.dispose();
            this.planeGeometry = null;
        }
    }
}

export default VideoPool;
