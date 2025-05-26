/**
 * VideoTransitionController.js
 * Manages the state and logic for video transitions.
 */
import settings from '../../config/settings.js'; // Adjusted
import DebugOverlay from '../../utils/DebugOverlay.js'; // Adjusted

const READINESS_CHECK_INTERVAL = 500; // ms
// const MAX_FAILED_TRANSITION_ATTEMPTS = 3; // No longer used

class VideoTransitionController {
    /**
     * @param {VideoPool} videoPool - The video pool to control.
     * @param {object} [options={}] - Configuration options.
     * @param {function} [options.onTransitionStart] - Callback when transition starts.
     * @param {function} [options.onTransitionComplete] - Callback when transition completes.
     * @param {function} [options.onForceTransition] - Callback when transition is forced.
     */
    constructor(videoPool, options = {}) {
        this.videoPool = videoPool;
        this.onTransitionStart = options.onTransitionStart || (() => {});
        this.onTransitionComplete = options.onTransitionComplete || (() => {});
        this.onForceTransition = options.onForceTransition || (() => {});

        this.state = {
            isTransitioning: false,
            progress: 0, // Transition progress (0-1)
            timeSinceLastTransition: 0, // Time elapsed since the last transition completed or video started
            readinessChecks: 0,
            lastReadinessCheckTime: 0,
            failedAttempts: 0, // Failed attempts to start a transition due to video readiness
            isForced: false, // True if the current or last transition was forced
            isWaitingForNextBuffer: false, // True if waiting for the next video to buffer
            nextBufferWaitTime: 0, // Time spent waiting for the next video's buffer
        };

        // Transition parameters from settings
        this.transitionDuration = settings.video.transitionDuration;
        this.videoDisplayDuration = settings.video.videoDuration; // How long a video plays before attempting to switch
        this.maxNextBufferWaitDuration = settings.video.maxNextBufferWaitDuration; // Max time to wait for next buffer
    }

    /**
     * Updates the transition controller state.
     * @param {number} deltaTime - Time since the last update in seconds.
     */
    update(deltaTime) {
        if (this.state.isTransitioning) {
            this._updateActiveTransition(deltaTime);
        } else {
            // Pass deltaTime to _checkAndStartTransition
            this._checkAndStartTransition(deltaTime);
        }
    }

    /**
     * @private
     * Updates the progress of an active transition.
     * @param {number} deltaTime - Time since the last update in seconds.
     */
    _updateActiveTransition(deltaTime) {
        let effectiveDuration = this.transitionDuration;
        if (this.state.isForced) {
            effectiveDuration = 0.2; // Make forced transitions very fast (e.g., 0.2 seconds)
        }
        this.state.progress += deltaTime / effectiveDuration;

        if (this.state.progress >= 1.0) {
            this._completeTransition();
        } else {
            const easedProgress = this._easeInOutCubic(this.state.progress);
            const opacityFactor = this.state.isForced ? 0.8 : 1.0;
            
            this.videoPool.activeState?.setOpacity((1.0 - easedProgress) * opacityFactor);
            this.videoPool.nextState?.setOpacity(easedProgress * opacityFactor);
        }
    }

