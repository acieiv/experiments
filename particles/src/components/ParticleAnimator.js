import SimplexNoise from '../utils/SimplexNoise.js';

// Constants moved from ParticleSystem.js
const LAYER_ROTATION_SPEED_FACTOR = 0.01;
const NOISE_Y_TIME_SCALE = 0.7;
const NOISE_Z_TIME_SCALE = 0.5;
// const PARALLAX_SPEED_DEPTH_FACTOR = 0.5; // Removed, will be passed via constructor
const CURL_NOISE_EPSILON = 0.01;
// MIN_VECTOR_LENGTH_THRESHOLD is used by ParticleSystem.update for a safety check,
// so it might need to be shared or kept in ParticleSystem if still needed there.
// For now, assuming ParticleAnimator might also need it if it were to handle that check.
const MIN_VECTOR_LENGTH_THRESHOLD = 0.0001;


class ParticleAnimator {
    constructor(noiseOptions, particleCount, particleRadius, parallaxDepthFactor) {
        this.noiseOptions = noiseOptions; // e.g., settings.particles.noise
        this.particleCount = particleCount;
        this.particleRadius = particleRadius; // e.g., settings.particles.radius for normalization
        this.parallaxDepthFactor = parallaxDepthFactor; // Store the passed factor

        this.noise = new SimplexNoise(this.noiseOptions.seed);
        
        // These will be initialized by this.init() using data from ParticleSystem
        this.sphericalCoords = null;
        this.radialDampening = null;
        this.layerNoiseFields = [];
    }

    /**
     * Initializes noise-specific data structures.
     * Call this after originalPositions and depthLayers (from options) are available.
     * @param {Float32Array} originalPositions - Original positions of particles.
     * @param {number} depthLayers - Number of depth layers from options.
     */
    init(originalPositions, depthLayers) {
        // Pre-compute spherical coordinates for each particle
        this.sphericalCoords = new Float32Array(this.particleCount * 3); // [r, theta, phi]
        
        // Pre-compute radial dampening values
        this.radialDampening = new Float32Array(this.particleCount);
        
        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 3;
            const x = originalPositions[idx];
            const y = originalPositions[idx + 1];
            const z = originalPositions[idx + 2];
            
            const r = Math.sqrt(x * x + y * y + z * z);
            const theta = Math.atan2(y, x);
            const phi = r > MIN_VECTOR_LENGTH_THRESHOLD ? Math.acos(z / r) : 0; // Safety for r=0
            
            this.sphericalCoords[idx] = r;
            this.sphericalCoords[idx + 1] = theta;
            this.sphericalCoords[idx + 2] = phi;
            
            const normalizedRadius = r / this.particleRadius; // Use passed particleRadius
            this.radialDampening[i] = 1.0 - Math.exp(-normalizedRadius * normalizedRadius * this.noiseOptions.centerDampening);
        }
        
