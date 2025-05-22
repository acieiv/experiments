# Crystal Ball Particle Animation - Code Documentation

## Overview

This project creates a futuristic crystal ball animation using Three.js. The animation features a spherical particle system with a video displayed inside, resembling a crystal ball that shows sports analytics data. The code has been refactored into a modular, maintainable structure.

## Directory Structure

```
/src
  /core           - Core application components
    SceneManager.js   - Manages Three.js scene, camera, and renderer
    VideoManager.js   - Handles video loading, transitions, and rendering
    UIManager.js      - Creates and manages UI controls
  /components     - Reusable UI and visual components
    ParticleSystem.js - Creates and manages the particle system
  /shaders        - GLSL shader code (for future use)
  /utils          - Utility functions and classes
    MouseTracker.js   - Tracks mouse movement with smoothing
  /config         - Configuration files
    settings.js       - Central configuration for all components
  main.js         - Application entry point
```

## Core Components

### SceneManager

Responsible for:
- Creating and managing the Three.js scene
- Setting up the camera and renderer
- Handling window resizing
- Managing scene lighting
- Rendering the scene

### VideoManager

Responsible for:
- Loading and playing videos
- Creating video textures and materials
- Handling video transitions
- Applying shader effects to videos
- Managing video positioning and parallax effects

### UIManager

Responsible for:
- Creating the control panel UI
- Managing UI controls (sliders, buttons)
- Handling user interactions with controls
- Providing callbacks for control changes

## Components

### ParticleSystem

Responsible for:
- Creating the spherical particle system
- Managing particle properties (position, color, size)
- Animating particles with depth-based effects
- Handling particle rotation and mouse interaction

## Utilities

### MouseTracker

Responsible for:
- Tracking mouse movement
- Normalizing mouse coordinates
- Applying smoothing to mouse movement
- Providing mouse position to other components

## Configuration

### settings.js

Central configuration file containing settings for:
- Scene properties
- Camera settings
- Particle system properties
- Video settings
- Shader parameters
- UI control settings
- Mouse interaction settings

## Main Application

### main.js

Application entry point that:
- Initializes all components
- Sets up the animation loop
- Coordinates interactions between components
- Handles timing and updates

## Usage

To use this code:
1. Include Three.js library in your HTML
2. Import the main.js file as a module
3. Create a container element with id "container"
4. The application will initialize automatically when the DOM is loaded

## Customization

To customize the animation:
1. Modify settings in the settings.js file
2. Replace video sources in the settings.js file
3. Adjust UI control ranges in the settings.js file
4. Modify shader code in VideoManager.js for different visual effects

## Future Improvements

Potential areas for future enhancement:
- Extract shader code to separate GLSL files
- Add more interactive controls
- Implement post-processing effects
- Add audio visualization capabilities
- Create additional particle effects
