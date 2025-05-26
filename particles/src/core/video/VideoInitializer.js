/**
 * VideoInitializer.js
 * Handles the asynchronous initialization of a video, including URL verification,
 * HTMLVideoElement creation, and Three.js mesh creation.
 * Operates on a VideoStateCore instance.
 */

import { Mesh } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../../config/settings.js';

class VideoInitializer {
    /**
     * Verifies the video URL using a HEAD request.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @returns {Promise<boolean>} True if URL is likely valid, false otherwise.
     */
    static async verifyUrl(videoStateCore) {
        if (videoStateCore.urlVerified) return true;

        if (!videoStateCore.source) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: No source URL provided for verification.`, 'error');
            }
            videoStateCore.isPermanentlyFailed = true;
            return false;
        }

        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoInitializer: Verifying URL ${videoStateCore.source}`);
        }

        try {
            const response = await fetch(videoStateCore.source, { method: 'HEAD', mode: 'cors' });
            if (!response.ok) {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoInitializer: URL verification failed for ${videoStateCore.source}. Status: ${response.status} ${response.statusText}`, 'error');
                }
                videoStateCore.isPermanentlyFailed = true;
                return false;
            }
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: URL verification successful for ${videoStateCore.source}. Status: ${response.status}`);
            }
            videoStateCore.urlVerified = true;
            return true;
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: URL verification fetch error for ${videoStateCore.source}: ${error.message}`, 'error');
            }
            videoStateCore.isPermanentlyFailed = true;
            return false;
        }
    }

    /**
     * Attempts to cache the video using the Cache API.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @returns {Promise<boolean>} True if caching was attempted (successfully or already cached), false if Cache API is not supported or an error occurred.
     */
    static async cacheVideo(videoStateCore) {
        if (!('caches' in window)) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log('VideoInitializer: Cache API not supported in this browser.', 'warn');
            }
            return false;
        }

        const cacheName = settings.cache?.videoCacheName || 'video-cache-v1'; // Allow configuration
        try {
            const cache = await caches.open(cacheName);
            const existingResponse = await cache.match(videoStateCore.source);

            if (existingResponse) {
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoInitializer: Video ${videoStateCore.source} already in cache '${cacheName}'.`);
                }
                return true;
            }

            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoInitializer: Attempting to cache ${videoStateCore.source} into '${cacheName}'.`);
            }
            
            // Fetch with appropriate cache mode if needed, though 'no-cors' might be problematic for opaque responses.
            // For simplicity, using default fetch. Ensure CORS is handled correctly for the video source.
            const response = await fetch(videoStateCore.source); 
            
            if (response.ok) {
                // We must clone the response to put it in the cache AND allow the browser to use it.
                await cache.put(videoStateCore.source, response.clone()); 
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoInitializer: Successfully cached ${videoStateCore.source} into '${cacheName}'.`);
                }
                return true;
            } else {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoInitializer: Failed to fetch for caching ${videoStateCore.source}. Status: ${response.status} ${response.statusText}`, 'error');
                }
                // Do not mark as permanently failed here, as direct loading might still work.
                return false; 
            }
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Error during video caching for ${videoStateCore.source}: ${error.message}`, 'error');
            }
            return false;
        }
    }

    /**
     * Creates and configures the HTMLVideoElement.
     * Should only be called after verifyUrl confirms the source.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     */
    static initializeVideoElement(videoStateCore) {
        if (videoStateCore.isPermanentlyFailed) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Skipping video element creation for ${videoStateCore.source} as it's permanently failed.`, 'warn');
            }
            return;
        }
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoInitializer: Initializing video element for ${videoStateCore.source}`);
        }
        try {
            videoStateCore.video = document.createElement('video');
            if (!videoStateCore.video) {
                throw new Error("document.createElement('video') returned null");
            }
            videoStateCore.video.loop = false;
            videoStateCore.video.muted = true;
            videoStateCore.video.crossOrigin = "anonymous";
            videoStateCore.video.playsInline = true;
            videoStateCore.video.preload = "auto";
            videoStateCore.video.width = videoStateCore.options.videoWidth || 720;
            videoStateCore.video.height = videoStateCore.options.videoHeight || 720;

            videoStateCore.onLoadedDataForTextureHandler = () => {
                if (!videoStateCore.video) return;
                if (videoStateCore.textureManager && videoStateCore.video.videoWidth && videoStateCore.video.videoHeight) {
                    videoStateCore.textureManager.prepareHighQualityTexture();
                }
            };
            videoStateCore.video.addEventListener('loadeddata', videoStateCore.onLoadedDataForTextureHandler);

            videoStateCore.video.src = videoStateCore.source;
            videoStateCore.video.load(); 

        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Error initializing video element for ${videoStateCore.source}: ${error.message}`, 'error');
            }
            videoStateCore.isPermanentlyFailed = true;
            if (videoStateCore.errorManager) {
                videoStateCore.errorManager.handleVideoError(error, 'initialization_element_creation');
            }
        }
    }
    
    /**
     * Creates the Three.js mesh with the initial texture.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     */
    static async createMesh(videoStateCore) {
        if (videoStateCore.meshCreated) return;
        if (videoStateCore.isPermanentlyFailed) {
             if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Skipping mesh creation for ${videoStateCore.source} as it's permanently failed.`, 'warn');
            }
            return;
        }
        
        try {
            // videoStateCore.texture should be the initial placeholder texture set by VideoStateCore constructor
            const material = await videoStateCore.createMaterial(videoStateCore.texture, videoStateCore.opacity);
            videoStateCore.mesh = new Mesh(
                videoStateCore.planeGeometry,
                material
            );
            videoStateCore.mesh.position.z = videoStateCore.options.position?.z || 0;
            videoStateCore.meshCreated = true;
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoInitializer: Mesh created for ${videoStateCore.source}`);
            }
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Error creating mesh for ${videoStateCore.source}: ${error.message}`, 'error');
            }
            videoStateCore.mesh = null;
            videoStateCore.meshCreated = false;
            videoStateCore.isPermanentlyFailed = true;
        }
    }

    /**
     * Asynchronously initializes the VideoStateCore instance.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     */
    static async initializeAsync(videoStateCore) {
        if (videoStateCore.meshCreated || videoStateCore.isPermanentlyFailed) {
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                const reason = videoStateCore.meshCreated ? "already initialized" : "permanently failed";
                window.debug.log(`VideoInitializer: Skipping async initialization for ${videoStateCore.source} (${reason}).`);
            }
            return;
        }

        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoInitializer: Starting async initialization for ${videoStateCore.source}`);
        }

        const urlIsValid = await this.verifyUrl(videoStateCore);
        if (!urlIsValid) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Async initialization aborted for ${videoStateCore.source} due to URL verification failure.`, 'warn');
            }
            return;
        }

        // Attempt to cache the video after URL verification
        if (settings.caching?.videosEnabled) { // Add a setting to enable/disable this feature
            await this.cacheVideo(videoStateCore);
        }

        this.initializeVideoElement(videoStateCore);

        if (videoStateCore.isPermanentlyFailed) {
             if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Async initialization aborted for ${videoStateCore.source} due to video element creation failure.`, 'warn');
            }
            return;
        }
        
        if (videoStateCore.video) {
            // Ensure eventHandler is available on videoStateCore
            if (videoStateCore.eventHandler) {
                videoStateCore.eventHandler.setupEventListeners(); // eventHandler operates on videoStateCore.video
            } else {
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoInitializer ${videoStateCore.source}: eventHandler not available on videoStateCore. Cannot setup event listeners.`, 'error');
                }
                videoStateCore.isPermanentlyFailed = true;
                return;
            }
        } else if (!videoStateCore.isPermanentlyFailed) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer ${videoStateCore.source}: Video element not available after initializeVideoElement() before setting up event listeners. This is unexpected.`, 'error');
            }
            videoStateCore.isPermanentlyFailed = true;
            return;
        }

        try {
            await this.createMesh(videoStateCore);
            if (videoStateCore.isPermanentlyFailed) {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoInitializer: Async initialization aborted for ${videoStateCore.source} due to mesh creation failure.`, 'warn');
                }
                return;
            }
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoInitializer: Async initialization complete for ${videoStateCore.source}`);
            }
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoInitializer: Unexpected error during createMesh in initializeAsync for ${videoStateCore.source}: ${error.message}`, 'error');
            }
            videoStateCore.isPermanentlyFailed = true;
        }
    }
}

export default VideoInitializer;
