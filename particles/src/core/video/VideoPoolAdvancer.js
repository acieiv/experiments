import settings from '../../config/settings.js';
import VideoState from './VideoState.js'; // Assuming VideoState is in the same directory

class VideoPoolAdvancer {
    constructor(videoPoolInstance) {
        this.pool = videoPoolInstance;
        this.sources = videoPoolInstance.sources;
        this.scene = videoPoolInstance.scene;
        this.options = videoPoolInstance.options;
        this.states = videoPoolInstance.states;
        this.planeGeometry = videoPoolInstance.planeGeometry;
        this.createMaterial = videoPoolInstance.createMaterial.bind(videoPoolInstance);
    }

    /**
     * Finds the next valid (not permanently failed) video source index.
     * @param {number} startIndex - The index to start searching from.
     * @param {string[]} sources - The array of source URLs.
     * @param {Map<string, VideoState>} states - The map of video states.
     * @param {Set<string>} [excludedSources=new Set()] - Sources to exclude from selection.
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
     * @param {string} sourceUrl - The URL of the video source.
     * @param {number} [zOffset=-0.01] - Z-offset for the video mesh, default for next/future videos.
     * @returns {Promise<VideoState|null>} The initialized and preloaded VideoState, or null if failed.
     */
    async _ensureAndPreloadState(sourceUrl, zOffset = -0.01) {
        let state = this.states.get(sourceUrl);
        if (!state || state.isPermanentlyFailed) {
            if (state && state.isPermanentlyFailed) {
                 if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: State for ${sourceUrl} was permanently failed. Cleaning up before attempting re-creation.`, 'warn');
                 state.cleanup();
                 this.states.delete(sourceUrl);
            }
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPoolAdvancer: Creating and initializing state for ${sourceUrl} (zOffset: ${zOffset})`);
            }
            state = new VideoState(
                sourceUrl,
                this.planeGeometry,
                this.createMaterial,
                { position: { z: (this.options.position?.z || 0) + zOffset } }
            );
            await state.initializeAsync();
            if (state.isPermanentlyFailed) {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Failed to initialize ${sourceUrl} for preloading.`, 'error');
                state.cleanup();
                return null;
            }
            this.states.set(sourceUrl, state);
        }
        
        if (state && !state.isPermanentlyFailed && !state.preloaded) {
            state.preload().catch(err => {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Error preloading ${sourceUrl}: ${err.message}`, 'error');
            });
        }
        return state.isPermanentlyFailed ? null : state;
    }

    /**
     * Advance to the next video asynchronously
     */
    async advance() {
        // Directly use this.pool.activeState, this.pool.nextState, this.pool.sources
        if (!this.pool.activeState && this.pool.sources.length === 0) {
             if (settings.debug.enabled && window.debug) window.debug.log("VideoPoolAdvancer: Advance called with no active state and no sources.", 'warn');
             return;
        }
        if (this.pool.sources.length === 0) {
            if (settings.debug.enabled && window.debug) window.debug.log("VideoPoolAdvancer: No sources to advance to.", 'warn');
            if (settings.video.fallbackVideoUrl) {
                const fallbackState = await this._ensureAndPreloadState(settings.video.fallbackVideoUrl, 0);
                if (fallbackState) {
                    this.pool.activeState = fallbackState;
                    this.pool.nextState = fallbackState;
                    if (this.pool.activeState.video) this.pool.activeState.video.loop = true;
                    this.pool.activeState.isCurrentUserVisible = true;
                    this.pool.activeState.setOpacity(1);
                    if (this.pool.activeState.mesh && !this.pool.activeState.mesh.parent) this.scene.add(this.pool.activeState.mesh);
                    this.pool.activeState.play().catch(e => window.debug?.log(`Error playing fallback: ${e.message}`, 'error'));
                    return;
                }
            }
            throw new Error("Cannot advance: No video sources available.");
        }
        if (this.pool.sources.length === 1 && this.pool.activeState && !this.pool.activeState.isPermanentlyFailed) {
            if (settings.debug.verboseLoggingEnabled && window.debug) window.debug.log("VideoPoolAdvancer: Only one video, looping.", 'info');
            if (this.pool.activeState.video && !this.pool.activeState.video.loop) this.pool.activeState.video.loop = true;
            if (this.pool.activeState.hasEnded) {
                this.pool.activeState.hasEnded = false;
                this.pool.activeState.play().catch(e => window.debug?.log(`Error re-playing single video: ${e.message}`, 'error'));
            }
            return;
        }

        if (settings.debug.enabled && window.debug) {
            window.debug.log(`VideoPoolAdvancer: Advancing. Current active: ${this.pool.activeState ? this.pool.activeState.source : 'None'}`);
        }

        const oldActive = this.pool.activeState;
        let currentActiveIndex = -1;
        if (oldActive && this.pool.sources.includes(oldActive.source)) {
            currentActiveIndex = this.pool.sources.indexOf(oldActive.source);
        } else if (this.pool.nextState && this.pool.sources.includes(this.pool.nextState.source)) {
            currentActiveIndex = (this.pool.sources.indexOf(this.pool.nextState.source) - 1 + this.pool.sources.length) % this.pool.sources.length;
        } else if (this.pool.sources.length > 0) {
            currentActiveIndex = 0;
        }

        let newActiveState = null;
        // Try to set the current nextState as activeState if it's valid
        if (this.pool.nextState && !this.pool.nextState.isPermanentlyFailed && this.pool.sources.includes(this.pool.nextState.source)) {
            newActiveState = this.pool.nextState;
            currentActiveIndex = this.pool.sources.indexOf(newActiveState.source);
            if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Promoting current nextState ${newActiveState.source} to active.`);
        } else {
            let searchStartIndexForActive = (currentActiveIndex + 1) % this.pool.sources.length;
            if (this.pool.nextState && this.pool.nextState.isPermanentlyFailed && this.pool.sources.includes(this.pool.nextState.source)) {
                searchStartIndexForActive = this.pool.sources.indexOf(this.pool.nextState.source);
            }
            const newActiveIndex = this._findNextValidSourceIndex(searchStartIndexForActive, this.pool.sources, this.states);
            if (newActiveIndex !== -1) {
                newActiveState = await this._ensureAndPreloadState(this.pool.sources[newActiveIndex], 0); // zOffset 0 for active
                currentActiveIndex = newActiveIndex; // Update currentActiveIndex based on the found new active
            }
        }
        
        // Cleanup oldActive
        if (oldActive) {
            if (oldActive !== newActiveState) {
                oldActive.isCurrentUserVisible = false;
                if (oldActive.isPermanentlyFailed || 
                    (!this.pool.sources.includes(oldActive.source) && oldActive.source !== settings.video.fallbackVideoUrl)) {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPoolAdvancer: Fully cleaning up and removing ${oldActive.source} from states map. PermanentFail: ${oldActive.isPermanentlyFailed}, NotInSources: ${!this.pool.sources.includes(oldActive.source)}`);
                    }
                    if (oldActive.mesh && oldActive.mesh.parent) this.scene.remove(oldActive.mesh);
                    oldActive.cleanup();
                    this.states.delete(oldActive.source);
                } else {
                    if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Preparing ${oldActive.source} for idle state.`);
                    oldActive.prepareForIdle();
                }
            } else {
                 if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Reusing active state ${oldActive.source}.`);
                 oldActive.isCurrentUserVisible = false; // Will be set true again
                 if (oldActive.mesh && !oldActive.mesh.parent && newActiveState && newActiveState.mesh === oldActive.mesh) {
                    this.scene.add(oldActive.mesh);
                 }
            }
        }

        let nextValidSourceFound = false;
        if (newActiveState) {
            this.pool.activeState = newActiveState;
            this.pool.activeState.isCurrentUserVisible = true;
            this.pool.activeState.hasEnded = false;
            this.pool.activeState.play().catch(error => {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Error playing new active video ${this.pool.activeState.source}: ${error.message}`, 'error');
            });
            if (this.pool.activeState.mesh && !this.pool.activeState.mesh.parent) this.scene.add(this.pool.activeState.mesh);

            const nextIndexForNext = this._findNextValidSourceIndex((currentActiveIndex + 1) % this.pool.sources.length, this.pool.sources, this.states, new Set([this.pool.activeState.source]));
            let newNextState = null;
            if (nextIndexForNext !== -1) {
                newNextState = await this._ensureAndPreloadState(this.pool.sources[nextIndexForNext]); // Default zOffset for next
            }
            this.pool.nextState = newNextState;

            if (this.pool.nextState) {
                if (this.pool.nextState.mesh && !this.pool.nextState.mesh.parent) this.scene.add(this.pool.nextState.mesh);
                this.pool.nextState.setOpacity(0);
                
                const futureIndex = this._findNextValidSourceIndex((nextIndexForNext + 1) % this.pool.sources.length, this.pool.sources, this.states, new Set([this.pool.activeState.source, this.pool.nextState.source]));
                if (futureIndex !== -1) {
                    await this._ensureAndPreloadState(this.pool.sources[futureIndex]); // Default zOffset for future
                }
            } else {
                if (this.pool.activeState && this.pool.sources.length > 0) {
                    this.pool.nextState = this.pool.activeState;
                    if (this.pool.activeState.video) this.pool.activeState.video.loop = true;
                    if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Only one valid video ${this.pool.activeState.source} remains. Setting to loop.`);
                }
            }
            nextValidSourceFound = true;
        }

        if (!nextValidSourceFound) {
            if (settings.debug.enabled && window.debug) window.debug.log("VideoPoolAdvancer: No valid primary videos found. Attempting fallback.", 'warn');
            if (settings.video.fallbackVideoUrl) {
                const fallbackState = await this._ensureAndPreloadState(settings.video.fallbackVideoUrl, 0);
                if (fallbackState) {
                    this.pool.activeState = fallbackState;
                    this.pool.nextState = fallbackState;
                    if (this.pool.activeState.video) this.pool.activeState.video.loop = true;
                    this.pool.activeState.isCurrentUserVisible = true;
                    this.pool.activeState.setOpacity(1); // Make sure fallback is visible
                    this.pool.activeState.play().catch(e => window.debug?.log(`Error playing fallback video: ${e.message}`, 'error'));
                    if (this.pool.activeState.mesh && !this.pool.activeState.mesh.parent) this.scene.add(this.pool.activeState.mesh);
                    if (settings.debug.enabled && window.debug) window.debug.log(`VideoPoolAdvancer: Switched to fallback video ${this.pool.activeState.source}.`);
                } else {
                    if (settings.debug.enabled && window.debug) window.debug.log("VideoPoolAdvancer: Fallback video also failed. No videos to play.", 'error');
                    this.pool.activeState = null; this.pool.nextState = null;
                }
            } else {
                if (settings.debug.enabled && window.debug) window.debug.log("VideoPoolAdvancer: No valid videos and no fallback. Playback will stop.", 'error');
                this.pool.activeState = null; this.pool.nextState = null;
            }
        }
        
        if (this.pool.activeState && settings.debug.enabled && window.debug) {
            window.debug.log(`VideoPoolAdvancer: Advanced. New Active: ${this.pool.activeState.source}, New Next: ${this.pool.nextState ? this.pool.nextState.source : 'None'}`);
        }
    }
}

export default VideoPoolAdvancer;
