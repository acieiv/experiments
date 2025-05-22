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
