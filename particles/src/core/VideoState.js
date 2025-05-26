/**
 * VideoState.js
 * Manages the state and lifecycle of a single video in the crystal ball animation.
 * Acts as a facade for specialized manager modules.
 */

import {
    Mesh
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import MaterialFactory from './MaterialFactory.js';
import VideoEventHandler from './VideoEventHandler.js';
import VideoPlaybackManager from './VideoPlaybackManager.js';
import VideoTextureManager from './VideoTextureManager.js';
import VideoErrorManager from './VideoErrorManager.js';

class VideoState {
    /**
     * Create a new VideoState
     * @param {string} source - Video source URL
     * @param {BufferGeometry} planeGeometry - Shared geometry for video plane
     * @param {Function} createMaterial - Function to create shader material
     * @param {Object} options - Configuration options
     */
    constructor(source, planeGeometry, createMaterial, options) {
        // Core properties
        this.source = source;
        this.video = null; // HTMLVideoElement, created in initializeVideo
        this.texture = null; // Current THREE.Texture for the material
        this.mesh = null; // THREE.Mesh
        this.loaded = false; // True when video 'loadeddata' fires
        this.playing = false; // True when video is actively playing
        this.preloaded = false; // True if video was preloaded
        this.opacity = 0;
        this.options = options || {};
        
        // Geometry and material creation references
        this.planeGeometry = planeGeometry;
        this.createMaterial = createMaterial; // Function to create the shader material
        this.meshCreated = false;

        // Initialize video element first, as managers might need it
        this.initializeVideoInternal(); // Renamed to avoid conflict if a manager needs `initializeVideo`

        // Instantiate managers - they might need `this.video`
        this.textureManager = new VideoTextureManager(this);
        this.playbackManager = new VideoPlaybackManager(this);
        this.errorManager = new VideoErrorManager(this);
        this.eventHandler = new VideoEventHandler(this); // EventHandler needs video, so after initializeVideoInternal

        // Initialize managers with options if they have such a method
        this.errorManager.initializeOptions(this.options);
        // Other managers can have similar init methods if needed

        // Set initial texture from TextureManager (placeholder)
        this.texture = this.textureManager.getInitialTexture();
        
        // Create mesh with the initial placeholder texture
        this.createMesh();

        // Setup event listeners via EventHandler
        // This needs to happen after the video element is created and managers are instantiated
        if (this.video) {
            this.eventHandler.setupEventListeners();
        } else {
            console.error(`VideoState ${this.source}: Video element not created before setting up event listeners.`);
        }
        
        console.log(`VideoState initialized for ${this.source}`);
    }

    /**
     * Internal method to create and configure the HTMLVideoElement.
     * @private
     */
    initializeVideoInternal() {
        console.log(`VideoState: Initializing internal video element for ${this.source}`);
        try {
            this.video = document.createElement('video');
            this.video.loop = true;
            this.video.muted = true;
            this.video.crossOrigin = "anonymous";
            this.video.playsInline = true;
            this.video.preload = "auto";
            this.video.width = this.options.videoWidth || 720;
            this.video.height = this.options.videoHeight || 720;

            // Special 'loadeddata' listener for TextureManager to prepare HQ texture
            // This is separate from VideoEventHandler as it's a core part of texture lifecycle.
            this.video.addEventListener('loadeddata', () => {
                if (this.video.videoWidth && this.video.videoHeight) {
                    this.textureManager.prepareHighQualityTexture();
                }
                // The main 'loadeddata' event is handled by VideoEventHandler for other state changes.
            });

            this.video.src = this.source;
            this.video.load();
        } catch (error) {
            console.error(`VideoState: Error initializing video element for ${this.source}:`, error);
            // If errorManager is already available, use it. Otherwise, log directly.
            if (this.errorManager) {
                this.errorManager.handleVideoError(error, 'initialization');
            }
        }
    }
    
    /**
     * Create mesh with current texture
     * @private
     */
    createMesh() {
        if (this.meshCreated) return;
        
        try {
            this.mesh = new Mesh(
                this.planeGeometry,
                this.createMaterial(this.texture, this.opacity) // Use initial texture
            );
            this.mesh.position.z = this.options.position?.z || 0;
            this.meshCreated = true;
            console.log(`VideoState: Mesh created for ${this.source}`);
        } catch (error) {
            console.error(`VideoState: Error creating mesh for ${this.source}:`, error);
            this.mesh = null;
            this.meshCreated = false;
        }
    }

    /**
     * Preload the video without starting playback
     */
    preload() {
        if (!this.video) return;
        this.video.preload = 'auto';
        this.video.load();
        this.preloaded = true;
        console.log(`VideoState: Preloading video ${this.source}`);
    }
    
    /**
     * Update video state, called every frame
     * @param {Object} params - Update parameters (time, mousePosition, etc.)
     */
    update(params) {
        const { time, mousePosition, mouseX, mouseY, lookAtTarget, parallaxAmount } = params;
        if (!this.mesh) return;

        // Delegate updates to managers
        this.playbackManager.update(); // Manages buffer checks, playback rate adjustments
        this.textureManager.tryActivateHighQualityTexture(); // Checks if HQ texture can be applied

        // Update material uniforms
        if (this.mesh.material) {
            MaterialFactory.updateUniforms(this.mesh.material, {
                time,
                mousePosition,
                // Use playbackManager's isBuffering flag
                opacity: this.playbackManager.isBuffering ? Math.max(0.5, this.opacity) : this.opacity
            });
        }

        // Update parallax
        if (mouseX !== undefined && mouseY !== undefined && parallaxAmount !== undefined) {
            const currentParallaxAmount = this.options.parallaxAmount !== undefined ? this.options.parallaxAmount : parallaxAmount;
            const parallaxScale = this.playbackManager.isBuffering ? currentParallaxAmount * 0.5 : currentParallaxAmount;
            this.mesh.position.x = -mouseX * parallaxScale;
            this.mesh.position.y = -mouseY * parallaxScale;
        }

        // Update look at target
        if (lookAtTarget) {
            this.mesh.lookAt(lookAtTarget);
        }
    }
    
    setOpacity(value) {
        this.opacity = value;
        if (this.mesh?.material) {
            MaterialFactory.updateUniforms(this.mesh.material, {
                opacity: this.playbackManager.isBuffering ? Math.max(0.5, this.opacity) : this.opacity
            });
        }
    }
    
    play() {
        if (!this.video) {
            console.warn(`VideoState ${this.source}: Play called but no video element.`);
            return Promise.reject(new Error('No video element'));
        }

        // If readyState is already high enough, play immediately.
        // readyState 3 (HAVE_FUTURE_DATA) is a good threshold.
        if (this.video.readyState >= 3) {
            console.log(`VideoState ${this.source}: Calling video.play() directly (readyState: ${this.video.readyState}, currentTime: ${this.video.currentTime.toFixed(3)})`);
            return this.video.play().catch(err => {
                if (this.errorManager) {
                    this.errorManager.handleVideoError(err, 'play_promise_reject_direct');
                } else {
                    console.error(`VideoState ${this.source}: Error during direct video.play() (no errorManager):`, err);
                }
                return Promise.reject(err);
            });
        }

        // If readyState is low, defer play and wait for 'canplay'.
        console.warn(`VideoState ${this.source}: Play called with readyState ${this.video.readyState}. Deferring video.play(), will wait for 'canplay' event. Current time: ${this.video.currentTime.toFixed(3)}`);

        // Ensure playbackManager is in 'buffering' if not already initializing.
        if (this.playbackManager && 
            this.playbackManager.playbackState !== 'buffering' && 
            this.playbackManager.playbackState !== 'initializing') {
            
            this.playbackManager.playbackState = 'buffering';
            console.log(`VideoState ${this.source}: Set playbackManager to 'buffering' due to low readyState on play() call, awaiting 'canplay'.`);
        }

        // Return a promise that resolves when 'canplay' fires and play is attempted,
        // or rejects if an error occurs or timeout.
        return new Promise((resolve, reject) => {
            const canPlayHandler = () => {
                this.video.removeEventListener('canplay', canPlayHandler);
                this.video.removeEventListener('error', errorHandler); // Clean up error listener too
                console.log(`VideoState ${this.source}: 'canplay' event received. Attempting video.play() (readyState: ${this.video.readyState}, currentTime: ${this.video.currentTime.toFixed(3)})`);
                this.video.play()
                    .then(() => {
                        // The play() promise resolves when playback actually begins.
                        // Our VideoEventHandler will catch the 'play'/'playing' events.
                        resolve(); 
                    })
                    .catch(err => {
                        if (this.errorManager) {
                            this.errorManager.handleVideoError(err, 'play_promise_reject_canplay');
                        } else {
                            console.error(`VideoState ${this.source}: Error during video.play() after 'canplay' (no errorManager):`, err);
                        }
                        reject(err);
                    });
            };

            const errorHandler = (err) => { // Generic error while waiting for canplay
                this.video.removeEventListener('canplay', canPlayHandler);
                this.video.removeEventListener('error', errorHandler);
                console.error(`VideoState ${this.source}: 'error' event received while waiting for 'canplay'.`, err);
                if (this.errorManager) {
                    this.errorManager.handleVideoError(err, 'error_awaiting_canplay');
                }
                reject(err.target?.error || new Error('Video error while awaiting canplay'));
            };
            
            this.video.addEventListener('canplay', canPlayHandler, { once: true });
            this.video.addEventListener('error', errorHandler, { once: true });

            // Optional: Add a timeout in case 'canplay' never fires for some reason
            // setTimeout(() => {
            //     this.video.removeEventListener('canplay', canPlayHandler);
            //     this.video.removeEventListener('error', errorHandler);
            //     reject(new Error(`Timeout waiting for 'canplay' on ${this.source}`));
            // }, 10000); // 10-second timeout
        });
    }
    
    pause() {
        this.video?.pause();
        // The 'pause' event will be caught by VideoEventHandler.
    }

    // Delegated methods for checking state, primarily used by VideoTransitionController
    isReadyForTransition() {
        return this.playbackManager.isReadyForTransition();
    }

    isSufficientlyPreloaded() {
        return this.playbackManager.isSufficientlyPreloaded();
    }
    
    cleanup() {
        console.log(`VideoState: Cleaning up ${this.source}`);
        this.pause();

        this.eventHandler?.cleanupEventListeners();
        this.textureManager?.cleanup();
        // PlaybackManager and ErrorManager typically don't have heavy resources to clean,
        // but if they did, we'd call their cleanup methods here.
        // this.playbackManager?.cleanup();
        // this.errorManager?.cleanup();

        if (this.mesh?.material?.uniforms?.videoTexture && this.textureManager?.getInitialTexture()) {
             // Reset to placeholder before disposing video texture
            this.mesh.material.uniforms.videoTexture.value = this.textureManager.getInitialTexture();
            this.mesh.material.needsUpdate = true;
        }
        
        this.video?.remove(); // Remove from DOM
        this.mesh?.material?.dispose();
        // Note: planeGeometry is shared, so not disposed here.
        
        this.video = null;
        this.texture = null;
        this.mesh = null;
        this.loaded = false;
        this.playing = false;
        this.meshCreated = false;
        
        console.log(`VideoState: Cleanup complete for ${this.source}`);
    }
}

export default VideoState;
