/**
 * VideoManager.js
 * Manages video transitions and effects using VideoPool
 */

import { Vector2 } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../config/settings.js';
import VideoPool from './VideoPool.js';

class VideoManager {
    /**
     * Create a new VideoManager
     * @param {THREE.Scene} scene - The Three.js scene
     */
    constructor(scene) {
        this.scene = scene;
        this.videoPool = null;
        this.transitionState = {
            isTransitioning: false,
            progress: 0,
            time: 0,
            readinessChecks: 0,
            lastReadinessCheck: 0,
            readinessCheckInterval: 500, // Check readiness every 500ms
            failedAttempts: 0,
            maxFailedAttempts: 3,
            forcedTransition: false
        };
        
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
    }
    
    /**
     * Update video transitions and effects
     * @param {number} time - Current time in milliseconds
     * @param {number} deltaTime - Time since last update in seconds
     */
    update(time, deltaTime) {
        if (!this.videoPool) return;
        
        // Update transition state
        if (this.transitionState.isTransitioning) {
            this.updateTransition(deltaTime);
        } else {
            this.checkStartTransition(deltaTime);
        }
        
        // Video states will be updated with mouse position in updateParallax
        this.videoPool.updateStates({ time });
    }
    
    /**
     * Update transition state
     * @private
     * @param {number} deltaTime - Time since last update in seconds
     */
    /**
     * Update transition state
     * @private
     * @param {number} deltaTime - Time since last update in seconds
     */
    updateTransition(deltaTime) {
        // Use shorter duration for forced transitions
        const duration = this.transitionState.forcedTransition ? 
            settings.video.transitionDuration * 0.5 : 
            settings.video.transitionDuration;
        
        // Update transition progress
        this.transitionState.progress += deltaTime / duration;
        
        if (this.transitionState.progress >= 1.0) {
            this.completeTransition();
        } else {
            // Update opacities using easing
            const progress = this.easeInOutCubic(this.transitionState.progress);
            
            // Add slight opacity reduction during forced transitions
            const forcedOpacityFactor = this.transitionState.forcedTransition ? 0.8 : 1.0;
            
            this.videoPool.activeState.setOpacity((1.0 - progress) * forcedOpacityFactor);
            this.videoPool.nextState.setOpacity(progress * forcedOpacityFactor);
        }
    }
    
    /**
     * Check if it's time to start a new transition
     * @private
     * @param {number} deltaTime - Time since last update in seconds
     */
    /**
     * Check if videos are ready for transition
     * @private
     * @returns {boolean} True if both videos are ready
     */
    checkVideosReady() {
        const now = performance.now();
        if (now - this.transitionState.lastReadinessCheck < this.transitionState.readinessCheckInterval) {
            return false;
        }
        
        this.transitionState.lastReadinessCheck = now;
        this.transitionState.readinessChecks++;
        
        const activeReady = this.videoPool.activeState.isReadyForTransition();
        const nextReady = this.videoPool.nextState.isReadyForTransition();
        
        // Log readiness status
        console.log(`Video readiness check #${this.transitionState.readinessChecks}:`);
        if (!activeReady) {
            console.log("- Active video not ready");
        }
        if (!nextReady) {
            console.log("- Next video not ready");
        }
        
        // Only require active video to be ready
        // This is a key change - we no longer require both videos to be ready
        return activeReady;
    }
    
    /**
     * Force transition to next video even if not fully ready
     * @private
     */
    forceTransition() {
        console.warn("Forcing transition to next video");
        this.transitionState.isTransitioning = true;
        this.transitionState.progress = 0;
        this.transitionState.readinessChecks = 0;
        this.transitionState.failedAttempts = 0;
        this.transitionState.forcedTransition = true;
    }
    
    /**
     * Check if it's time to start a new transition
     * @private
     * @param {number} deltaTime - Time since last update in seconds
     */
    checkStartTransition(deltaTime) {
        this.transitionState.time += deltaTime;
        
        // Only check readiness if we've reached the transition time
        if (this.transitionState.time < settings.video.videoDuration) {
            return;
        }
        
        // Check if videos are ready
        if (this.checkVideosReady()) {
            console.log("Videos ready, starting transition");
            this.transitionState.isTransitioning = true;
            this.transitionState.progress = 0;
            this.transitionState.readinessChecks = 0;
            this.transitionState.failedAttempts = 0;
            this.transitionState.forcedTransition = false;
            return;
        }
        
        // If we've been waiting too long, try to recover
        if (this.transitionState.time >= settings.video.videoDuration * 2) {
            this.transitionState.failedAttempts++;
            console.warn(`Transition delayed significantly, attempt ${this.transitionState.failedAttempts}/${this.transitionState.maxFailedAttempts}`);
            
            if (this.transitionState.failedAttempts >= this.transitionState.maxFailedAttempts) {
                console.warn("Max failed attempts reached, forcing transition");
                this.forceTransition();
            } else {
                // Reset time but keep track of attempts
                this.transitionState.time = settings.video.videoDuration;
            }
        }
    }
    
    /**
     * Complete the current transition
     * @private
     */
    /**
     * Complete the current transition
     * @private
     */
    completeTransition() {
        const activeReady = this.videoPool.activeState.isReadyForTransition();
        const nextReady = this.videoPool.nextState.isReadyForTransition();
        
        // Complete transition if active video is ready OR we've been trying too long
        if (activeReady || this.transitionState.failedAttempts >= this.transitionState.maxFailedAttempts) {
            // Advance to next video
            this.videoPool.advance();
            
            // Reset transition state
            this.transitionState.isTransitioning = false;
            this.transitionState.progress = 0;
            this.transitionState.time = 0;
            this.transitionState.readinessChecks = 0;
            this.transitionState.failedAttempts = 0;
            this.transitionState.forcedTransition = false;
            
            console.log("Transition complete" + (activeReady ? "" : " (forced)"));
        } else {
            // If not ready, increment failed attempts
            this.transitionState.failedAttempts++;
            console.log(`Transition attempt ${this.transitionState.failedAttempts} failed`);
            
            // Reset progress but keep time accumulated
            this.transitionState.progress = 0;
            this.transitionState.isTransitioning = false;
        }
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
    
    /**
     * Set video opacity
     * @param {number} opacity - Opacity value
     */
    setVideoOpacity(opacity) {
        if (!this.videoPool) return;
        
        if (this.transitionState.isTransitioning) {
            // During transition, maintain the fade ratio but adjust overall opacity
            const progress = this.transitionState.progress;
            this.videoPool.activeState.setOpacity(opacity * (1.0 - progress));
            this.videoPool.nextState.setOpacity(opacity * progress);
        } else {
            this.videoPool.activeState.setOpacity(opacity);
        }
    }
    
    /**
     * Easing function for smooth transitions
     * @private
     * @param {number} t - Input value (0-1)
     * @returns {number} Eased value (0-1)
     */
    easeInOutCubic(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        this.videoPool?.cleanup();
        this.videoPool = null;
    }
}

export default VideoManager;
