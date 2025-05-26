import {
    Texture,
    PointsMaterial,
    AdditiveBlending 
    // NormalBlending might be needed if options allow choosing it
} from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

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
        gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
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
        const material = new PointsMaterial({
            map: this.createCircleTexture(), // Call static method
            transparent: true,
            blending: AdditiveBlending, // Defaulting to AdditiveBlending
            depthWrite: false, 
            depthTest: true,
            vertexColors: true,
            opacity: particleOptions.opacity,
            size: particleOptions.maxSize,
            sizeAttenuation: true
        });
        
        return material;
    }
}

export default ParticleMaterialFactory;