        // Initialize shared noise fields for each depth layer
        this.layerNoiseFields = [];
        for (let layer = 0; layer < depthLayers; layer++) {
            this.layerNoiseFields[layer] = {
                offsetX: 0,
                offsetY: 0,
                offsetZ: 0,
                rotation: layer * 0.3 // Slight rotation offset per layer
            };
        }
    }

    /**
     * Calculate curl noise for turbulence effect
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate  
     * @param {number} z - Z coordinate
     * @param {number} time - Current time
     * @returns {Object} Curl vector {x, y, z}
     */
    calculateCurlNoise(x, y, z, time) {
        const { turbulence } = this.noiseOptions; // Use this.noiseOptions
        const scale = turbulence.curlScale;
        
        const n1 = this.noise.octaveNoise3D((x + CURL_NOISE_EPSILON) * scale, y * scale, z * scale + time);
        const n2 = this.noise.octaveNoise3D((x - CURL_NOISE_EPSILON) * scale, y * scale, z * scale + time);
        const n3 = this.noise.octaveNoise3D(x * scale, (y + CURL_NOISE_EPSILON) * scale, z * scale + time);
        const n4 = this.noise.octaveNoise3D(x * scale, (y - CURL_NOISE_EPSILON) * scale, z * scale + time);
        const n5 = this.noise.octaveNoise3D(x * scale, y * scale, (z + CURL_NOISE_EPSILON) * scale + time);
        const n6 = this.noise.octaveNoise3D(x * scale, y * scale, (z - CURL_NOISE_EPSILON) * scale + time);
        
        const curlX = (n4 - n3) / (2 * CURL_NOISE_EPSILON) - (n6 - n5) / (2 * CURL_NOISE_EPSILON);
        const curlY = (n5 - n6) / (2 * CURL_NOISE_EPSILON) - (n2 - n1) / (2 * CURL_NOISE_EPSILON);
        const curlZ = (n1 - n2) / (2 * CURL_NOISE_EPSILON) - (n4 - n3) / (2 * CURL_NOISE_EPSILON);
        
        return {
            x: curlX * turbulence.strength,
            y: curlY * turbulence.strength,
            z: curlZ * turbulence.strength
        };
    }
    
    /**
     * @private
     * Calculates the noise-based offsets for a single particle.
     * This method is internal to ParticleAnimator.
     */
    _calculateNoiseOffsets(originalPosition, normalizedDirection, sphericalCoords, depthFactor, dampening, timeFactor, layerField, particleIndex, animationSpeed) {
        const { r, theta, phi } = sphericalCoords;
        const { x: nx, y: ny, z: nz } = normalizedDirection;

        const rotatedTime = timeFactor + layerField.rotation;
        const noiseX = theta * this.noiseOptions.scale + rotatedTime;
        const noiseY = phi * this.noiseOptions.scale + rotatedTime * NOISE_Y_TIME_SCALE;
        const noiseZ = r * this.noiseOptions.scale + rotatedTime * NOISE_Z_TIME_SCALE;

        const primaryNoiseValue = this.noise.octaveNoise3D(
            noiseX, noiseY, noiseZ,
            this.noiseOptions.octaves, this.noiseOptions.persistence || 0.5, this.noiseOptions.lacunarity || 1.0
        );

        const speedMultiplier = 1.0 + (depthFactor * this.parallaxDepthFactor); // Use stored parallaxDepthFactor
        const primaryStrength = this.noiseOptions.strength * animationSpeed * speedMultiplier * dampening;
        
        let offsetX = primaryNoiseValue * primaryStrength * nx;
        let offsetY = primaryNoiseValue * primaryStrength * ny;
        let offsetZ = primaryNoiseValue * primaryStrength * nz;

        if (this.noiseOptions.turbulence.enabled) {
            const curl = this.calculateCurlNoise(originalPosition.x, originalPosition.y, originalPosition.z, rotatedTime);
            const helixFactor = this.noiseOptions.turbulence.helixFactor; 
            offsetX += curl.x * dampening * helixFactor;
            offsetY += curl.y * dampening * helixFactor;
            offsetZ += curl.z * dampening * helixFactor;
        }
        
        // Logging can be re-added here if needed, using particleIndex for conditional logging
        // For brevity in this refactoring step, it's omitted but can be ported from ParticleSystem.js

        return { offsetX, offsetY, offsetZ };
    }

    /**
     * Updates the positions array based on noise animation.
     * @param {number} time - Current time in milliseconds.
     * @param {Float32Array} positions - The positions array to update.
     * @param {Float32Array} originalPositions - Original positions of particles.
     * @param {Float32Array} depthFactors - Depth factors for each particle.
     * @param {number} animationSpeed - from particle options
     */
    updatePositions(time, positions, originalPositions, depthFactors, animationSpeed) {
        if (!this.sphericalCoords || !this.radialDampening) {
            console.warn("ParticleAnimator not fully initialized. Call init() with originalPositions and depthLayers.");
            return;
        }

        const timeFactor = time * 0.001 * this.noiseOptions.speed;

        for (let layer = 0; layer < this.layerNoiseFields.length; layer++) {
            const field = this.layerNoiseFields[layer];
            field.rotation += this.noiseOptions.rotation * LAYER_ROTATION_SPEED_FACTOR * (layer + 1);
        }

        for (let i = 0; i < this.particleCount; i++) {
            const idx = i * 3;

            const origX = originalPositions[idx];
            const origY = originalPositions[idx + 1];
            const origZ = originalPositions[idx + 2];

            const length = Math.sqrt(origX * origX + origY * origY + origZ * origZ);
            if (length < MIN_VECTOR_LENGTH_THRESHOLD) { // Safety check
                positions[idx] = MIN_VECTOR_LENGTH_THRESHOLD;
                positions[idx + 1] = MIN_VECTOR_LENGTH_THRESHOLD;
                positions[idx + 2] = MIN_VECTOR_LENGTH_THRESHOLD;
                continue;
            }
            
            const normalizedDirection = { x: origX / length, y: origY / length, z: origZ / length };
            const currentSphericalCoords = { r: this.sphericalCoords[idx], theta: this.sphericalCoords[idx+1], phi: this.sphericalCoords[idx+2] };
            const depthFactor = depthFactors[i];
            const dampening = this.radialDampening[i];
            
            const depthLayerIndex = this.layerNoiseFields.length > 1 ? Math.floor(depthFactor * (this.layerNoiseFields.length - 1)) : 0;
            const layerField = this.layerNoiseFields[depthLayerIndex];

            const { offsetX, offsetY, offsetZ } = this._calculateNoiseOffsets(
                { x: origX, y: origY, z: origZ },
                normalizedDirection,
                currentSphericalCoords,
                depthFactor,
                dampening,
                timeFactor,
                layerField,
                i, // particleIndex for potential logging
                animationSpeed
            );

            positions[idx] = origX + offsetX;
            positions[idx + 1] = origY + offsetY;
            positions[idx + 2] = origZ + offsetZ;
        }
    }
}

export default ParticleAnimator;
