# Project: Crystal-Ball - Visualizing Sports Betting Futures

## Business Overview

This project features an animated "crystal-ball" graphic that surrounds a short football video clip, primarily intended for the homepage.

**Purpose:**
The core idea is to visually reinforce the product's promise: helping users see the future of sports betting.

**Business Value:**
*   **Brand Storytelling:** Instantly communicates the brand's narrative without relying on text.
*   **Memorable First Impression:** Aims to create a lasting impact on investors and early users.
*   **Differentiation:** Sets the product apart from more conventional, plain-looking analytics tools.

**Considerations:**
While the "wow" factor is valuable for demonstrations and conveying brand personality, it's a marketing flourish. It doesn't directly influence the accuracy of betting predictions. Potential downsides include increased load times, the need for ongoing maintenance, and potential distraction on slower devices. The decision to keep or simplify this element depends on the current priorities: whether the "wow" factor for closing deals is paramount, or if speed, clarity, and rapid iteration are more critical.

## Technical Snapshot

The "crystal-ball" effect is a dynamic 3D animation. At its heart, it's a sophisticated particle system that forms a sphere. Inside this sphere, video content (like sports clips) is rendered.

**Key Technical Components:**
*   **Particle System:** Generates and animates a multitude of particles to create the spherical "crystal-ball" visual. It handles the appearance, movement, and depth effects of the particles.
*   **Video Integration:** Manages the loading, playback, and display of video content within the particle sphere, creating the illusion of the crystal ball showing future events.
*   **3D Scene Management:** Utilizes a 3D graphics library (Three.js) to set up and render the overall scene, including the particles, video, lighting, and camera.

The application is structured modularly to manage these different aspects, from core rendering and video handling to specific components like the particle animation.

---

## Original Technical Documentation (Details)

### Overview

This project creates a futuristic crystal ball animation using Three.js. The animation features a spherical particle system with a video displayed inside, resembling a crystal ball that shows sports analytics data. The code has been refactored into a modular, maintainable structure.

### Directory Structure

```
/src
  /core           - Core application components
    SceneManager.js   - Manages Three.js scene, camera, and renderer
    VideoManager.js   - Handles video loading, transitions, and rendering
  /components     - Reusable UI and visual components
    ParticleSystem.js - Creates and manages the particle system
  /shaders        - GLSL shader code (for future use)
  /utils          - Utility functions and classes
    MouseTracker.js   - Tracks mouse movement with smoothing
  /config         - Configuration files
    settings.js       - Central configuration for all components
  main.js         - Application entry point
```

### Core Components

#### SceneManager

Responsible for:
- Creating and managing the Three.js scene
- Setting up the camera and renderer
- Handling window resizing
- Managing scene lighting
- Rendering the scene

#### VideoManager

Responsible for:
- Loading and playing videos
- Creating video textures and materials
- Handling video transitions
- Applying shader effects to videos
- Managing video positioning and parallax effects

### Components

#### ParticleSystem

Responsible for:
- Creating the spherical particle system
- Managing particle properties (position, color, size)
- Animating particles with depth-based effects
- Handling particle rotation and mouse interaction

### Utilities

#### MouseTracker

Responsible for:
- Tracking mouse movement
- Normalizing mouse coordinates
- Applying smoothing to mouse movement
- Providing mouse position to other components

### Configuration

#### settings.js

Central configuration file containing settings for:
- Scene properties
- Camera settings
- Particle system properties
- Video settings
- Shader parameters
- UI control settings
- Mouse interaction settings

### Main Application

#### main.js

Application entry point that:
- Initializes all components
- Sets up the animation loop
- Coordinates interactions between components
- Handles timing and updates

### Usage

To use this code:
1. Include Three.js library in your HTML
2. Import the main.js file as a module
3. Create a container element with id "container"
4. The application will initialize automatically when the DOM is loaded

### Customization

To customize the animation:
1. Modify settings in the settings.js file
2. Replace video sources in the settings.js file
3. Adjust UI control ranges in the settings.js file
4. Modify shader code in VideoManager.js for different visual effects

### Future Improvements

Potential areas for future enhancement:
- Extract shader code to separate GLSL files
- Add more interactive controls
- Implement post-processing effects
- Add audio visualization capabilities
- Create additional particle effects
