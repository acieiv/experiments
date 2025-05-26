/**
 * VideoPlaybackManager.js
 * Manages playback state, buffering, and playback rate for a VideoState instance.
 */
import settings from '../../config/settings.js'; // Adjusted path
import DebugOverlay from '../../utils/DebugOverlay.js'; // Adjusted path

class VideoPlaybackManager {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance; // Instance of VideoStateCore
        // this.video is accessed via this.videoState.video when needed,
        // as it's initialized asynchronously by VideoInitializer.
        // Ensure methods always check for this.videoState.video availability.

        // Properties to be managed by this class
        this.playbackState = 'initializing'; // initializing, buffering, playing, ready
        this.minPlaybackTime = 3; // Seconds of successful playback required
        this.playbackStartTime = 0; // When stable playback began
        this.lastStutterTime = 0; // When last stutter occurred
        
        this.minBufferForPlayback = 6; 
        this.minBufferForTransition = 6; 
        this.isBuffering = false; // More explicit flag
        this.playbackRate = 1.0;
        this.lastBufferCheck = 0;
        this.bufferCheckInterval = 500; 
    }

    get video() { // Convenience getter
        return this.videoState ? this.videoState.video : null;
    }

    updatePlaybackState(bufferAhead) {
        if (!this.video) return;

        const now = performance.now();
        const oldState = this.playbackState;

        switch (this.playbackState) {
            case 'initializing':
                if (this.videoState.loaded && this.videoState.playing) { // playing flag on VideoStateCore
                    this.playbackState = 'buffering';
                }
                break;
            case 'buffering':
                if (bufferAhead >= this.minBufferForPlayback && this.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) { 
                    this.playbackState = 'playing';
                    this.playbackStartTime = now;
                }
                break;
            case 'playing':
                if (now - this.playbackStartTime > this.minPlaybackTime * 1000 &&
                    now - this.lastStutterTime > this.minPlaybackTime * 1000 &&
                    bufferAhead >= (this.minBufferForPlayback / 2)) { 
                    this.playbackState = 'ready';
                }
                break;
            case 'ready':
                // Stays ready unless stutter (handled by handleStutter via ErrorManager/EventHandler)
                break;
        }
        if (oldState !== this.playbackState && settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoPlaybackManager: State for ${this.videoState.source} → ${this.playbackState} (from ${oldState})`);
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
        
        this.updatePlaybackState(currentBufferAhead); // Update internal state based on buffer
        this.adjustPlaybackRate(currentBufferAhead); // Adjust rate based on buffer and state
        
        const threshold = forTransition ? this.minBufferForTransition : this.minBufferForPlayback;
        return currentBufferAhead >= threshold;
    }

    adjustPlaybackRate(bufferAhead) {
        if (!this.video || this.video.ended) return;
        
        let targetRate = 1.0;
        // Determine targetRate based on current playbackState and bufferAhead
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
                targetRate = 1.0; 
                this.isBuffering = false;
                break;
            default: // initializing or other
                targetRate = 0.7; // Default to a slower rate if state is indeterminate
                this.isBuffering = true;
        }
        
        const adjustmentFactor = this.playbackState === 'ready' ? 0.15 : 0.1;
        this.playbackRate = this.playbackRate + (targetRate - this.playbackRate) * adjustmentFactor;
        
        // Apply the calculated playbackRate to the video element if significantly different
        if (Math.abs(this.video.playbackRate - this.playbackRate) > 0.05) {
            this.video.playbackRate = this.playbackRate;
            if (settings.debug.logLevel > 1 && window.debug) { 
                window.debug.log(
                    `VideoPlaybackManager: Adjusting rate for ${this.videoState.source}: ` +
                    `${this.video.playbackRate.toFixed(2)}x (target: ${targetRate.toFixed(2)}x, buffer: ${bufferAhead.toFixed(1)}s, state: ${this.playbackState})`
                );
            }
        }
    }

    isReadyForTransition() {
        if (!this.videoState.loaded || !this.video || this.video.ended || this.video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
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

        const playbackTime = (this.playbackState === 'playing' || this.playbackState === 'ready') ? performance.now() - this.playbackStartTime : 0;
        const hasPlayedLongEnough = playbackTime > this.minPlaybackTime * 1000;
        
        let isReady;
        if (this.playbackState === 'ready' && hasPlayedLongEnough) {
            isReady = bufferAhead >= Math.min(1, this.minBufferForTransition / 4); // More lenient if already stable
        } else {
            // For non-ready states, or ready but not played long enough, require full transition buffer
            isReady = bufferAhead >= this.minBufferForTransition;
        }
        
        if (!isReady && settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(
                `VideoPlaybackManager: Video not ready for transition ${this.videoState.source} ` +
                `(buffer: ${bufferAhead.toFixed(1)}s/${this.minBufferForTransition}s, state: ${this.playbackState}, played: ${(playbackTime/1000).toFixed(1)}s/${this.minPlaybackTime}s, readyState: ${this.video.readyState})`
            );
        }
        return isReady;
    }

    isSufficientlyPreloaded() {
        if (!this.video || !this.videoState.loaded || this.video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
            return false;
        }
        const buffered = this.video.buffered;
        if (buffered.length === 0) return false;

        let maxContinuousBuffer = 0;
        // Check buffer from current time onwards for preloading relevance
        const currentTime = this.video.currentTime;
        for (let i = 0; i < buffered.length; i++) {
            if (buffered.end(i) > currentTime) { // Only consider buffer ranges ahead of current time
                 const relevantBufferStart = Math.max(currentTime, buffered.start(i));
                 const duration = buffered.end(i) - relevantBufferStart;
                 if (duration > maxContinuousBuffer) maxContinuousBuffer = duration;
            }
        }
        return maxContinuousBuffer >= this.minBufferForTransition;
    }

    update() {
        if (!this.video) return; // Guard against missing video element

        const now = performance.now();
        if (now - this.lastBufferCheck > this.bufferCheckInterval) {
            this.lastBufferCheck = now;
            if (this.videoState.loaded && (this.playbackState !== 'ready' || this.videoState.playing)) {
                this.hasEnoughBuffer(); // This also calls updatePlaybackState and adjustPlaybackRate
            }
        }
    }

    handleStutter() {
        this.lastStutterTime = performance.now();
        if (this.playbackState === 'playing' || this.playbackState === 'ready') {
            this.playbackState = 'buffering';
            this.isBuffering = true; // Explicitly set
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPlaybackManager: State for ${this.videoState.source} → buffering (due to stutter)`);
            }
        }
    }
    
    handlePlay() {
        if (!this.video) return;

        this.lastStutterTime = 0; 

        if (this.video.readyState < HTMLMediaElement.HAVE_ENOUGH_DATA) {
            if (this.playbackState !== 'buffering' && this.playbackState !== 'initializing') {
                this.playbackState = 'buffering';
                this.isBuffering = true;
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPlaybackManager: ${this.videoState.source} handlePlay event when readyState (${this.video.readyState}) is insufficient. Forcing to buffering.`, 'warn');
                }
            }
            return; 
        }

        if (this.playbackState === 'buffering' || this.playbackState === 'initializing') {
            const previousStateForLog = this.playbackState;
            this.playbackState = 'playing';
            this.isBuffering = false; // Should have enough buffer to start playing
            this.playbackStartTime = performance.now();
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPlaybackManager: State for ${this.videoState.source} → playing (from ${previousStateForLog} via handlePlay, readyState: ${this.video.readyState})`);
            }
        }
    }

    handlePause() {
         if (this.playbackState === 'playing' || this.playbackState === 'ready') {
            this.playbackState = 'buffering';
            this.isBuffering = true;
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPlaybackManager: State for ${this.videoState.source} → buffering (paused)`);
            }
        }
    }
}

export default VideoPlaybackManager;
