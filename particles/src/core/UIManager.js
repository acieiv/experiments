/**
 * UIManager.js
 * Responsible for creating and managing UI controls
 */

import settings from '../config/settings.js';

class UIManager {
    /**
     * Create a new UIManager
     * @param {HTMLElement} container - The DOM element to add controls to
     * @param {Object} callbacks - Callback functions for control changes
     */
    constructor(container, callbacks = {}) {
        this.container = container;
        this.callbacks = callbacks;
        this.controlsContainer = null;
        
        // Initialize
        this.initialize();
    }
    
    /**
     * Initialize UI controls
     */
    initialize() {
        // Create container for controls
        this.controlsContainer = document.createElement('div');
        this.controlsContainer.style.position = 'absolute';
        this.controlsContainer.style.bottom = '20px';
        this.controlsContainer.style.right = '20px';
        this.controlsContainer.style.zIndex = '1000';
        this.controlsContainer.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        this.controlsContainer.style.padding = '10px';
        this.controlsContainer.style.borderRadius = '5px';
        this.controlsContainer.style.display = 'flex';
        this.controlsContainer.style.flexDirection = 'column';
        this.controlsContainer.style.alignItems = 'center';
        this.controlsContainer.style.width = '180px';
        
        // Add title
        const title = document.createElement('div');
        title.textContent = 'Crystal Ball Controls';
        title.style.color = 'white';
        title.style.marginBottom = '10px';
        title.style.fontSize = '14px';
        title.style.fontWeight = 'bold';
        this.controlsContainer.appendChild(title);
        
        // Add controls
        this.addControls();
        
        // Add container to DOM
        this.container.appendChild(this.controlsContainer);
    }
    
    /**
     * Add all controls to the UI
     */
    addControls() {
        const uiSettings = settings.ui.controls;
        
        // Create opacity control
        const opacityControl = this.createSliderControl(
            uiSettings.opacity.label,
            uiSettings.opacity.min,
            uiSettings.opacity.max,
            uiSettings.opacity.step,
            uiSettings.opacity.default,
            (value) => {
                console.log("Opacity slider value:", value);
                if (this.callbacks.onOpacityChange) {
                    this.callbacks.onOpacityChange(value);
                }
            }
        );
        this.controlsContainer.appendChild(opacityControl);
        
        // Create zoom control
        const zoomControl = this.createSliderControl(
            uiSettings.zoom.label,
            uiSettings.zoom.min,
            uiSettings.zoom.max,
            uiSettings.zoom.step,
            uiSettings.zoom.default,
            (value) => {
                console.log("Zoom slider value:", value);
                if (this.callbacks.onZoomChange) {
                    this.callbacks.onZoomChange(value);
                }
            }
        );
        this.controlsContainer.appendChild(zoomControl);
        
        // Create horizontal position control
        const xPosControl = this.createSliderControl(
            uiSettings.offsetX.label,
            uiSettings.offsetX.min,
            uiSettings.offsetX.max,
            uiSettings.offsetX.step,
            uiSettings.offsetX.default,
            (value) => {
                console.log("X position slider value:", value);
                if (this.callbacks.onOffsetXChange) {
                    this.callbacks.onOffsetXChange(value);
                }
            }
        );
        this.controlsContainer.appendChild(xPosControl);
        
        // Create vertical position control
        const yPosControl = this.createSliderControl(
            uiSettings.offsetY.label,
            uiSettings.offsetY.min,
            uiSettings.offsetY.max,
            uiSettings.offsetY.step,
            uiSettings.offsetY.default,
            (value) => {
                console.log("Y position slider value:", value);
                if (this.callbacks.onOffsetYChange) {
                    this.callbacks.onOffsetYChange(value);
                }
            }
        );
        this.controlsContainer.appendChild(yPosControl);
    }
    
    /**
     * Create a slider control
     * @param {string} label - Label for the slider
     * @param {number} min - Minimum value
     * @param {number} max - Maximum value
     * @param {number} step - Step value
     * @param {number} defaultValue - Default value
     * @param {Function} onChange - Callback function for value change
     * @returns {HTMLElement} The created control group element
     */
    createSliderControl(label, min, max, step, defaultValue, onChange) {
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
    
    /**
     * Add a play button if autoplay is blocked
     * @param {HTMLVideoElement} video - The video element
     */
    addPlayButton(video) {
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
        
        this.container.appendChild(playButton);
    }
}

export default UIManager;
