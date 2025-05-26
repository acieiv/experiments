/**
 * VideoEventHandler.js
 * Manages HTMLVideoElement event listeners for a VideoState instance.
 */
import settings from '../config/settings.js'; // Added
import DebugOverlay from '../utils/DebugOverlay.js'; // Added

class VideoEventHandler {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance;
        this.video = videoStateInstance.video; // Assuming video element is already created
        this.boundEventHandlers = [];
    }

    // Video event handlers configuration
    static EVENT_HANDLERS = {
        loadeddata: (instance, video) => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Video loaded: ${instance.source} (${video.videoWidth}x${video.videoHeight})`);
            }
            instance.loaded = true;
            if (instance.errorManager) instance.errorManager.resetCounters();


            // Move to buffering state
            if (instance.playbackManager) {
                instance.playbackManager.playbackState = 'buffering';
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoEventHandler: State for ${instance.source} set to buffering via PlaybackManager`);
                }
            } else {
                instance.playbackState = 'buffering'; // Fallback if manager not ready
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video state for ${instance.source} → buffering (fallback)`);
                }
            }
            
            // Only start playing if not just preloading
            if (!instance.preloaded) {
                instance.play().catch(e => instance.errorManager ? instance.errorManager.handleVideoError(e, 'play') : instance.handleVideoError(e));
            }
        },
        play: (instance) => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Play event (play() called) for: ${instance.source} at ${performance.now().toFixed(0)}`);
            }
            instance.playing = true; // Mark as attempting to play
            // Note: actual 'playing' state and loop counting is handled in 'playing' event
            if (instance.errorManager) instance.errorManager.resetCounters();
            
            // Start tracking playback time
            if (instance.playbackManager) {
                instance.playbackManager.handlePlay();
            } else if (instance.playbackState === 'buffering') { // Fallback
                instance.playbackState = 'playing';
                instance.playbackStartTime = performance.now();
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video state for ${instance.source} → playing (fallback)`);
                }
            }
        },
        pause: (instance) => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Video paused: ${instance.source}`);
            }
            instance.playing = false;
            
            // Reset state on pause
            if (instance.playbackManager) {
                instance.playbackManager.handlePause();
            } else if (instance.playbackState === 'playing' || instance.playbackState === 'ready') { // Fallback
                instance.playbackState = 'buffering';
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video state for ${instance.source} → buffering (paused, fallback)`);
                }
            }
            
            // Only auto-resume if not preloaded
            if (!instance.preloaded) {
                instance.play().catch(e => instance.errorManager ? instance.errorManager.handleVideoError(e, 'play') : instance.handleVideoError(e));
            }
        },
        error: (instance, videoElement, e) => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Error event for ${instance.source}: ${e.target?.error?.message || 'Unknown video error'}`, 'error');
            }
            if (instance.errorManager) {
                instance.errorManager.handleVideoError(e.target.error || new Error('Unknown video error'), 'event');
            } else {
                // Fallback to old VideoState.handleVideoError if manager not present
                instance.handleVideoError(e.target.error || new Error('Unknown video error')); // This might be a method on VideoState
            }
        },
        stalled: (instance) => {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Video stalled: ${instance.source}`, 'warn');
            }
            instance.playing = false; // Ensure playing is false
            
            if (instance.errorManager) {
                instance.errorManager.handleVideoError(new Error('Video stalled'), 'stalled');
            } else {
                 // Fallback
                if (instance.playbackState === 'playing' || instance.playbackState === 'ready') {
                    instance.playbackState = 'buffering';
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoEventHandler: Video state for ${instance.source} → buffering (stalled, fallback)`);
                    }
                }
                instance.handleVideoError(new Error('Video stalled')); // This might be a method on VideoState
            }
        },
        waiting: (instance) => {
            const video = instance.video; 
            if (settings.debug.verboseLoggingEnabled && window.debug && video) { // Gated verbose bufferInfo
                let bufferInfo = `WAITING Event for ${instance.source} at currentTime: ${video.currentTime.toFixed(3)}\n`;
                bufferInfo += `  Playback State: ${instance.playbackManager?.playbackState}\n`;
                bufferInfo += `  readyState: ${video.readyState}, paused: ${video.paused}, ended: ${video.ended}\n`;
                bufferInfo += `  Buffered TimeRanges (${video.buffered?.length || 0}):\n`;
                if (video.buffered) {
                    for (let i = 0; i < video.buffered.length; i++) {
                        bufferInfo += `    Range ${i}: ${video.buffered.start(i).toFixed(3)} - ${video.buffered.end(i).toFixed(3)} (duration: ${(video.buffered.end(i) - video.buffered.start(i)).toFixed(3)}s)\n`;
                    }
                }
                let currentBufferAhead = 0;
                if (video.buffered) {
                    for (let i = 0; i < video.buffered.length; i++) {
                        if (video.buffered.start(i) <= video.currentTime && video.currentTime < video.buffered.end(i)) {
                            currentBufferAhead = video.buffered.end(i) - video.currentTime;
                            break;
                        }
                    }
                }
                const minBuffer = instance.playbackManager?.minBufferForPlayback || 'N/A';
                bufferInfo += `  Calculated currentBufferAhead: ${currentBufferAhead.toFixed(3)}s (minPlayback: ${minBuffer}s)\n`;
                window.debug.log(bufferInfo, 'warn');
            }

            if (settings.debug.enabled && !settings.debug.verboseLoggingEnabled && window.debug) { // Less verbose log if not verbose mode
                 window.debug.log(`VideoEventHandler: Video waiting: ${instance.source}`, 'warn');
            }

            if (instance.errorManager) {
                instance.errorManager.handleWaiting();
            } else {
                // Fallback
                instance.playing = false;
                instance.waitingCount = instance.waitingCount ? instance.waitingCount + 1 : 1; // Ensure waitingCount exists
                instance.lastStutterTime = performance.now();
                if (instance.playbackState === 'playing' || instance.playbackState === 'ready') {
                    instance.playbackState = 'buffering';
                     if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoEventHandler: Video state for ${instance.source} → buffering (waiting, fallback)`);
                    }
                }
                const maxWaiting = instance.maxWaitingRetries || 5;
                if (instance.waitingCount >= maxWaiting) {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoEventHandler: Too many waiting events for ${instance.source}, reloading video (fallback)`, 'warn');
                    }
                    instance.handleVideoError(new Error('Excessive waiting')); // This might be a method on VideoState
                    instance.waitingCount = 0;
                }
            }
        },
        playing: (instance) => { 
            if (instance.isCurrentUserVisible) { // Check if it's the main active video
                if (instance.video && instance.video.currentTime < 0.5 && instance.hasPlayedOnce) { 
                    instance.loopCount++;
                }
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video playing: ${instance.source}, Loop: ${instance.loopCount}, CurrentTime: ${instance.video ? instance.video.currentTime.toFixed(2) : 'N/A'}s, Duration: ${instance.video ? instance.video.duration.toFixed(2) : 'N/A'}s, Timestamp: ${performance.now().toFixed(0)}`);
                }
                instance.hasPlayedOnce = true;
            } else {
                // Log for preloading videos if needed, less prominently
                if (settings.debug.verboseLoggingEnabled && window.debug) { 
                    window.debug.log(`VideoEventHandler: Preload video event 'playing': ${instance.source}, CurrentTime: ${instance.video ? instance.video.currentTime.toFixed(2) : 'N/A'}s`);
                }
            }
            instance.playing = true; // General playing flag for the VideoState, confirms it is actively playing
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
                    if (settings.debug.verboseLoggingEnabled && window.debug) {
                        window.debug.log(`VideoEventHandler: Activated HQ texture for ${instance.source} on 'playing' event (fallback).`);
                    }
                } else {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoEventHandler: Video ${instance.source} 'playing' event (fallback), but readyState is ${instance.video?.readyState}. Deferring HQ texture activation.`, 'warn');
                    }
                }
            }
            
            // Notify playback manager
            if (instance.playbackManager) {
                instance.playbackManager.handlePlay();
            } else if (instance.playbackState === 'buffering') { // Fallback
                instance.playbackState = 'playing';
                instance.playbackStartTime = performance.now();
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video state for ${instance.source} → playing (resumed, fallback)`);
                }
            }
        },
        ended: (instance, video) => { 
            if (instance.isCurrentUserVisible) {
                instance.hasEnded = true; // Set the flag
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Main video ended: ${instance.source}. Flag 'hasEnded' set to true.`);
                }
                // The VideoTransitionController will pick this up.
            }

            // Keep existing detailed log for all 'ended' events
            if (settings.debug.enabled && window.debug) { 
                window.debug.log(
                    `VideoEventHandler: Video ended event details: ${instance.source}, Loop: ${instance.loopCount}, ` +
                    `CT: ${video.currentTime.toFixed(3)}, ` + 
                    `Duration: ${video.duration ? video.duration.toFixed(3) : 'N/A'}s, ` +
                    `Timestamp: ${performance.now().toFixed(0)}, ` +
                    `loopProp: ${video.loop}, ` + 
                    `isCurrentUserVisible: ${instance.isCurrentUserVisible}, ` +
                    `playing: ${instance.playing}`
                );
            }
            // Since video.loop is now false, this event signifies the true end of a single playthrough.
        }
    };

    setupEventListeners() {
        if (!this.video) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log("VideoEventHandler: Video element not available for setup.", 'error');
            }
            return;
        }
        this.cleanupEventListeners(); // Ensure no duplicate listeners

        Object.entries(VideoEventHandler.EVENT_HANDLERS).forEach(([event, handlerConfig]) => {
            const boundHandler = (e) => handlerConfig(this.videoState, this.video, e);
            this.boundEventHandlers.push({ event, handler: boundHandler });
            this.video.addEventListener(event, boundHandler);
        });
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoEventHandler: Event listeners set up for ${this.videoState.source}`);
        }
    }

    cleanupEventListeners() {
        if (this.video && this.boundEventHandlers.length > 0) {
            this.boundEventHandlers.forEach(({ event, handler }) => {
                this.video.removeEventListener(event, handler);
            });
            this.boundEventHandlers = [];
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoEventHandler: Event listeners cleaned up for ${this.videoState.source}`);
            }
        }
    }
}

export default VideoEventHandler;
