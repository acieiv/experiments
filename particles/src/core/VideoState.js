/**
 * VideoState.js
 * Manages the state and lifecycle of a single video in the crystal ball animation
 */

import {
    VideoTexture,
    CanvasTexture,
    LinearFilter,
    RGBAFormat,
    Mesh
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import MaterialFactory from './MaterialFactory.js';

class VideoState {
    // Video event handlers configuration
    static EVENT_HANDLERS = {
        loadeddata: (instance, video) => {
            console.log(`Video loaded: ${instance.source} (${video.videoWidth}x${video.videoHeight})`);
            instance.loaded = true;
            instance.retryCount = 0;
            instance.waitingCount = 0;
            
            // Move to buffering state
            instance.playbackState = 'buffering';
            console.log(`Video state: ${instance.source} → buffering`);
            
            // Only start playing if not just preloading
            if (!instance.preloaded) {
                instance.play().catch(e => instance.handleVideoError(e));
            }
        },
        play: (instance) => {
            console.log(`Video started playing: ${instance.source}`);
            instance.playing = true;
            instance.retryCount = 0;
            instance.waitingCount = 0;
            
            // Start tracking playback time
            if (instance.playbackState === 'buffering') {
                instance.playbackState = 'playing';
                instance.playbackStartTime = performance.now();
                console.log(`Video state: ${instance.source} → playing`);
            }
        },
        pause: (instance) => {
            console.log(`Video paused: ${instance.source}`);
            instance.playing = false;
            
            // Reset state on pause
            if (instance.playbackState === 'playing' || instance.playbackState === 'ready') {
                instance.playbackState = 'buffering';
                console.log(`Video state: ${instance.source} → buffering (paused)`);
            }
            
            // Only auto-resume if not preloaded
            if (!instance.preloaded) {
                instance.play().catch(e => instance.handleVideoError(e));
            }
        },
        error: (instance, _, e) => {
            console.error(`Error loading video ${instance.source}:`, e.target.error);
            instance.handleVideoError(e);
        },
        stalled: (instance) => {
            console.warn(`Video stalled: ${instance.source}`);
            instance.playing = false;
            
            // Reset state on stall
            if (instance.playbackState === 'playing' || instance.playbackState === 'ready') {
                instance.playbackState = 'buffering';
                console.log(`Video state: ${instance.source} → buffering (stalled)`);
            }
            
            instance.handleVideoError(new Error('Video stalled'));
        },
        waiting: (instance) => {
            console.warn(`Video waiting: ${instance.source}`);
            instance.playing = false;
            instance.waitingCount++;
            instance.lastStutterTime = performance.now();
            
            // Reset state on waiting
            if (instance.playbackState === 'playing' || instance.playbackState === 'ready') {
                instance.playbackState = 'buffering';
                console.log(`Video state: ${instance.source} → buffering (waiting)`);
            }
            
            // If waiting too frequently, try reloading
            if (instance.waitingCount >= instance.maxWaitingRetries) {
                console.warn(`Too many waiting events for ${instance.source}, reloading video`);
                instance.handleVideoError(new Error('Excessive waiting'));
                instance.waitingCount = 0;
            }
        },
        playing: (instance) => {
            console.log(`Video resumed playing: ${instance.source}`);
            instance.playing = true;
            instance.waitingCount = 0;
            
            // Start new playback period
            if (instance.playbackState === 'buffering') {
                instance.playbackState = 'playing';
                instance.playbackStartTime = performance.now();
                console.log(`Video state: ${instance.source} → playing (resumed)`);
            }
        }
    };

    /**
     * Create a new VideoState
     * @param {string} source - Video source URL
     * @param {BufferGeometry} planeGeometry - Shared geometry for video plane
     * @param {Function} createMaterial - Function to create shader material
     * @param {Object} options - Configuration options
     */
    constructor(source, planeGeometry, createMaterial, options) {
        // Core properties
        this.source = source;
        this.video = null;
        this.texture = null;
        this.mesh = null;
        this.loaded = false;
        this.playing = false;
        this.preloaded = false;
        this.opacity = 0;
        this.options = options;
        
        // Geometry and material
        this.planeGeometry = planeGeometry;
        this.createMaterial = createMaterial;
        this.tempTexture = null;
        this.meshCreated = false;
        this.hasHighQualityTexture = false;
        
        // Error handling
        this.retryCount = 0;
        this.maxRetries = 3;
        this.waitingCount = 0;
        this.maxWaitingRetries = 5;
        
        // Core state tracking
        this.playbackState = 'initializing'; // initializing, buffering, playing, ready
        this.minPlaybackTime = 3; // Seconds of successful playback required
        this.playbackStartTime = 0; // When stable playback began
        this.lastStutterTime = 0; // When last stutter occurred
        
        // Buffer management
        this.minBufferForPlayback = 2; // Start playing with 2s buffer
        this.minBufferForTransition = 4; // Allow transition with 4s buffer
        this.isBuffering = false;
        this.playbackRate = 1.0;
        this.lastBufferCheck = 0;
        this.bufferCheckInterval = 500; // Check buffer every 500ms
        
        // Create placeholder texture immediately
        this.createPlaceholderTexture();
        
        // Initialize video element
        this.initializeVideo();
    }

    /**
     * Create a placeholder texture while video loads
     * @private
     */
    createPlaceholderTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Create a simple gradient as placeholder
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, '#2c3e50');
        gradient.addColorStop(1, '#1a2634');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        // Add loading indicator
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Loading...', 32, 32);
        
        // Create temporary texture
        this.tempTexture = new CanvasTexture(canvas);
        this.tempTexture.minFilter = LinearFilter;
        this.tempTexture.magFilter = LinearFilter;
        
        // Create initial texture using placeholder
        this.texture = this.tempTexture;
        
        // Create mesh with placeholder texture
        this.createMesh();
    }

    /**
     * Check if video has enough buffer to play smoothly
     * @param {boolean} [forTransition=false] - Whether this check is for transition readiness
     * @returns {boolean} True if enough buffer is available
     */
    hasEnoughBuffer(forTransition = false) {
        if (!this.video) return false;
        
        // Get time ranges of buffered video
        const buffered = this.video.buffered;
        const currentTime = this.video.currentTime;
        
        // Find the buffer range that contains current time
        for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
                const bufferAhead = buffered.end(i) - currentTime;
                
                // Update state based on buffer
                this.updatePlaybackState(bufferAhead);
                
                // Adjust playback rate based on state and buffer
                this.adjustPlaybackRate(bufferAhead);
                
                // Different thresholds for transition vs regular playback
                const threshold = forTransition ? 
                    this.minBufferForTransition : 
                    this.minBufferForPlayback;
                
                return bufferAhead >= threshold;
            }
        }
        
        return false;
    }

    /**
     * Adjust video playback rate based on buffer size and stability
     * @private
     * @param {number} bufferAhead - Seconds of video buffered ahead
     * @param {boolean} isStable - Whether buffer level is stable
     */
    adjustPlaybackRate(bufferAhead) {
        if (!this.video) return;
        
        // Base rate on state and buffer
        let targetRate = 1.0;
        
        switch (this.playbackState) {
            case 'buffering':
                // Aggressive slowdown during initial buffering
                targetRate = bufferAhead < this.minBufferForPlayback ? 0.5 : 0.7;
                this.isBuffering = true;
                break;
                
            case 'playing':
                // Moderate slowdown during initial playback
                targetRate = bufferAhead < this.minBufferForPlayback ? 0.7 : 0.9;
                this.isBuffering = bufferAhead < this.minBufferForPlayback;
                break;
                
            case 'ready':
                // Normal playback when ready, slight speedup if buffer is very high
                targetRate = bufferAhead > this.minBufferForTransition * 2 ? 1.1 : 1.0;
                this.isBuffering = false;
                break;
                
            default:
                // Default to slow playback for other states
                targetRate = 0.7;
                this.isBuffering = true;
        }
        
        // Smooth transition to target rate
        const adjustmentRate = this.playbackState === 'ready' ? 0.15 : 0.1;
        this.playbackRate = this.playbackRate + (targetRate - this.playbackRate) * adjustmentRate;
        
        // Only apply if change is significant
        if (Math.abs(this.video.playbackRate - this.playbackRate) > 0.05) {
            this.video.playbackRate = this.playbackRate;
            console.log(
                `Adjusting playback rate for ${this.source}:`,
                `${this.video.playbackRate.toFixed(2)}x`,
                `(target: ${targetRate.toFixed(2)}x,`,
                `buffer: ${bufferAhead.toFixed(1)}s,`,
                `state: ${this.playbackState})`
            );
        }
    }

    /**
     * Preload the video without starting playback
     */
    preload() {
        if (!this.video) return;
        
        // Set preload attribute to auto
        this.video.preload = 'auto';
        
        // Load the video without playing
        this.video.load();
        
        // Mark as preloaded
        this.preloaded = true;
        
        console.log(`Preloading video: ${this.source}`);
    }

    /**
     * Check if video is ready for transition
     * @returns {boolean} True if video is loaded and playing with enough buffer
     */
    /**
     * Update playback state based on buffer and time
     * @private
     * @param {number} bufferAhead - Seconds of video buffered ahead
     */
    updatePlaybackState(bufferAhead) {
        const now = performance.now();
        
        switch (this.playbackState) {
            case 'initializing':
                if (this.loaded && this.playing) {
                    this.playbackState = 'buffering';
                    console.log(`Video state: ${this.source} → buffering`);
                }
                break;
                
            case 'buffering':
                if (bufferAhead >= this.minBufferForPlayback) {
                    this.playbackState = 'playing';
                    this.playbackStartTime = now;
                    console.log(`Video state: ${this.source} → playing`);
                }
                break;
                
            case 'playing':
                if (now - this.playbackStartTime > this.minPlaybackTime * 1000 &&
                    now - this.lastStutterTime > this.minPlaybackTime * 1000) {
                    this.playbackState = 'ready';
                    console.log(`Video state: ${this.source} → ready`);
                }
                break;
                
            case 'ready':
                // Stay in ready state unless we stutter
                break;
        }
    }
    
    isReadyForTransition() {
        // Basic state checks
        const basicChecks = this.loaded && this.playing && 
                          this.video && !this.video.paused && 
                          !this.video.ended && this.video.readyState >= 3;
        
        if (!basicChecks) return false;
        
        // Get current buffer state
        let bufferAhead = 0;
        const currentTime = this.video.currentTime;
        const buffered = this.video.buffered;
        
        for (let i = 0; i < buffered.length; i++) {
            if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
                bufferAhead = buffered.end(i) - currentTime;
                break;
            }
        }
        
        // Check if we've been playing long enough
        const playbackTime = this.playbackState === 'ready' ? 
            performance.now() - this.playbackStartTime : 0;
        const hasPlayedLongEnough = playbackTime > this.minPlaybackTime * 1000;
        
        // More flexible readiness criteria:
        // 1. If in 'ready' state with long playback time, accept lower buffer (1s minimum)
        // 2. If not in 'ready' state, require full buffer
        // 3. If buffer is very large (2x minimum), accept regardless of state
        
        let isReady = false;
        
        if (this.playbackState === 'ready' && hasPlayedLongEnough) {
            // In ready state with sufficient playback time, accept lower buffer
            isReady = bufferAhead >= Math.min(1, this.minBufferForTransition / 4);
        } else if (bufferAhead >= this.minBufferForTransition * 2) {
            // Very large buffer, accept regardless of state
            isReady = true;
        } else {
            // Standard case: require minimum buffer
            isReady = bufferAhead >= this.minBufferForTransition;
        }
        
        // Enhanced logging
        if (!isReady) {
            console.log(
                `Video not ready: ${this.source}`,
                `(buffer: ${bufferAhead.toFixed(1)}s/${this.minBufferForTransition}s,`,
                `state: ${this.playbackState},`,
                `played: ${(playbackTime/1000).toFixed(1)}s/${this.minPlaybackTime}s)`
            );
        }
        
        return isReady;
    }
    
    /**
     * Create mesh with current texture
     * @private
     */
    createMesh() {
        if (this.meshCreated) return;
        
        try {
            // Create mesh with material
            this.mesh = new Mesh(
                this.planeGeometry,
                this.createMaterial(this.texture, this.opacity)
            );
            
            // Position mesh
            this.mesh.position.z = this.options.position.z;
            
            this.meshCreated = true;
        } catch (error) {
            console.error('Error creating mesh:', error);
            this.mesh = null;
            this.meshCreated = false;
        }
    }

    /**
     * Initialize video element and setup event handlers
     * @private
     */
    initializeVideo() {
        console.log(`Initializing VideoState for ${this.source}`);
        
        try {
            // Create and setup video element
            this.video = document.createElement('video');
            
            // Set video attributes
            this.video.loop = true;
            this.video.muted = true;
            this.video.crossOrigin = "anonymous";
            this.video.playsInline = true;
            this.video.preload = "auto"; // Changed from metadata to auto
            
            // Set initial dimensions
            this.video.width = 720;
            this.video.height = 720;
            
            // Add event listeners
            this.setupVideoEventListeners(this.video);
            
            // Add loadeddata handler for texture update
            this.video.addEventListener('loadeddata', () => {
                if (this.video.videoWidth && this.video.videoHeight) {
                    // Create video texture once video is loaded
                    this.texture = new VideoTexture(this.video);
                    this.texture.minFilter = LinearFilter;
                    this.texture.magFilter = LinearFilter;
                    this.texture.format = RGBAFormat;
                    this.texture.needsUpdate = true;
                    
                    // Update mesh with new texture
                    if (this.mesh?.material) {
                        this.mesh.material.uniforms.videoTexture.value = this.texture;
                        this.mesh.material.needsUpdate = true;
                    }
                    
                    this.hasHighQualityTexture = true;
                    console.log(`Enhanced texture quality for ${this.source}`);
                }
            });
            
            // Set source last
            this.video.src = this.source;
            
            // Start loading
            this.video.load();
            
        } catch (error) {
            console.error('Error initializing video:', error);
            this.handleVideoError(error);
        }
    }
    
    /**
     * Setup video event listeners
     * @private
     * @param {HTMLVideoElement} video - The video element
     */
    setupVideoEventListeners(video) {
        Object.entries(VideoState.EVENT_HANDLERS).forEach(([event, handler]) => {
            video.addEventListener(event, (e) => handler(this, video, e));
        });
    }
    
    /**
     * Update video state
     * @param {Object} params - Update parameters
     */
    update(params) {
        const { time, mousePosition, mouseX, mouseY, lookAtTarget, parallaxAmount } = params;
        if (!this.mesh) return;

        // Check buffer status periodically
        const now = performance.now();
        if (now - this.lastBufferCheck > this.bufferCheckInterval) {
            this.lastBufferCheck = now;
            
            if (this.playing) {
                const buffered = this.video?.buffered;
                const currentTime = this.video?.currentTime;
                let bufferAhead = 0;
                
                if (buffered && currentTime !== undefined) {
                    for (let i = 0; i < buffered.length; i++) {
                        if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
                            bufferAhead = buffered.end(i) - currentTime;
                            break;
                        }
                    }
                }
                
                const hasEnoughBuffer = this.hasEnoughBuffer();
                
                // Log buffer status with state info
                const status = {
                    buffer: `${bufferAhead.toFixed(1)}s/${this.minBufferForTransition}s`,
                    state: this.playbackState,
                    rate: `${this.video?.playbackRate.toFixed(2)}x`,
                    readyState: this.video?.readyState
                };
                
                if (!hasEnoughBuffer || this.playbackState !== 'ready') {
                    console.log(`Buffer status for ${this.source}:`, status);
                }
            }
        }

        // Update material uniforms
        if (this.mesh.material) {
            MaterialFactory.updateUniforms(this.mesh.material, {
                time,
                mousePosition,
                opacity: this.isBuffering ? Math.max(0.5, this.opacity) : this.opacity // Fade slightly when buffering
            });
            
            // Update texture if video is ready and not already high quality
            if (this.video && 
                this.video.readyState >= 3 && // HAVE_FUTURE_DATA
                !this.hasHighQualityTexture && 
                this.video.videoWidth && 
                this.video.videoHeight) {
                
                // Create new video texture
                const videoTexture = new VideoTexture(this.video);
                videoTexture.minFilter = LinearFilter;
                videoTexture.magFilter = LinearFilter;
                videoTexture.format = RGBAFormat;
                
                // Update material with new texture
                this.mesh.material.uniforms.videoTexture.value = videoTexture;
                this.mesh.material.needsUpdate = true;
                
                // Clean up old texture
                if (this.texture && this.texture !== this.tempTexture) {
                    this.texture.dispose();
                }
                
                this.texture = videoTexture;
                this.hasHighQualityTexture = true;
                console.log(`Enhanced texture quality for ${this.source}`);
            }
        }

        // Update parallax
        if (mouseX !== undefined && mouseY !== undefined && parallaxAmount !== undefined) {
            const parallaxScale = this.isBuffering ? parallaxAmount * 0.5 : parallaxAmount;
            this.mesh.position.x = -mouseX * parallaxScale;
            this.mesh.position.y = -mouseY * parallaxScale;
        }

        // Update look at target
        if (lookAtTarget) {
            this.mesh.lookAt(lookAtTarget);
        }
    }
    
    /**
     * Set the opacity of the video
     * @param {number} value - Opacity value (0-1)
     */
    setOpacity(value) {
        this.opacity = value;
        if (this.mesh?.material) {
            MaterialFactory.updateUniforms(this.mesh.material, {
                opacity: value
            });
        }
    }
    
    /**
     * Start video playback
     * @returns {Promise} Resolves when playback starts
     */
    play() {
        if (!this.video) {
            return Promise.reject(new Error('No video element'));
        }
        return this.video.play();
    }
    
    /**
     * Pause video playback
     */
    pause() {
        this.video?.pause();
    }
    
    /**
     * Handle video errors
     * @private
     * @param {Error} error - The error that occurred
     */
    handleVideoError(error) {
        console.error(`Video error for ${this.source}:`, error);
        this.playing = false;
        
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`Retrying playback (attempt ${this.retryCount}/${this.maxRetries})`);
            
            // Wait briefly before retrying
            setTimeout(() => {
                if (this.video) {
                    this.video.load(); // Reload the video
                    this.play().catch(e => {
                        console.warn(`Retry ${this.retryCount} failed:`, e);
                        if (this.retryCount >= this.maxRetries) {
                            console.error(`Max retries (${this.maxRetries}) reached for ${this.source}`);
                        }
                    });
                }
            }, 1000); // 1 second delay between retries
        } else {
            console.error(`Max retries (${this.maxRetries}) reached for ${this.source}`);
        }
    }
    
    /**
     * Clean up resources
     */
    cleanup() {
        this.pause();
        this.video?.remove();
        this.texture?.dispose();
        this.mesh?.material?.dispose();
        
        this.video = null;
        this.texture = null;
        this.mesh = null;
        this.loaded = false;
    }
}

export default VideoState;
