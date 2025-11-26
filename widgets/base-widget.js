/**
 * Base Widget Class
 * Abstract base class for all dashboard widgets
 * Provides common functionality and interface for widget modules
 */

class BaseWidget {
    constructor(config = {}) {
        this.id = config.id || '';
        this.title = config.title || 'Untitled Widget';
        this.icon = config.icon || 'fas fa-cube';
        this.category = config.category || 'general';
        this.size = config.size || 'medium'; // small, medium, large, full
        this.refreshInterval = config.refreshInterval || 0; // 0 = manual only
        this.requiresAuth = config.requiresAuth !== false; // Default true
    }

    /**
     * Generate HTML for widget container
     * Subclasses can override for custom rendering
     */
    render(data = {}) {
        return `
            <div class="widget-item widget-${this.size}" data-widget-id="${this.id}">
                <div class="widget-item-content">
                    <div class="widget-card">
                        <div class="widget-header">
                            <h3><i class="${this.icon}"></i> ${this.title}</h3>
                            <div class="widget-actions">
                                <button onclick="refreshWidget('${this.id}')" class="btn-icon" title="Refresh">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                                <button onclick="removeWidget('${this.id}')" class="btn-icon" title="Remove">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        </div>
                        <div class="widget-content">
                            ${this.renderContent(data)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render widget-specific content
     * MUST be overridden by subclasses
     */
    renderContent(data) {
        throw new Error('renderContent() must be implemented by subclass');
    }

    /**
     * Fetch data for widget
     * MUST be overridden by subclasses that need data
     */
    async fetchData(dal) {
        throw new Error('fetchData() must be implemented by subclass');
    }

    /**
     * Get client-side JavaScript for widget
     * Returns function string to be executed in browser
     */
    getClientScript() {
        return null; // Override if widget needs client-side logic
    }

    /**
     * Get widget metadata for marketplace
     */
    getMetadata() {
        return {
            id: this.id,
            title: this.title,
            icon: this.icon,
            category: this.category,
            size: this.size,
            description: this.getDescription(),
            requiresAuth: this.requiresAuth
        };
    }

    /**
     * Get widget description for marketplace
     */
    getDescription() {
        return 'No description available';
    }

    /**
     * Validate widget data before rendering
     */
    validateData(data) {
        return true; // Override for custom validation
    }

    /**
     * Handle widget errors gracefully
     */
    renderError(error) {
        return `
            <div class="empty-state error">
                <i class="fas fa-exclamation-triangle empty-state-icon"></i>
                <br>Failed to load widget
                <br><small>${error.message || 'Unknown error'}</small>
            </div>
        `;
    }

    /**
     * Render empty state when no data available
     */
    renderEmptyState(message = 'No data available') {
        return `
            <div class="empty-state">
                <i class="fas fa-inbox empty-state-icon"></i>
                <br>${message}
            </div>
        `;
    }
}

module.exports = BaseWidget;
