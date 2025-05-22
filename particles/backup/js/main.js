/**
 * Main application file for the Crystal Ball Particle Animation
 */

console.log("Main.js loaded");

// Global variables
let scene, camera, renderer;
let particleSphere;
let container;
let videoSphereA, videoSphereB;
let currentVideoIndex = 0;
let transitionTime = 0;
let isTransitioning = false;
let transitionProgress = 0;
let transitionDuration = 3.0; // seconds for fade transition
let videoDuration = 15.0; // seconds before switching videos
let lastTime = 0;
// Mouse tracking for parallax effects
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;
let mouseInfluence = 0.05; // How much mouse movement affects the scene
const videos = [
    'assets/videos/Football_Game_Video_Generated.mp4',
    'assets/videos/Football_Video_Generation_Complete.mp4'
];

// Initialize the application
function init() {
    console.log("Initializing application");
    // Get container element
    container = document.getElementById('container');
    
    // Create scene
    console.log("Creating scene");
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000814); // Dark blue background
    
    // Create camera
    const width = window.innerWidth;
    const height = window.innerHeight;
    camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.z = 5;
    
    // Create renderer
    console.log("Creating renderer");
    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: true,
        premultipliedAlpha: false // Better for video transparency
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    // Enable proper sorting for transparent objects
    renderer.sortObjects = true;
    
    // Set clear color with alpha for better blending
    renderer.setClearColor(0x000814, 1);
    
    container.appendChild(renderer.domElement);
    
    // Add lighting
    console.log("Setting up lighting");
    setupLighting();
    
    // Create particle sphere
    console.log("Creating particle sphere");
    createParticleSphere();
    
    // Post-processing removed for now
    console.log("Post-processing removed for now");
    // setupPostProcessing();
    
    // Add event listeners
    window.addEventListener('resize', onWindowResize);
    // Add mouse movement listener for parallax effects
    container.addEventListener('mousemove', onMouseMove);
    
    // Setup videos with automatic transitions
    setupVideos();
    
    // Add opacity slider for overall video blend control
    addOpacitySlider();
    
    // Start animation loop
    animate();
}

// Set up scene lighting
function setupLighting() {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x222233);
    scene.add(ambientLight);
    
    // Add directional light for subtle highlights
    const directionalLight = new THREE.DirectionalLight(0x8888ff, 0.5);
    directionalLight.position.set(1, 1, 1);
    scene.add(directionalLight);
}

// Create the particle sphere
function createParticleSphere() {
    // Create particle sphere with custom options
    particleSphere = new ParticleSphere(scene, {
        particleCount: 6000,  // Slightly increased for better density
        radius: 2,
        radiusVariation: 0.1,
        baseColor: new THREE.Color(0x3388ff), // Blue base color for futuristic feel
        colorVariation: 0.3,
        minParticleSize: 0.04,  // Adjusted for circular texture
        maxParticleSize: 0.12,  // Adjusted for circular texture
        animationSpeed: 0.5
    });
}

// Handle window resize
function onWindowResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    // Update camera
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    
    // Update renderer
    renderer.setSize(width, height);
}

// Handle mouse movement for parallax effects
function onMouseMove(event) {
    // Calculate normalized mouse position (-1 to 1 range)
    targetMouseX = (event.clientX / window.innerWidth) * 2 - 1;
    targetMouseY = -((event.clientY / window.innerHeight) * 2 - 1);
}

// Setup videos with automatic transitions using billboard approach
function setupVideos() {
    console.log("Setting up videos with billboard approach");
    
    // Prepare particle sphere for video overlay
    if (particleSphere) {
        particleSphere.prepareForVideoOverlay(videos[0]);
        particleSphere.prepareForVideoOverlay(videos[1]);
    }
    
    // Create video elements
    const videoA = createVideoElement(videos[0]);
    const videoB = createVideoElement(videos[1]);
    
    // Create video textures
    const textureA = new THREE.VideoTexture(videoA);
    const textureB = new THREE.VideoTexture(videoB);
    
    // Apply texture settings
    textureA.minFilter = THREE.LinearFilter;
    textureA.magFilter = THREE.LinearFilter;
    textureB.minFilter = THREE.LinearFilter;
    textureB.magFilter = THREE.LinearFilter;
    
    // Create a circular plane geometry for the billboard
    // Size is slightly smaller than the particle sphere to fit inside
    const planeSize = 3.0;
    const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
    
    // Create materials
    const materialA = createVideoBillboardMaterial(textureA, 1.0); // First video fully visible
    const materialB = createVideoBillboardMaterial(textureB, 0.0); // Second video hidden
    
    // Create meshes
    videoSphereA = new THREE.Mesh(planeGeometry, materialA);
    videoSphereB = new THREE.Mesh(planeGeometry, materialB);
    
    // Position slightly differently to avoid z-fighting
    videoSphereA.position.z = -1.0; // Inside the crystal ball
    videoSphereB.position.z = -1.01;
    
    // Add to scene
    scene.add(videoSphereA);
    scene.add(videoSphereB);
    
    // Log to confirm video planes were added
    console.log("Video planes added to scene:", 
                "A:", videoSphereA.uuid, 
                "B:", videoSphereB.uuid);
}

