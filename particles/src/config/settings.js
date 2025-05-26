/**
 * settings.js
 * Central configuration file for the crystal ball particle animation
 */

const settings = {
    // Scene settings
    scene: {
        backgroundColor: 0x000814, // Dark blue background
    },
    
    // Camera settings
    camera: {
        fov: 60,
        near: 0.1,
        far: 1000,
        position: { x: 0, y: 0, z: 5 },
        movementRange: 0.3, // How much the camera moves with mouse
    },
    
    // Particle system settings
    particles: {
        count: 6000,
        radius: 2,
        radiusVariation: 0.1,
        baseColor: 0x3388ff, // Blue base color for futuristic feel
        colorVariation: 0.3,
        minSize: 0.04,
        maxSize: 0.12,
        animationSpeed: 0.005,
        depthLayers: 3,
        depthVariation: 0.3,
        opacity: 0.5,
        parallaxDepthFactor: 0.6, // Added for parallax strength
        parallaxCounterRotationFactor: 0.008, // Added for counter-rotation effect
        rotationSpeed: {
            x: 0.00005,
            y: 0.0001,
            z: 0.00002
        },
        // Enhanced noise-based motion system
        noise: {
            scale: 0.4,              // Noise field scale (lowered for more organic drift)
            speed: 0.3,              // Noise evolution speed
            strength: 2.0,           // Movement amplitude (increased from 0.02)
            octaves: 2,              // Noise complexity layers
            seed: 12345,             // Deterministic behavior
            rotation: 0.1,           // Field rotation speed
            centerDampening: 2.0,    // Fade-in curve strength near center (reverted to 2.0)
            turbulence: {
                enabled: true,
                strength: 0.008,     // Curl noise strength
                curlScale: 1.2,      // Scale for curl noise sampling
                helixFactor: 0.5     // Helical motion influence
            }
        }
    },
    
    // Video settings
    video: {
        sources: [
            'src/assets/videos/Football_Game_Video_Generated.mp4',
            'src/assets/videos/Football_Video_Generation_Complete.mp4',
            'src/assets/videos/Football_AI_Generated.mp4'
        ],
        planeSize: 3.0,
        position: { z: -1.0 },
        initialOpacity: 0.8,
        transitionDuration: 2.0, // seconds for fade transition
        videoDuration: 20.0, // seconds before switching videos (Increased from 15.0)
        maxNextBufferWaitDuration: 5.0, // seconds to wait for next video to buffer before forcing transition
        parallaxAmount: 0.15, // How much the video planes move with mouse
        gentlePauseWaitingCountThreshold: 3, // Number of 'waiting' events before more aggressive stall handling
        gentlePauseRecoveryTimeoutMs: 2500, // Milliseconds to wait for recovery during a gentle pause
        fallbackVideoUrl: 'src/assets/videos/fallback_video.mp4', // Default fallback video
        maxLoadRetries: 1, // Retries for initial load/HEAD check
    },
    
    // Shader settings
    shaders: {
        video: {
            defaultScale: 0.75,
            defaultOffsetX: 0.0,
            defaultOffsetY: 0.0,
            distortionStrength: 0.02,
            edgeGlowFactor: 0.7,
            pulseSpeed: 0.001,
            pulseAmount: 0.05,
        }
    },
    
    // UI settings
    ui: {
        controls: {
            opacity: {
                label: 'Video Blend',
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.8
            },
            zoom: {
                label: 'Zoom',
                min: 0.3,
                max: 1.0,
                step: 0.01,
                default: 0.75
            },
            offsetX: {
                label: 'Horizontal',
                min: -0.2,
                max: 0.2,
                step: 0.01,
                default: 0
            },
            offsetY: {
                label: 'Vertical',
                min: -0.2,
                max: 0.2,
                step: 0.01,
                default: 0
            }
        }
    },
    
    // Mouse settings
    mouse: {
        influence: 0.001, // How much mouse movement affects the scene
        smoothing: 0.08   // Smoothing factor for mouse movement
    },

    // Caching settings
    caching: {
        videosEnabled: true,        // Master switch for video caching via Cache API
        videoCacheName: 'particle-video-cache-v1' // Name for the video cache storage
    },

    // Debug settings
    debug: {
        enabled: true,                 // Master switch for all debug logs/overlays
        verboseLoggingEnabled: false,  // Enables more detailed console logs
        logLevel: 1                    // 0: errors only, 1: info, 2: verbose/spammy
    }
};

export default settings;
