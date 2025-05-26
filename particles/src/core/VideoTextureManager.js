/**
 * VideoTextureManager.js
 * Manages the creation and lifecycle of video textures for a VideoState instance.
 */
import {
    VideoTexture,
    CanvasTexture,
    LinearFilter,
    RGBAFormat
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../config/settings.js'; // Added
import DebugOverlay from '../utils/DebugOverlay.js'; // Added

class VideoTextureManager {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance;
        this.video = videoStateInstance.video; // Assuming video element is available

        this.tempTexture = null; // Placeholder texture
        this.actualVideoTexture = null; // HQ VideoTexture
        this.hasHighQualityTexture = false; // Flag if HQ texture object is created
        
        this.createPlaceholderTexture();
    }

    createPlaceholderTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, '#2c3e50');
        gradient.addColorStop(1, '#1a2634');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Loading...', 32, 32);
        
        this.tempTexture = new CanvasTexture(canvas);
        this.tempTexture.minFilter = LinearFilter;
        this.tempTexture.magFilter = LinearFilter;
        
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoTextureManager: Placeholder texture created for ${this.videoState.source}`);
        }
    }

    // Called when video 'loadeddata' event fires
    prepareHighQualityTexture() {
        if (this.video && this.video.videoWidth && this.video.videoHeight) {
            if (this.actualVideoTexture) { // Dispose previous one if any
                this.actualVideoTexture.dispose();
            }
            this.actualVideoTexture = new VideoTexture(this.video);
            this.actualVideoTexture.minFilter = LinearFilter;
            this.actualVideoTexture.magFilter = LinearFilter;
            this.actualVideoTexture.format = RGBAFormat;
            this.hasHighQualityTexture = true;
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoTextureManager: HQ texture prepared for ${this.videoState.source} (not yet active).`);
            }
            
            // If video is already playing and ready, attempt to activate immediately
            this.tryActivateHighQualityTexture();
        } else {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoTextureManager: Cannot prepare HQ texture for ${this.videoState.source}, video dimensions not available.`, 'warn');
            }
        }
    }

    // Called when video 'playing' event fires, or during update loop
    tryActivateHighQualityTexture() {
        if (this.videoState.playing && 
            this.hasHighQualityTexture && 
            this.actualVideoTexture &&
            this.videoState.mesh?.material && 
            this.videoState.mesh.material.uniforms.videoTexture.value !== this.actualVideoTexture &&
            this.video && this.video.readyState >= 2) { // HAVE_CURRENT_DATA

            this.videoState.mesh.material.uniforms.videoTexture.value = this.actualVideoTexture;
            this.videoState.mesh.material.needsUpdate = true;
            this.videoState.texture = this.actualVideoTexture; // Update VideoState's main texture reference
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoTextureManager: Activated HQ texture for ${this.videoState.source}.`);
            }
            return true;
        }
        return false;
    }

    getCurrentTexture() {
        // Prefer actual video texture if it's ready and active, otherwise placeholder
        if (this.hasHighQualityTexture && this.actualVideoTexture && 
            this.videoState.mesh?.material?.uniforms.videoTexture.value === this.actualVideoTexture) {
            return this.actualVideoTexture;
        }
        return this.tempTexture;
    }
    
    getInitialTexture() {
        return this.tempTexture;
    }

    cleanup() {
        // The tempTexture might be shared or managed differently, so we primarily dispose the actualVideoTexture.
        if (this.actualVideoTexture) {
            this.actualVideoTexture.dispose();
            this.actualVideoTexture = null;
        }
        // tempTexture is a CanvasTexture, its canvas element might need explicit handling if not garbage collected.
        // For now, we assume it's simple enough.
        if (this.tempTexture) {
            this.tempTexture.dispose(); // Dispose placeholder as well
            this.tempTexture = null;
        }
        this.hasHighQualityTexture = false;
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoTextureManager: Textures cleaned up for ${this.videoState.source}`);
        }
    }
}

export default VideoTextureManager;
