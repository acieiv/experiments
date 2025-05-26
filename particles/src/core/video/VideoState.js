/**
 * VideoState.js
 * Facade for managing the state and lifecycle of a single video.
 * Orchestrates VideoStateCore and various helper modules.
 */

import VideoStateCore from './VideoStateCore.js';
import VideoInitializer from './VideoInitializer.js';
import VideoPlaybackController from './VideoPlaybackController.js';
import VideoUpdater from './VideoUpdater.js';
import VideoCleaner from './VideoCleaner.js';
// DebugOverlay and settings might be used for top-level logging or passed if needed.
// For now, assuming most specific logging is handled by sub-modules.
// import settings from '../../config/settings.js'; 
// import DebugOverlay from '../../utils/DebugOverlay.js';

// MaterialFactory is used by VideoStateCore via dependency injection (createMaterial function)
// No direct import needed here if VideoStateCore handles it.

class VideoState {
    /**
     * Create a new VideoState facade.
     * @param {string} source - Video source URL
     * @param {BufferGeometry} planeGeometry - Shared geometry for video plane
     * @param {Function} createMaterial - Function to create shader material (e.g., from MaterialFactory)
     * @param {Object} options - Configuration options
     */
    constructor(source, planeGeometry, createMaterial, options) {
        this.core = new VideoStateCore(source, planeGeometry, createMaterial, options);
    }

    // --- Initialization ---
    async initializeAsync() {
        return VideoInitializer.initializeAsync(this.core);
    }

    // --- Playback Control ---
    async preload() {
        return VideoPlaybackController.preload(this.core);
    }

    play() {
        return VideoPlaybackController.play(this.core);
    }

    pause(reason = 'stall') {
        VideoPlaybackController.pause(this.core, reason);
    }

    // --- Update and Rendering ---
    update(params) {
        VideoUpdater.update(this.core, params);
    }

    setOpacity(value) {
        VideoUpdater.setOpacity(this.core, value);
    }

    // --- Cleanup ---
    cleanup() {
        VideoCleaner.cleanup(this.core);
    }

    /**
     * Prepares the video state for an idle period, making it ready for potential reuse.
     * It pauses the video with an 'idle' reason and then sets appropriate flags and visuals.
     */
    prepareForIdle() {
        // Ensure pause reason is set correctly via the controller, and video is paused.
        if (this.core.video) { // Check if video element exists
             VideoPlaybackController.pause(this.core, 'idle');
        }
        // Then call the core method to set other idle visuals and flags.
        this.core.setIdleVisualsAndFlags();
    }

    // --- State Accessors (delegating to VideoStateCore) ---
    get source() { return this.core.source; }
    get video() { return this.core.video; }
    get texture() { return this.core.texture; } // Current texture
    get mesh() { return this.core.mesh; }
    get loaded() { return this.core.loaded; }
    get playing() { return this.core.playing; }
    get preloaded() { return this.core.preloaded; }
    get opacity() { return this.core.opacity; }
    get loopCount() { return this.core.loopCount; }
    set loopCount(value) { this.core.loopCount = value; }
    get hasPlayedOnce() { return this.core.hasPlayedOnce; }
    set hasPlayedOnce(value) { this.core.hasPlayedOnce = value; }
    get isCurrentUserVisible() { return this.core.isCurrentUserVisible; }
    set isCurrentUserVisible(value) { this.core.isCurrentUserVisible = value; }
    get hasEnded() { return this.core.hasEnded; }
    set hasEnded(value) { this.core.hasEnded = value; }
    get isPermanentlyFailed() { return this.core.isPermanentlyFailed; }
    get meshCreated() { return this.core.meshCreated; }
    get pauseReason() { return this.core.pauseReason; } // Expose pause reason

    // --- Manager Accessors ---
    get textureManager() { return this.core.textureManager; }
    get playbackManager() { return this.core.playbackManager; }
    get errorManager() { return this.core.errorManager; }
    get eventHandler() { return this.core.eventHandler; }
    
    // --- Utility/State Check Methods (delegating to VideoPlaybackController or PlaybackManager via core) ---
    isReadyForTransition() {
        // Directly call static method or access via playbackManager if preferred
        return VideoPlaybackController.isReadyForTransition(this.core);
    }

    isSufficientlyPreloaded() {
        return VideoPlaybackController.isSufficientlyPreloaded(this.core);
    }
}

export default VideoState;
