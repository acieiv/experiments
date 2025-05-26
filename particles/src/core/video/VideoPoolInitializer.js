import { PlaneGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../../config/settings.js';
import VideoState from './VideoState.js';

class VideoPoolInitializer {
    constructor(videoPoolInstance) {
        this.pool = videoPoolInstance; // Keep a reference to the main pool instance
        this.sources = videoPoolInstance.sources;
        this.scene = videoPoolInstance.scene;
        this.options = videoPoolInstance.options;
        this.states = videoPoolInstance.states; // Operate directly on the pool's states map
        this.planeGeometry = videoPoolInstance.planeGeometry; // Use/set pool's geometry
        this.createMaterial = videoPoolInstance.createMaterial.bind(videoPoolInstance); // Ensure 'this' context
    }

    /**
     * Finds the next valid (not permanently failed) video source index.
     * @param {number} startIndex - The index to start searching from.
     * @param {string[]} sources - The array of source URLs.
     * @param {Map<string, VideoState>} states - The map of video states.
     * @param {Set<string>} [excludedSources=new Set()] - Sources to exclude from selection (e.g. current active)
     * @returns {number} The index of the next valid source, or -1 if none found.
     */
    _findNextValidSourceIndex(startIndex, sources, states, excludedSources = new Set()) {
        if (!sources || sources.length === 0) return -1;
        for (let i = 0; i < sources.length; i++) {
            const currentIndex = (startIndex + i) % sources.length;
            const source = sources[currentIndex];
            if (excludedSources.has(source)) continue;

            const state = states.get(source);
            if (!state || !state.isPermanentlyFailed) {
                return currentIndex;
            }
        }
        return -1;
    }

    /**
     * Ensures a VideoState exists for the given sourceUrl, initializes it if new, and preloads it.
     * This version is adapted for use within the initializer and potentially the advancer.
     * @param {string} sourceUrl - The URL of the video source.
     * @param {number} [zOffset=0] - Z-offset for the video mesh.
     * @returns {Promise<VideoState|null>} The initialized and preloaded VideoState, or null if failed.
     */
    async _ensureAndPreloadState(sourceUrl, zOffset = 0) {
        let state = this.states.get(sourceUrl);
        // If state exists and is permanently failed, it should have been filtered out or handled before calling this
        // for initial setup. If called during advance, advancer logic would handle it.
        // For initialization, we create if it doesn't exist.
        if (!state) {
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPoolInitializer: Creating and initializing state for ${sourceUrl} (zOffset: ${zOffset})`);
            }
            state = new VideoState(
                sourceUrl,
                this.pool.planeGeometry, // Use pool's geometry
                this.createMaterial,    // Use pool's bound createMaterial
                { position: { z: (this.options.position?.z || 0) + zOffset } }
            );
            await state.initializeAsync();
            if (state.isPermanentlyFailed) {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolInitializer: Failed to initialize ${sourceUrl}.`, 'error');
                state.cleanup();
                return null;
            }
            this.states.set(sourceUrl, state);
        } else if (state.isPermanentlyFailed) {
            // This case should ideally not be hit if sources are pre-filtered or if this is for a new source.
            // If it's a re-attempt on a known failed source, it might indicate a logic flaw elsewhere.
            if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolInitializer: Attempted to ensure state for already permanently failed source ${sourceUrl}.`, 'warn');
            return null;
        }

        // Preload if not already preloaded (and not failed)
        if (!state.preloaded) { // isPermanentlyFailed check already done
            state.preload().catch(err => {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolInitializer: Error preloading ${sourceUrl}: ${err.message}`, 'error');
                // isPermanentlyFailed should be set by preload() or its error handlers if critical
            });
        }
        return state; // Return the state, whether newly created or existing
    }


    /**
     * Initialize the video pool asynchronously
     */
    async initializePoolAsync() {
        if (settings.debug.enabled && window.debug) {
            window.debug.log("VideoPoolInitializer: Initializing asynchronously");
        }

        if (!this.sources || this.sources.length === 0) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log("VideoPoolInitializer: No sources provided. Attempting to use fallback video.", 'warn');
            }
            if (settings.video.fallbackVideoUrl) {
                this.sources = [settings.video.fallbackVideoUrl];
                this.pool.sources = this.sources; // Update pool's sources
            } else {
                throw new Error("VideoPoolInitializer: Requires at least one video source and no fallback is configured.");
            }
        }

        // Ensure planeGeometry is created on the pool instance if not already
        if (!this.pool.planeGeometry) {
            this.pool.planeGeometry = new PlaneGeometry(this.options.planeSize, this.options.planeSize);
        }
        this.planeGeometry = this.pool.planeGeometry; // ensure local reference is updated

        let initialPlayableSources = [];
        for (const sourceUrl of this.sources) {
            // _ensureAndPreloadState will create, initialize, and store in this.states if successful
            const state = await this._ensureAndPreloadState(sourceUrl, 0); // zOffset 0 for initial potential active
            if (state && !state.isPermanentlyFailed) {
                initialPlayableSources.push(sourceUrl);
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPoolInitializer: Successfully initialized and verified source: ${sourceUrl}`);
                }
            } else {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPoolInitializer: Source ${sourceUrl} failed initialization/verification and will be skipped.`, 'warn');
                }
                // _ensureAndPreloadState handles cleanup of failed state if it created it
                // If state existed and was already failed, it's just skipped.
                // If state was newly created and failed, _ensureAndPreloadState cleans it.
                // We might need to explicitly remove from this.states if it was pre-existing and now confirmed failed.
                if (this.states.has(sourceUrl) && this.states.get(sourceUrl).isPermanentlyFailed) {
                    this.states.get(sourceUrl).cleanup(); // Ensure cleanup
                    this.states.delete(sourceUrl); // Remove from pool's map
                }
            }
        }

        if (initialPlayableSources.length === 0) {
            if (settings.video.fallbackVideoUrl && (!this.sources.includes(settings.video.fallbackVideoUrl) || this.states.get(settings.video.fallbackVideoUrl)?.isPermanentlyFailed)) {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log("VideoPoolInitializer: All primary sources failed. Attempting to initialize fallback video.", 'warn');
                }
                const fallbackState = await this._ensureAndPreloadState(settings.video.fallbackVideoUrl, 0);
                if (fallbackState && !fallbackState.isPermanentlyFailed) {
                    this.sources = [settings.video.fallbackVideoUrl];
                    this.pool.sources = this.sources; // Update pool's sources
                    
                    // Clear any failed primary states that might have been added to the map before failing
                    const keysToDelete = [];
                    this.states.forEach((s, key) => {
                        if (key !== settings.video.fallbackVideoUrl) keysToDelete.push(key);
                    });
                    keysToDelete.forEach(key => {
                        this.states.get(key)?.cleanup();
                        this.states.delete(key);
                    });
                    // Ensure fallback state is in the map (it should be by _ensureAndPreloadState)
                    if (!this.states.has(settings.video.fallbackVideoUrl)) {
                         this.states.set(settings.video.fallbackVideoUrl, fallbackState);
                    }

                    initialPlayableSources = [settings.video.fallbackVideoUrl];
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPoolInitializer: Fallback video ${settings.video.fallbackVideoUrl} initialized successfully.`);
                    }
                } else {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPoolInitializer: Fallback video ${settings.video.fallbackVideoUrl} also failed to initialize.`, 'error');
                    }
                    // Fallback state cleanup handled by _ensureAndPreloadState if it created it and it failed
                    throw new Error("VideoPoolInitializer: All primary video sources and the fallback video failed to initialize.");
                }
            } else if (initialPlayableSources.length === 0) {
                 throw new Error("VideoPoolInitializer: No playable video sources found after verification, and no fallback available or fallback also failed.");
            }
        }
        
        if (initialPlayableSources.length > 0 && initialPlayableSources.length !== this.sources.length) {
            if(!(initialPlayableSources.length === 1 && initialPlayableSources[0] === settings.video.fallbackVideoUrl)) {
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPoolInitializer: Updating sources list to reflect playable videos. Original: ${this.sources.length}, Playable: ${initialPlayableSources.length}`);
                 }
            }
            this.sources = initialPlayableSources;
            this.pool.sources = this.sources; // Critical: Update the main pool's source list
        }

        // Setup active and next states on the pool instance
        if (this.sources.length > 0) {
            this.pool.activeState = this.states.get(this.sources[0]);
            if (this.pool.activeState) {
                this.pool.activeState.isCurrentUserVisible = true;
                this.pool.activeState.hasEnded = false;
                this.pool.activeState.setOpacity(1);
                if (this.pool.activeState.mesh) this.scene.add(this.pool.activeState.mesh);
                else if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolInitializer: Active state ${this.pool.activeState.source} has no mesh after init.`, "warn");
                
                this.pool.activeState.play().catch(error => {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPoolInitializer: Error playing initial active video ${this.pool.activeState.source}: ${error.message}`, 'error');
                    }
                });
            } else {
                 if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolInitializer: Could not set activeState for ${this.sources[0]}. State not found.`, "error");
            }
        }

        if (this.sources.length > 1) {
            const nextSourceUrl = this.sources[1];
            // Ensure the next state is created and preloaded if it wasn't already
            this.pool.nextState = await this._ensureAndPreloadState(nextSourceUrl, -0.01);
            
            if (this.pool.nextState) {
                this.pool.nextState.setOpacity(0);
                if(this.pool.nextState.mesh) {
                    // z-position already handled by _ensureAndPreloadState if newly created
                    if (!this.pool.nextState.mesh.parent) this.scene.add(this.pool.nextState.mesh);
                } else if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolInitializer: Next state ${this.pool.nextState.source} has no mesh after init.`, "warn");
                // Preloading is handled by _ensureAndPreloadState
            } else {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolInitializer: Could not set or create nextState for ${nextSourceUrl}.`, "error");
            }
        } else if (this.sources.length === 1 && this.pool.activeState) {
            this.pool.nextState = this.pool.activeState;
            if (this.pool.activeState.video) this.pool.activeState.video.loop = true;
        }

        if (this.sources.length > 2) {
            const futureSourceUrl = this.sources[2];
            // Ensure the future state is created and preloaded
            await this._ensureAndPreloadState(futureSourceUrl, -0.01);
            // No need to assign to a pool property, _ensureAndPreloadState handles map and preloading
        }
        if (settings.debug.enabled && window.debug) {
            window.debug.log("VideoPoolInitializer: Async initialization complete.");
        }
    }
}

export default VideoPoolInitializer;
