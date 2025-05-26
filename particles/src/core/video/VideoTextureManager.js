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
import settings from '../../config/settings.js'; // Adjusted path
import DebugOverlay from '../../utils/DebugOverlay.js'; // Adjusted path

class VideoTextureManager {
    constructor(videoStateInstance) {
        this.videoState = videoStateInstance; // Instance of VideoStateCore
        // this.video will be accessed dynamically via this.videoState.video

        this.tempTexture = null; // Placeholder texture
        this.actualVideoTexture = null; // HQ VideoTexture
        this.hasHighQualityTexture = false; // Flag if HQ texture object is created
        
        this.createPlaceholderTexture();
    }

    get video() { // Convenience getter
        return this.videoState ? this.videoState.video : null;
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

    // Called when video 'loadeddata' event fires (via VideoStateCore's onLoadedDataForTextureHandler)
    prepareHighQualityTexture() {
        const videoElement = this.video; 
        if (videoElement && videoElement.videoWidth && videoElement.videoHeight) {
            if (this.actualVideoTexture) { 
                this.actualVideoTexture.dispose();
            }
            this.actualVideoTexture = new VideoTexture(videoElement);
            this.actualVideoTexture.minFilter = LinearFilter;
            this.actualVideoTexture.magFilter = LinearFilter;
            this.actualVideoTexture.format = RGBAFormat; // Ensure RGBAFormat for consistency
            this.hasHighQualityTexture = true;
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoTextureManager: HQ texture prepared for ${this.videoState.source} (not yet active).`);
            }
            
            this.tryActivateHighQualityTexture();
        } else {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`VideoTextureManager: Cannot prepare HQ texture for ${this.videoState.source}, video dimensions not available. Video Element: ${videoElement}`, 'warn');
            }
        }
    }

    tryActivateHighQualityTexture() {
        const videoElement = this.video; 
        if (this.videoState.playing && // playing flag on VideoStateCore
            this.hasHighQualityTexture && 
            this.actualVideoTexture &&
            this.videoState.mesh?.material && 
            this.videoState.mesh.material.uniforms.videoTexture.value !== this.actualVideoTexture &&
            videoElement && videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) { // HAVE_CURRENT_DATA (2) or higher

            this.videoState.mesh.material.uniforms.videoTexture.value = this.actualVideoTexture;
            this.videoState.mesh.material.needsUpdate = true;
            this.videoState.texture = this.actualVideoTexture; 
            if (settings.debug.verboseLoggingEnabled && window.debug) {
                window.debug.log(`VideoTextureManager: Activated HQ texture for ${this.videoState.source}.`);
            }
            return true;
        }
        return false;
    }
    
    getInitialTexture() {
        // This is called by VideoStateCore constructor before video element exists.
        // So, it must always return the tempTexture.
        return this.tempTexture;
    }

    cleanup() {
        if (this.actualVideoTexture) {
            this.actualVideoTexture.dispose();
            this.actualVideoTexture = null;
        }
        if (this.tempTexture) {
            this.tempTexture.dispose(); 
            this.tempTexture = null;
        }
        this.hasHighQualityTexture = false;
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoTextureManager: Textures cleaned up for ${this.videoState.source}`);
        }
    }
}

export default VideoTextureManager;
