/**
 * VideoUpdater.js
 * Handles per-frame updates for a video, including material uniforms and parallax.
 * Also manages opacity updates.
 * Operates on a VideoStateCore instance.
 */

import MaterialFactory from '../MaterialFactory.js'; // Assuming MaterialFactory stays in src/core
import settings from '../../config/settings.js';


class VideoUpdater {
    /**
     * Update video state, called every frame.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @param {Object} params - Update parameters (time, mousePosition, etc.).
     */
    static update(videoStateCore, params) {
        const { time, mousePosition, mouseX, mouseY, lookAtTarget, parallaxAmount } = params;

        if (!videoStateCore.mesh || videoStateCore.isPermanentlyFailed) return;

        // Delegate updates to relevant managers if they have per-frame logic
        if (videoStateCore.playbackManager) {
            videoStateCore.playbackManager.update(); // Manages buffer checks, playback rate adjustments
        }
        if (videoStateCore.textureManager) {
            videoStateCore.textureManager.tryActivateHighQualityTexture(); // Checks if HQ texture can be applied
        }

        // Update material uniforms
        if (videoStateCore.mesh.material) {
            const currentOpacity = videoStateCore.playbackManager?.isBuffering ? 
                                   Math.max(0.5, videoStateCore.opacity) : 
                                   videoStateCore.opacity;
            MaterialFactory.updateUniforms(videoStateCore.mesh.material, {
                time,
                mousePosition,
                opacity: currentOpacity
            });
        }

        // Update parallax
        if (mouseX !== undefined && mouseY !== undefined && parallaxAmount !== undefined) {
            const currentParallaxAmount = videoStateCore.options.parallaxAmount !== undefined ? 
                                          videoStateCore.options.parallaxAmount : 
                                          parallaxAmount;
            const parallaxScale = videoStateCore.playbackManager?.isBuffering ? 
                                  currentParallaxAmount * 0.5 : 
                                  currentParallaxAmount;
            videoStateCore.mesh.position.x = -mouseX * parallaxScale;
            videoStateCore.mesh.position.y = -mouseY * parallaxScale;
        }

        // Update look at target
        if (lookAtTarget) {
            videoStateCore.mesh.lookAt(lookAtTarget);
        }
    }
    
    /**
     * Sets the opacity for the video mesh.
     * @param {VideoStateCore} videoStateCore - The core video state instance.
     * @param {number} value - The new opacity value.
     */
    static setOpacity(videoStateCore, value) {
        videoStateCore.opacity = value;
        if (videoStateCore.mesh?.material && !videoStateCore.isPermanentlyFailed) {
            const currentOpacity = videoStateCore.playbackManager?.isBuffering ? 
                                   Math.max(0.5, videoStateCore.opacity) : 
                                   videoStateCore.opacity;
            MaterialFactory.updateUniforms(videoStateCore.mesh.material, {
                opacity: currentOpacity
            });
        }
    }
}

export default VideoUpdater;
