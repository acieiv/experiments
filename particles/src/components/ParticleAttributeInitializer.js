import { Color } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Define constants (copied from ParticleSystem.js, might be shared or moved later)
const MIN_VECTOR_LENGTH_THRESHOLD = 0.0001;
const BRIGHTNESS_BOOST_FACTOR = 0.3;
const DEPTH_SIZE_INFLUENCE_FACTOR = 0.7;

class ParticleAttributeInitializer {
    constructor(options) {
        this.options = options; // Particle settings from config
    }

    /**
     * Populates the attribute arrays for all particles.
     * @param {object} attributeData - Object containing attribute arrays and count.
     * @param {Float32Array} attributeData.positions
     * @param {Float32Array} attributeData.originalPositions
     * @param {Float32Array} attributeData.colors
     * @param {Float32Array} attributeData.sizes
     * @param {Float32Array} attributeData.depthFactors
     * @param {number} attributeData.count - Number of particles (this.options.count)
     */
    initializeAll(attributeData) {
        const { baseColor, count } = this.options;
        // Add originalCalculatedSizes to destructuring
        const { positions, originalPositions, colors, sizes, depthFactors, originalCalculatedSizes } = attributeData; 

        let baseColorObj;
        if (typeof baseColor === 'number') {
            baseColorObj = new Color(baseColor);
        } else {
            baseColorObj = baseColor; // Assuming it's already a THREE.Color instance
        }

        for (let i = 0; i < count; i++) {
            const depthFactor = this._initializeParticlePositionAndDepth(i, positions, originalPositions, depthFactors);
            this._initializeParticleColor(i, colors, baseColorObj, depthFactor);
            // Pass originalCalculatedSizes to _initializeParticleSize
            this._initializeParticleSize(i, sizes, originalCalculatedSizes, depthFactor);
        }
    }

    /**
     * @private
     * Initializes the position and depth for a single particle.
     * @param {number} index - The index of the particle.
     * @param {Float32Array} positions - Array to store current positions.
     * @param {Float32Array} originalPositions - Array to store original positions.
     * @param {Float32Array} depthFactors - Array to store depth factors.
     * @returns {number} The calculated depthFactor for the particle.
     */
    _initializeParticlePositionAndDepth(index, positions, originalPositions, depthFactors) {
        const {
            radius,
            radiusVariation,
            depthLayers,
            depthVariation
        } = this.options;
        const idx = index * 3;

        const depthLayer = Math.floor(Math.random() * depthLayers);
        const depthFactor = depthLayers > 1 ? depthLayer / (depthLayers - 1) : 0;
        
        depthFactors[index] = depthFactor;
        
        const r = Math.max(MIN_VECTOR_LENGTH_THRESHOLD, radius * (1 - radiusVariation + Math.random() * radiusVariation));
        const theta = Math.random() * Math.PI * 2;
        const phiRange = MIN_VECTOR_LENGTH_THRESHOLD; 
        const phi = phiRange + (Math.acos((Math.random() * 2) - 1) * (Math.PI - 2 * phiRange));
        
        let x = r * Math.sin(phi) * Math.cos(theta);
        let y = r * Math.sin(phi) * Math.sin(theta);
        let z = r * Math.cos(phi);
        
        if (Math.abs(x) < MIN_VECTOR_LENGTH_THRESHOLD) x = MIN_VECTOR_LENGTH_THRESHOLD * (Math.random() > 0.5 ? 1 : -1);
        if (Math.abs(y) < MIN_VECTOR_LENGTH_THRESHOLD) y = MIN_VECTOR_LENGTH_THRESHOLD * (Math.random() > 0.5 ? 1 : -1);
        if (Math.abs(z) < MIN_VECTOR_LENGTH_THRESHOLD) z = MIN_VECTOR_LENGTH_THRESHOLD * (Math.random() > 0.5 ? 1 : -1);
        
        const layerRadiusAdjustment = 1.0 - (depthFactor * depthVariation);
        x *= layerRadiusAdjustment;
        y *= layerRadiusAdjustment;
        z *= layerRadiusAdjustment;
        
        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
        
        originalPositions[idx] = x;
        originalPositions[idx + 1] = y;
        originalPositions[idx + 2] = z;

        return depthFactor;
    }

    /**
     * @private
     * Initializes the color for a single particle.
     * @param {number} index - The index of the particle.
     * @param {Float32Array} colors - Array to store colors.
     * @param {THREE.Color} baseColorObj - The base color object.
     * @param {number} depthFactor - The depth factor of the particle.
     */
    _initializeParticleColor(index, colors, baseColorObj, depthFactor) {
        const { colorVariation } = this.options;
        const idx = index * 3;

        const brightnessBoost = depthFactor * BRIGHTNESS_BOOST_FACTOR;
        const colorR = baseColorObj.r + (Math.random() * 2 - 1) * colorVariation + brightnessBoost;
        const colorG = baseColorObj.g + (Math.random() * 2 - 1) * colorVariation + brightnessBoost;
        const colorB = baseColorObj.b + (Math.random() * 2 - 1) * colorVariation + brightnessBoost;
        
        colors[idx] = Math.max(0, Math.min(1, colorR));
        colors[idx + 1] = Math.max(0, Math.min(1, colorG));
        colors[idx + 2] = Math.max(0, Math.min(1, colorB));
    }

    /**
     * @private
     * Initializes the size for a single particle.
     * @param {number} index - The index of the particle.
     * @param {Float32Array} sizes - Array to store sizes.
     * @param {Float32Array} originalCalculatedSizes - Array to store original calculated sizes.
     * @param {number} depthFactor - The depth factor of the particle.
     */
    _initializeParticleSize(index, sizes, originalCalculatedSizes, depthFactor) { // Added originalCalculatedSizes parameter
        const { minSize, maxSize } = this.options;
        const sizeVariation = maxSize - minSize;
        // Calculate the particle's unique original size
        const calculatedSize = minSize + (sizeVariation * (Math.random() * (1 - DEPTH_SIZE_INFLUENCE_FACTOR) + depthFactor * DEPTH_SIZE_INFLUENCE_FACTOR));
        
        sizes[index] = calculatedSize; // Set the initial current size
        if (originalCalculatedSizes) { // Store it in the new array if provided
            originalCalculatedSizes[index] = calculatedSize;
        }
    }
}

export default ParticleAttributeInitializer;
