/**
 * VideoEventHandler.js
 * Manages HTMLVideoElement event listeners for a VideoState instance.
 */

class VideoEventHandler {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance;
        this.video = videoStateInstance.video; // Assuming video element is already created
        this.boundEventHandlers = [];
    }

    // Video event handlers configuration
    static EVENT_HANDLERS = {
        loadeddata: (instance, video) => {
            console.log(`Video loaded: ${instance.source} (${video.videoWidth}x${video.videoHeight})`);
            instance.loaded = true;
            // instance.retryCount = 0; // To be handled by ErrorManager
            // instance.waitingCount = 0; // To be handled by ErrorManager
            if (instance.errorManager) instance.errorManager.resetCounters();


            // Move to buffering state
            // instance.playbackState = 'buffering'; // To be handled by PlaybackManager
            if (instance.playbackManager) {
                instance.playbackManager.playbackState = 'buffering';
                 console.log(`VideoEventHandler: State for ${instance.source} set to buffering via PlaybackManager`);
            } else {
                instance.playbackState = 'buffering'; // Fallback if manager not ready
                console.log(`Video state: ${instance.source} → buffering (fallback)`);
            }
            
            // Only start playing if not just preloading
            if (!instance.preloaded) {
                instance.play().catch(e => instance.errorManager ? instance.errorManager.handleVideoError(e, 'play') : instance.handleVideoError(e));
            }
        },
        play: (instance) => {
            console.log(`Video started playing: ${instance.source}`);
            instance.playing = true;
            // instance.retryCount = 0; // ErrorManager
            // instance.waitingCount = 0; // ErrorManager
            if (instance.errorManager) instance.errorManager.resetCounters();
            
            // Start tracking playback time
            if (instance.playbackManager) {
                instance.playbackManager.handlePlay();
            } else if (instance.playbackState === 'buffering') { // Fallback
                instance.playbackState = 'playing';
                instance.playbackStartTime = performance.now();
                console.log(`Video state: ${instance.source} → playing (fallback)`);
            }
        },
        pause: (instance) => {
            console.log(`Video paused: ${instance.source}`);
            instance.playing = false;
            
            // Reset state on pause
            if (instance.playbackManager) {
                instance.playbackManager.handlePause();
            } else if (instance.playbackState === 'playing' || instance.playbackState === 'ready') { // Fallback
                instance.playbackState = 'buffering';
                console.log(`Video state: ${instance.source} → buffering (paused, fallback)`);
            }
            
            // Only auto-resume if not preloaded
            if (!instance.preloaded) {
                instance.play().catch(e => instance.errorManager ? instance.errorManager.handleVideoError(e, 'play') : instance.handleVideoError(e));
            }
        },
        error: (instance, videoElement, e) => { // Added videoElement to signature for consistency
            console.error(`VideoEventHandler: Error event for ${instance.source}:`, e.target.error);
            if (instance.errorManager) {
                instance.errorManager.handleVideoError(e.target.error || new Error('Unknown video error'), 'event');
            } else {
                // Fallback to old VideoState.handleVideoError if manager not present
                instance.handleVideoError(e.target.error || new Error('Unknown video error'));
            }
        },
        stalled: (instance) => {
            console.warn(`Video stalled: ${instance.source}`);
            instance.playing = false; // Ensure playing is false
            
            if (instance.errorManager) {
                instance.errorManager.handleVideoError(new Error('Video stalled'), 'stalled');
            } else {
                 // Fallback
                if (instance.playbackState === 'playing' || instance.playbackState === 'ready') {
                    instance.playbackState = 'buffering';
                    console.log(`Video state: ${instance.source} → buffering (stalled, fallback)`);
                }
                instance.handleVideoError(new Error('Video stalled'));
            }
        },
        waiting: (instance) => {
            const video = instance.video; // instance is this.videoState
            if (video) {
                let bufferInfo = `WAITING Event for ${instance.source} at currentTime: ${video.currentTime.toFixed(3)}\n`;
                bufferInfo += `  Playback State: ${instance.playbackManager.playbackState}\n`;
                bufferInfo += `  readyState: ${video.readyState}, paused: ${video.paused}, ended: ${video.ended}\n`;
                bufferInfo += `  Buffered TimeRanges (${video.buffered.length}):\n`;
                for (let i = 0; i < video.buffered.length; i++) {
                    bufferInfo += `    Range ${i}: ${video.buffered.start(i).toFixed(3)} - ${video.buffered.end(i).toFixed(3)} (duration: ${(video.buffered.end(i) - video.buffered.start(i)).toFixed(3)}s)\n`;
                }
                // Calculate currentBufferAhead like in VideoPlaybackManager for context
                let currentBufferAhead = 0;
                for (let i = 0; i < video.buffered.length; i++) {
                    if (video.buffered.start(i) <= video.currentTime && video.currentTime < video.buffered.end(i)) { // Note: strictly < for end
                        currentBufferAhead = video.buffered.end(i) - video.currentTime;
                        break;
                    }
                }
                bufferInfo += `  Calculated currentBufferAhead: ${currentBufferAhead.toFixed(3)}s (minPlayback: ${instance.playbackManager.minBufferForPlayback}s)\n`;
                console.warn(bufferInfo); // Use warn to make it stand out
            }

            console.warn(`Video waiting: ${instance.source}`);
            // instance.playing = false; // This is handled by ErrorManager.handleWaiting
            // instance.waitingCount++; // ErrorManager
            // instance.lastStutterTime = performance.now(); // PlaybackManager

            if (instance.errorManager) {
                instance.errorManager.handleWaiting();
            } else {
                // Fallback
                instance.playing = false;
                instance.waitingCount++;
                instance.lastStutterTime = performance.now();
                if (instance.playbackState === 'playing' || instance.playbackState === 'ready') {
                    instance.playbackState = 'buffering';
                    console.log(`Video state: ${instance.source} → buffering (waiting, fallback)`);
                }
                if (instance.waitingCount >= instance.maxWaitingRetries) {
                    console.warn(`Too many waiting events for ${instance.source}, reloading video (fallback)`);
                    instance.handleVideoError(new Error('Excessive waiting'));
                    instance.waitingCount = 0;
                }
            }
        },
        playing: (instance) => { // This is 'resumed playing' or continued playing
            console.log(`Video resumed playing: ${instance.source}`);
            instance.playing = true;
            // instance.waitingCount = 0; // ErrorManager
            if (instance.errorManager) instance.errorManager.resetCounters();


            // Activate the actual video texture if it's ready and not already active
            if (instance.textureManager) {
                instance.textureManager.tryActivateHighQualityTexture();
            } else if (instance.hasHighQualityTexture && instance.actualVideoTexture && instance.mesh?.material &&
                instance.mesh.material.uniforms.videoTexture.value !== instance.actualVideoTexture) { // Fallback
                if (instance.video && instance.video.readyState >= 2) { // HAVE_CURRENT_DATA
                    instance.mesh.material.uniforms.videoTexture.value = instance.actualVideoTexture;
                    instance.mesh.material.needsUpdate = true;
                    instance.texture = instance.actualVideoTexture; 
                    console.log(`Activated HQ texture for ${instance.source} on 'playing' event (fallback).`);
                } else {
                    console.warn(`Video ${instance.source} 'playing' event (fallback), but readyState is ${instance.video?.readyState}. Deferring HQ texture activation.`);
                }
            }
            
            // Notify playback manager
            if (instance.playbackManager) {
                instance.playbackManager.handlePlay();
            } else if (instance.playbackState === 'buffering') { // Fallback
                instance.playbackState = 'playing';
                instance.playbackStartTime = performance.now();
                console.log(`Video state: ${instance.source} → playing (resumed, fallback)`);
            }
        },
        ended: (instance, video) => { // instance is videoState, video is videoElement
            console.log(
                `VIDEO EVENT: Ended - Source: ${instance.source}, ` +
                `currentTime: ${video.currentTime.toFixed(3)}, ` +
                `duration: ${video.duration.toFixed(3)}, ` +
                `loop: ${video.loop}, ` +
                `VideoState.playing: ${instance.playing}`
            );
            // If loop is true, the browser handles restarting.
            // If loop is false, this is where we might eventually add logic
            // to perhaps force a transition or handle the stopped video.
            // For now, just logging.
        }
    };

    setupEventListeners() {
        if (!this.video) {
            console.error("VideoEventHandler: Video element not available for setup.");
            return;
        }
        this.cleanupEventListeners(); // Ensure no duplicate listeners

        Object.entries(VideoEventHandler.EVENT_HANDLERS).forEach(([event, handlerConfig]) => {
            // The handlerConfig will be a function that expects (instance, video, event)
            // We need to adapt it or ensure VideoState passes the correct context
            const boundHandler = (e) => handlerConfig(this.videoState, this.video, e);
            this.boundEventHandlers.push({ event, handler: boundHandler });
            this.video.addEventListener(event, boundHandler);
        });
        console.log(`VideoEventHandler: Event listeners set up for ${this.videoState.source}`);
    }

    cleanupEventListeners() {
        if (this.video && this.boundEventHandlers.length > 0) {
            this.boundEventHandlers.forEach(({ event, handler }) => {
                this.video.removeEventListener(event, handler);
            });
            this.boundEventHandlers = [];
            console.log(`VideoEventHandler: Event listeners cleaned up for ${this.videoState.source}`);
        }
    }
}

export default VideoEventHandler;
