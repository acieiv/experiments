/**
 * VideoErrorManager.js
 * Centralizes error handling and retry logic for a VideoState instance.
 */
import settings from '../../config/settings.js'; // Adjusted path
import RetryLogic from '../errorhandling/RetryLogic.js'; // Adjusted path
import StallLogic from '../errorhandling/StallLogic.js'; // Adjusted path

class VideoErrorManager {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance; // Instance of VideoStateCore
        // this.video is accessed via this.videoState.video

        this.retryCount = 0;
        this.maxRetries = 3; 
        this.waitingCount = 0;
        this.maxWaitingRetries = 5;

        this.isLoading = false; 

        this.retryLogic = new RetryLogic(this.videoState, this);
        this.stallLogic = new StallLogic(this.videoState, this);
    }

    get video() { // Convenience getter
        return this.videoState ? this.videoState.video : null;
    }

    handleVideoError(error, type = 'general') {
        if (this.isLoading && type !== 'stalled' && type !== 'waiting' && type !== 'initialization_element_creation' && type !== 'preload') {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: Already handling an error for ${this.videoState.source}. Ignoring new error: ${error.message || error}`, 'warn');
            }
            return;
        }
        this.isLoading = true;

        this.retryLogic.clearRetryTimeout();
        this.stallLogic.clearStallObservationTimeout();

        if (settings.debug.enabled && window.debug) {
            const message = `VideoErrorManager: Error for ${this.videoState.source} (type: ${type}): ${error.message || error}`;
            window.debug.log(message, 'error');
        }
        
        if (this.videoState) { // Ensure videoState exists
            this.videoState.playing = false; // Update playing status on VideoStateCore
        }


        if (this.videoState?.playbackManager) {
            if (type === 'stalled' || type === 'waiting' || type === 'waiting_max_retries') {
                this.videoState.playbackManager.handleStutter();
            }
        }

        if (this.videoState?.hasEnded) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: Suppressing retry for ${this.videoState.source} as 'hasEnded' is true.`, 'info');
            }
            this.resetCounters(); // Still reset counters and isLoading
            // isLoading is set to false in resetCounters
            return;
        }

        const retryScheduled = this.retryLogic.attemptRetry(type); // Pass type to retryLogic

        if (!retryScheduled) { 
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: Max retries reached or retry aborted for ${this.videoState.source}. Marking as permanently failed.`, 'error');
            }
            this.isLoading = false; // Ensure isLoading is false if no retry is scheduled
            if (this.videoState) {
                this.videoState.isPermanentlyFailed = true;
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoErrorManager: Marked ${this.videoState.source} as permanently failed.`, 'error');
                }
            }
        }
        // If retryScheduled, isLoading remains true until success (resetCounters) or final failure.
    }

    handleWaiting() {
        this.stallLogic.handleWaiting();
    }

    resetCounters() {
        if (!this.videoState) { // Guard if videoState somehow becomes null
             if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoErrorManager: resetCounters called but videoState is null.`, 'warn');
            }
            this.isLoading = false; // Ensure isLoading is reset
            return;
        }
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoErrorManager: Resetting counters for ${this.videoState.source}. Current retryCount: ${this.retryCount}, waitingCount: ${this.stallLogic.waitingCount}, isLoading: ${this.isLoading}`);
        }

        this.retryCount = 0; // Managed by RetryLogic instance now
        // this.waitingCount = 0; // Managed by StallLogic instance now
        this.isLoading = false;

        this.retryLogic.reset(); // Resets internal retryCount and clears timeout
        this.stallLogic.reset(); // Resets internal waitingCount and clears timeout
        
        this.videoState.isAttemptingAutoResume = false;
        this.videoState.autoResumeAttempts = 0;

        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoErrorManager: Error/waiting and smart resume attempt counters reset for ${this.videoState.source}`);
        }
    }

    initializeOptions(options) {
        if (options) {
            this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
            // Pass maxRetries to RetryLogic
            if (this.retryLogic) {
                this.retryLogic.maxRetries = this.maxRetries;
            }
            
            this.maxWaitingRetries = options.maxWaitingRetries !== undefined ? options.maxWaitingRetries : this.maxWaitingRetries;
            // Pass maxWaitingRetries to StallLogic
            if (this.stallLogic) {
                this.stallLogic.maxWaitingRetries = this.maxWaitingRetries;
            }
        }
    }
}

export default VideoErrorManager;
