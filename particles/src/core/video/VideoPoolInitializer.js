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
                window.debug.log("VideoPoolInitializer: No sources provided.", 'error'); // Changed message
            }
            // Removed fallback logic here
            throw new Error("VideoPoolInitializer: Requires at least one video source."); // Simplified error
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
            // All primary sources failed, and no fallback logic anymore
            throw new Error("VideoPoolInitializer: No playable video sources found after verification.");
        }
        
        // This condition might still be relevant if some sources failed but not all
        if (initialPlayableSources.length > 0 && initialPlayableSources.length !== this.sources.length) {
            // The check for fallbackVideoUrl is no longer needed here
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPoolInitializer: Updating sources list to reflect playable videos. Original: ${this.sources.length}, Playable: ${initialPlayableSources.length}`);
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
