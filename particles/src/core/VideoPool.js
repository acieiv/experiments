/**
 * VideoPool.js
 * Manages a collection of videos and handles transitions between them
 */

import { PlaneGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../config/settings.js'; // Added
import DebugOverlay from '../utils/DebugOverlay.js'; // Added
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
        this.initializationPromise = null; // To store the promise from initializeAsync
        
        // Initialize the pool
        // Store the promise so it can be awaited by VideoManager if needed
        this.initializationPromise = this.initializeAsync();
        this.initializationPromise.catch(error => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPool: Error during async initialization: ${error.message}`, 'error');
            }
            // Optionally, update a global error state or UI
        });
    }
    
    /**
     * Initialize the video pool asynchronously
     * @private
     */
    async initializeAsync() {
        if (settings.debug.enabled && window.debug) {
            window.debug.log("VideoPool: Initializing asynchronously");
        }
        
        // --- guardrail: no videos at all -----------------
        if ( this.sources.length === 0 ) {
            throw new Error( "VideoPool requires at least one video source." );
        }

        // Create shared geometry
        this.planeGeometry = new PlaneGeometry(
            this.options.planeSize,
            this.options.planeSize
        );
        
        // --- single‑video shortcut -----------------------
        if ( this.sources.length === 1 ) {

            const singleSource = this.sources[ 0 ];

            const state = new VideoState(
                singleSource,
            this.planeGeometry,
            this.createMaterial.bind(this),
            { position: { z: this.options.position.z } }
        );
        await state.initializeAsync(); // Await async initialization

        this.states.set(singleSource, state);
        this.activeState = state;
        this.nextState = state;

        if (state.video) {
            state.video.loop = true;
        } else {
            if (settings.debug.enabled && window.debug) {
                window.debug.log("VideoPool: Video element not found for single source, cannot set loop.", 'warn');
            }
        }

        if (state.mesh) {
            this.scene.add(state.mesh);
        } else {
            if (settings.debug.enabled && window.debug) {
                window.debug.log("VideoPool: Mesh not available for single source after init.", 'warn');
            }
        }

        state.play().catch(err => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPool: Error auto-playing single video: ${err.message}`, 'error');
            }
        });

        return;
    }

    // Create initial states
    const initialStatesToCreate = [];
    if (this.sources.length > 0) {
        initialStatesToCreate.push({ source: this.sources[0], id: 'active', zOffset: 0 });
    }
    if (this.sources.length > 1) {
        initialStatesToCreate.push({ source: this.sources[1], id: 'next', zOffset: -0.01 });
    }
    if (this.sources.length > 2) {
        initialStatesToCreate.push({ source: this.sources[2], id: 'future', zOffset: -0.01 });
    }

    const createdStates = await Promise.all(initialStatesToCreate.map(async (s) => {
        const videoState = new VideoState(
            s.source,
            this.planeGeometry,
            this.createMaterial.bind(this),
            { position: { z: this.options.position.z + s.zOffset } }
        );
        await videoState.initializeAsync();
        this.states.set(s.source, videoState);
        return { id: s.id, state: videoState };
    }));

    createdStates.forEach(({ id, state }) => {
        if (id === 'active') this.activeState = state;
        if (id === 'next') this.nextState = state;
        // Future state is just cached in this.states
    });
    
    if (this.activeState) {
        this.activeState.isCurrentUserVisible = true; // Mark initial active video
        this.activeState.hasEnded = false; // Reset ended flag
        this.activeState.setOpacity(1);
        if (this.activeState.mesh) this.scene.add(this.activeState.mesh);
        this.activeState.play().catch(error => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPool: Error playing initial active video: ${error.message}`, 'error');
            }
            // setTimeout(() => this.activeState.play(), 1000); // Retry logic removed
        });
    }

    if (this.nextState) {
        this.nextState.setOpacity(0);
        if (this.nextState.mesh) this.scene.add(this.nextState.mesh);
        this.nextState.preload().catch(err => {
            if(settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Error preloading next video: ${err.message}`, 'error');
        });
    }
    
    // Ensure the third video (if it exists and was created as 'future') is preloaded
    const futureSource = this.sources[2];
    if (futureSource && this.states.has(futureSource)) {
        this.states.get(futureSource).preload();
    }
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
        if (this.sources.length <= 1) return;

        if (settings.debug.enabled && window.debug) {
            window.debug.log("VideoPool: Advancing to next video (async)");
        }

        const currentSource = this.activeState.source;
        const currentIndex = this.sources.indexOf(currentSource);
        const nextIndex = (currentIndex + 1) % this.sources.length;
        const futureIndex = (nextIndex + 1) % this.sources.length;

        const oldActive = this.activeState;
        if (oldActive) {
            oldActive.isCurrentUserVisible = false; // Mark as no longer primary
            if (oldActive.mesh) this.scene.remove(oldActive.mesh);
            oldActive.cleanup();
            this.states.delete(oldActive.source);
        }

        this.activeState = this.nextState;
        if (this.activeState) {
            this.activeState.isCurrentUserVisible = true; // Mark new active video as primary
        }

        // Ensure the "future" video (which will become the "next" one) is created and initialized
        let futureVideoState = this.states.get(this.sources[futureIndex]);
        if (!futureVideoState) {
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPool: Creating and initializing future state for video ${futureIndex + 1}/${this.sources.length}`);
            }
            futureVideoState = new VideoState(
                this.sources[futureIndex],
                this.planeGeometry,
                this.createMaterial.bind(this),
                { position: { z: this.options.position.z - 0.01 } }
            );
            await futureVideoState.initializeAsync();
            this.states.set(this.sources[futureIndex], futureVideoState);
        }
        this.nextState = futureVideoState;

        if (this.activeState) {
            // Reset loop tracking and ended flag for the new active video
            this.activeState.loopCount = 0;
            this.activeState.hasPlayedOnce = false;
            this.activeState.hasEnded = false; // Reset ended flag
            
            this.activeState.play().catch(error => {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPool: Error playing new active video: ${error.message}`, 'error');
                }
                // setTimeout(() => this.activeState.play(), 1000); // Retry logic removed
            });
        }

        if (this.nextState) {
            this.nextState.preload().catch(err => {
                 if(settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Error preloading next state in advance: ${err.message}`, 'error');
            });
            this.nextState.setOpacity(0);
            if (this.nextState.mesh) {
                this.scene.add(this.nextState.mesh);
            } else {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log("VideoPool.advance: Next state mesh not available after init.", 'warn');
                }
            }
        }

        // Pre-create and initialize the video *after* the next one (the new "future-future")
        const futureFutureIndex = (futureIndex + 1) % this.sources.length;
        if (!this.states.has(this.sources[futureFutureIndex])) {
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPool: Pre-creating and initializing state for video ${futureFutureIndex + 1}/${this.sources.length}`);
            }
            const newFutureFutureState = new VideoState(
                this.sources[futureFutureIndex],
                this.planeGeometry,
                this.createMaterial.bind(this),
                { position: { z: this.options.position.z - 0.01 } }
            );
            // Don't wait for this one, let it initialize in the background
            newFutureFutureState.initializeAsync().then(() => {
                 this.states.set(this.sources[futureFutureIndex], newFutureFutureState);
                 newFutureFutureState.preload().catch(e => {
                    if(settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Error preloading future-future video: ${e.message}`, 'error');
                 });
                 if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoPool: Background initialization complete for video ${futureFutureIndex + 1}/${this.sources.length}`);
                 }
            }).catch(err => {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPool: Error background initializing video ${futureFutureIndex + 1}: ${err.message}`, 'error');
                }
            });
        }
        
        if (settings.debug.enabled && window.debug) {
            window.debug.log(`VideoPool: Advanced to video ${nextIndex + 1}/${this.sources.length}`);
        }
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
