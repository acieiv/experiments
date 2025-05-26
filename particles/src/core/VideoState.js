/**
 * VideoState.js
 * Manages the state and lifecycle of a single video in the crystal ball animation.
 * Acts as a facade for specialized manager modules.
 */

import {
    Mesh
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../config/settings.js'; // Added
import DebugOverlay from '../utils/DebugOverlay.js'; // Added
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
        this.loopCount = 0; // Added for loop tracking
        this.hasPlayedOnce = false; // Added to help distinguish initial play from loops
        this.onLoadedDataForTextureHandler = null; // For explicit listener management
        this.isCurrentUserVisible = false; // Flag to identify the primary visible video
        this.hasEnded = false; // Flag to indicate if the video has naturally ended
        
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
        
        // Mesh creation is now deferred to initializeAsync()

        // Setup event listeners via EventHandler
        // This needs to happen after the video element is created and managers are instantiated
        if (this.video) {
            this.eventHandler.setupEventListeners();
        } else {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoState ${this.source}: Video element not created before setting up event listeners.`, 'error');
            }
        }
        
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoState initialized for ${this.source}`);
        }
    }

    /**
     * Internal method to create and configure the HTMLVideoElement.
     * @private
     */
    initializeVideoInternal() {
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoState: Initializing internal video element for ${this.source}`);
        }
        try {
            this.video = document.createElement('video');
            this.video.loop = false; // Play once, not continuously
            this.video.muted = true;
            this.video.crossOrigin = "anonymous";
            this.video.playsInline = true;
            this.video.preload = "auto";
            this.video.width = this.options.videoWidth || 720;
            this.video.height = this.options.videoHeight || 720;

            // Special 'loadeddata' listener for TextureManager to prepare HQ texture
            // This is separate from VideoEventHandler as it's a core part of texture lifecycle.
            this.onLoadedDataForTextureHandler = () => {
                if (!this.video) return; // Guard
                if (this.textureManager && this.video.videoWidth && this.video.videoHeight) {
                    this.textureManager.prepareHighQualityTexture();
                }
                // The main 'loadeddata' event is handled by VideoEventHandler for other state changes.
            };
            this.video.addEventListener('loadeddata', this.onLoadedDataForTextureHandler);

            this.video.src = this.source;
            this.video.load();
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoState: Error initializing video element for ${this.source}: ${error.message}`, 'error');
            }
            // If errorManager is already available, use it. Otherwise, log directly.
            if (this.errorManager) {
                this.errorManager.handleVideoError(error, 'initialization');
            }
        }
    }
    
    /**
     * Create mesh with current texture, asynchronously.
     * @private
     */
    async createMesh() {
        if (this.meshCreated) return;
        
        try {
            const material = await this.createMaterial(this.texture, this.opacity); // Use initial texture
            this.mesh = new Mesh(
                this.planeGeometry,
                material
            );
            this.mesh.position.z = this.options.position?.z || 0;
            this.meshCreated = true;
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoState: Mesh created for ${this.source}`);
            }
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoState: Error creating mesh for ${this.source}: ${error.message}`, 'error');
            }
            this.mesh = null; // Ensure mesh is null on error
            this.meshCreated = false;
            throw error; // Re-throw to be caught by initializeAsync
        }
    }

    /**
     * Asynchronously initializes the VideoState, including mesh creation.
     * This should be called after the constructor.
     */
    async initializeAsync() {
        if (this.meshCreated) return; // Already initialized
        try {
            await this.createMesh();
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoState: Async initialization complete for ${this.source}`);
            }
        } catch (error) {
            // Error is already logged by createMesh or caught by higher level
            // No need to log again here unless adding more context.
        }
    }
    
    /**
     * Preload the video and ensure it's sufficiently buffered.
     * Returns a promise that resolves when preloading is considered complete.
     */
    async preload() {
        if (!this.video) return Promise.reject(new Error("Video element not available for preload."));
        if (this.preloaded && this.video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            return Promise.resolve(); // Already preloaded
        }

        this.video.preload = 'auto';
        this.preloaded = false; // Reset preloaded flag, will be set true upon successful preload

        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoState: Preloading video ${this.source}`);
        }

        return new Promise((resolve, reject) => {
            const onCanPlayThrough = () => {
                cleanupListeners();
                this.preloaded = true;
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoState: Sufficiently preloaded (canplaythrough) ${this.source}`);
                }
                resolve();
            };

            const onProgress = () => {
                // HAVE_FUTURE_DATA is good, HAVE_ENOUGH_DATA (canplaythrough) is better.
                // If we get HAVE_FUTURE_DATA, we might resolve earlier for faster transitions,
                // but risk stalling. For robust preloading, wait for canplaythrough.
                if (this.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                     // This might fire multiple times, but onCanPlayThrough is {once: true}
                }
            };
            
            const onError = (err) => {
                cleanupListeners();
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoState: Error during preload for ${this.source}: ${err.message || err}`, 'error');
                }
                reject(err.target?.error || new Error('Video preload error'));
            };

            const cleanupListeners = () => {
                this.video.removeEventListener('canplaythrough', onCanPlayThrough);
                this.video.removeEventListener('progress', onProgress);
                this.video.removeEventListener('error', onError);
            };

            this.video.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
            this.video.addEventListener('progress', onProgress); // Keep listening to progress
            this.video.addEventListener('error', onError, { once: true });

            // Initial check
            if (this.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                onCanPlayThrough(); // Call directly if already met criteria
            } else {
                this.video.load(); // Ensure load is explicitly called
            }
        });
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
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoState ${this.source}: Play called but no video element.`, 'warn');
            }
            return Promise.reject(new Error('No video element'));
        }

        if (this.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) { 
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoState ${this.source}: Calling video.play() directly (readyState: ${this.video.readyState}, currentTime: ${this.video.currentTime.toFixed(3)})`);
            }
            return this.video.play().catch(err => {
                if (this.errorManager) {
                    this.errorManager.handleVideoError(err, 'play_promise_reject_direct');
                } else if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoState ${this.source}: Error during direct video.play() (no errorManager): ${err.message}`, 'error');
                }
                return Promise.reject(err);
            });
        }

        if (settings.debug.enabled && window.debug) { 
             window.debug.log(`VideoState ${this.source}: Play called with low readyState ${this.video.readyState}. Deferring video.play(), will wait for 'canplaythrough'. Current time: ${this.video.currentTime.toFixed(3)}`, 'warn');
        }

        if (this.playbackManager && 
            this.playbackManager.playbackState !== 'buffering' && 
            this.playbackManager.playbackState !== 'initializing') {
            this.playbackManager.playbackState = 'buffering';
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoState ${this.source}: Set playbackManager to 'buffering' due to low readyState on play() call, awaiting 'canplaythrough'.`);
            }
        }

        return new Promise((resolve, reject) => {
            const canPlayThroughHandler = () => {
                if (!this.video) return; // Guard
                cleanupPlayListeners();
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoState ${this.source}: 'canplaythrough' event received. Attempting video.play() (readyState: ${this.video.readyState}, currentTime: ${this.video.currentTime.toFixed(3)})`);
                }
                if (!this.video) return; // Guard before play
                this.video.play()
                    .then(resolve)
                    .catch(err => {
                        if (this.errorManager) {
                            this.errorManager.handleVideoError(err, 'play_promise_reject_canplaythrough');
                        } else if (settings.debug.enabled && window.debug) {
                             window.debug.log(`VideoState ${this.source}: Error during video.play() after 'canplaythrough' (no errorManager): ${err.message}`, 'error');
                        }
                        reject(err);
                    });
            };

            const errorHandler = (err) => {
                if (!this.video) return; // Guard
                cleanupPlayListeners();
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoState ${this.source}: 'error' event received while waiting for 'canplaythrough'.`, 'error');
                }
                if (this.errorManager) {
                    this.errorManager.handleVideoError(err, 'error_awaiting_canplaythrough');
                }
                reject(err.target?.error || new Error('Video error while awaiting canplaythrough'));
            };
            
            const cleanupPlayListeners = () => {
                if (!this.video) return; // Guard
                this.video.removeEventListener('canplaythrough', canPlayThroughHandler);
                this.video.removeEventListener('error', errorHandler);
            };
            
            this.video.addEventListener('canplaythrough', canPlayThroughHandler, { once: true });
            this.video.addEventListener('error', errorHandler, { once: true });
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
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoState: Cleaning up ${this.source}`);
        }
        this.pause();

        this.eventHandler?.cleanupEventListeners();
        
        // Remove specific listener from initializeVideoInternal
        if (this.video && this.onLoadedDataForTextureHandler) {
            this.video.removeEventListener('loadeddata', this.onLoadedDataForTextureHandler);
            this.onLoadedDataForTextureHandler = null; 
        }

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
        
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoState: Cleanup complete for ${this.source}`);
        }
    }
}

export default VideoState;
