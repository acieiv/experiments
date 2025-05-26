/**
 * VideoStateCore.js
 * Holds the core state properties and constructor for a video.
 * Instantiates and holds references to specialized manager modules.
 */

import settings from '../../config/settings.js';
// Managers will be in the same directory
import VideoEventHandler from './VideoEventHandler.js';
import VideoPlaybackManager from './VideoPlaybackManager.js';
import VideoTextureManager from './VideoTextureManager.js';
import VideoErrorManager from './VideoErrorManager.js';
// MaterialFactory might stay in src/core or be passed in if general
import MaterialFactory from '../MaterialFactory.js';


class VideoStateCore {
    /**
     * Create a new VideoStateCore
     * @param {string} source - Video source URL
     * @param {BufferGeometry} planeGeometry - Shared geometry for video plane
     * @param {Function} createMaterial - Function to create shader material (likely from MaterialFactory)
     * @param {Object} options - Configuration options
     */
    constructor(source, planeGeometry, createMaterial, options) {
        // Core properties
        this.source = source;
        this.video = null; // HTMLVideoElement, created in VideoInitializer
        this.texture = null; // Current THREE.Texture for the material
        this.mesh = null; // THREE.Mesh
        this.loaded = false; // True when video 'loadeddata' fires
        this.playing = false; // True when video is actively playing
        this.preloaded = false; // True if video was preloaded
        this.opacity = 0;
        this.options = options || {};
        this.loopCount = 0;
        this.hasPlayedOnce = false;
        this.onLoadedDataForTextureHandler = null; // For explicit listener management in VideoInitializer
        this.isCurrentUserVisible = false;
        this.hasEnded = false;
        this.isPermanentlyFailed = false;
        this.urlVerified = false;

        // Auto-resume and pause state properties
        this.pauseReason = 'none'; // 'none', 'stall', 'transition'
        this.isAttemptingAutoResume = false;
        this.autoResumeAttempts = 0;
        this.lastAutoResumeAttemptTime = 0;
        
        // Geometry and material creation references
        this.planeGeometry = planeGeometry;
        // createMaterial is passed in, likely MaterialFactory.createVideoMaterial
        this.createMaterial = createMaterial; 
        this.meshCreated = false;

        // Instantiate managers
        // These managers will operate on this VideoStateCore instance (passed as 'this' or 'videoState')
        this.textureManager = new VideoTextureManager(this);
        this.playbackManager = new VideoPlaybackManager(this);
        this.errorManager = new VideoErrorManager(this);
        this.eventHandler = new VideoEventHandler(this);

        // Initialize managers with options if they have such a method
        this.errorManager.initializeOptions(this.options);
        // Other managers can have similar init methods if needed

        // Set initial texture from TextureManager (placeholder)
        // This texture will be used by VideoInitializer when creating the mesh initially.
        this.texture = this.textureManager.getInitialTexture();
        
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoStateCore constructor complete for ${this.source}. Async initialization via VideoInitializer pending.`);
        }
    }

    /**
     * Sets the visual state and flags for an idle video.
     * This is called after the video has been paused with the correct reason ('idle').
     */
    setIdleVisualsAndFlags() {
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoStateCore: Setting idle visuals and flags for ${this.source}. Current pauseReason: ${this.pauseReason}`);
        }
        
        // Video should have been paused by VideoState facade using VideoPlaybackController,
        // which also sets this.pauseReason.
        // Update internal 'playing' status based on video's actual paused state.
        if (this.video) {
            this.playing = !this.video.paused;
        } else {
            this.playing = false;
        }
        
        // Hide the mesh
        if (this.mesh) {
            this.mesh.visible = false;
        }

        // Reset flags relevant for reuse
        this.hasEnded = false;
        this.preloaded = false; // Allow preload to re-evaluate buffering
        this.isCurrentUserVisible = false; // No longer the primary visible video

        // DO NOT reset:
        // this.video (HTML element)
        // this.mesh (Three.js object)
        // this.texture (unless explicitly managed by textureManager for idle states)
        // this.urlVerified
        // this.meshCreated
        // this.isPermanentlyFailed (this should only be set on actual unrecoverable errors)
        // this.loaded (this indicates if 'loadeddata' has fired, might still be relevant)

        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log(`VideoStateCore: ${this.source} is now set to idle. Mesh visible: ${this.mesh?.visible}, Playing: ${this.playing}, Preloaded: ${this.preloaded}`);
        }
    }
}

export default VideoStateCore;
