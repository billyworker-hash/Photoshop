// ConfirmationModal.js - Custom confirmation dialog system
class ConfirmationModal {
    constructor() {
        this.modalId = 'custom-confirmation-modal';
        this.currentResolve = null;
        this.currentReject = null;
        this.createModal();
    }

    // Create the confirmation modal HTML
    createModal() {
        // Remove existing modal if it exists
        const existingModal = document.getElementById(this.modalId);
        if (existingModal) {
            existingModal.remove();
        }

        const modalHtml = `
            <!-- Custom Confirmation Modal -->
            <div class="modal fade" id="${this.modalId}" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="confirmation-modal-title">
                                <i class="bi bi-question-circle-fill text-warning me-2"></i>
                                Confirm Action
                            </h5>
                        </div>
                        <div class="modal-body">
                            <div id="confirmation-modal-message" class="mb-3">
                                Are you sure you want to proceed?
                            </div>
                            <div id="confirmation-modal-details" class="text-muted small" style="display: none;">
                                <!-- Additional details will go here -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" id="confirmation-cancel-btn">
                                <i class="bi bi-x-circle me-1"></i>
                                Cancel
                            </button>
                            <button type="button" class="btn btn-danger" id="confirmation-confirm-btn">
                                <i class="bi bi-check-circle me-1"></i>
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.setupEventListeners();
    }

    // Setup event listeners for modal buttons
    setupEventListeners() {
        const modal = document.getElementById(this.modalId);
        const cancelBtn = document.getElementById('confirmation-cancel-btn');
        const confirmBtn = document.getElementById('confirmation-confirm-btn');

        // Cancel button handler
        cancelBtn.addEventListener('click', () => {
            this.handleCancel();
        });

        // Confirm button handler
        confirmBtn.addEventListener('click', () => {
            this.handleConfirm();
        });

        // Handle modal close events (backdrop click, ESC key)
        modal.addEventListener('hidden.bs.modal', () => {
            // If modal is closed without explicit confirm/cancel, treat as cancel
            if (this.currentReject) {
                this.handleCancel();
            }
        });
    }

    // Show confirmation modal with custom options
    show(options = {}) {
        const {
            title = 'Confirm Action',
            message = 'Are you sure you want to proceed?',
            details = null,
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmButtonClass = 'btn-danger',
            icon = 'bi-question-circle-fill text-warning'
        } = options;

        // Update modal content
        document.getElementById('confirmation-modal-title').innerHTML = `
            <i class="bi ${icon} me-2"></i>
            ${title}
        `;
        document.getElementById('confirmation-modal-message').textContent = message;
        
        // Show/hide details section
        const detailsElement = document.getElementById('confirmation-modal-details');
        if (details) {
            detailsElement.textContent = details;
            detailsElement.style.display = 'block';
        } else {
            detailsElement.style.display = 'none';
        }

        // Update button texts and classes
        const cancelBtn = document.getElementById('confirmation-cancel-btn');
        const confirmBtn = document.getElementById('confirmation-confirm-btn');
        
        cancelBtn.innerHTML = `<i class="bi bi-x-circle me-1"></i>${cancelText}`;
        confirmBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i>${confirmText}`;
        confirmBtn.className = `btn ${confirmButtonClass}`;

        // Show the modal
        const modal = new bootstrap.Modal(document.getElementById(this.modalId));
        modal.show();

        // Return a promise that resolves with true/false
        return new Promise((resolve, reject) => {
            this.currentResolve = resolve;
            this.currentReject = reject;
        });
    }

    // Handle confirm action
    handleConfirm() {
        if (this.currentResolve) {
            this.currentResolve(true);
            this.currentResolve = null;
            this.currentReject = null;
        }
        this.hideModal();
    }

    // Handle cancel action
    handleCancel() {
        if (this.currentResolve) {
            this.currentResolve(false);
            this.currentResolve = null;
            this.currentReject = null;
        }
        this.hideModal();
    }

    // Hide the modal
    hideModal() {
        const modal = bootstrap.Modal.getInstance(document.getElementById(this.modalId));
        if (modal) {
            modal.hide();
        }
    }

    // Convenience method for simple confirmations
    async confirm(message, title = 'Confirm Action') {
        return await this.show({
            title,
            message,
            confirmText: 'Yes',
            cancelText: 'No'
        });
    }

    // Convenience method for delete confirmations
    async confirmDelete(itemName, itemType = 'item', additionalInfo = null) {
        return await this.show({
            title: 'Confirm Delete',
            message: `Are you sure you want to delete ${itemType} "${itemName}"?`,
            details: additionalInfo || 'This action cannot be undone.',
            confirmText: 'Delete',
            cancelText: 'Cancel',
            confirmButtonClass: 'btn-danger',
            icon: 'bi-trash-fill text-danger'
        });
    }

    // Convenience method for warning confirmations
    async confirmWarning(message, title = 'Warning', details = null) {
        return await this.show({
            title,
            message,
            details,
            confirmText: 'Proceed',
            cancelText: 'Cancel',
            confirmButtonClass: 'btn-warning',
            icon: 'bi-exclamation-triangle-fill text-warning'
        });
    }

    // Convenience method for destructive actions
    async confirmDestructive(message, title = 'Destructive Action', details = null) {
        return await this.show({
            title,
            message,
            details: details || 'This action cannot be undone.',
            confirmText: 'Continue',
            cancelText: 'Cancel',
            confirmButtonClass: 'btn-danger',
            icon: 'bi-exclamation-triangle-fill text-danger'
        });
    }
}

// Create global instance
window.confirmationModal = new ConfirmationModal();

// Helper function to replace browser confirm() calls
window.customConfirm = async (message, title = 'Confirm') => {
    return await window.confirmationModal.confirm(message, title);
};
