// Attribute passed from BufferGeometry
// attribute float size;       // DEBUG: Size still fixed for now
attribute vec3 color;       // Restore color attribute

// Varying to pass color to fragment shader
varying vec3 vColor;        // Restore vColor varying

void main() {
    vColor = color;         // Pass color attribute to fragment shader

    // Calculate model-view position
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);

    // DEBUG: Set a large, fixed, obvious point size
    gl_PointSize = 10.0;

    // Set final position
    gl_Position = projectionMatrix * mvPosition;
}
