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

class MaterialFactory {
    /**
     * Create a video shader material
     * @param {THREE.VideoTexture} videoTexture - The video texture
     * @param {number} initialOpacity - Initial opacity value
     * @param {Object} settings - Shader settings
     * @returns {THREE.ShaderMaterial}
     */
    static createVideoMaterial(videoTexture, initialOpacity, settings) {
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
            vertexShader: this.loadShader('video.vert.glsl'),
            fragmentShader: this.loadShader('video.frag.glsl'),
            transparent: true,
            side: FrontSide,
            depthTest: true,
            depthWrite: false,
            blending: NormalBlending
        });
    }

    /**
     * Get shader code
     * @private
     * @param {string} filename - Name of the shader file
     * @returns {string} Shader code
     */
    static loadShader(filename) {
        // Return the appropriate shader code based on filename
        if (filename === 'video.vert.glsl') {
            return `
                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;

                void main() {
                    vUv = uv;
                    vPosition = position;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `;
        } else if (filename === 'video.frag.glsl') {
            return `
                uniform sampler2D videoTexture;
                uniform float opacity;
                uniform float time;
                uniform float videoScale;
                uniform float videoOffsetX;
                uniform float videoOffsetY;
                uniform vec2 mousePosition;
                uniform float distortionStrength;
                uniform float pulseSpeed;
                uniform float pulseAmount;
                uniform float edgeGlowFactor;

                varying vec2 vUv;
                varying vec3 vPosition;
                varying vec3 vNormal;

                void main() {
                    // Calculate distance from center for circular mask
                    vec2 centered = vUv * 2.0 - 1.0;
                    float dist = length(centered);
                    
                    // Create circular mask with soft edges
                    float mask = 1.0 - smoothstep(0.8, 1.0, dist);
                    float pulse = pulseAmount * sin(time * pulseSpeed);
                    mask *= 1.0 + (pulse * smoothstep(0.7, 0.9, dist));
                    
                    // Transform UVs for video scaling and offset
                    vec2 transformedUV = (vUv - 0.5) / videoScale + 0.5;
                    transformedUV.x += videoOffsetX;
                    transformedUV.y += videoOffsetY;
                    
                    // Apply mouse-based distortion effect
                    float localDistortionStrength = distortionStrength * (1.0 - dist * 0.8);
                    vec2 distortion = vec2(
                        mousePosition.x * localDistortionStrength * sin(dist * 5.0 + time * pulseSpeed),
                        mousePosition.y * localDistortionStrength * sin(dist * 5.0 + time * pulseSpeed * 2.0)
                    );
                    transformedUV += distortion;
                    
                    // Discard pixels outside the circular mask
                    if (mask < 0.01) {
                        discard;
                    }
                    
                    // Sample and apply video texture
                    vec4 videoColor = texture2D(videoTexture, transformedUV);
                    gl_FragColor = vec4(videoColor.rgb, videoColor.a * opacity * mask);
                    
                    // Add crystal ball edge effect
                    if (dist > 0.7) {
                        float edgeFactor = smoothstep(0.7, 0.9, dist);
                        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.2, 0.4, 0.8), edgeFactor * edgeGlowFactor);
                    }
                    
                    // Add refraction effect at edges
                    float refraction = sin(vUv.x * 15.0 + time * pulseSpeed) * 
                                     sin(vUv.y * 15.0 + time * pulseSpeed * 2.0) * 0.02;
                    gl_FragColor.rgb += vec3(refraction) * smoothstep(0.7, 0.9, dist);
                }
            `;
        }
        return '';
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