// Create video element with proper settings
function createVideoElement(src) {
    console.log("Creating video element for:", src);
    
    const video = document.createElement('video');
    video.src = src;
    video.loop = true;
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.playsInline = true; // Better for mobile
    video.preload = "auto"; // Preload the video
    
    // Force video to have dimensions for better texture creation
    video.width = 1024;
    video.height = 1024;
    
    // Add event listeners for debugging
    video.addEventListener('loadeddata', () => {
        console.log(`Video loaded: ${src} (${video.videoWidth}x${video.videoHeight})`);
        // Force video to play again after loading
        video.play().catch(e => console.warn("Couldn't play video after loading:", e));
    });
    
    video.addEventListener('play', () => {
        console.log(`Video started playing: ${src}`);
    });
    
    video.addEventListener('pause', () => {
        console.log(`Video paused: ${src}`);
        // Try to resume playback if paused unexpectedly
        video.play().catch(e => console.warn("Couldn't resume paused video:", e));
    });
    
    video.addEventListener('error', (e) => {
        console.error(`Error loading video ${src}:`, e.target.error);
    });
    
    video.addEventListener('stalled', () => {
        console.warn(`Video stalled: ${src}`);
    });
    
    // Auto-play with a promise to handle browser autoplay policies
    console.log(`Attempting to play video: ${src}`);
    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            console.log(`Video autoplay successful: ${src}`);
        }).catch(error => {
            console.warn("Autoplay was prevented. User interaction required.", error);
            // Add a play button if autoplay is blocked
            addPlayButton(video);
        });
    }
    
    return video;
}

// Create material for video billboard with circular mask
function createVideoBillboardMaterial(videoTexture, initialOpacity) {
    console.log("Creating video material with initial opacity:", initialOpacity);
    
    // Log video texture properties
    console.log("Video texture:", videoTexture);
    console.log("Video texture image:", videoTexture.image);
    
    // Set texture filtering for better quality
    if (videoTexture) {
        videoTexture.minFilter = THREE.LinearFilter;
        videoTexture.magFilter = THREE.LinearFilter;
        videoTexture.format = THREE.RGBAFormat;
        videoTexture.needsUpdate = true;
    }
    
    // Create shader material with circular mask
    const material = new THREE.ShaderMaterial({
        uniforms: {
            videoTexture: { value: videoTexture },
            opacity: { value: initialOpacity },
            time: { value: 0.0 },
            videoScale: { value: 0.75 },  // Adjusted for better fit (0.75 is less zoomed in)
            videoOffsetX: { value: 0.0 }, // Horizontal position adjustment
            videoOffsetY: { value: 0.0 }, // Vertical position adjustment
            mousePosition: { value: new THREE.Vector2(0, 0) } // Mouse position for distortion effects
        },
        vertexShader: `
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                vUv = uv;
                vPosition = position;
                vNormal = normalize(normalMatrix * normal);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D videoTexture;
            uniform float opacity;
            uniform float time;
            uniform float videoScale;
            uniform float videoOffsetX;
            uniform float videoOffsetY;
            uniform vec2 mousePosition;
            varying vec2 vUv;
            varying vec3 vPosition;
            varying vec3 vNormal;
            
            void main() {
                // Calculate distance from center of plane for circular mask
                vec2 centered = vUv * 2.0 - 1.0;
                float dist = length(centered);
                
                // Create circular mask with soft edges
                // This creates a perfect circle in the middle of the plane
                float mask = 1.0 - smoothstep(0.8, 1.0, dist);
                
                // Add a subtle pulsing effect to the edges
                float pulse = 0.05 * sin(time * 0.001);
                mask *= 1.0 + (pulse * smoothstep(0.7, 0.9, dist));
                
                // Transform UVs to center and scale the video content
                vec2 transformedUV = (vUv - 0.5) / videoScale + 0.5;
                
                // Apply offset adjustments
                transformedUV.x += videoOffsetX;
                transformedUV.y += videoOffsetY;
                
                // Apply mouse-based distortion effect
                // More effect in center, less at edges for depth illusion
                float distortionStrength = 0.02 * (1.0 - dist * 0.8); // Stronger in center
                vec2 distortion = vec2(
                    mousePosition.x * distortionStrength * sin(dist * 5.0 + time * 0.001),
                    mousePosition.y * distortionStrength * sin(dist * 5.0 + time * 0.002)
                );
                transformedUV += distortion;
                
                // Sample video texture with transformed UVs
                vec4 videoColor = texture2D(videoTexture, transformedUV);
                
                // Apply mask and opacity
                // Discard pixels outside the circular mask completely
                if (mask < 0.01) {
                    discard; // This makes the outer area completely transparent
                }
                
                gl_FragColor = vec4(videoColor.rgb, videoColor.a * opacity * mask);
                
                // Add a subtle blue tint to edges for crystal ball effect
                if (dist > 0.7) {
                    float edgeFactor = smoothstep(0.7, 0.9, dist);
                    gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.2, 0.4, 0.8), edgeFactor * 0.7);
                }
                
                // Add subtle refraction/glow effect
                float refraction = sin(vUv.x * 15.0 + time * 0.001) * sin(vUv.y * 15.0 + time * 0.002) * 0.02;
                gl_FragColor.rgb += vec3(refraction) * smoothstep(0.7, 0.9, dist); // Only apply to edges
            }
        `,
        transparent: true,
        side: THREE.FrontSide, // Changed to FrontSide for billboard approach
        depthTest: true,
        depthWrite: false,
        blending: THREE.NormalBlending // Changed from AdditiveBlending for better video visibility
    });
    
    return material;
}

