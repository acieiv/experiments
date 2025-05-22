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
        rotationSpeed: {
            x: 0.00005,
            y: 0.0001,
            z: 0.00002
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
        videoDuration: 15.0, // seconds before switching videos
        parallaxAmount: 0.15, // How much the video planes move with mouse
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
    }
};

export default settings;
