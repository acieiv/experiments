/**
 * StallLogic.js
 * Manages the detection and handling of video stalling or excessive 'waiting' events.
 */
import settings from '../../config/settings.js';

class StallLogic {
    constructor(videoState, errorManager) {
        this.videoState = videoState;
        this.errorManager = errorManager; // To access shared properties like waitingCount, maxWaitingRetries, and to call handleVideoError.
        this.stallObservationTimeoutId = null;
        this._lastWaitTime = 0; // For debouncing waiting logs
    }

    /**
     * Handles a 'waiting' event from the video element.
     * Manages stall observation and can escalate to a full error if stalls persist.
     */
    handleWaiting() {
        const now = performance.now();
        if (now - this._lastWaitTime < 500 && this.errorManager.waitingCount > 0) { // Debounce
            return;
        }
        this._lastWaitTime = now;

        this.videoState.playing = false;
        this.errorManager.waitingCount++;

        if (this.videoState.playbackManager) {
            this.videoState.playbackManager.handleStutter();
        }

        this._logBufferInfo();

        if (settings.debug.enabled && window.debug) {
            window.debug.log(`StallLogic: Video waiting for ${this.videoState.source} (count: ${this.errorManager.waitingCount}, readyState: ${this.videoState.video?.readyState})`, 'warn');
        }

        const gentlePauseThreshold = settings.video?.gentlePauseWaitingCountThreshold || 3;
        const gentlePauseRecoveryTimeoutMs = settings.video?.gentlePauseRecoveryTimeoutMs || 2500;

        if (this.errorManager.waitingCount < gentlePauseThreshold && !this.errorManager.isLoading && !this.stallObservationTimeoutId) {
            if (this._tryGentlePause(gentlePauseRecoveryTimeoutMs)) {
                return; // Gentle pause initiated
            }
        }

        if (this.errorManager.waitingCount >= gentlePauseThreshold && 
            this.errorManager.waitingCount < this.errorManager.maxWaitingRetries && 
            !this.stallObservationTimeoutId && 
            !this.errorManager.isLoading) {
            if (this._trySeriousObservation()) {
                return; // Serious observation initiated
            }
        }

        if (this.errorManager.waitingCount >= this.errorManager.maxWaitingRetries && !this.errorManager.isLoading) {
            this._escalateToReload();
        }
    }

    _logBufferInfo() {
        if (!settings.debug.enabled || !window.debug || !this.videoState.video) return;

        let bufferInfo = 'N/A';
        const video = this.videoState.video;
        if (video.buffered && video.buffered.length > 0) {
            const currentTime = video.currentTime;
            let currentBufferEnd = 0;
            for (let i = 0; i < video.buffered.length; i++) {
                if (video.buffered.start(i) <= currentTime && currentTime < video.buffered.end(i)) {
                    currentBufferEnd = video.buffered.end(i);
                    break;
                }
            }
            if (currentBufferEnd === 0 && video.buffered.length > 0) {
                currentBufferEnd = video.buffered.end(video.buffered.length - 1);
            }
            bufferInfo = `Buffered: ${video.buffered.length} ranges, current end: ${currentBufferEnd.toFixed(2)}s. Ahead: ${(currentBufferEnd - currentTime).toFixed(2)}s`;
        }
        window.debug.log(`StallLogic: Buffer for ${this.videoState.source}: ${bufferInfo}`, 'info');
    }

    _tryGentlePause(recoveryTimeoutMs) {
        const video = this.videoState.video;
        if (video && (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA)) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`StallLogic: Gentle pause for ${this.videoState.source} (waitingCount: ${this.errorManager.waitingCount}). Pausing and observing for ${recoveryTimeoutMs / 1000}s.`, 'info');
            }
            video.pause();

            this.clearStallObservationTimeout(); // Clear previous if any
            this.stallObservationTimeoutId = setTimeout(() => {
                this.stallObservationTimeoutId = null;
                if (this.videoState.video && !this.videoState.video.paused && this.videoState.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`StallLogic: Video for ${this.videoState.source} recovered during gentle pause.`, 'info');
                    }
                    this.errorManager.resetCounters(); // Recovered
                } else {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`StallLogic: Video for ${this.videoState.source} did not recover during gentle pause. Escalating. readyState: ${this.videoState.video?.readyState}, paused: ${this.videoState.video?.paused}`, 'warn');
                    }
                    this.handleWaiting(); // Re-call to go through next logic path
                }
            }, recoveryTimeoutMs);
            return true;
        }
        return false;
    }

    _trySeriousObservation() {
        const video = this.videoState.video;
        const gentlePauseThreshold = settings.video?.gentlePauseWaitingCountThreshold || 3;
        const isFirstSeriousObservation = this.errorManager.waitingCount === gentlePauseThreshold;

        if (isFirstSeriousObservation || (video && (video.paused || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA))) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`StallLogic: Observing ${this.videoState.source} for 1s due to persistent waiting (count: ${this.errorManager.waitingCount})...`, 'info');
            }
            this.clearStallObservationTimeout();
            
            this.stallObservationTimeoutId = setTimeout(() => {
                this.stallObservationTimeoutId = null;
                const currentVideo = this.videoState.video; // Re-fetch in case it changed
                if (currentVideo && (currentVideo.paused || currentVideo.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) && !currentVideo.ended) {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`StallLogic: Video for ${this.videoState.source} still stalled after 1s serious observation. Triggering error handler. readyState: ${currentVideo.readyState}`, 'warn');
                    }
                    this.errorManager.waitingCount = this.errorManager.maxWaitingRetries; // Force escalation
                    this.errorManager.handleVideoError(new Error('Persistent stall after 1s observation'), 'stalled');
                } else if (currentVideo && !currentVideo.paused) {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`StallLogic: Video for ${this.videoState.source} recovered during 1s serious observation.`, 'info');
                    }
                    this.errorManager.resetCounters();
                } else {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`StallLogic: Video for ${this.videoState.source} state unclear after 1s serious observation (paused: ${currentVideo?.paused}, ended: ${currentVideo?.ended}, readyState: ${currentVideo?.readyState}). Assuming stall.`, 'warn');
                    }
                    this.errorManager.waitingCount = this.errorManager.maxWaitingRetries; 
                    this.errorManager.handleVideoError(new Error('Persistent stall after 1s observation - unclear state'), 'stalled');
                }
            }, 1000); // 1-second observation period
            return true;
        }
        return false;
    }

    _escalateToReload() {
        this.clearStallObservationTimeout();
        if (settings.debug.enabled && window.debug) {
            window.debug.log(`StallLogic: Max waiting events (${this.errorManager.maxWaitingRetries}) for ${this.videoState.source}, triggering error handler to reload.`, 'warn');
        }
        this.errorManager.handleVideoError(new Error('Excessive waiting - max retries, attempting reload'), 'waiting_max_retries');
    }

    clearStallObservationTimeout() {
        if (this.stallObservationTimeoutId) {
            clearTimeout(this.stallObservationTimeoutId);
            this.stallObservationTimeoutId = null;
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`StallLogic: Cleared pending stall observation timeout for ${this.videoState?.source}.`);
            }
        }
    }

    reset() {
        this.clearStallObservationTimeout();
        this._lastWaitTime = 0;
        // waitingCount is reset by VideoErrorManager's resetCounters
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`StallLogic: State reset for ${this.videoState?.source}.`);
        }
    }
}

export default StallLogic;
