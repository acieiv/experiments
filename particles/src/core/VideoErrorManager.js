/**
 * VideoErrorManager.js
 * Centralizes error handling and retry logic for a VideoState instance.
 */

class VideoErrorManager {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance;
        this.video = videoStateInstance.video; // Assuming video element is available

        this.retryCount = 0;
        this.maxRetries = 3; // Default, can be overridden by options in VideoState
        this.waitingCount = 0;
        this.maxWaitingRetries = 5; // Default
    }

    // Called when a video error, stall, or excessive waiting occurs
    handleVideoError(error, type = 'general') {
        console.error(`VideoErrorManager: Error for ${this.videoState.source} (type: ${type}):`, error.message || error);
        this.videoState.playing = false; // Ensure playing flag is false

        if (this.videoState.playbackManager) {
             // Notify playback manager about the error/stutter if it's a relevant type
            if (type === 'stalled' || type === 'waiting') {
                this.videoState.playbackManager.handleStutter();
            }
        }


        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`VideoErrorManager: Retrying playback for ${this.videoState.source} (attempt ${this.retryCount}/${this.maxRetries})`);
            
            setTimeout(() => {
                if (this.video) {
                    console.log(`VideoErrorManager: Reloading video source ${this.videoState.source}`);
                    this.video.load(); // Reload the video
                    this.videoState.play().catch(e => { // Use VideoState's play method
                        console.warn(`VideoErrorManager: Retry ${this.retryCount} for ${this.videoState.source} failed:`, e.message || e);
                        if (this.retryCount >= this.maxRetries) {
                            console.error(`VideoErrorManager: Max retries (${this.maxRetries}) reached for ${this.videoState.source}. Playback failed.`);
                        }
                    });
                } else {
                     console.warn(`VideoErrorManager: Video element not available for retry for ${this.videoState.source}`);
                }
            }, 1000 * this.retryCount); // Exponential backoff for retries could be considered
        } else {
            console.error(`VideoErrorManager: Max retries (${this.maxRetries}) reached for ${this.videoState.source}. No more retries.`);
            // Potentially emit an event or call a callback to signal permanent failure
        }
    }

    // Specifically for 'waiting' events that might lead to a reload
    handleWaiting() {
        this.videoState.playing = false; // Video is not actively playing if waiting
        this.waitingCount++;
        
        if (this.videoState.playbackManager) {
            this.videoState.playbackManager.handleStutter(); // Treat waiting as a stutter
        }

        console.warn(`VideoErrorManager: Video waiting for ${this.videoState.source} (count: ${this.waitingCount})`);

        if (this.waitingCount >= this.maxWaitingRetries) {
            console.warn(`VideoErrorManager: Too many waiting events for ${this.videoState.source}, triggering error handler to reload.`);
            this.handleVideoError(new Error('Excessive waiting'), 'waiting');
            this.waitingCount = 0; // Reset after triggering error
        }
    }

    // Reset counters when video successfully loads or plays
    resetCounters() {
        this.retryCount = 0;
        this.waitingCount = 0;
        // console.log(`VideoErrorManager: Error/waiting counters reset for ${this.videoState.source}`);
    }

    // Initialize with options if provided by VideoState
    initializeOptions(options) {
        if (options) {
            this.maxRetries = options.maxRetries !== undefined ? options.maxRetries : this.maxRetries;
            this.maxWaitingRetries = options.maxWaitingRetries !== undefined ? options.maxWaitingRetries : this.maxWaitingRetries;
        }
    }
}

export default VideoErrorManager;
