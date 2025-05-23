/**
 * MouseTracker.js
 * Utility class for tracking mouse movement and providing normalized coordinates
 */

class MouseTracker {
    /**
     * Create a new MouseTracker
     * @param {HTMLElement} element - The DOM element to track mouse movement on
     */
    constructor(targetElement = document.getElementById('container')) {
        this.element = targetElement;
        
        // Mouse position (normalized -1 to 1)
        this.x = 0;
        this.y = 0;
        
        // Target mouse position (for smooth interpolation)
        this.targetX = 0;
        this.targetY = 0;
        
        // Smoothing factor (0-1, lower = smoother)
        this.smoothing = 0.05;
        
        // Bind methods
        this._onMouseMove = this._onMouseMove.bind(this);
        
        // Initialize
        this._addEventListeners();
    }
    
    /**
     * Add event listeners
     * @private
     */
    _addEventListeners() {
        this.element.addEventListener('mousemove', this._onMouseMove);
    }
    
    /**
     * Remove event listeners
     * @private
     */
    _removeEventListeners() {
        this.element.removeEventListener('mousemove', this._onMouseMove);
    }
    
    /**
     * Handle mouse movement
     * @param {MouseEvent} event - The mouse event
     * @private
     */
    _onMouseMove(event) {
        const rect = this.element.getBoundingClientRect();

        // Ensure rect.width and rect.height are not zero to avoid division by zero
        if (rect.width === 0 || rect.height === 0) {
            // If the element has no size, cannot normalize, keep last position or default
            return; 
        }

        const x = ( event.clientX - rect.left ) / rect.width;   // 0 → 1
        const y = ( event.clientY - rect.top  ) / rect.height;  // 0 → 1

        this.targetX = x *  2 - 1;   //  -1 → 1
        this.targetY = y * -2 + 1;   //   1 → -1  (flip Y, so positive Y is up)
    }
    
    /**
     * Update mouse position with smoothing
     */
    update() {
        // Apply smoothing
        this.x += (this.targetX - this.x) * this.smoothing;
        this.y += (this.targetY - this.y) * this.smoothing;
    }
    
    /**
     * Set the smoothing factor
     * @param {number} value - Smoothing factor (0-1, lower = smoother)
     */
    setSmoothing(value) {
        this.smoothing = Math.max(0.001, Math.min(1, value));
    }
    
    /**
     * Get current mouse position
     * @returns {Object} Object with x and y properties
     */
    getPosition() {
        return { x: this.x, y: this.y };
    }
    
    /**
     * Clean up resources
     */
    dispose() {
        this._removeEventListeners();
    }
}

export default MouseTracker;
