/**
 * VideoErrorManager.js
 * Centralizes error handling and retry logic for a VideoState instance.
 */
import settings from '../config/settings.js';
import DebugOverlay from '../utils/DebugOverlay.js';

class VideoErrorManager {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance;
        this.video = videoStateInstance.video; // Assuming video element is available

        this.retryCount = 0;
        this.maxRetries = 3; // Default, can be overridden by options in VideoState
        this.waitingCount = 0;
        this.maxWaitingRetries = 5; // Default
        this._lastWaitTime = 0; // For debouncing waiting logs
    }

    // Called when a video error, stall, or excessive waiting occurs
    handleVideoError(error, type = 'general') {
        if (settings.debug.enabled && window.debug) {
            const message = `VideoErrorManager: Error for ${this.videoState.source} (type: ${type}): ${error.message || error}`;
            window.debug.log(message, 'error');
        }
        this.videoState.playing = false; // Ensure playing flag is false

        if (this.videoState.playbackManager) {
             // Notify playback manager about the error/stutter if it's a relevant type
            if (type === 'stalled' || type === 'waiting') {
                this.videoState.playbackManager.handleStutter();
            }
        }

        // If the video has naturally ended its single playthrough, don't retry.
        // The hasEnded flag is only set for isCurrentUserVisible videos when they actually end.
        if (this.videoState.hasEnded) { 
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: Suppressing retry for ${this.videoState.source} as 'hasEnded' is true.`, 'info');
            }
            this.resetCounters(); // Its "active play" session is over.
            return; // Do not proceed to retry logic
        }

        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: Retrying playback for ${this.videoState.source} (attempt ${this.retryCount}/${this.maxRetries})`, 'warn');
            }
            
            setTimeout(() => {
                if (this.video) {
                    if (settings.debug.verboseLoggingEnabled && window.debug) {
                        window.debug.log(`VideoErrorManager: Reloading video source ${this.videoState.source}`);
                    }
                    this.video.load(); // Reload the video
                    this.videoState.play().catch(e => { // Use VideoState's play method
                        if (settings.debug.enabled && window.debug) {
                            window.debug.log(`VideoErrorManager: Retry ${this.retryCount} for ${this.videoState.source} failed: ${e.message || e}`, 'warn');
                        }
                        if (this.retryCount >= this.maxRetries) {
                            if (settings.debug.enabled && window.debug) {
                                window.debug.log(`VideoErrorManager: Max retries (${this.maxRetries}) reached for ${this.videoState.source}. Playback failed.`, 'error');
                            }
                        }
                    });
                } else {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoErrorManager: Video element not available for retry for ${this.videoState.source}`, 'warn');
                    }
                }
            }, 1000 * this.retryCount); // Exponential backoff for retries could be considered
        } else {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: Max retries (${this.maxRetries}) reached for ${this.videoState.source}. No more retries.`, 'error');
            }
            // Potentially emit an event or call a callback to signal permanent failure
        }
    }

    // Specifically for 'waiting' events that might lead to a reload
    handleWaiting() {
        const now = performance.now();
        if (now - this._lastWaitTime < 500) { // Debounce for 500ms
            return;
        }
        this._lastWaitTime = now;

        this.videoState.playing = false; // Video is not actively playing if waiting
        this.waitingCount++;
        
        if (this.videoState.playbackManager) {
            this.videoState.playbackManager.handleStutter(); // Treat waiting as a stutter
        }

        if (settings.debug.verboseLoggingEnabled && window.debug) { // Make this log verbose
            window.debug.log(`VideoErrorManager: Video waiting for ${this.videoState.source} (count: ${this.waitingCount})`, 'warn');
        }

        if (this.waitingCount >= this.maxWaitingRetries) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: Too many waiting events for ${this.videoState.source}, triggering error handler to reload.`, 'warn');
            }
            this.handleVideoError(new Error('Excessive waiting'), 'waiting');
            this.waitingCount = 0; // Reset after triggering error
        }
    }

    // Reset counters when video successfully loads or plays
    resetCounters() {
        this.retryCount = 0;
        this.waitingCount = 0;
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoErrorManager: Error/waiting counters reset for ${this.videoState.source}`);
        }
    }

    // Initialize with options if provided by VideoState
    initializeOptions(options) {
        if (options) {
            this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
            this.maxWaitingRetries = options.maxWaitingRetries !== undefined ? options.maxWaitingRetries : this.maxWaitingRetries;
        }
    }
}

export default VideoErrorManager;
