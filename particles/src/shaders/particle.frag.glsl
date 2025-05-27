// Varying received from vertex shader
varying vec3 vColor; // Restore vColor varying

// Uniforms passed from JavaScript
uniform sampler2D uParticleTexture; // Restore texture uniform
uniform float uOpacity;           // Restore opacity uniform

void main() {
    vec4 texColor = texture2D(uParticleTexture, gl_PointCoord);
    
    // Use vColor for particle color, texColor.a for texture alpha, and uOpacity for global opacity.
    // Assumes texColor.rgb is white/grayscale and doesn't contribute to hue.
    // gl_FragColor = vec4(vColor, texColor.a * uOpacity); // Original line for vertex colors
    gl_FragColor = vec4(1.0, 0.0, 0.0, texColor.a * uOpacity); // DEBUG: Output fixed red
}
