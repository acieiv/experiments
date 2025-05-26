/**
 * MaterialFactory.js
 * Factory class for creating shader materials
 */

import {
    ShaderMaterial,
    Vector2,
    Vector3,
    FrontSide,
    NormalBlending
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import settings from '../config/settings.js'; // Added
import DebugOverlay from '../utils/DebugOverlay.js'; // Added

class MaterialFactory {
    static _shaderCache = {};

    /**
     * Create a video shader material
     * @param {THREE.VideoTexture} videoTexture - The video texture
     * @param {number} initialOpacity - Initial opacity value
     * @param {Object} settings - Shader settings
     * @returns {Promise<THREE.ShaderMaterial>}
     */
    static async createVideoMaterial(videoTexture, initialOpacity, settings) {
        const vertexShaderSource = await this.loadShader('video.vert.glsl');
        const fragmentShaderSource = await this.loadShader('video.frag.glsl');

        return new ShaderMaterial({
            uniforms: {
                videoTexture: { value: videoTexture },
                opacity: { value: initialOpacity },
                time: { value: 0.0 },
                videoScale: { value: settings.defaultScale },
                videoOffsetX: { value: settings.defaultOffsetX },
                videoOffsetY: { value: settings.defaultOffsetY },
                mousePosition: { value: new Vector2(0, 0) },
                distortionStrength: { value: settings.distortionStrength },
                pulseSpeed: { value: settings.pulseSpeed },
                pulseAmount: { value: settings.pulseAmount },
                edgeGlowFactor: { value: settings.edgeGlowFactor }
            },
            vertexShader: vertexShaderSource,
            fragmentShader: fragmentShaderSource,
            transparent: true,
            side: FrontSide,
            depthTest: true,
            depthWrite: false,
            blending: NormalBlending
        });
    }

    /**
     * Load shader code from a file, with caching.
     * @private
     * @param {string} filename - Name of the shader file (e.g., 'video.vert.glsl')
     * @returns {Promise<string>} Shader code
     */
    static async loadShader(filename) {
        if (this._shaderCache[filename]) {
            return this._shaderCache[filename];
        }

        try {
            const response = await fetch(`./src/shaders/${filename}`);
            if (!response.ok) {
                throw new Error(`Failed to fetch shader ${filename}: ${response.statusText}`);
            }
            const shaderCode = await response.text();
            this._shaderCache[filename] = shaderCode;
            return shaderCode;
        } catch (error) {
            if (settings.debug.enabled && window.debug) {
                window.debug.log(`MaterialFactory: Error loading shader ${filename}: ${error.message}`, 'error');
            }
            throw error; // Re-throw to be caught by higher-level initializers
        }
    }

    /**
     * Update material uniforms
     * @param {THREE.ShaderMaterial} material - The material to update
     * @param {Object} updates - Object containing uniform updates
     */
    static updateUniforms(material, updates) {
        if (!material?.uniforms) return;

        Object.entries(updates).forEach(([key, value]) => {
            const uniform = material.uniforms[key];
            // Skip if uniform doesn't exist or value is undefined/null
            if (!uniform || value == null) return;
            
            // For vector uniforms, ensure the value has required properties
            if (value instanceof Vector2 || value instanceof Vector3) {
                if (typeof value.x !== 'number') return;
            }
            
            uniform.value = value;
        });

        material.needsUpdate = true;
    }
}

export default MaterialFactory;
