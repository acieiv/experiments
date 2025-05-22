/**
 * VideoPool.js
 * Manages a collection of videos and handles transitions between them
 */

import { PlaneGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import VideoState from './VideoState.js';
import MaterialFactory from './MaterialFactory.js';

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
        this.planeGeometry = null;
        
        // Initialize the pool
        this.initialize();
    }
    
    /**
     * Initialize the video pool
     * @private
     */
    initialize() {
        console.log("Initializing VideoPool");
        
        if (this.sources.length < 2) {
            console.error("At least two video sources are required");
            return;
        }
        
        // Create shared geometry
        this.planeGeometry = new PlaneGeometry(
            this.options.planeSize,
            this.options.planeSize
        );
        
        // Create initial states for first three videos (if available)
        const activeState = new VideoState(
            this.sources[0],
            this.planeGeometry,
            this.createMaterial.bind(this),
            {
                position: {
                    z: this.options.position.z
                }
            }
        );
        
        const nextState = new VideoState(
            this.sources[1],
            this.planeGeometry,
            this.createMaterial.bind(this),
            {
                position: {
                    z: this.options.position.z - 0.01 // Prevent z-fighting
                }
            }
        );
        
        // Store and set up first two states
        this.states.set(this.sources[0], activeState);
        this.states.set(this.sources[1], nextState);
        this.activeState = activeState;
        this.nextState = nextState;
        
        // Set initial opacities and add to scene
        this.activeState.setOpacity(1);
        this.nextState.setOpacity(0);
        this.scene.add(this.activeState.mesh);
        this.scene.add(this.nextState.mesh);
        
        // Start playing active video
        this.activeState.play().catch(error => {
            console.error("Error playing initial video:", error);
            setTimeout(() => this.activeState.play(), 1000);
        });
        
        // Start preloading next video
        this.nextState.preload();
        
        // Pre-create and start preloading third video if available
        if (this.sources.length > 2) {
            console.log("Pre-creating third video state");
            const futureState = new VideoState(
                this.sources[2],
                this.planeGeometry,
                this.createMaterial.bind(this),
                {
                    position: {
                        z: this.options.position.z - 0.01
                    }
                }
            );
            this.states.set(this.sources[2], futureState);
            futureState.preload();
        }
    }
    
    /**
     * Create material for video planes
     * @private
     * @param {THREE.VideoTexture} videoTexture - The video texture
     * @param {number} initialOpacity - Initial opacity value
     * @returns {THREE.ShaderMaterial}
     */
    createMaterial(videoTexture, initialOpacity) {
        return MaterialFactory.createVideoMaterial(
            videoTexture,
            initialOpacity,
            this.options.shaders.video
        );
    }
    
    /**
     * Advance to the next video
     */
    advance() {
        console.log("Advancing to next video");
        
        // Get indices for current, next, and future videos
        const currentSource = this.activeState.source;
        const currentIndex = this.sources.indexOf(currentSource);
        const nextIndex = (currentIndex + 1) % this.sources.length;
        const futureIndex = (nextIndex + 1) % this.sources.length;
        
        // Clean up current active state
        const oldActive = this.activeState;
        this.scene.remove(oldActive.mesh);
        oldActive.cleanup();
        
        // Update active state
        this.activeState = this.nextState;
        
        // Ensure future state exists and is preloading
        if (!this.states.has(this.sources[futureIndex])) {
            console.log(`Creating future state for video ${futureIndex + 1}/${this.sources.length}`);
            const futureState = new VideoState(
                this.sources[futureIndex],
                this.planeGeometry,
                this.createMaterial.bind(this),
                {
                    position: {
                        z: this.options.position.z - 0.01
                    }
                }
            );
            this.states.set(this.sources[futureIndex], futureState);
        }
        
        // Update next state
        this.nextState = this.states.get(this.sources[futureIndex]);
        
        // Start playing active video
        this.activeState.play().catch(error => {
            console.error("Error playing active video:", error);
            // If play fails, try again after a short delay
            setTimeout(() => this.activeState.play(), 1000);
        });
        
        // Start preloading next video immediately
        this.nextState.preload();
        
        // Prepare next state visuals
        this.nextState.setOpacity(0);
        this.scene.add(this.nextState.mesh);
        
        // Start preloading the video after next
        const futureFutureIndex = (futureIndex + 1) % this.sources.length;
        if (!this.states.has(this.sources[futureFutureIndex])) {
            console.log(`Pre-creating state for video ${futureFutureIndex + 1}/${this.sources.length}`);
            const futureFutureState = new VideoState(
                this.sources[futureFutureIndex],
                this.planeGeometry,
                this.createMaterial.bind(this),
                {
                    position: {
                        z: this.options.position.z - 0.01
                    }
                }
            );
            this.states.set(this.sources[futureFutureIndex], futureFutureState);
            futureFutureState.preload();
        }
        
        console.log(`Advanced to video ${nextIndex + 1}/${this.sources.length}`);
    }
    
    /**
     * Update active states
     * @param {Object} params - Update parameters (time, mousePosition, mouseX, mouseY, lookAtTarget)
     */
    updateStates(params) {
        [this.activeState, this.nextState]
            .filter(Boolean)
            .forEach(state => state.update({
                ...params,
                parallaxAmount: this.options.parallaxAmount
            }));
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