    /**
     * @private
     * Checks if conditions are met to start a new transition.
     * @param {number} deltaTime - Time since the last update in seconds.
     */
    _checkAndStartTransition(deltaTime) {
        this.state.timeSinceLastTransition += deltaTime;
        const activeVideo = this.videoPool.activeState;

        if (!activeVideo) { return; } // No active video to check

        // Immediately force transition if the active video is permanently failed
        if (activeVideo.isPermanentlyFailed) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoTransitionController: Active video ${activeVideo.source} is permanently failed. Forcing transition.`, 'warn');
            }
            this.onForceTransition();
            this._initiateTransition(true); // true for forced
            if (activeVideo) { activeVideo.hasEnded = true; } // Mark as ended to ensure it's processed out
            return;
        }

        let attemptTransition = false;
        let transitionReason = "";
        let forceTransition = false;

        // Primary Trigger: Video has naturally ended
        if (activeVideo.hasEnded) {
            attemptTransition = true;
            transitionReason = `Video ${activeVideo.source} reported 'ended'.`;
            forceTransition = true; // Ended video should transition quickly
        }

        // Fallback Trigger: Timeout
        if (!attemptTransition) {
            let actualDuration = activeVideo.video?.duration;
            let timeoutDuration = this.videoDisplayDuration;
            if (actualDuration && !isNaN(actualDuration) && actualDuration > 0) {
                timeoutDuration = actualDuration + 1.0; // Grace period
            }

            if (this.state.timeSinceLastTransition >= timeoutDuration) {
                // Timeout reached, now check next video's buffer
                const nextVideo = this.videoPool.nextState;
                const nextVideoReady = nextVideo?.isSufficientlyPreloaded();

                if (this.state.isWaitingForNextBuffer) {
                    this.state.nextBufferWaitTime += deltaTime;
                    if (nextVideoReady) {
                        attemptTransition = true;
                        transitionReason = `Video ${activeVideo.source} timeout reached, next video ${nextVideo.source} now buffered after waiting ${this.state.nextBufferWaitTime.toFixed(2)}s.`;
                        forceTransition = false; // Not forced, next video is ready
                        this._resetWaitingForNextBufferState();
                    } else if (this.state.nextBufferWaitTime >= this.maxNextBufferWaitDuration) {
                        attemptTransition = true;
                        transitionReason = `Video ${activeVideo.source} timeout reached, and max wait time (${this.maxNextBufferWaitDuration}s) for next video ${nextVideo?.source || 'N/A'} exceeded. Forcing.`;
                        forceTransition = true;
                        this._resetWaitingForNextBufferState();
                    } else {
                        // Still waiting, do nothing this frame
                        if (settings.debug.verboseLoggingEnabled && window.debug) {
                            window.debug.log(`VideoTransitionController: Waiting for next video buffer. Waited ${this.state.nextBufferWaitTime.toFixed(2)}s / ${this.maxNextBufferWaitDuration}s for ${nextVideo?.source}`);
                        }
                    }
                } else { // Not currently waiting, this is the first time timeout is hit
                    if (nextVideoReady) {
                        attemptTransition = true;
                        transitionReason = `Video ${activeVideo.source} timeout reached, next video ${nextVideo.source} is ready.`;
                        forceTransition = false; // Next video is ready
                    } else {
                        if (settings.debug.enabled && window.debug) {
                            window.debug.log(`VideoTransitionController: Video ${activeVideo.source} timeout. Next video ${nextVideo?.source || 'N/A'} not ready. Starting wait period.`);
                        }
                        this.state.isWaitingForNextBuffer = true;
                        this.state.nextBufferWaitTime = 0;
                        // Don't transition yet, wait for next buffer or maxNextBufferWaitDuration
                    }
                }
            }
        }

        if (attemptTransition) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoTransitionController: ${transitionReason} Initiating transition (forced: ${forceTransition}).`);
            }
            if (forceTransition) {
                this.onForceTransition(); // Call specific callback if forced
            }
            this._initiateTransition(forceTransition);
            if (activeVideo) { activeVideo.hasEnded = false; } // Reset flag
        }
    }

    /**
     * @private
     * Resets the state variables related to waiting for the next video's buffer.
     */
    _resetWaitingForNextBufferState() {
        this.state.isWaitingForNextBuffer = false;
        this.state.nextBufferWaitTime = 0;
    }
    
    /**
     * @private
     * Initiates a transition.
     * @param {boolean} isForced - Whether the transition is forced.
     */
    _initiateTransition(isForced) {
        this.state.isTransitioning = true;
        this.state.progress = 0;
        this.state.isForced = isForced;
        this.state.readinessChecks = 0;
        this._resetWaitingForNextBufferState(); // Reset waiting state when a transition starts
        // Do not reset failedAttempts here, only upon successful *non-forced* completion
        
        if (this.videoPool.activeState) { // Pause active video regardless of forced, but with reason
            this.videoPool.activeState.pause('transition'); 
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoTransitionController: Paused active video ${this.videoPool.activeState.source} with reason 'transition'.`);
            }
        }
        
        this.onTransitionStart({ forced: isForced });

        // Ensure next video is visible if it's not already
        if (this.videoPool.nextState) {
            if (this.videoPool.nextState.mesh) { // Check if mesh exists
                this.videoPool.nextState.mesh.visible = true;
            }
            if (isForced) { // If forced, immediately set next video opacity to a low value
                this.videoPool.nextState.setOpacity(0.1);
            }
        }
    }

    /**
     * @private
     * Finalizes a completed transition.
     */
    async _completeTransition() { // Make the method async
        const nextVideoIsPrepared = this.videoPool.nextState?.isSufficientlyPreloaded();
        const canAdvance = nextVideoIsPrepared || this.state.isForced;
        let advancedSuccessfully = false; // Keep track if advance was successful

        if (canAdvance) {
            try {
                await this.videoPool.advance(); // ADD await HERE
                advancedSuccessfully = true;
                
                const reason = nextVideoIsPrepared ? "next video ready" : (this.state.isForced ? "forced" : "max attempts met conditions");
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoTransitionController: Transition complete (${reason}). Advancing video pool.`);
                }

                if (nextVideoIsPrepared && !this.state.isForced) {
                    this.state.failedAttempts = 0; 
                }
            } catch (error) {
                advancedSuccessfully = false;
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoTransitionController: Error during videoPool.advance(): ${error.message}`, 'error');
                }
                // Potentially handle the error, e.g., by trying to reset or recover
            }
        } else {
            // This case should ideally be rare if _checkAndStartTransition logic is robust
            // It means we started a transition but the next video *still* isn't ready and it wasn't forced.
            // Since MAX_FAILED_TRANSITION_ATTEMPTS is removed, this path might need review if it's hit.
            // For now, we'll keep the original failedAttempts increment for logging if this path is taken.
            this.state.failedAttempts++; 
            if (settings.debug.enabled && window.debug) {
                 window.debug.log(`VideoTransitionController: Transition completion failed: Next video not ready, and not a forced transition. Attempt: ${this.state.failedAttempts}`, 'warn');
            }
            
            // Reset progress to try fading again or re-evaluate.
            this.state.progress = 0; 
        }

        this.state.isTransitioning = false;
        // this.state.progress = 0; // Resetting progress above if completion failed.
        this.state.timeSinceLastTransition = 0;
        this.state.readinessChecks = 0;
        this._resetWaitingForNextBufferState(); // Also reset waiting state on completion
        const wasForced = this.state.isForced; // Capture before reset
        this.state.isForced = false; 

        this.onTransitionComplete({ forced: wasForced, advanced: advancedSuccessfully });
    }

    /**
     * @private
     * Checks if the active and next videos are ready for a transition.
     * @returns {boolean} True if videos are ready.
     */
    _areVideosReadyForTransition() {
        const now = performance.now();
        if (now - this.state.lastReadinessCheckTime < READINESS_CHECK_INTERVAL) {
            return false; // Debounce readiness checks
        }
        this.state.lastReadinessCheckTime = now;
        this.state.readinessChecks++;

        const activeReady = this.videoPool.activeState?.isReadyForTransition();
        const nextReady = this.videoPool.nextState?.isSufficientlyPreloaded(); // Still good to check, though active is key

        if (settings.debug.verboseLoggingEnabled && window.debug) { // Made this log verbose
            window.debug.log(`VideoTransitionController: Video readiness check #${this.state.readinessChecks}: Active: ${activeReady}, Next: ${nextReady}`);
        }
        
        // Primary condition: active video must be ready to fade out.
        // Next video's readiness is also critical for starting the transition smoothly.
        return activeReady === true && nextReady === true;
    }

    /**
     * Easing function for smooth transitions.
     * @private
     * @param {number} t - Input value (0-1)
     * @returns {number} Eased value (0-1)
     */
    _easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    /**
     * Gets the current transition progress.
     * @returns {number}
     */
    getTransitionProgress() {
        return this.state.progress;
    }

    /**
     * Checks if a transition is currently active.
     * @returns {boolean}
     */
    isTransitioning() {
        return this.state.isTransitioning;
    }
    
    /**
     * Checks if the last or current transition was forced.
     * @returns {boolean}
     */
    wasForced() {
        return this.state.isForced;
    }
}

export default VideoTransitionController;