// Easing function for smooth transitions
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Animation loop
function animate(time) {
    requestAnimationFrame(animate);
    
    // Calculate delta time
    const deltaTime = lastTime === 0 ? 0 : (time - lastTime) / 1000;
    lastTime = time;
    
    // Smooth mouse movement for parallax effect
    mouseX += (targetMouseX - mouseX) * 0.05;
    mouseY += (targetMouseY - mouseY) * 0.05;
    
    // Apply subtle camera movement based on mouse position
    const cameraMovementRange = 0.3; // How much the camera moves
    camera.position.x = cameraMovementRange * mouseX;
    camera.position.y = cameraMovementRange * mouseY;
    camera.lookAt(scene.position); // Always look at the center
    
    // Update particle sphere
    if (particleSphere) {
        particleSphere.update(time);
        
        // Enhanced automatic rotation on multiple axes for more interesting movement
        particleSphere.rotate(0.0002, 0.0005, 0.0001);
        
        // Add subtle rotation based on mouse position for parallax effect
        particleSphere.particleSystem.rotation.x += mouseY * 0.001;
        particleSphere.particleSystem.rotation.y += mouseX * 0.001;
    }
    
    // Handle video transitions
    if (videoSphereA && videoSphereB) {
        // Apply parallax effect to video planes
        // Video planes move in opposite direction to mouse for depth effect
        const videoParallaxAmount = 0.15; // How much the video planes move
        videoSphereA.position.x = -mouseX * videoParallaxAmount;
        videoSphereA.position.y = -mouseY * videoParallaxAmount;
        videoSphereB.position.x = -mouseX * videoParallaxAmount;
        videoSphereB.position.y = -mouseY * videoParallaxAmount;
        
        // Make billboards always face the camera
        videoSphereA.lookAt(camera.position);
        videoSphereB.lookAt(camera.position);
        
        // Update shader uniforms
        if (videoSphereA.material.uniforms) {
            if (videoSphereA.material.uniforms.time) {
                videoSphereA.material.uniforms.time.value = time;
            }
            if (videoSphereA.material.uniforms.mousePosition) {
                videoSphereA.material.uniforms.mousePosition.value.set(mouseX, mouseY);
            }
        }
        if (videoSphereB.material.uniforms) {
            if (videoSphereB.material.uniforms.time) {
                videoSphereB.material.uniforms.time.value = time;
            }
            if (videoSphereB.material.uniforms.mousePosition) {
                videoSphereB.material.uniforms.mousePosition.value.set(mouseX, mouseY);
            }
        }
        
        // Handle transition logic
        if (isTransitioning) {
            // Update transition progress
            transitionProgress += deltaTime / transitionDuration;
            
            if (transitionProgress >= 1.0) {
                // Transition complete
                // Toggle current video
                currentVideoIndex = (currentVideoIndex + 1) % 2;
                
                // Reset transition state
                isTransitioning = false;
                transitionProgress = 0;
                transitionTime = 0;
                
                // Set final opacity values using shader uniforms
                if (currentVideoIndex === 0) {
                    if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
                        videoSphereA.material.uniforms.opacity.value = 1.0;
                    }
                    if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
                        videoSphereB.material.uniforms.opacity.value = 0.0;
                    }
                } else {
                    if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
                        videoSphereA.material.uniforms.opacity.value = 0.0;
                    }
                    if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
                        videoSphereB.material.uniforms.opacity.value = 1.0;
                    }
                }
                
                console.log(`Transition complete. Now showing video ${currentVideoIndex + 1}`);
            } else {
                // Update opacities using easing function for smooth transition
                const easeProgress = easeInOutCubic(transitionProgress);
                
                if (currentVideoIndex === 0) {
                    // Fade from A to B
                    if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
                        videoSphereA.material.uniforms.opacity.value = 1.0 - easeProgress;
                    }
                    if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
                        videoSphereB.material.uniforms.opacity.value = easeProgress;
                    }
                } else {
                    // Fade from B to A
                    if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
                        videoSphereA.material.uniforms.opacity.value = easeProgress;
                    }
                    if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
                        videoSphereB.material.uniforms.opacity.value = 1.0 - easeProgress;
                    }
                }
            }
        } else {
            // Check if it's time to start a new transition
            transitionTime += deltaTime;
            if (transitionTime >= videoDuration) {
                console.log("Starting transition to next video");
                isTransitioning = true;
                transitionProgress = 0;
            }
        }
        
        // Ensure materials are marked for update
        videoSphereA.material.needsUpdate = true;
        videoSphereB.material.needsUpdate = true;
    }
    
    // Render scene directly without post-processing
    renderer.render(scene, camera);
}

