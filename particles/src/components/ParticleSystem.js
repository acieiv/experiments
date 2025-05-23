/**
 * ParticleSystem.js
 * Responsible for creating and managing the particle system
 */

import settings from '../config/settings.js';
import {
    BufferGeometry,
    Color,
    BufferAttribute,
    Points,
    Texture,
    AdditiveBlending,
    ShaderMaterial
} from 'three';

// Vertex Shader for Particles
const particleVert = `
  attribute float size;
  attribute vec3 color;
  uniform float sizeMultiplier;
  varying vec3 vColor;

  void main() {
    vColor = color;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    
    // Use length(mvPosition.xyz) for distance, which is generally more stable than -mvPosition.z for perspective.
    // sizeMultiplier allows overall scaling.
    gl_PointSize = size * sizeMultiplier * (150.0 / length(mvPosition.xyz));
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment Shader for Particles
const particleFrag = `
  uniform sampler2D particleTexture;
  uniform float opacity;
  varying vec3 vColor;

  void main() {
    vec4 texColor = texture2D(particleTexture, gl_PointCoord);
    if (texColor.a < 0.1) discard; // For crisper edges

    gl_FragColor = vec4(vColor, opacity) * texColor;
  }
`;

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
        this.depthFactors = null;
        
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
            
            // Initialize particles in a spherical distribution
            this.initParticles();
            
            // Compute bounding sphere after initializing particles
            this.geometry.computeBoundingSphere();
            
            // Create shader material for particles
            this.material = this.createShaderMaterial();
            
            // Create the particle system
            this.particleSystem = new Points(this.geometry, this.material);
            
            // Add to scene
            this.scene.add(this.particleSystem);
        } catch (error) {
            console.error('Error initializing particle system:', error);
            throw error;
        }
    }
    
    /**
     * Initialize particles in a spherical distribution
     */
    initParticles() {
        const { 
            radius, 
            radiusVariation, 
            baseColor, 
            colorVariation, 
            minSize, 
            maxSize,
            depthLayers,
            depthVariation
        } = this.options;
        
        // Create array to store depth factors for each particle
        this.depthFactors = new Float32Array(this.options.count);
        
        // Convert baseColor from hex to RGB if needed
        let baseColorObj;
        if (typeof baseColor === 'number') {
            baseColorObj = new Color(baseColor);
        } else {
            baseColorObj = baseColor;
        }
        
        for (let i = 0; i < this.options.count; i++) {
            // Assign each particle to a depth layer (0 to depthLayers-1)
            const depthLayer = Math.floor(Math.random() * depthLayers);
            
            // Calculate depth factor (0-1 range, with 0 being furthest, 1 being closest)
            const depthFactor = depthLayer / (depthLayers - 1);
            
            // Store depth information for later use in animation
            this.depthFactors[i] = depthFactor;
            
            // Calculate spherical coordinates with slight randomness
            // Ensure r is never zero to avoid zero-length vectors
            const r = Math.max(0.0001, radius * (1 - radiusVariation + Math.random() * radiusVariation));
            const theta = Math.random() * Math.PI * 2; // Azimuthal angle (0 to 2π)
            
            // Ensure phi is never exactly 0 or π to avoid zero-length vectors on x and y
            const phiRange = 0.0001; // Small value to avoid exact 0 or π
            const phi = phiRange + (Math.acos((Math.random() * 2) - 1) * (Math.PI - 2 * phiRange));
            
            // Convert to Cartesian coordinates
            let x = r * Math.sin(phi) * Math.cos(theta);
            let y = r * Math.sin(phi) * Math.sin(theta);
            let z = r * Math.cos(phi);
            
            // Safety check to ensure no zero values
            if (Math.abs(x) < 0.0001) x = 0.0001 * (Math.random() > 0.5 ? 1 : -1);
            if (Math.abs(y) < 0.0001) y = 0.0001 * (Math.random() > 0.5 ? 1 : -1);
            if (Math.abs(z) < 0.0001) z = 0.0001 * (Math.random() > 0.5 ? 1 : -1);
            
            // Adjust particle position based on depth layer
            // Particles in outer layers are positioned slightly further from center
            const layerRadiusAdjustment = 1.0 - (depthFactor * depthVariation);
            x *= layerRadiusAdjustment;
            y *= layerRadiusAdjustment;
            z *= layerRadiusAdjustment;
            
            // Set position
            const idx = i * 3;
            this.positions[idx] = x;
            this.positions[idx + 1] = y;
            this.positions[idx + 2] = z;
            
            // Store original position for animation reference
            this.originalPositions[idx] = x;
            this.originalPositions[idx + 1] = y;
            this.originalPositions[idx + 2] = z;
            
            // Set color with variation and depth-based brightness
            // Closer particles (higher depthFactor) are brighter
            const brightnessBoost = depthFactor * 0.3; // 0-0.3 range
            const colorR = baseColorObj.r + (Math.random() * 2 - 1) * colorVariation + brightnessBoost;
            const colorG = baseColorObj.g + (Math.random() * 2 - 1) * colorVariation + brightnessBoost;
            const colorB = baseColorObj.b + (Math.random() * 2 - 1) * colorVariation + brightnessBoost;
            
            this.colors[idx] = Math.max(0, Math.min(1, colorR));
            this.colors[idx + 1] = Math.max(0, Math.min(1, colorG));
            this.colors[idx + 2] = Math.max(0, Math.min(1, colorB));
            
            // Set size with variation based on depth
            // Closer particles (higher depthFactor) are larger
            const sizeVariation = maxSize - minSize;
            const depthSizeFactor = 0.7; // How much depth affects size (0-1)
            this.sizes[i] = minSize + (sizeVariation * (Math.random() * (1 - depthSizeFactor) + depthFactor * depthSizeFactor));
        }
        
        // Add attributes to geometry
        this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new BufferAttribute(this.colors, 3));
        this.geometry.setAttribute('size', new BufferAttribute(this.sizes, 1));
    }
    
    /**
     * Create a circular texture for particles
     * @returns {Texture} The created texture
     */
    createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        
        const context = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = canvas.width / 2;
        
        // Create gradient
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        // Draw circle
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
        
        const texture = new Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }
    
    /**
     * Create shader material for particles
     * @returns {THREE.ShaderMaterial} The created material
     */
    createShaderMaterial() {
        const uniforms = {
            particleTexture: { value: this.createCircleTexture() },
            opacity:         { value: this.options.opacity },
            sizeMultiplier:  { value: this.options.maxSize } // Initialize with maxSize, can be adjusted
        };

        const material = new ShaderMaterial({
            uniforms: uniforms,
            vertexShader: particleVert,
            fragmentShader: particleFrag,
            transparent: true,
            blending: AdditiveBlending,
            depthWrite: false, // Important for additive blending and transparency
            depthTest: true,   // Ensure nearer particles occlude farther ones correctly
            vertexColors: true // Signals Three.js to use vertex colors (handled by 'color' attribute and vColor varying)
        });
        
        return material;
    }
    
    /**
     * Update particle positions with animation
     * @param {number} time - Current time in milliseconds
     */
    update(time) {
        const { animationSpeed } = this.options;
        const positions = this.geometry.attributes.position.array;
        
        // Update particle positions with subtle movement
        for (let i = 0; i < this.options.count; i++) {
            const idx = i * 3;
            
            // Get original position
            const origX = this.originalPositions[idx];
            const origY = this.originalPositions[idx + 1];
            const origZ = this.originalPositions[idx + 2];
            
            // Calculate normalized direction vector with safety check for division by zero
            const length = Math.sqrt(origX * origX + origY * origY + origZ * origZ);
            
            // Handle particles with zero or very small length to avoid NaN
            if (length < 0.0001) {
                // Set to a small default value to avoid NaN
                positions[idx] = 0.0001;
                positions[idx + 1] = 0.0001;
                positions[idx + 2] = 0.0001;
                continue;
            }
            
            const nx = origX / length;
            const ny = origY / length;
            const nz = origZ / length;
            
            // Get depth factor for this particle (0-1 range)
            const depthFactor = this.depthFactors[i];
            
            // Make closer particles move slightly faster for parallax effect
            const speedMultiplier = 1.0 + (depthFactor * 0.5); // 1.0-1.5 range
            
            // Apply subtle movement using sin/cos with time
            const factor = 0.05 * animationSpeed * speedMultiplier;
            const timeFactor = time * 0.001;
            
            // Different frequencies for each axis for more organic movement
            // Add slight phase shift based on depth for more layered movement
            const depthPhaseShift = depthFactor * 0.5;
            const offsetX = Math.sin(timeFactor + i * 0.1 + depthPhaseShift) * factor;
            const offsetY = Math.cos(timeFactor * 0.8 + i * 0.05 + depthPhaseShift) * factor;
            const offsetZ = Math.sin(timeFactor * 1.2 + i * 0.07 + depthPhaseShift) * factor;
            
            // Apply movement along the normalized direction
            positions[idx] = origX + nx * offsetX;
            positions[idx + 1] = origY + ny * offsetY;
            positions[idx + 2] = origZ + nz * offsetZ;
        }
        
        // Update geometry
        this.geometry.attributes.position.needsUpdate = true;
        
        // Check for and fix any NaN values that might have been introduced during animation
        // for (let i = 0; i < positions.length; i++) {
        //     if (isNaN(positions[i])) {
        //         positions[i] = 0.0001; // Replace NaN with a small value
        //     }
        // }
        
        // Update bounding sphere after position changes
        // this.geometry.computeBoundingSphere(); // Removed for performance, called in init()
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
        console.log("Preparing particle sphere for video overlay");
        
        // Adjust particle properties for better video visibility
        if (this.material) {
            // Reduce particle opacity for better video visibility
            if (this.material.uniforms && this.material.uniforms.opacity) {
                this.material.uniforms.opacity.value = this.options.opacity;
            }
            
            // Adjust blending mode for better integration with video
            // Blending mode is set at material creation and usually doesn't need dynamic update here
            // unless specifically required to change. The ShaderMaterial is already set to AdditiveBlending.
            // this.material.blending = THREE.AdditiveBlending; 
            
            // Update material
            this.material.needsUpdate = true;
        }
        
        // Fix NaN values in position attribute before computing bounding sphere
        if (this.geometry && this.geometry.attributes.position) {
            const positions = this.geometry.attributes.position.array;
            
            // Check for and fix any NaN values
            for (let i = 0; i < positions.length; i++) {
                if (isNaN(positions[i])) {
                    positions[i] = 0.0001; // Replace NaN with a small value
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
        if (this.material && this.material.uniforms && this.material.uniforms.opacity) {
            this.material.uniforms.opacity.value = opacity;
        }
    }
}

export default ParticleSystem;
