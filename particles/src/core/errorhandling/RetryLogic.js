/**
 * RetryLogic.js
 * Handles the logic for retrying video playback after an error.
 */
import settings from '../../config/settings.js';
import VideoPlaybackController from '../video/VideoPlaybackController.js';

class RetryLogic {
    constructor(videoState, errorManager) {
        this.videoState = videoState;
        this.errorManager = errorManager; // To access shared properties like retryCount, maxRetries, and to call play.
        this.retryTimeoutId = null;
    }

    /**
     * Attempts to retry video playback.
     * Manages its own timeout for the retry attempt.
     * @returns {boolean} True if a retry was scheduled, false otherwise (e.g., max retries reached).
     */
    attemptRetry() {
        if (this.errorManager.retryCount >= this.errorManager.maxRetries) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`RetryLogic: Max retries (${this.errorManager.maxRetries}) reached for ${this.videoState.source}. No more retries.`, 'error');
            }
            return false; // Max retries reached
        }

        this.errorManager.retryCount++;
        const retryDelay = 1000 * Math.pow(2, this.errorManager.retryCount - 1); // Exponential backoff

        if (settings.debug.enabled && window.debug) {
            window.debug.log(`RetryLogic: Retrying playback for ${this.videoState.source} (attempt ${this.errorManager.retryCount}/${this.errorManager.maxRetries}) in ${retryDelay / 1000}s`, 'warn');
        }

        // Clear previous retry timeout if any (should be managed by VideoErrorManager, but good practice)
        if (this.retryTimeoutId) {
            clearTimeout(this.retryTimeoutId);
        }

        this.retryTimeoutId = setTimeout(async () => {
            this.retryTimeoutId = null; // Clear the ID once the timeout executes

            if (!this.videoState || this.videoState.isPermanentlyFailed || !this.videoState.video) {
                if (settings.debug.enabled && window.debug) {
                    const reason = !this.videoState ? "VideoState is null" :
                        this.videoState.isPermanentlyFailed ? "VideoState is permanently failed" :
                        !this.videoState.video ? "Video element is null" : "Unknown reason";
                    window.debug.log(`RetryLogic: Aborting retry for ${this.videoState?.source || 'unknown source'} because ${reason}.`, 'warn');
                }
                this.errorManager.isLoading = false; // Ensure isLoading is reset if we abort here
                return;
            }

            const currentVideoElement = this.videoState.video;
            let attemptResumeOnCanPlay, resumeErrorListener; // Declare here for cleanup

            try {
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`RetryLogic: Pausing video before reload for ${this.videoState.source}`);
                }
                currentVideoElement.pause();

                const resumeTime = currentVideoElement.currentTime;
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`RetryLogic: Storing resume time ${resumeTime.toFixed(2)}s for ${this.videoState.source}`);
                }

                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`RetryLogic: Reloading video source ${this.videoState.source}`);
                }

                attemptResumeOnCanPlay = () => {
                    if (!this.videoState || !this.videoState.video || this.videoState.isPermanentlyFailed) {
                        if (settings.debug.enabled && window.debug) window.debug.log(`RetryLogic: Aborting resumeOnCanPlay for ${this.videoState?.source || 'unknown'} due to invalid state.`, 'warn');
                        cleanupListeners();
                        return;
                    }
                    const videoForResume = this.videoState.video;
                    cleanupListeners();

                    if (resumeTime > 0 && isFinite(resumeTime)) {
                        if (settings.debug.enabled && window.debug) {
                            window.debug.log(`RetryLogic: 'canplay' event after reload for ${this.videoState.source}. Attempting to seek to ${resumeTime.toFixed(2)}s. Current readyState: ${videoForResume.readyState}`);
                        }
                        videoForResume.currentTime = resumeTime;
                    }

                    VideoPlaybackController.play(this.videoState).then(() => {
                        if (settings.debug.enabled && window.debug) {
                            window.debug.log(`RetryLogic: Retry ${this.errorManager.retryCount} for ${this.videoState.source} initiated play after potential resume.`, 'info');
                        }
                        // Successful play should trigger errorManager.resetCounters() via 'playing' event
                    }).catch(playError => {
                        if (settings.debug.enabled && window.debug) {
                            window.debug.log(`RetryLogic: VideoPlaybackController.play() failed after resume attempt for ${this.videoState?.source || 'unknown'}: ${playError.message || playError}`, 'warn');
                        }
                        // If play fails, VideoErrorManager's main error handler will catch it if it bubbles or if another error event is fired.
                        // This specific retry attempt is considered failed. The errorManager will decide if further retries are possible.
                        // We might need to signal failure more directly to errorManager here.
                        // For now, rely on the video element firing another 'error' event or the play promise rejection being handled.
                        // If this was the last retry, errorManager will set isLoading = false.
                    });
                };

                resumeErrorListener = (err) => {
                    if (!this.videoState || !this.videoState.video) {
                        if (settings.debug.enabled && window.debug) window.debug.log(`RetryLogic: Aborting resumeErrorListener for ${this.videoState?.source || 'unknown'} due to invalid state.`, 'warn');
                        cleanupListeners();
                        return;
                    }
                    cleanupListeners();
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`RetryLogic: 'error' event during reload/resume for ${this.videoState.source}: ${err.message || err}`, 'error');
                    }
                    // This error means the reload itself failed.
                    // Let VideoErrorManager handle this as a new error event for the current retry attempt.
                    // This might trigger another call to handleVideoError.
                    // If this was the last retry, errorManager will set isLoading = false.
                };
                
                const cleanupListeners = () => {
                    if (currentVideoElement) {
                        // Note: For .bind(this) to be removable, the original function reference is needed.
                        // However, since these are { once: true }, they remove themselves after firing.
                        // If they weren't `once`, we'd need to store the bound functions to remove them.
                        currentVideoElement.removeEventListener('canplay', boundAttemptResumeOnCanPlay);
                        currentVideoElement.removeEventListener('error', boundResumeErrorListener);
                    }
                };

                // Bind 'this' context for the event handlers
                const boundAttemptResumeOnCanPlay = attemptResumeOnCanPlay.bind(this);
                const boundResumeErrorListener = resumeErrorListener.bind(this);

                currentVideoElement.addEventListener('canplay', boundAttemptResumeOnCanPlay, { once: true });
                currentVideoElement.addEventListener('error', boundResumeErrorListener, { once: true });

                currentVideoElement.load(); // Reload the video

            } catch (e) {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`RetryLogic: Error during retry setup for ${this.videoState?.source || 'unknown source'}: ${e.message || e}`, 'warn');
                }
                cleanupListeners(); // Ensure listeners are cleaned up
                // This catch means the setup for load() failed.
                // This is a failure of the current retry attempt.
                // VideoErrorManager's main loop will determine if more retries are allowed.
                // If this was the last retry, errorManager will set isLoading = false.
            }
            // isLoading is managed by VideoErrorManager. It remains true during retries.
            // It's set to false if max retries are hit or if play is successful (via resetCounters).
        }, retryDelay);

        return true; // Retry was scheduled
    }

    clearRetryTimeout() {
        if (this.retryTimeoutId) {
            clearTimeout(this.retryTimeoutId);
            this.retryTimeoutId = null;
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`RetryLogic: Cleared pending retry timeout for ${this.videoState?.source}.`);
            }
        }
    }

    reset() {
        this.clearRetryTimeout();
        // No other internal state like retryCount is managed directly within RetryLogic itself,
        // as errorManager.retryCount is used.
        if (settings.debug.verboseLoggingEnabled && window.debug && this.videoState) {
            window.debug.log(`RetryLogic: Reset for ${this.videoState.source}.`);
        }
    }
}

export default RetryLogic;