// Function to add a play button if autoplay is blocked
function addPlayButton(video) {
    const playButton = document.createElement('button');
    playButton.textContent = 'Play Video';
    playButton.style.position = 'absolute';
    playButton.style.bottom = '20px';
    playButton.style.left = '20px';
    playButton.style.zIndex = '1000';
    playButton.style.padding = '10px 20px';
    playButton.style.backgroundColor = '#3388ff';
    playButton.style.color = 'white';
    playButton.style.border = 'none';
    playButton.style.borderRadius = '5px';
    playButton.style.cursor = 'pointer';
    
    playButton.addEventListener('click', () => {
        video.play();
        playButton.remove();
    });
    
    container.appendChild(playButton);
}

// Function to add controls for video overlay
function addOpacitySlider() {
    // Create container for controls
    const controlsContainer = document.createElement('div');
    controlsContainer.style.position = 'absolute';
    controlsContainer.style.bottom = '20px';
    controlsContainer.style.right = '20px';
    controlsContainer.style.zIndex = '1000';
    controlsContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    controlsContainer.style.padding = '10px';
    controlsContainer.style.borderRadius = '5px';
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'column';
    controlsContainer.style.alignItems = 'center';
    controlsContainer.style.width = '180px';
    
    // Add title
    const title = document.createElement('div');
    title.textContent = 'Crystal Ball Controls';
    title.style.color = 'white';
    title.style.marginBottom = '10px';
    title.style.fontSize = '14px';
    title.style.fontWeight = 'bold';
    controlsContainer.appendChild(title);
    
    // Create opacity control
    const opacityControl = createSliderControl('Video Blend', 0, 1, 0.01, 0.8, (value) => {
        console.log("Opacity slider value:", value);
        
        // Apply to both video spheres
        if (videoSphereA && videoSphereB) {
            // Preserve the relative opacity between spheres during transition
            if (currentVideoIndex === 0) {
                if (!isTransitioning) {
                    if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
                        videoSphereA.material.uniforms.opacity.value = value;
                    }
                } else {
                    // During transition, maintain the fade ratio but adjust overall opacity
                    const ratio = 1.0 - transitionProgress;
                    if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
                        videoSphereA.material.uniforms.opacity.value = value * ratio;
                    }
                    if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
                        videoSphereB.material.uniforms.opacity.value = value * (1.0 - ratio);
                    }
                }
            } else {
                if (!isTransitioning) {
                    if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
                        videoSphereB.material.uniforms.opacity.value = value;
                    }
                } else {
                    // During transition, maintain the fade ratio but adjust overall opacity
                    const ratio = transitionProgress;
                    if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
                        videoSphereA.material.uniforms.opacity.value = value * ratio;
                    }
                    if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
                        videoSphereB.material.uniforms.opacity.value = value * (1.0 - ratio);
                    }
                }
            }
        }
    });
    controlsContainer.appendChild(opacityControl);
    
    // Create zoom control
    const zoomControl = createSliderControl('Zoom', 0.3, 1.0, 0.01, 0.75, (value) => {
        console.log("Zoom slider value:", value);
        
        // Apply to both video spheres
        if (videoSphereA && videoSphereB) {
            if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.videoScale) {
                videoSphereA.material.uniforms.videoScale.value = value;
            }
            if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.videoScale) {
                videoSphereB.material.uniforms.videoScale.value = value;
            }
        }
    });
    controlsContainer.appendChild(zoomControl);
    
    // Create horizontal position control
    const xPosControl = createSliderControl('Horizontal', -0.2, 0.2, 0.01, 0, (value) => {
        console.log("X position slider value:", value);
        
        // Apply to both video spheres
        if (videoSphereA && videoSphereB) {
            if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.videoOffsetX) {
                videoSphereA.material.uniforms.videoOffsetX.value = value;
            }
            if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.videoOffsetX) {
                videoSphereB.material.uniforms.videoOffsetX.value = value;
            }
        }
    });
    controlsContainer.appendChild(xPosControl);
    
    // Create vertical position control
    const yPosControl = createSliderControl('Vertical', -0.2, 0.2, 0.01, 0, (value) => {
        console.log("Y position slider value:", value);
        
        // Apply to both video spheres
        if (videoSphereA && videoSphereB) {
            if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.videoOffsetY) {
                videoSphereA.material.uniforms.videoOffsetY.value = value;
            }
            if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.videoOffsetY) {
                videoSphereB.material.uniforms.videoOffsetY.value = value;
            }
        }
    });
    controlsContainer.appendChild(yPosControl);
    
    // Set initial values
    if (videoSphereA && videoSphereB) {
        if (videoSphereA.material.uniforms && videoSphereA.material.uniforms.opacity) {
            videoSphereA.material.uniforms.opacity.value = currentVideoIndex === 0 ? 0.8 : 0.0;
        }
        if (videoSphereB.material.uniforms && videoSphereB.material.uniforms.opacity) {
            videoSphereB.material.uniforms.opacity.value = currentVideoIndex === 1 ? 0.8 : 0.0;
        }
    }
    
    // Add container to DOM
    container.appendChild(controlsContainer);
}

