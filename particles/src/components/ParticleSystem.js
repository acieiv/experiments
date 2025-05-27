/**
 * ParticleSystem.js
 * Responsible for creating and managing the particle system
 */

import settings from '../config/settings.js';
import DebugOverlay from '../utils/DebugOverlay.js'; // Added
// SimplexNoise is now used by ParticleAnimator
import ParticleAttributeInitializer from './ParticleAttributeInitializer.js';
import ParticleAnimator from './ParticleAnimator.js';
import ParticleMaterialFactory from './ParticleMaterialFactory.js'; // Added import
import {
    BufferGeometry,
    Color,
    BufferAttribute,
    Points,
    Texture,
    AdditiveBlending,
    NormalBlending, // Added NormalBlending
    PointsMaterial,
    MathUtils, // Added MathUtils for clamping
    DynamicDrawUsage // Added for dynamic attributes
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Define constants for magic numbers to improve readability and maintainability
const MIN_VECTOR_LENGTH_THRESHOLD = 0.0001; // Still used by prepareForVideoOverlay()
// Other animation-specific constants moved to ParticleAnimator.js


class ParticleSystem {
    /**
     * Create a new ParticleSystem
     * @param {THREE.Scene} scene - The Three.js scene
     * @param {Object} options - Optional settings to override defaults
     */
    constructor(scene, options = {}) {
        this.scene = scene;
        
        // Merge default settings with provided options
        this.options = Object.assign({}, settings.particles, options);
        
        // Initialize properties
        this.geometry = null;
        this.material = null;
        this.particleSystem = null;
        this.positions = null;
        this.originalPositions = null;
        this.colors = null;
        this.sizes = null;
        this.originalCalculatedSizes = null; // Added to store original calculated sizes
        this.depthFactors = null; // Still needed to pass to animator
        
        // Animator will manage noise instance and its related data structures
        this.animator = new ParticleAnimator(
            this.options.noise,
            this.options.count,
            this.options.radius,
            this.options.parallaxDepthFactor // Pass the new setting
        );
        
        // Initialize the particle system
        this.init();
    }
    
    /**
     * Check if particle system is properly initialized
     * @returns {boolean} True if initialized successfully
     */
    isInitialized() {
        return !!(this.geometry && this.material && this.particleSystem);
    }

    /**
     * Initialize the particle system
     */
    init() {
        try {
            // Create geometry for particles
            this.geometry = new BufferGeometry();
            
            // Create arrays for particle attributes
            this.positions = new Float32Array(this.options.count * 3);
            this.originalPositions = new Float32Array(this.options.count * 3);
            this.colors = new Float32Array(this.options.count * 3);
            this.sizes = new Float32Array(this.options.count);
            this.originalCalculatedSizes = new Float32Array(this.options.count); // Initialize new array
            
            // Initialize particles in a spherical distribution
            this.initParticles();
            
            // Compute bounding sphere after initializing particles
            this.geometry.computeBoundingSphere();
            
            // Create material for particles using the factory
            this.material = ParticleMaterialFactory.createMaterial(this.options);
            
            // Create the particle system
            this.particleSystem = new Points(this.geometry, this.material);
            
            // Add to scene
            this.scene.add(this.particleSystem);
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`ParticleSystem: Error initializing: ${error.message}`, 'error');
            }
            throw error;
        }
    }
    
    /**
     * Initialize particles in a spherical distribution
     */
    initParticles() {
        // Create array to store depth factors for each particle
        this.depthFactors = new Float32Array(this.options.count); // Still needed by ParticleSystem for noise logic

        const initializer = new ParticleAttributeInitializer(this.options);
        const attributeData = {
            positions: this.positions,
            originalPositions: this.originalPositions,
            colors: this.colors,
            sizes: this.sizes,
            depthFactors: this.depthFactors,
            originalCalculatedSizes: this.originalCalculatedSizes, // Pass the new array
            count: this.options.count
        };
        initializer.initializeAll(attributeData);
        
        // Add attributes to geometry
        this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
        
        // Create size attribute with DynamicDrawUsage
        const sizeAttribute = new BufferAttribute(this.sizes, 1);
        sizeAttribute.setUsage(DynamicDrawUsage); 
        this.geometry.setAttribute('size', sizeAttribute);
        
        // Initialize animator's internal state
        this.animator.init(this.originalPositions, this.options.depthLayers);
    }
    
    /**
     * Update particle positions with enhanced noise-based animation
     * @param {number} time - Current time in milliseconds
     */
    update(time) {
        // Delegate animation logic to ParticleAnimator
        this.animator.updatePositions(
            time,
            this.positions,
            this.originalPositions,
            this.depthFactors,
            this.options.animationSpeed 
        );

        // --- NEW LOGIC FOR CENTRAL PARTICLE SIZE ---
        const centerEffectConfig = this.options.centerEffect || { enabled: false, radius: 0.5, sizeFactor: 0.5 }; // Fallback defaults

        if (this.originalCalculatedSizes && this.geometry && this.geometry.attributes.size) {
            const currentPositions = this.geometry.attributes.position.array; // Current positions from animator
            const currentSizes = this.geometry.attributes.size.array;         // Sizes to modify
            
            const effectRadiusSq = centerEffectConfig.radius * centerEffectConfig.radius; // Use squared radius for efficiency
            let sizesChanged = false;

            for (let i = 0; i < this.options.count; i++) {
                const originalSize = this.originalCalculatedSizes[i];
                let newSize = originalSize;

                if (centerEffectConfig.enabled) {
                    const i3 = i * 3;
                    const px = currentPositions[i3];
                    const py = currentPositions[i3 + 1];
                    const distSq = px * px + py * py; // 2D distance from center (0,0) squared

                    if (distSq < effectRadiusSq) {
                        newSize = originalSize * centerEffectConfig.sizeFactor;
                    }
                }
                
                if (currentSizes[i] !== newSize) {
                    currentSizes[i] = newSize;
                    sizesChanged = true;
                }
            }

            if (sizesChanged) {
                this.geometry.attributes.size.needsUpdate = true;
            }

        }
        // --- END OF NEW LOGIC ---

        // Update geometry position attribute
        this.geometry.attributes.position.needsUpdate = true;
    }
    
    
    /**
     * Add rotation to the entire particle system
     * @param {number} x - X rotation amount
     * @param {number} y - Y rotation amount
     * @param {number} z - Z rotation amount
     */
    rotate(x, y, z) {
        this.particleSystem.rotation.x += x;
        this.particleSystem.rotation.y += y;
        this.particleSystem.rotation.z += z;
    }
    
    /**
     * Apply mouse-based rotation to the particle system
     * @param {number} mouseX - Normalized mouse X position (-1 to 1)
     * @param {number} mouseY - Normalized mouse Y position (-1 to 1)
     * @param {number} influence - How much mouse movement affects rotation
     */
    applyMouseRotation(mouseX, mouseY, influence = 0.001) {
        this.particleSystem.rotation.x += mouseY * influence;
        this.particleSystem.rotation.y += mouseX * influence;
    }
    
    /**
     * Prepare particle system for video overlay
     */
    prepareForVideoOverlay() {
        if (settings.debug.verboseLoggingEnabled && window.debug) {
            window.debug.log("ParticleSystem: Preparing particle sphere for video overlay");
        }
        
        // Adjust particle properties for better video visibility
        if (this.material) {
            // Reduce particle opacity for better video visibility
            this.material.opacity = this.options.opacity;
            
            // Update material
            this.material.needsUpdate = true;
        }
        
        // Fix NaN values in position attribute before computing bounding sphere
        if (this.geometry && this.geometry.attributes.position) {
            const positions = this.geometry.attributes.position.array;
            
            // Check for and fix any NaN values
            for (let i = 0; i < positions.length; i++) {
                if (isNaN(positions[i])) {
                    positions[i] = MIN_VECTOR_LENGTH_THRESHOLD; // Replace NaN with a small value
                }
            }
            
            this.geometry.attributes.position.needsUpdate = true;
            
            // Now compute the bounding sphere
            this.geometry.computeBoundingSphere();
        }
    }
    
    /**
     * Set particle system opacity
     * @param {number} opacity - Opacity value (0-1)
     */
    setOpacity(opacity) {
        if (this.material) {
            this.material.opacity = opacity;
            this.material.needsUpdate = true;
        }
    }

    /**
     * Apply a subtle counter-rotation to the particle system based on smoothed mouse input
     * to enhance parallax effect. The rotation is clamped to prevent drift.
     * @param {number} smoothedMouseX - Smoothed mouse X position (-1 to 1).
     * @param {number} smoothedMouseY - Smoothed mouse Y position (-1 to 1, positive Y is up).
     */
    applyParallaxCounterRotation(smoothedMouseX, smoothedMouseY) {
        if (!this.particleSystem || typeof this.options.parallaxCounterRotationFactor !== 'number') {
            return;
        }
        const factor = this.options.parallaxCounterRotationFactor;
        const clampLimit = 0.15; // As suggested by user

        this.particleSystem.rotation.y = MathUtils.clamp(smoothedMouseX * -factor, -clampLimit, clampLimit);
        
        this.particleSystem.rotation.x = MathUtils.clamp(smoothedMouseY * -factor, -clampLimit, clampLimit);
    }
}

export default ParticleSystem;
