import {
    Texture,
    // PointsMaterial, // No longer needed
    // AdditiveBlending, // Blending mode will be set on ShaderMaterial
    NormalBlending, // Ensure NormalBlending is imported
    ShaderMaterial, // Import ShaderMaterial
    Color // For uColor uniform if needed, though vColor is used
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

// Shaders with Vertex Colors and Dynamic Size restored
const vertexShader = `
// Attribute passed from BufferGeometry
attribute float size;    // Restore size attribute
attribute vec3 color;    // Restore color attribute

// Varying to pass color to fragment shader
varying vec3 vColor;     // Restore vColor varying

void main() {
    vColor = color;      // Pass color attribute to fragment shader

    // Calculate model-view position
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // Restore dynamic point size
    gl_PointSize = size * (750.0 / -mvPosition.z); // Using a smaller factor to reduce blur

    // Set final position
    gl_Position = projectionMatrix * mvPosition;
}
`;

const fragmentShader = `
// Varying received from vertex shader
varying vec3 vColor;

// Uniforms passed from JavaScript
uniform sampler2D uParticleTexture;
uniform float uOpacity;

void main() {
    vec4 texColor = texture2D(uParticleTexture, gl_PointCoord);
    
    // Use vColor for particle color, texColor.a for texture alpha, and uOpacity for global opacity.
    gl_FragColor = vec4(vColor, texColor.a * uOpacity); 
}
`;

class ParticleMaterialFactory {
    /**
     * Create a circular texture for particles.
     * Made static as it doesn't depend on instance state of the factory itself.
     * @returns {Texture} The created texture
     */
    static createCircleTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        
        const context = canvas.getContext('2d');
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = canvas.width / 2;
        
        const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)'); // Adjusted core alpha
        gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(centerX, centerY, radius, 0, Math.PI * 2);
        context.fill();
        
        const texture = new Texture(canvas);
        texture.needsUpdate = true;
        return texture;
    }
    
    /**
     * Create material for particles using built-in PointsMaterial.
     * Made static. Requires particle options to be passed.
     * @param {object} particleOptions - Particle settings, e.g., settings.particles.
     * @returns {THREE.PointsMaterial} The created material
     */
    static createMaterial(particleOptions) {
        const material = new ShaderMaterial({
            uniforms: { // Restore uniforms
                uParticleTexture: { value: ParticleMaterialFactory.createCircleTexture() },
                uOpacity: { value: particleOptions.opacity }
            },
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            
            transparent: true, 
            blending: NormalBlending, 
            depthWrite: false,
            depthTest: true
        });
        
        return material;
    }
}

export default ParticleMaterialFactory;