// Helper function to create a slider control
function createSliderControl(label, min, max, step, defaultValue, onChange) {
    const controlGroup = document.createElement('div');
    controlGroup.style.marginBottom = '10px';
    controlGroup.style.width = '100%';
    
    // Add label
    const labelElement = document.createElement('label');
    labelElement.textContent = label;
    labelElement.style.color = 'white';
    labelElement.style.marginBottom = '5px';
    labelElement.style.fontSize = '12px';
    labelElement.style.display = 'block';
    
    // Create slider
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = min.toString();
    slider.max = max.toString();
    slider.step = step.toString();
    slider.value = defaultValue.toString();
    slider.style.width = '100%';
    
    // Create value display
    const valueDisplay = document.createElement('span');
    valueDisplay.textContent = defaultValue.toString();
    valueDisplay.style.color = 'white';
    valueDisplay.style.fontSize = '10px';
    valueDisplay.style.marginLeft = '5px';
    
    // Add event listener
    slider.addEventListener('input', (event) => {
        const value = parseFloat(event.target.value);
        valueDisplay.textContent = value.toFixed(2);
        onChange(value);
    });
    
    // Add elements to group
    controlGroup.appendChild(labelElement);
    const sliderRow = document.createElement('div');
    sliderRow.style.display = 'flex';
    sliderRow.style.alignItems = 'center';
    sliderRow.appendChild(slider);
    sliderRow.appendChild(valueDisplay);
    controlGroup.appendChild(sliderRow);
    
    return controlGroup;
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);
