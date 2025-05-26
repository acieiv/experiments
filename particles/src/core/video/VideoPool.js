/**
 * VideoPool.js
 * Manages a collection of videos and handles transitions between them
 */

import { PlaneGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../../config/settings.js'; // Adjusted
import DebugOverlay from '../../utils/DebugOverlay.js'; // Adjusted
import VideoState from './VideoState.js'; // Adjusted - now a sibling
import MaterialFactory from '../MaterialFactory.js'; // Adjusted - MaterialFactory stays in src/core

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
        // Catch is now handled more gracefully within initializeAsync or by the caller
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
            // A video is valid if:
            // 1. It has a state object AND that state is not permanently failed.
            // 2. Or, it doesn't have a state object yet (meaning it hasn't been initialized and failed verification).
            //    VideoState.initializeAsync() will handle its own verification.
            if (!state || !state.isPermanentlyFailed) {
                return currentIndex;
            }
        }
        return -1; // No valid source found
    }
    
    /**
     * Initialize the video pool asynchronously
     * @private
     */
    async initializeAsync() {
        if (settings.debug.enabled && window.debug) {
            window.debug.log("VideoPool: Initializing asynchronously");
        }

        if (!this.sources || this.sources.length === 0) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log("VideoPool: No sources provided. Attempting to use fallback video.", 'warn');
            }
            if (settings.video.fallbackVideoUrl) {
                this.sources = [settings.video.fallbackVideoUrl]; // Use fallback as the only source
            } else {
                throw new Error("VideoPool requires at least one video source and no fallback is configured.");
            }
        }

        this.planeGeometry = new PlaneGeometry(this.options.planeSize, this.options.planeSize);

        let initialPlayableSources = [];
        for (const sourceUrl of this.sources) {
            // Tentatively create VideoState, its own initializeAsync will verify URL
            const tempState = new VideoState(
                sourceUrl,
                this.planeGeometry,
                this.createMaterial.bind(this),
                { position: { z: this.options.position.z } } // Temporary position
            );
            await tempState.initializeAsync(); // This includes URL verification
            if (!tempState.isPermanentlyFailed) {
                initialPlayableSources.push(sourceUrl);
                this.states.set(sourceUrl, tempState); // Store successfully initialized state
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPool: Successfully initialized and verified source: ${sourceUrl}`);
                }
            } else {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPool: Source ${sourceUrl} failed initialization/verification and will be skipped.`, 'warn');
                }
                tempState.cleanup(); // Clean up resources for failed state
            }
        }

        if (initialPlayableSources.length === 0) {
            if (settings.video.fallbackVideoUrl && (!this.sources.includes(settings.video.fallbackVideoUrl) || this.states.get(settings.video.fallbackVideoUrl)?.isPermanentlyFailed)) {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log("VideoPool: All primary sources failed. Attempting to initialize fallback video.", 'warn');
                }
                const fallbackState = new VideoState(
                    settings.video.fallbackVideoUrl,
                    this.planeGeometry,
                    this.createMaterial.bind(this),
                    { position: { z: this.options.position.z } }
                );
                await fallbackState.initializeAsync();
                if (!fallbackState.isPermanentlyFailed) {
                    this.sources = [settings.video.fallbackVideoUrl]; // Replace sources with just the fallback
                    this.states.clear(); // Clear any failed primary states
                    this.states.set(settings.video.fallbackVideoUrl, fallbackState);
                    initialPlayableSources = [settings.video.fallbackVideoUrl];
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPool: Fallback video ${settings.video.fallbackVideoUrl} initialized successfully.`);
                    }
                } else {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPool: Fallback video ${settings.video.fallbackVideoUrl} also failed to initialize.`, 'error');
                    }
                    fallbackState.cleanup();
                    throw new Error("VideoPool: All primary video sources and the fallback video failed to initialize.");
                }
            } else if (initialPlayableSources.length === 0) { // Still no playable sources
                 throw new Error("VideoPool: No playable video sources found after verification, and no fallback available or fallback also failed.");
            }
        }
        
        // Update this.sources to only contain playable ones if primaries were filtered
        // Or if it was replaced by fallback
        if (initialPlayableSources.length > 0 && initialPlayableSources.length !== this.sources.length) {
            if(! (initialPlayableSources.length === 1 && initialPlayableSources[0] === settings.video.fallbackVideoUrl)) {
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPool: Updating sources list to reflect playable videos. Original: ${this.sources.length}, Playable: ${initialPlayableSources.length}`);
                 }
            }
            this.sources = initialPlayableSources;
        }


        // Setup active and next states from the (potentially filtered) this.sources list
        if (this.sources.length > 0) {
            this.activeState = this.states.get(this.sources[0]);
            if (this.activeState) {
                this.activeState.isCurrentUserVisible = true;
                this.activeState.hasEnded = false;
                this.activeState.setOpacity(1);
                if (this.activeState.mesh) this.scene.add(this.activeState.mesh);
                else if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Active state ${this.activeState.source} has no mesh after init.`, "warn");
                
                this.activeState.play().catch(error => {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPool: Error playing initial active video ${this.activeState.source}: ${error.message}`, 'error');
                    }
                });
            } else {
                 if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Could not set activeState for ${this.sources[0]}. State not found.`, "error");
            }
        }

        if (this.sources.length > 1) {
            const nextSourceUrl = this.sources[1];
            this.nextState = this.states.get(nextSourceUrl);
            if (this.nextState) {
                this.nextState.setOpacity(0);
                 // Ensure mesh z-position is distinct for next video if not already handled by VideoState options
                if(this.nextState.mesh) {
                    this.nextState.mesh.position.z = (this.options.position?.z || 0) - 0.01;
                    this.scene.add(this.nextState.mesh);
                } else if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Next state ${this.nextState.source} has no mesh after init.`, "warn");

                this.nextState.preload().catch(err => {
                    if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Error preloading next video ${this.nextState.source}: ${err.message}`, 'error');
                });
            } else {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Could not set nextState for ${nextSourceUrl}. State not found.`, "error");
            }
        } else if (this.sources.length === 1 && this.activeState) {
            // Single video, make it loop and be its own nextState
            this.nextState = this.activeState;
            if (this.activeState.video) this.activeState.video.loop = true;
        }

        // Preload the third video if available
        if (this.sources.length > 2) {
            const futureSourceUrl = this.sources[2];
            let futureState = this.states.get(futureSourceUrl);
            if (futureState) {
                 if(futureState.mesh) futureState.mesh.position.z = (this.options.position?.z || 0) - 0.01; // Ensure distinct Z
                futureState.preload().catch(err => {
                     if(settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Error preloading future video ${futureState.source}: ${err.message}`, 'error');
                });
            } else {
                 // This case should ideally be handled by the initial loop that populates this.states
                 if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Could not find state for future video ${futureSourceUrl} to preload.`, "warn");
            }
        }
        if (settings.debug.enabled && window.debug) {
            window.debug.log("VideoPool: Async initialization complete.");
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

    async _ensureAndPreloadState(sourceUrl, zOffset = -0.01) {
        let state = this.states.get(sourceUrl);
        if (!state || state.isPermanentlyFailed) { // If failed, try to re-create, though initializeAsync should prevent this if source is bad
            if (state && state.isPermanentlyFailed) {
                 if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: State for ${sourceUrl} was permanently failed. Cleaning up before attempting re-creation.`, 'warn');
                 state.cleanup(); // Ensure old failed state is cleaned
                 this.states.delete(sourceUrl);
            }
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPool: Creating and initializing state for ${sourceUrl} (zOffset: ${zOffset})`);
            }
            state = new VideoState(
                sourceUrl,
                this.planeGeometry,
                this.createMaterial.bind(this),
                { position: { z: (this.options.position?.z || 0) + zOffset } }
            );
            await state.initializeAsync(); // This includes URL verification
            if (state.isPermanentlyFailed) {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Failed to initialize ${sourceUrl} for preloading.`, 'error');
                state.cleanup(); // Clean up the failed state
                return null; // Indicate failure
            }
            this.states.set(sourceUrl, state);
        }
        // Preload if not already preloaded and not failed
        if (state && !state.isPermanentlyFailed && !state.preloaded) {
            state.preload().catch(err => {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Error preloading ${sourceUrl}: ${err.message}`, 'error');
                // isPermanentlyFailed should be set by preload() or its error handlers if critical
            });
        }
        return state.isPermanentlyFailed ? null : state;
    }

    /**
     * Advance to the next video asynchronously
     */
    async advance() {
        if (!this.activeState && this.sources.length === 0) {
             if (settings.debug.enabled && window.debug) window.debug.log("VideoPool: Advance called with no active state and no sources.", 'warn');
             return; // Nothing to do
        }
        if (this.sources.length === 0) { // Should have been caught by init, but as a safeguard
            if (settings.debug.enabled && window.debug) window.debug.log("VideoPool: No sources to advance to.", 'warn');
            // Potentially try fallback one last time if activeState just failed
            if (settings.video.fallbackVideoUrl) {
                const fallbackState = await this._ensureAndPreloadState(settings.video.fallbackVideoUrl, 0);
                if (fallbackState) {
                    this.activeState = fallbackState;
                    this.nextState = fallbackState; // Loop fallback
                    if (this.activeState.video) this.activeState.video.loop = true;
                    this.activeState.isCurrentUserVisible = true;
                    this.activeState.setOpacity(1);
                    if (this.activeState.mesh && !this.activeState.mesh.parent) this.scene.add(this.activeState.mesh);
                    this.activeState.play().catch(e => window.debug?.log(`Error playing fallback: ${e.message}`, 'error'));
                    return;
                }
            }
            throw new Error("Cannot advance: No video sources available.");
        }
        if (this.sources.length === 1 && this.activeState && !this.activeState.isPermanentlyFailed) {
            if (settings.debug.verboseLoggingEnabled && window.debug) window.debug.log("VideoPool: Only one video, looping.", 'info');
            if (this.activeState.video && !this.activeState.video.loop) this.activeState.video.loop = true;
             // Ensure it's playing if it ended
            if (this.activeState.hasEnded) {
                this.activeState.hasEnded = false;
                this.activeState.play().catch(e => window.debug?.log(`Error re-playing single video: ${e.message}`, 'error'));
            }
            return;
        }


        if (settings.debug.enabled && window.debug) {
            window.debug.log(`VideoPool: Advancing. Current active: ${this.activeState ? this.activeState.source : 'None'}`);
        }

        const oldActive = this.activeState;
        // Determine currentActiveIndex (NEEDED FOR newActiveState calculation)
        // oldActive is captured at the top of the function.
        let currentActiveIndex = -1;
        if (oldActive && this.sources.includes(oldActive.source)) {
            currentActiveIndex = this.sources.indexOf(oldActive.source);
        } else if (this.nextState && this.sources.includes(this.nextState.source)) {
            currentActiveIndex = (this.sources.indexOf(this.nextState.source) - 1 + this.sources.length) % this.sources.length;
        } else if (this.sources.length > 0) { // Fallback if no clear oldActive or nextState in sources, or if oldActive was null
            currentActiveIndex = 0; // Default to start search from beginning
        }
        // newActiveState will be determined next, then we'll handle oldActive's cleanup.

        let attempts = 0;
        let nextValidSourceFound = false;
        let newActiveState = null;
        let newNextState = null;
        let newFutureState = null; // For preloading the one after next

        // Try to set the current nextState as activeState if it's valid
        if (this.nextState && !this.nextState.isPermanentlyFailed && this.sources.includes(this.nextState.source)) {
            newActiveState = this.nextState;
            currentActiveIndex = this.sources.indexOf(newActiveState.source);
            if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Promoting current nextState ${newActiveState.source} to active.`);
        } else {
             // Find the first valid video to be the new activeState
            let searchStartIndexForActive = (currentActiveIndex + 1) % this.sources.length;
            if (this.nextState && this.nextState.isPermanentlyFailed && this.sources.includes(this.nextState.source)) {
                // If current nextState is bad, start search for active from its position to ensure we skip it.
                searchStartIndexForActive = this.sources.indexOf(this.nextState.source);
            }

            const newActiveIndex = this._findNextValidSourceIndex(searchStartIndexForActive, this.sources, this.states);
            if (newActiveIndex !== -1) {
                newActiveState = await this._ensureAndPreloadState(this.sources[newActiveIndex], 0);
                currentActiveIndex = newActiveIndex;
            }
        }

        // PERFORM CONDITIONAL CLEANUP/IDLING OF oldActive (captured at the start of advance())
        // This is done AFTER newActiveState is determined, but BEFORE this.activeState is updated.
        if (oldActive) {
            if (oldActive !== newActiveState) {
                oldActive.isCurrentUserVisible = false; // Mark as not visible

                // If oldActive is permanently failed, or its source is no longer in the main playlist (and it's not the fallback)
                // then perform a full cleanup and remove it from the states map.
                if (oldActive.isPermanentlyFailed || 
                    (!this.sources.includes(oldActive.source) && oldActive.source !== settings.video.fallbackVideoUrl)) {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPool: Fully cleaning up and removing ${oldActive.source} from states map. PermanentFail: ${oldActive.isPermanentlyFailed}, NotInSources: ${!this.sources.includes(oldActive.source)}`);
                    }
                    if (oldActive.mesh && oldActive.mesh.parent) {
                        this.scene.remove(oldActive.mesh);
                    }
                    oldActive.cleanup();
                    this.states.delete(oldActive.source);
                } else {
                    // Otherwise, if it's a reusable video from the playlist, just prepare it for idle.
                    // Its mesh might be temporarily removed from scene by transition controller or kept if it's next.
                    // For now, prepareForIdle will hide it.
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoPool: Preparing ${oldActive.source} for idle state instead of full cleanup.`);
                    }
                    oldActive.prepareForIdle();
                    // Ensure its mesh is not in the scene if it's not the next video to be shown immediately.
                    // The transition controller should handle making the newActiveState visible.
                    // If oldActive.mesh is still parented and oldActive is not newActiveState or newNextState,
                    // it might be an idea to remove it here, or ensure prepareForIdle handles visibility/scene removal.
                    // For now, prepareForIdle sets mesh.visible = false.
                    // If oldActive.mesh.parent and it's not going to be newNextState, consider removing from scene.
                    if (oldActive.mesh && oldActive.mesh.parent && oldActive !== newNextState) {
                         // this.scene.remove(oldActive.mesh); // Potentially, or let transition controller manage
                    }
                }
            } else { // If oldActive is the same as newActiveState (looping/replaying same instance)
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPool: Reusing active state ${oldActive.source}. Minimal reset, no full cleanup.`);
                }
                oldActive.isCurrentUserVisible = false; // Will be set true again shortly by newActiveState logic
                // Ensure its mesh is still in the scene if it was there and is being reused.
                // This handles cases where the mesh might have been removed if logic elsewhere assumed a full swap.
                if (oldActive.mesh && !oldActive.mesh.parent && newActiveState && newActiveState.mesh === oldActive.mesh) {
                   this.scene.add(oldActive.mesh);
                }
            }
        }

        if (newActiveState) {
            this.activeState = newActiveState;
            this.activeState.isCurrentUserVisible = true;
            this.activeState.hasEnded = false;
            // Opacity and mesh adding will be handled by transition controller or immediately after this
            this.activeState.play().catch(error => {
                if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Error playing new active video ${this.activeState.source}: ${error.message}`, 'error');
            });
            if (this.activeState.mesh && !this.activeState.mesh.parent) this.scene.add(this.activeState.mesh);


            // Find the next valid video for newNextState
            const nextIndexForNext = this._findNextValidSourceIndex((currentActiveIndex + 1) % this.sources.length, this.sources, this.states, new Set([this.activeState.source]));
            if (nextIndexForNext !== -1) {
                newNextState = await this._ensureAndPreloadState(this.sources[nextIndexForNext], -0.01);
            }
            this.nextState = newNextState;

            if (this.nextState) {
                if (this.nextState.mesh && !this.nextState.mesh.parent) this.scene.add(this.nextState.mesh);
                this.nextState.setOpacity(0); // Ensure it's hidden initially
                
                // Preload the one *after* newNextState (future state)
                const futureIndex = this._findNextValidSourceIndex((nextIndexForNext + 1) % this.sources.length, this.sources, this.states, new Set([this.activeState.source, this.nextState.source]));
                if (futureIndex !== -1) {
                    newFutureState = await this._ensureAndPreloadState(this.sources[futureIndex], -0.01);
                    // newFutureState is now preloading in the background, stored in this.states
                }
            } else {
                 // Only one valid video left (the new active one), make it loop
                if (this.activeState && this.sources.length > 0) { // Check sources.length too
                    this.nextState = this.activeState; // Point to self
                    if (this.activeState.video) this.activeState.video.loop = true;
                    if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Only one valid video ${this.activeState.source} remains. Setting to loop.`);
                }
            }
            nextValidSourceFound = true;
        }


        if (!nextValidSourceFound) {
            if (settings.debug.enabled && window.debug) window.debug.log("VideoPool: No valid primary videos found to advance to. Attempting fallback.", 'warn');
            if (settings.video.fallbackVideoUrl) {
                const fallbackState = await this._ensureAndPreloadState(settings.video.fallbackVideoUrl, 0);
                if (fallbackState) {
                    this.activeState = fallbackState;
                    this.nextState = fallbackState; // Loop fallback
                    if (this.activeState.video) this.activeState.video.loop = true;
                    this.activeState.isCurrentUserVisible = true;
                    // Opacity and mesh adding handled by transition controller or immediately after
                    this.activeState.play().catch(e => window.debug?.log(`Error playing fallback video: ${e.message}`, 'error'));
                    if (this.activeState.mesh && !this.activeState.mesh.parent) this.scene.add(this.activeState.mesh);
                     if (settings.debug.enabled && window.debug) window.debug.log(`VideoPool: Switched to fallback video ${this.activeState.source}.`);
                } else {
                    if (settings.debug.enabled && window.debug) window.debug.log("VideoPool: Fallback video also failed. No videos to play.", 'error');
                    this.activeState = null; this.nextState = null; // No videos left
                    // Consider throwing an error or setting a "no video" state for the UI
                }
            } else {
                if (settings.debug.enabled && window.debug) window.debug.log("VideoPool: No valid videos and no fallback configured. Playback will stop.", 'error');
                this.activeState = null; this.nextState = null;
            }
        }
        
        if (this.activeState && settings.debug.enabled && window.debug) {
            window.debug.log(`VideoPool: Advanced. New Active: ${this.activeState.source}, New Next: ${this.nextState ? this.nextState.source : 'None'}`);
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
