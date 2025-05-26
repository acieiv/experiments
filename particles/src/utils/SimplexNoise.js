/**
 * 3D Simplex Noise Implementation
 * Optimized for real-time particle animation
 */
class SimplexNoise {
    constructor(seed = 0) {
        this.seed = seed;
        this.grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ];
        
        // Initialize permutation table with seed
        this.p = [];
        for (let i = 0; i < 256; i++) {
            this.p[i] = i;
        }
        
        // Shuffle with seed
        let rng = this.seedRandom(seed);
        for (let i = 255; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        
        // Extend permutation table
        for (let i = 0; i < 256; i++) {
            this.p[256 + i] = this.p[i];
        }
    }
    
    seedRandom(seed) {
        let m = 0x80000000;
        let a = 1103515245;
        let c = 12345;
        let state = seed ? seed : Math.floor(Math.random() * (m - 1));
        
        return function() {
            state = (a * state + c) % m;
            return state / (m - 1);
        };
    }
    
    dot(g, x, y, z) {
        return g[0] * x + g[1] * y + g[2] * z;
    }
    
    noise3D(x, y, z) {
        const F3 = 1.0 / 3.0;
        const G3 = 1.0 / 6.0;
        
        // Skew the input space
        const s = (x + y + z) * F3;
        const i = Math.floor(x + s);
        const j = Math.floor(y + s);
        const k = Math.floor(z + s);
        
        const t = (i + j + k) * G3;
        const X0 = i - t;
        const Y0 = j - t;
        const Z0 = k - t;
        const x0 = x - X0;
        const y0 = y - Y0;
        const z0 = z - Z0;
        
        // Determine which simplex we are in
        let i1, j1, k1, i2, j2, k2;
        if (x0 >= y0) {
            if (y0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=1; k2=0; }
            else if (x0 >= z0) { i1=1; j1=0; k1=0; i2=1; j2=0; k2=1; }
            else { i1=0; j1=0; k1=1; i2=1; j2=0; k2=1; }
        } else {
            if (y0 < z0) { i1=0; j1=0; k1=1; i2=0; j2=1; k2=1; }
            else if (x0 < z0) { i1=0; j1=1; k1=0; i2=0; j2=1; k2=1; }
            else { i1=0; j1=1; k1=0; i2=1; j2=1; k2=0; }
        }
        
        const x1 = x0 - i1 + G3;
        const y1 = y0 - j1 + G3;
        const z1 = z0 - k1 + G3;
        const x2 = x0 - i2 + 2.0 * G3;
        const y2 = y0 - j2 + 2.0 * G3;
        const z2 = z0 - k2 + 2.0 * G3;
        const x3 = x0 - 1.0 + 3.0 * G3;
        const y3 = y0 - 1.0 + 3.0 * G3;
        const z3 = z0 - 1.0 + 3.0 * G3;
        
        // Work out the hashed gradient indices
        const ii = i & 255;
        const jj = j & 255;
        const kk = k & 255;
        const gi0 = this.p[ii + this.p[jj + this.p[kk]]] % 12;
        const gi1 = this.p[ii + i1 + this.p[jj + j1 + this.p[kk + k1]]] % 12;
        const gi2 = this.p[ii + i2 + this.p[jj + j2 + this.p[kk + k2]]] % 12;
        const gi3 = this.p[ii + 1 + this.p[jj + 1 + this.p[kk + 1]]] % 12;
        
        // Calculate the contribution from the four corners
        let t0 = 0.6 - x0*x0 - y0*y0 - z0*z0;
        let n0 = t0 < 0 ? 0.0 : Math.pow(t0, 4) * this.dot(this.grad3[gi0], x0, y0, z0);
        
        let t1 = 0.6 - x1*x1 - y1*y1 - z1*z1;
        let n1 = t1 < 0 ? 0.0 : Math.pow(t1, 4) * this.dot(this.grad3[gi1], x1, y1, z1);
        
        let t2 = 0.6 - x2*x2 - y2*y2 - z2*z2;
        let n2 = t2 < 0 ? 0.0 : Math.pow(t2, 4) * this.dot(this.grad3[gi2], x2, y2, z2);
        
        let t3 = 0.6 - x3*x3 - y3*y3 - z3*z3;
        let n3 = t3 < 0 ? 0.0 : Math.pow(t3, 4) * this.dot(this.grad3[gi3], x3, y3, z3);
        
        return 32.0 * (n0 + n1 + n2 + n3);
    }
    
    // Multi-octave noise
    octaveNoise3D(x, y, z, octaves = 1, persistence = 0.5, scale = 1.0) {
        let value = 0.0;
        let amplitude = 1.0;
        let frequency = scale;
        let maxValue = 0.0;
        
        const P = 256.0; // Period for wrapping coordinates

        for (let i = 0; i < octaves; i++) {
            const xf = x * frequency;
            const yf = y * frequency;
            const zf = z * frequency;

            // Wrap coordinates to prevent them from becoming too large
            const x_wrapped = xf % P;
            const y_wrapped = yf % P;
            const z_wrapped = zf % P;
            
            value += this.noise3D(x_wrapped, y_wrapped, z_wrapped) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= 2.0;
        }
        
        // Ensure maxValue is not zero to prevent division by zero, though unlikely with octaves >= 1
        if (maxValue === 0.0) {
            return 0.0; // Or handle as an error/warning
        }
        return value / maxValue;
    }
}

export default SimplexNoise;
