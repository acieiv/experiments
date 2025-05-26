/**
 * VideoTransitionController.js
 * Manages the state and logic for video transitions.
 */
import settings from '../config/settings.js';

const READINESS_CHECK_INTERVAL = 500; // ms
const MAX_FAILED_TRANSITION_ATTEMPTS = 3;

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
        };

        // Transition parameters from settings
        this.transitionDuration = settings.video.transitionDuration;
        this.videoDisplayDuration = settings.video.videoDuration; // How long a video plays before attempting to switch
    }

    /**
     * Updates the transition controller state.
     * @param {number} deltaTime - Time since the last update in seconds.
     */
    update(deltaTime) {
        if (this.state.isTransitioning) {
            this._updateActiveTransition(deltaTime);
        } else {
            this._checkAndStartTransition(deltaTime);
        }
    }

    /**
     * @private
     * Updates the progress of an active transition.
     * @param {number} deltaTime - Time since the last update in seconds.
     */
    _updateActiveTransition(deltaTime) {
        const effectiveDuration = this.state.isForced ? this.transitionDuration * 0.5 : this.transitionDuration;
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

        if (this.state.timeSinceLastTransition < this.videoDisplayDuration) {
            return; // Not time yet
        }

        if (this._areVideosReadyForTransition()) {
            console.log("Videos ready, starting transition.");
            this._initiateTransition(false); // Not forced
        } else {
            // Videos not ready, check if we should force or retry
            if (this.state.timeSinceLastTransition >= this.videoDisplayDuration * 2) { // Waited too long
                this.state.failedAttempts++;
                console.warn(`Transition delayed, attempt ${this.state.failedAttempts}/${MAX_FAILED_TRANSITION_ATTEMPTS}`);
                if (this.state.failedAttempts >= MAX_FAILED_TRANSITION_ATTEMPTS) {
                    console.warn("Max failed attempts reached, forcing transition.");
                    this.onForceTransition();
                    this._initiateTransition(true); // Force transition
                } else {
                    // Reset timer to try again after a delay, but keep failedAttempts count
                    this.state.timeSinceLastTransition = this.videoDisplayDuration;
                }
            }
        }
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
        // Do not reset failedAttempts here, only upon successful *non-forced* completion
        
        this.onTransitionStart({ forced: isForced });

        // Ensure next video is visible if it's not already
        if (this.videoPool.nextState) {
            this.videoPool.nextState.mesh.visible = true;
            if (isForced) { // If forced, immediately set next video opacity to a low value
                this.videoPool.nextState.setOpacity(0.1);
            }
        }
    }

    /**
     * @private
     * Finalizes a completed transition.
     */
    _completeTransition() {
        const nextVideoIsPrepared = this.videoPool.nextState?.isSufficientlyPreloaded();
        const canAdvance = nextVideoIsPrepared || this.state.isForced;

        if (canAdvance) {
            this.videoPool.advance();
            
            const reason = nextVideoIsPrepared ? "next video ready" : (this.state.isForced ? "forced" : "max attempts met conditions");
            console.log(`Transition complete (${reason}). Advancing video pool.`);

            if (nextVideoIsPrepared && !this.state.isForced) {
                this.state.failedAttempts = 0; // Reset on successful, non-forced
            }
        } else {
            // This case should ideally be rare if _checkAndStartTransition logic is robust
            // It means we started a transition but the next video *still* isn't ready and it wasn't forced.
            this.state.failedAttempts++;
            console.warn(`Transition completion attempt ${this.state.failedAttempts}/${MAX_FAILED_TRANSITION_ATTEMPTS} failed: Next video not ready, and not a forced transition.`);
            
            // Reset progress to try fading again or re-evaluate.
            // This might lead to a loop if the next video never becomes ready.
            // Consider if we should force here or revert. For now, reset and let _checkAndStartTransition handle.
            this.state.progress = 0; 
        }

        this.state.isTransitioning = false;
        // this.state.progress = 0; // Already handled or set for retry
        this.state.timeSinceLastTransition = 0;
        this.state.readinessChecks = 0;
        const wasForced = this.state.isForced;
        this.state.isForced = false; // Reset forced flag for the next cycle

        this.onTransitionComplete({ forced: wasForced, advanced: canAdvance });
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

        console.log(`Video readiness check #${this.state.readinessChecks}: Active: ${activeReady}, Next: ${nextReady}`);
        
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
