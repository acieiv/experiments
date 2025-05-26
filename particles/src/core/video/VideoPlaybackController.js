/**
 * VideoPlaybackController.js
 * Handles high-level playback controls like play, pause, and preload.
 * Operates on a VideoStateCore instance and its associated video element and managers.
 */

import settings from '../../config/settings.js';

class VideoPlaybackController {
    /**
     * Preload the video and ensure it's sufficiently buffered.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @returns {Promise<void>} Resolves when preloading is considered complete.
     */
    static async preload(videoStateCore) {
        if (videoStateCore.isPermanentlyFailed) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPlaybackController: Skipping preload for ${videoStateCore.source} as it's permanently failed.`, 'warn');
            }
            return Promise.reject(new Error(`Video ${videoStateCore.source} is permanently failed.`));
        }
        if (!videoStateCore.video) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPlaybackController: Video element not available for preload on ${videoStateCore.source}.`, 'error');
            }
            videoStateCore.isPermanentlyFailed = true;
            return Promise.reject(new Error("Video element not available for preload."));
        }

        if (videoStateCore.preloaded && videoStateCore.video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPlaybackController: Already preloaded ${videoStateCore.source}`);
            }
            return Promise.resolve();
        }

        videoStateCore.preloaded = false;

        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoPlaybackController: Preloading video ${videoStateCore.source}`);
        }

        return new Promise((resolve, reject) => {
            const onCanPlayThrough = () => {
                cleanupListeners();
                videoStateCore.preloaded = true;
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoPlaybackController: Sufficiently preloaded (canplaythrough) ${videoStateCore.source}`);
                }
                resolve();
            };

            const onProgress = () => {
                if (!videoStateCore.video) return;
                // Additional logic for progress if needed
            };
            
            const onError = (errEvent) => {
                cleanupListeners();
                const error = videoStateCore.video?.error || errEvent.target?.error || new Error('Video preload error');
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPlaybackController: Error during preload for ${videoStateCore.source}: ${error.message || error.code}`, 'error');
                }
                videoStateCore.isPermanentlyFailed = true;
                if (videoStateCore.errorManager) {
                    videoStateCore.errorManager.handleVideoError(error, 'preload');
                }
                reject(error);
            };

            const cleanupListeners = () => {
                if (!videoStateCore.video) return;
                videoStateCore.video.removeEventListener('canplaythrough', onCanPlayThrough);
                videoStateCore.video.removeEventListener('progress', onProgress);
                videoStateCore.video.removeEventListener('error', onError);
            };

            videoStateCore.video.addEventListener('canplaythrough', onCanPlayThrough, { once: true });
            videoStateCore.video.addEventListener('progress', onProgress);
            videoStateCore.video.addEventListener('error', onError, { once: true });

            if (videoStateCore.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
                onCanPlayThrough();
            } else {
                // If readyState is less than HAVE_ENOUGH_DATA, always try to load.
                // This is more assertive than only loading if networkState is EMPTY or NO_SOURCE.
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoPlaybackController: readyState is ${videoStateCore.video.readyState} (< HAVE_ENOUGH_DATA). Explicitly calling video.load() for preload of ${videoStateCore.source}`);
                }
                videoStateCore.video.load();
            }
        });
    }
    
    /**
     * Initiates playback of the video.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @returns {Promise<void>} Resolves when playback starts or is underway.
     */
    static play(videoStateCore) {
        if (videoStateCore.isPermanentlyFailed) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Play called but video is permanently failed.`, 'warn');
            }
            return Promise.reject(new Error(`Video ${videoStateCore.source} is permanently failed.`));
        }
        if (!videoStateCore.video) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Play called but no video element.`, 'error');
            }
            videoStateCore.isPermanentlyFailed = true;
            return Promise.reject(new Error('No video element'));
        }

        if (videoStateCore.video.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) { 
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Calling video.play() directly (readyState: ${videoStateCore.video.readyState}, currentTime: ${videoStateCore.video.currentTime.toFixed(3)})`);
            }
            return videoStateCore.video.play().catch(err => {
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Error during direct video.play(): ${err.message || err}`, 'error');
                }
                if (videoStateCore.errorManager) {
                    videoStateCore.errorManager.handleVideoError(err, 'play_promise_reject_direct');
                }
                return Promise.reject(err);
            });
        }

        if (settings.debug.enabled && window.debug) { 
             window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Play called with low readyState ${videoStateCore.video.readyState}. Deferring video.play(), will wait for 'canplaythrough'. Current time: ${videoStateCore.video.currentTime.toFixed(3)}`, 'warn');
        }

        if (videoStateCore.playbackManager && 
            videoStateCore.playbackManager.playbackState !== 'buffering' && 
            videoStateCore.playbackManager.playbackState !== 'initializing') {
            videoStateCore.playbackManager.playbackState = 'buffering';
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Set playbackManager to 'buffering' due to low readyState on play() call, awaiting 'canplaythrough'.`);
            }
        }

        return new Promise((resolve, reject) => {
            const canPlayThroughHandler = () => {
                if (!videoStateCore.video || videoStateCore.isPermanentlyFailed) {
                    cleanupPlayListeners();
                    const reason = !videoStateCore.video ? "video element became null" : "video marked permanently failed";
                    if (settings.debug.enabled && window.debug) window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Aborting play after canplaythrough because ${reason}.`, 'warn');
                    reject(new Error(`Play aborted for ${videoStateCore.source}: ${reason}`));
                    return;
                }
                cleanupPlayListeners();
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoPlaybackController ${videoStateCore.source}: 'canplaythrough' event received. Attempting video.play() (readyState: ${videoStateCore.video.readyState}, currentTime: ${videoStateCore.video.currentTime.toFixed(3)})`);
                }
                videoStateCore.video.play()
                    .then(resolve)
                    .catch(err => {
                        if (settings.debug.enabled && window.debug) {
                             window.debug.log(`VideoPlaybackController ${videoStateCore.source}: Error during video.play() after 'canplaythrough': ${err.message || err}`, 'error');
                        }
                        if (videoStateCore.errorManager) {
                            videoStateCore.errorManager.handleVideoError(err, 'play_promise_reject_canplaythrough');
                        }
                        reject(err);
                    });
            };

            const errorHandler = (errEvent) => {
                cleanupPlayListeners();
                const error = videoStateCore.video?.error || errEvent.target?.error || new Error('Video error while awaiting canplaythrough');
                if (settings.debug.enabled && window.debug) {
                    window.debug.log(`VideoPlaybackController ${videoStateCore.source}: 'error' event received while waiting for 'canplaythrough': ${error.message || error.code}`, 'error');
                }
                if (videoStateCore.errorManager) {
                    videoStateCore.errorManager.handleVideoError(error, 'error_awaiting_canplaythrough');
                }
                reject(error);
            };
            
            const cleanupPlayListeners = () => {
                if (!videoStateCore.video) return; 
                videoStateCore.video.removeEventListener('canplaythrough', canPlayThroughHandler);
                videoStateCore.video.removeEventListener('error', errorHandler);
            };
            
            videoStateCore.video.addEventListener('canplaythrough', canPlayThroughHandler, { once: true });
            videoStateCore.video.addEventListener('error', errorHandler, { once: true });

            if (videoStateCore.video.networkState === HTMLMediaElement.NETWORK_EMPTY || videoStateCore.video.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
                if (settings.debug.verboseLoggingEnabled && window.debug) {
                    window.debug.log(`VideoPlaybackController: Explicitly calling video.load() for play() of ${videoStateCore.source} due to networkState ${videoStateCore.video.networkState}`);
                }
                videoStateCore.video.load();
            }
        });
    }
    
    /**
     * Pauses the video.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @param {string} [reason='stall'] - The reason for pausing.
     */
    static pause(videoStateCore, reason = 'stall') {
        if (videoStateCore.video) {
            videoStateCore.pauseReason = reason;
            videoStateCore.video.pause();
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoPlaybackController ${videoStateCore.source}: video.pause() called. Reason: ${videoStateCore.pauseReason}`);
            }
        }
    }

    /**
     * Checks if the video is ready for transition (delegates to playbackManager).
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @returns {boolean}
     */
    static isReadyForTransition(videoStateCore) {
        return videoStateCore.playbackManager ? videoStateCore.playbackManager.isReadyForTransition() : false;
    }

    /**
     * Checks if the video is sufficiently preloaded (delegates to playbackManager).
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @returns {boolean}
     */
    static isSufficientlyPreloaded(videoStateCore) {
        return videoStateCore.playbackManager ? videoStateCore.playbackManager.isSufficientlyPreloaded() : false;
    }
}

export default VideoPlaybackController;
