/**
 * VideoPlaybackManager.js
 * Manages playback state, buffering, and playback rate for a VideoState instance.
 */

class VideoPlaybackManager {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance;
        this.video = videoStateInstance.video; // Assuming video element is available

        // Properties to be managed by this class
        this.playbackState = 'initializing'; // initializing, buffering, playing, ready
        this.minPlaybackTime = 3; // Seconds of successful playback required
        this.playbackStartTime = 0; // When stable playback began
        this.lastStutterTime = 0; // When last stutter occurred
        
        this.minBufferForPlayback = 4; // Start playing with 4s buffer
        this.minBufferForTransition = 6; // Allow transition with 6s buffer
        this.isBuffering = false;
        this.playbackRate = 1.0;
        this.lastBufferCheck = 0;
        this.bufferCheckInterval = 500; // Check buffer every 500ms
    }

    updatePlaybackState(bufferAhead) {
        const now = performance.now();
        const oldState = this.playbackState;

        switch (this.playbackState) {
            case 'initializing':
                if (this.videoState.loaded && this.videoState.playing) {
                    this.playbackState = 'buffering';
                }
                break;
            case 'buffering':
                //readyState 3 is HAVE_FUTURE_DATA - enough data for current and some future frames
                //readyState 4 is HAVE_ENOUGH_DATA - enough data to play through to the end, likely
                if (bufferAhead >= this.minBufferForPlayback && this.video.readyState >= 3) { 
                    this.playbackState = 'playing';
                    this.playbackStartTime = now;
                }
                break;
            case 'playing':
                if (now - this.playbackStartTime > this.minPlaybackTime * 1000 &&
                    now - this.lastStutterTime > this.minPlaybackTime * 1000) {
                    this.playbackState = 'ready';
                }
                break;
            case 'ready':
                // Stay in ready state unless a stutter occurs (handled by event manager)
                break;
        }
        if (oldState !== this.playbackState) {
            console.log(`VideoPlaybackManager: State for ${this.videoState.source} → ${this.playbackState} (from ${oldState})`);
        }
    }

    hasEnoughBuffer(forTransition = false) {
        if (!this.video) return false;
        
        const buffered = this.video.buffered;
        const currentTime = this.video.currentTime;
        let currentBufferAhead = 0;
        
        for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
                currentBufferAhead = buffered.end(i) - currentTime;
                break;
            }
        }
        
        this.updatePlaybackState(currentBufferAhead);
        this.adjustPlaybackRate(currentBufferAhead);
        
        const threshold = forTransition ? this.minBufferForTransition : this.minBufferForPlayback;
        return currentBufferAhead >= threshold;
    }

    adjustPlaybackRate(bufferAhead) {
        if (!this.video) return;
        
        let targetRate = 1.0;
        switch (this.playbackState) {
            case 'buffering':
                targetRate = bufferAhead < this.minBufferForPlayback ? 0.5 : 0.7;
                this.isBuffering = true;
                break;
            case 'playing':
                targetRate = bufferAhead < this.minBufferForPlayback ? 0.7 : 0.9;
                this.isBuffering = bufferAhead < this.minBufferForPlayback;
                break;
            case 'ready':
                targetRate = 1.0; // Always aim for 1.0x when ready, don't try to speed up
                this.isBuffering = false;
                break;
            default:
                targetRate = 0.7;
                this.isBuffering = true;
        }
        
        const adjustmentRate = this.playbackState === 'ready' ? 0.15 : 0.1;
        this.playbackRate = this.playbackRate + (targetRate - this.playbackRate) * adjustmentRate;
        
        if (Math.abs(this.video.playbackRate - this.playbackRate) > 0.05) {
            this.video.playbackRate = this.playbackRate;
            // console.log(
            //     `VideoPlaybackManager: Adjusting rate for ${this.videoState.source}:`,
            //     `${this.video.playbackRate.toFixed(2)}x (target: ${targetRate.toFixed(2)}x, buffer: ${bufferAhead.toFixed(1)}s, state: ${this.playbackState})`
            // );
        }
    }

    isReadyForTransition() {
        // For a video to be ready for transition (either as active or next):
        // - It must be loaded and the video element must exist.
        // - It must not have ended.
        // - It must have at least HAVE_FUTURE_DATA (readyState 3).
        // We remove checks for `!this.videoState.playing` and `this.video.paused` here,
        // as a preloading 'next' video will be paused and not yet 'playing'.
        // The actual playback readiness is then determined by buffer levels and playbackState.
        if (!this.videoState.loaded || !this.video || this.video.ended || this.video.readyState < 3) {
            return false;
        }

        let bufferAhead = 0;
        const currentTime = this.video.currentTime;
        const buffered = this.video.buffered;
        for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
                bufferAhead = buffered.end(i) - currentTime;
                break;
            }
        }

        const playbackTime = this.playbackState === 'ready' ? performance.now() - this.playbackStartTime : 0;
        const hasPlayedLongEnough = playbackTime > this.minPlaybackTime * 1000;
        
        let isReady = false;
        if (this.playbackState === 'ready' && hasPlayedLongEnough) {
            isReady = bufferAhead >= Math.min(1, this.minBufferForTransition / 4);
        } else if (bufferAhead >= this.minBufferForTransition * 2) {
            isReady = true;
        } else {
            isReady = bufferAhead >= this.minBufferForTransition;
        }
        
        // if (!isReady) {
        //     console.log(
        //         `VideoPlaybackManager: Video not ready for transition ${this.videoState.source}`,
        //         `(buffer: ${bufferAhead.toFixed(1)}s/${this.minBufferForTransition}s, state: ${this.playbackState}, played: ${(playbackTime/1000).toFixed(1)}s/${this.minPlaybackTime}s)`
        //     );
        // }
        return isReady;
    }

    isSufficientlyPreloaded() {
        if (!this.video || !this.videoState.loaded || this.video.readyState < 3) {
            return false;
        }
        const buffered = this.video.buffered;
        if (buffered.length === 0) return false;

        let maxContinuousBuffer = 0;
        for (let i = 0; i < buffered.length; i++) {
            const duration = buffered.end(i) - buffered.start(i);
            if (duration > maxContinuousBuffer) maxContinuousBuffer = duration;
        }
        return maxContinuousBuffer >= this.minBufferForTransition;
    }

    // Called by VideoState's update method
    update() {
        const now = performance.now();
        if (now - this.lastBufferCheck > this.bufferCheckInterval) {
            this.lastBufferCheck = now;
            // Check buffer if video is loaded and not yet 'ready' (according to playbackManager's own state), 
            // OR if it's 'playing' (which covers the 'ready' state too, and active videos).
            // This ensures preloading videos get their buffer checked and can transition to 'playing' or 'ready' state.
            if (this.video && this.videoState.loaded && (this.playbackState !== 'ready' || this.videoState.playing)) {
                this.hasEnoughBuffer();
            }
        }
    }

    // Call this when a stutter/waiting event occurs
    handleStutter() {
        this.lastStutterTime = performance.now();
        if (this.playbackState === 'playing' || this.playbackState === 'ready') {
            this.playbackState = 'buffering';
            console.log(`VideoPlaybackManager: State for ${this.videoState.source} → buffering (due to stutter)`);
        }
    }
    
    // Call this when video starts playing (from event)
    handlePlay() {
        this.lastStutterTime = 0; // Reset stutter time on successful play/resume

        if (this.video && this.video.readyState < 3) {
            // If readyState is insufficient, force to buffering unless already initializing/buffering.
            // This handles cases where play is called but browser isn't ready.
            if (this.playbackState !== 'buffering' && this.playbackState !== 'initializing') {
                this.playbackState = 'buffering';
                console.warn(`VideoPlaybackManager: ${this.videoState.source} handlePlay event when readyState (${this.video.readyState}) is insufficient. Forcing to buffering.`);
            } else {
                 // Already in a state that's waiting for readyState/buffer, so just note the play attempt.
                 console.log(`VideoPlaybackManager: ${this.videoState.source} handlePlay event while ${this.playbackState} and readyState is ${this.video.readyState}. Waiting for conditions.`);
            }
            return; // Do not proceed if readyState is too low
        }

        // If readyState is sufficient, proceed based on current playbackState
        if (this.playbackState === 'buffering' || this.playbackState === 'initializing') {
            const previousStateForLog = this.playbackState;
            this.playbackState = 'playing';
            this.playbackStartTime = performance.now();
            console.log(`VideoPlaybackManager: State for ${this.videoState.source} → playing (from ${previousStateForLog} via handlePlay, readyState: ${this.video ? this.video.readyState : 'N/A'})`);
        } else if (this.playbackState === 'playing' || this.playbackState === 'ready') {
            // If already playing or ready, this 'play' event is likely a confirmation or a result of seeking.
            // No state change needed, but good to acknowledge.
            console.log(`VideoPlaybackManager: Play event confirmed for ${this.videoState.source} (already ${this.playbackState}, readyState: ${this.video ? this.video.readyState : 'N/A'})`);
        }
        // Other states are not explicitly handled here, assuming they are transient or error states.
    }

    // Call this when video is paused (from event)
    handlePause() {
         if (this.playbackState === 'playing' || this.playbackState === 'ready') {
            this.playbackState = 'buffering';
            console.log(`VideoPlaybackManager: State for ${this.videoState.source} → buffering (paused)`);
        }
    }
}

export default VideoPlaybackManager;
