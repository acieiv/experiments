/**
 * VideoManager.js
 * Manages video transitions and effects using VideoPool
 */

import { Vector2 } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../config/settings.js';
import VideoPool from './VideoPool.js';
import VideoTransitionController from './VideoTransitionController.js';

class VideoManager {
    /**
     * Create a new VideoManager
     * @param {THREE.Scene} scene - The Three.js scene
     */
    constructor(scene) {
        this.scene = scene;
        this.videoPool = null;
        this.transitionController = null;
        
        // Initialize
        this.initialize();
    }
    
    initialize() {
        console.log("Initializing VideoManager");
        
        // Create video pool
        this.videoPool = new VideoPool(
            settings.video.sources,
            this.scene,
            {
                planeSize: settings.video.planeSize,
                position: settings.video.position,
                parallaxAmount: settings.video.parallaxAmount,
                shaders: settings.shaders
            }
        );

        // Create transition controller
        this.transitionController = new VideoTransitionController(this.videoPool);
    }
    
    /**
     * Update video transitions and effects
     * @param {number} time - Current time in milliseconds
     * @param {number} deltaTime - Time since last update in seconds
     */
    update(time, deltaTime) {
        if (!this.videoPool || !this.transitionController) return;
        
        // Update transition controller
        this.transitionController.update(deltaTime);
        
        // Video states will be updated with mouse position in updateParallax
        // Time is passed for potential time-based effects within VideoState itself
        this.videoPool.updateStates({ time });
    }
    
    /**
     * Update parallax effect
     * @param {number} mouseX - Normalized mouse X position (-1 to 1)
     * @param {number} mouseY - Normalized mouse Y position (-1 to 1)
     */
    updateParallax(mouseX, mouseY) {
        if (!this.videoPool) return;
        const mousePosition = new Vector2(mouseX, mouseY);
        this.videoPool.updateStates({ mousePosition, mouseX, mouseY });
    }
    
    /**
     * Update look at target
     * @param {THREE.Camera} camera - The camera to look at
     */
    updateLookAt(camera) {
        if (!this.videoPool) return;
        this.videoPool.updateStates({ lookAtTarget: camera.position });
    }
    
    /**
     * Update material uniforms
     * @private
     * @param {string} uniformName - Name of the uniform to update
     * @param {*} value - New value for the uniform
     */
    updateUniform(uniformName, value) {
        if (!this.videoPool) return;
        this.videoPool.states.forEach(state => {
            if (state.mesh?.material?.uniforms?.[uniformName]) {
                state.mesh.material.uniforms[uniformName].value = value;
            }
        });
    }
    
    /**
     * Set a video property
     * @param {string} property - Property name (Scale, OffsetX, OffsetY)
     * @param {number} value - Property value
     */
    setVideoProperty(property, value) {
        this.updateUniform(`video${property}`, value);
    }
    
  // --- new helpers for the UI sliders -----------------
  setVideoScale ( scale ) {            // zoom slider
    this.setVideoProperty( 'Scale', scale );
  }

  setVideoOffsetX ( x ) {              // horizontal slider
    this.setVideoProperty( 'OffsetX', x );
  }

  setVideoOffsetY ( y ) {              // vertical slider
    this.setVideoProperty( 'OffsetY', y );
  }

    /**
     * Set video opacity
     * @param {number} opacity - Opacity value
     */
    setVideoOpacity(opacity) {
        if (!this.videoPool || !this.transitionController) return;
        
        if (this.transitionController.isTransitioning()) {
            // During transition, the controller handles individual opacities.
            // This call could adjust a master/target opacity if needed,
            // but the controller's logic would need to incorporate it.
            // For now, let's assume the controller's opacity logic is sufficient
            // or this function adjusts an overall "target" opacity that the controller might use.
            // Simplest approach: if transitioning, let controller manage. If not, set active.
            // However, to allow UI to dim overall scene including during transition:
            const progress = this.transitionController.getTransitionProgress();
            const forcedFactor = this.transitionController.wasForced() ? 0.8 : 1.0;

            this.videoPool.activeState?.setOpacity(opacity * (1.0 - progress) * forcedFactor);
            this.videoPool.nextState?.setOpacity(opacity * progress * forcedFactor);

        } else {
            this.videoPool.activeState?.setOpacity(opacity);
            // Ensure next video is hidden if not transitioning
            this.videoPool.nextState?.setOpacity(0);
        }
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        this.videoPool?.cleanup();
        this.videoPool = null;
        this.transitionController = null; // Clean up controller reference
    }
}

export default VideoManager;
