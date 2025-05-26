/**
 * VideoEventHandler.js
 * Manages HTMLVideoElement event listeners for a VideoState instance.
 */
import settings from '../../config/settings.js'; // Adjusted path
import DebugOverlay from '../../utils/DebugOverlay.js'; // Adjusted path
import VideoPlaybackController from './VideoPlaybackController.js'; // Added import

// Constants for Smart Auto-Resume
const MAX_AUTO_RESUME_ATTEMPTS = 3;
const RESUME_THROTTLE_INTERVAL = 2000; // ms (2 seconds)
const RETRY_DELAY_IF_NO_BUFFER = 1500; // ms (1.5 seconds)

class VideoEventHandler {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance; // This will be an instance of VideoStateCore
        this.boundEventHandlers = [];
    }

    // Video event handlers configuration
    static EVENT_HANDLERS = {
        loadeddata: (instance, video) => { // instance is VideoStateCore
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Video loaded: ${instance.source} (${video.videoWidth}x${video.videoHeight})`);
            }
            instance.loaded = true;
            if (instance.errorManager) instance.errorManager.resetCounters();


            if (instance.playbackManager) {
                instance.playbackManager.playbackState = 'buffering';
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoEventHandler: State for ${instance.source} set to buffering via PlaybackManager`);
                }
            } else {
                // This fallback might be less relevant if playbackManager is always initialized in VideoStateCore
                // instance.playbackState = 'buffering'; // Property might not exist directly on VideoStateCore
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video state for ${instance.source} → buffering (playbackManager not found)`);
                }
            }
            
            // Playback initiation is now handled by VideoPlaybackController.play()
            // This event primarily signals data is loaded.
            // If VideoState.play() was called and waiting for 'loadeddata', it would proceed.
            // For now, this handler focuses on state update.
        },
        play: (instance) => { // instance is VideoStateCore
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Play event (play() called) for: ${instance.source} at ${performance.now().toFixed(0)}`);
            }
            instance.playing = true; 
            if (instance.errorManager) instance.errorManager.resetCounters();
            
            if (instance.playbackManager) {
                instance.playbackManager.handlePlay();
            } else {
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video state for ${instance.source} → playing (playbackManager not found)`);
                }
            }
        },
        pause: (instance) => { // instance is VideoStateCore
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Video paused: ${instance.source}`);
            }
            instance.playing = false;
            if (instance.pauseReason === 'none') {
                instance.pauseReason = 'stall'; 
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Pause event for ${instance.source} with 'none' reason, treating as 'stall'.`);
                }
            }
            
            if (instance.playbackManager) {
                instance.playbackManager.handlePause(); 
            }
            
            // Check pauseReason before attempting smart resume
            if (instance.pauseReason === 'idle' || instance.pauseReason === 'cleanup') {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Pause event for ${instance.source} (reason: ${instance.pauseReason}). Skipping smart resume as it's an internal/idle pause.`);
                }
            } else if (instance.pauseReason !== 'transition') {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Pause event for ${instance.source} (reason: ${instance.pauseReason}). Initiating smart resume.`);
                }
                VideoEventHandler._handleSmartResume(instance);
            } else { // reason is 'transition'
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Pause event for ${instance.source} (reason: ${instance.pauseReason}). Skipping smart resume for transition.`);
                }
            }
        },
        error: (instance, videoElement, e) => { // instance is VideoStateCore
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Error event for ${instance.source}: ${e.target?.error?.message || 'Unknown video error'}`, 'error');
            }
            if (instance.errorManager) {
                instance.errorManager.handleVideoError(e.target.error || new Error('Unknown video error'), 'event');
            } else {
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Error event for ${instance.source} but no errorManager found.`, 'error');
                }
            }
        },
        stalled: (instance) => { // instance is VideoStateCore
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Video stalled: ${instance.source}`, 'warn');
            }
            instance.playing = false; 
            instance.pauseReason = 'stall'; 
            
            if (instance.errorManager) {
                instance.errorManager.handleVideoError(new Error('Video stalled'), 'stalled');
            } else {
                if (instance.playbackManager) {
                    instance.playbackManager.handleStutter();
                }
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Stalled event for ${instance.source} but no errorManager found.`, 'warn');
                }
            }
            if (instance.pauseReason !== 'transition') {
                 VideoEventHandler._handleSmartResume(instance);
            }
        },
        waiting: (instance) => { // instance is VideoStateCore
            const video = instance.video; 
            if (settings.debug.verboseLoggingEnabled && window.debug && video) {
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

            if (settings.debug.enabled && !settings.debug.verboseLoggingEnabled && window.debug) {
                 window.debug.log(`VideoEventHandler: Video waiting: ${instance.source}`, 'warn');
            }
            
            instance.pauseReason = 'stall'; 
            instance.playing = false; 

            if (instance.errorManager) {
                instance.errorManager.handleWaiting();
            } else {
                 if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Waiting event for ${instance.source} but no errorManager found.`, 'warn');
                }
            }
        },
        playing: (instance) => { // instance is VideoStateCore
            if (instance.isCurrentUserVisible) { 
                if (instance.video && instance.video.currentTime < 0.5 && instance.hasPlayedOnce) { 
                    instance.loopCount++;
                }
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Video playing: ${instance.source}, Loop: ${instance.loopCount}, CurrentTime: ${instance.video ? instance.video.currentTime.toFixed(2) : 'N/A'}s, Duration: ${instance.video ? instance.video.duration.toFixed(2) : 'N/A'}s, Timestamp: ${performance.now().toFixed(0)}`);
                }
                instance.hasPlayedOnce = true;
            } else {
                if (settings.debug.verboseLoggingEnabled && window.debug) { 
                    window.debug.log(`VideoEventHandler: Preload video event 'playing': ${instance.source}, CurrentTime: ${instance.video ? instance.video.currentTime.toFixed(2) : 'N/A'}s`);
                }
            }
            
            instance.playing = true; 
            instance.pauseReason = 'none'; 
            instance.isAttemptingAutoResume = false; 
            instance.autoResumeAttempts = 0;

            if (instance.errorManager) instance.errorManager.resetCounters();

            if (instance.textureManager) {
                instance.textureManager.tryActivateHighQualityTexture();
            }
            
            if (instance.playbackManager) {
                instance.playbackManager.handlePlay();
            }
        },
        ended: (instance, video) => { // instance is VideoStateCore
            if (instance.isCurrentUserVisible) {
                instance.hasEnded = true; 
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoEventHandler: Main video ended: ${instance.source}. Flag 'hasEnded' set to true.`);
                }
            }

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
        }
    };

    setupEventListeners() {
        const videoElement = this.videoState.video; 
        if (!videoElement) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Video element not available for setup on ${this.videoState.source}.`, 'error');
            }
            return;
        }
        this.cleanupEventListeners(); 

        Object.entries(VideoEventHandler.EVENT_HANDLERS).forEach(([event, handlerConfig]) => {
            const boundHandler = (e) => handlerConfig(this.videoState, videoElement, e);
            this.boundEventHandlers.push({ event, handler: boundHandler, element: videoElement }); 
            videoElement.addEventListener(event, boundHandler);
        });
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoEventHandler: Event listeners set up for ${this.videoState.source}`);
        }
    }

    cleanupEventListeners() {
        if (this.boundEventHandlers.length > 0) {
            this.boundEventHandlers.forEach(({ event, handler, element }) => {
                if (element) { 
                    element.removeEventListener(event, handler);
                }
            });
            this.boundEventHandlers = []; 
            if (settings.debug.verboseLoggingEnabled && window.debug && this.videoState) { 
                window.debug.log(`VideoEventHandler: Event listeners cleaned up for ${this.videoState.source}`);
            }
        }
    }

    static _handleSmartResume(instance) { // instance is VideoStateCore
        if (!instance || !instance.video) { // Allow first attempt even if isAttemptingAutoResume is true from a previous event cycle
            return;
        }

        // Primary Fix: If the video has already ended, do not attempt to smart resume it.
        if (instance.hasEnded) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Skipping smart resume for ${instance.source} because instance.hasEnded is true. Current pauseReason: ${instance.pauseReason}`, 'info');
            }
            if (instance.smartResumeTimeoutId) {
                clearTimeout(instance.smartResumeTimeoutId);
                instance.smartResumeTimeoutId = null;
            }
            instance.isAttemptingAutoResume = false; // Ensure flags are reset
            instance.autoResumeAttempts = 0;
            return; 
        }
        
        const now = performance.now();

        if (instance.autoResumeAttempts >= MAX_AUTO_RESUME_ATTEMPTS) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Max auto-resume attempts (${MAX_AUTO_RESUME_ATTEMPTS}) reached for ${instance.source}. Giving up on smart resume. ErrorManager might take over.`, 'warn');
            }
            if (instance.smartResumeTimeoutId) { // Clear timeout if max attempts reached
                clearTimeout(instance.smartResumeTimeoutId);
                instance.smartResumeTimeoutId = null;
            }
            return;
        }

        // Throttle subsequent attempts, but not the very first one for a given pause event.
        if (instance.autoResumeAttempts > 0 && (now - instance.lastAutoResumeAttemptTime < RESUME_THROTTLE_INTERVAL)) {
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoEventHandler: Auto-resume attempt for ${instance.source} throttled. Waiting...`);
            }
            // Clear previous timeout before setting a new one
            if (instance.smartResumeTimeoutId) clearTimeout(instance.smartResumeTimeoutId);
            instance.smartResumeTimeoutId = setTimeout(() => VideoEventHandler._handleSmartResume(instance), RESUME_THROTTLE_INTERVAL - (now - instance.lastAutoResumeAttemptTime));
            return;
        }

        instance.isAttemptingAutoResume = true;
        instance.autoResumeAttempts++;
        instance.lastAutoResumeAttemptTime = now;

        if (settings.debug.enabled && window.debug) {
            window.debug.log(`VideoEventHandler: Attempting smart resume for ${instance.source} (Attempt ${instance.autoResumeAttempts}/${MAX_AUTO_RESUME_ATTEMPTS})`);
        }

        const hasEnoughBuffer = instance.playbackManager ? instance.playbackManager.hasEnoughBuffer() : false;
        const readyStateSufficient = instance.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;

        if (hasEnoughBuffer && readyStateSufficient) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Smart resume conditions met for ${instance.source}. Calling play via PlaybackController.`);
            }
            // Clear any pending timeout before attempting to play
            if (instance.smartResumeTimeoutId) {
                clearTimeout(instance.smartResumeTimeoutId);
                instance.smartResumeTimeoutId = null;
            }
            VideoPlaybackController.play(instance) // instance here is VideoStateCore
                .then(() => {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoEventHandler: Smart resume play() successful for ${instance.source}.`);
                    }
                    // instance.isAttemptingAutoResume and autoResumeAttempts are reset by the 'playing' event handler
                    // No need to clear smartResumeTimeoutId here as it was cleared before play, and 'playing' event handles state.
                })
                .catch(err => {
                    if (settings.debug.enabled && window.debug) {
                        window.debug.log(`VideoEventHandler: Smart resume play() failed for ${instance.source}: ${err.message}`, 'warn');
                    }
                    instance.isAttemptingAutoResume = false; 
                    // Schedule another attempt
                    if (instance.smartResumeTimeoutId) clearTimeout(instance.smartResumeTimeoutId);
                    instance.smartResumeTimeoutId = setTimeout(() => VideoEventHandler._handleSmartResume(instance), RETRY_DELAY_IF_NO_BUFFER);
                });
        } else {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoEventHandler: Smart resume conditions not met for ${instance.source} (Buffer: ${hasEnoughBuffer}, Actual ReadyState: ${instance.video.readyState}, Needed: ${HTMLMediaElement.HAVE_ENOUGH_DATA}). Will retry.`, 'warn');
            }
            instance.isAttemptingAutoResume = false;
            // Schedule another attempt
            if (instance.smartResumeTimeoutId) clearTimeout(instance.smartResumeTimeoutId);
            instance.smartResumeTimeoutId = setTimeout(() => VideoEventHandler._handleSmartResume(instance), RETRY_DELAY_IF_NO_BUFFER);
        }
    }
}

export default VideoEventHandler;
