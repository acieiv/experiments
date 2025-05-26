/**
 * VideoCleaner.js
 * Handles the cleanup process for a video state, releasing resources.
 * Operates on a VideoStateCore instance.
 */

import settings from '../../config/settings.js';
// VideoPlaybackController is used to call pause, ensure its path is correct if it's also refactored.
// For now, assuming it will be in the same directory as VideoState (the facade)
import VideoPlaybackController from './VideoPlaybackController.js'; 

class VideoCleaner {
    /**
     * Cleans up resources associated with the video state.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     */
    static cleanup(videoStateCore) {
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoCleaner: Cleaning up ${videoStateCore.source}`);
        }

        // Use VideoPlaybackController to pause, if available and video element exists
        if (videoStateCore.video) {
            VideoPlaybackController.pause(videoStateCore, 'cleanup');
        }

        videoStateCore.eventHandler?.cleanupEventListeners();
        
        if (videoStateCore.video && videoStateCore.onLoadedDataForTextureHandler) {
            videoStateCore.video.removeEventListener('loadeddata', videoStateCore.onLoadedDataForTextureHandler);
            videoStateCore.onLoadedDataForTextureHandler = null; 
        }

        videoStateCore.textureManager?.cleanup();
        // playbackManager and errorManager cleanup if they implement it
        // videoStateCore.playbackManager?.cleanup(); 
        // videoStateCore.errorManager?.cleanup();

        if (videoStateCore.mesh?.material?.uniforms?.videoTexture && videoStateCore.textureManager?.getInitialTexture()) {
            videoStateCore.mesh.material.uniforms.videoTexture.value = videoStateCore.textureManager.getInitialTexture();
            videoStateCore.mesh.material.needsUpdate = true;
        }
        
        videoStateCore.video?.remove(); // Remove from DOM
        videoStateCore.mesh?.material?.dispose();
        // videoStateCore.planeGeometry is shared, so not disposed here.
        
        // Reset core properties
        videoStateCore.video = null;
        videoStateCore.texture = null; // Should be handled by textureManager.cleanup()
        videoStateCore.mesh = null;
        videoStateCore.loaded = false;
        videoStateCore.playing = false;
        videoStateCore.meshCreated = false;
        videoStateCore.isPermanentlyFailed = false; // Reset failure state on cleanup
        videoStateCore.urlVerified = false;
        videoStateCore.preloaded = false;
        
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoCleaner: Cleanup complete for ${videoStateCore.source}`);
        }
    }
}

export default VideoCleaner;
