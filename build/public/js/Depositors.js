// Depositors.js - Handle depositor list functionality (mirrors Customers.js structure)
class DepositorManager {    constructor(apiManager) {
        this.apiManager = apiManager;
        this.allDepositors = [];
    }

    // Load depositors - main entry point (mirrors loadCustomers)
    async loadDepositors() {
        try {
            // Fetch depositors from the API
            this.allDepositors = await this.fetchDepositors();
            
            // Display depositors with proper headers
            this.displayDepositors(this.allDepositors);
            
            // Set up search and filter event listeners
            this.setupDepositorFilters();
        } catch (err) {
            console.error('Error loading depositors:', err);
        }
    }

    // Initialize depositor management
    init() {
        const depositorsTab = document.getElementById('depositors-tab');
        if (depositorsTab) {
            depositorsTab.addEventListener('click', () => {
                this.loadDepositors();
            });
        }
    }    // Fetch depositors from API (mirrors fetchCustomers)
    async fetchDepositors() {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/depositors`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch depositors');
            }
            
            const data = await response.json();
            // Return just the depositors array from the API response
            return data.depositors || [];
        } catch (err) {
            console.error('Error fetching depositors:', err);
            return [];
        }
    }

    // Display depositors with filtering (mirrors displayCustomers)
    displayDepositors(depositors, filters = {}) {
        const tableHeader = document.getElementById('depositors-table-header');
        const tableBody = document.getElementById('depositors-table-body');
        const noDepositorsMessage = document.getElementById('no-depositors-message');
        
        if (!tableBody) return;
        
        // Generate dynamic table headers
        this.generateTableHeaders(tableHeader);
        
        tableBody.innerHTML = '';
        
        // Apply filters if provided
        let filteredDepositors = [...depositors];
        
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filteredDepositors = filteredDepositors.filter(depositor => {
                // Search in standard fields
                const standardMatch = 
                    this.getField(depositor, 'fullName').toLowerCase().includes(searchTerm) ||
                    this.getField(depositor, 'email').toLowerCase().includes(searchTerm) ||
                    this.getField(depositor, 'phone').toLowerCase().includes(searchTerm);
                
                // Search in custom fields
                let customMatch = false;
                if (depositor.customFields) {
                    for (const [key, value] of depositor.customFields) {
                        if (value && value.toString().toLowerCase().includes(searchTerm)) {
                            customMatch = true;
                            break;
                        }
                    }
                }
                
                return standardMatch || customMatch;
            });
        }
        
        if (filters.status && filters.status !== '') {
            filteredDepositors = filteredDepositors.filter(depositor => depositor.status === filters.status);
        }
        
        // Show/hide no depositors message
        if (filteredDepositors.length === 0) {
            tableBody.innerHTML = '';
            if (noDepositorsMessage) noDepositorsMessage.style.display = 'block';
        } else {
            if (noDepositorsMessage) noDepositorsMessage.style.display = 'none';
              // Display filtered depositors
            filteredDepositors.forEach(depositor => {
                const row = document.createElement('tr');
                row.innerHTML = this.generateDepositorRow(depositor);
                row.dataset.depositorId = depositor._id;
                  // Add click event listener to open depositor modal, but ignore clicks on dropdowns
                const rowClickHandler = (e) => {
                    // Don't trigger if the click was on a dropdown or its elements
                    if (e.target.classList.contains('depositor-status-dropdown') || 
                        e.target.closest('.depositor-status-dropdown')) {
                        return;
                    }
                    this.openDepositorNotesModal(depositor);
                };                row.addEventListener('click', rowClickHandler);
                
                tableBody.appendChild(row);            });
            
            // Add event listeners to phone spans to enable click-to-call
            const phoneLinks = tableBody.querySelectorAll('.phone-link');
            phoneLinks.forEach(span => {
                const phoneLinkHandler = (e) => {
                    e.stopPropagation(); // Prevent the row click event
                    
                    // Get the phone number from the data attribute
                    const phoneNumber = span.getAttribute('data-phone');
                    const sipUrl = `sip:${phoneNumber}`;
                    
                    // Try to open the SIP URL in a new way that doesn't block the UI
                    try {
                        // Create a temporary iframe to handle the SIP protocol
                        const iframe = document.createElement('iframe');
                        iframe.style.display = 'none';
                        iframe.src = sipUrl;
                        document.body.appendChild(iframe);
                        
                        // Remove the iframe after a short delay
                        setTimeout(() => {
                            document.body.removeChild(iframe);
                        }, 1000);
                    } catch (error) {
                        // Fallback: try to open directly (this might still cause delay)
                        window.location.href = sipUrl;
                    }
                };
                span.addEventListener('click', phoneLinkHandler);
            });
            
            // Apply status colors to dropdowns
            this.applyStatusColors();
        }
    }

    // Generate dynamic table headers (mirrors generateTableHeaders)
    generateTableHeaders(headerElement) {
        if (!headerElement) return;
        
        headerElement.innerHTML = '';
        
        // Get all unique labels from all depositors' original list labels
        const allLabels = new Map();
        this.allDepositors.forEach(depositor => {
            if (depositor.originalListLabels && Array.isArray(depositor.originalListLabels)) {
                depositor.originalListLabels.forEach(label => {
                    if (!allLabels.has(label.name)) {
                        allLabels.set(label.name, label.label);
                    }
                });
            }
        });
        
        // Add unique labels as headers
        allLabels.forEach((displayLabel, fieldName) => {
            const th = document.createElement('th');
            th.textContent = displayLabel;
            headerElement.appendChild(th);
        });
        
        // Add standard columns
        const standardColumns = ['Original List', 'Status', 'Created'];
        standardColumns.forEach(columnName => {
            const th = document.createElement('th');
            th.textContent = columnName;
            headerElement.appendChild(th);
        });
    }

    // Generate depositor row HTML (mirrors generateCustomerRow)
    generateDepositorRow(depositor) {
        let rowHtml = '';
        
        // Get all unique labels from all depositors
        const allLabels = new Map();
        this.allDepositors.forEach(d => {
            if (d.originalListLabels && Array.isArray(d.originalListLabels)) {
                d.originalListLabels.forEach(label => {
                    if (!allLabels.has(label.name)) {
                        allLabels.set(label.name, label.label);
                    }
                });
            }
        });
          // Add data for each unique label
        allLabels.forEach((displayLabel, fieldName) => {
            const value = depositor.customFields?.[fieldName] || '-';            // Check if this is a phone field and format it for click-to-call
            if (this.isPhoneField(fieldName) && value && value !== '-') {
                const formattedPhone = this.formatPhoneForCall(value);
                const displayPhone = this.formatPhoneForDisplay(value);
                rowHtml += `<td><span class="phone-link" data-phone="${formattedPhone}" title="Click to call with MicroSip" style="cursor: pointer; color: #0066cc; text-decoration: underline;">${displayPhone}</span></td>`;
            } else {
                rowHtml += `<td>${value}</td>`;
            }
        });
          // Add original list name
        rowHtml += `<td><span class="badge bg-secondary">${depositor.originalListName || 'Unknown List'}</span></td>`;
        
        // Add status dropdown
        const statusOptions = ['new', 'No Answer', 'Voice Mail', 'Call Back Qualified', 'Call Back NOT Qualified', 'deposited', 'active', 'withdrawn', 'inactive'];
        const currentStatus = depositor.status || 'new';
        rowHtml += `
            <td>
                <select class="form-select form-select-sm depositor-status-dropdown" 
                        data-depositor-id="${depositor._id}" 
                        onchange="window.depositorManager.updateDepositorStatus('${depositor._id}', this.value)">
                    ${statusOptions.map(status => 
                        `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${this.formatStatus(status)}</option>`
                    ).join('')}
                </select>
            </td>
        `;
        
        // Add created date
        const createdDate = new Date(depositor.createdAt).toLocaleDateString();
        rowHtml += `<td>${createdDate}</td>`;
        
        return rowHtml;
    }

    // Set up depositor filters (mirrors setupCustomerFilters)
    setupDepositorFilters() {
        const searchInput = document.getElementById('depositor-search');
        const statusFilter = document.getElementById('depositor-status-filter');
        const resetFiltersBtn = document.getElementById('reset-depositor-filters');
        
        // Function to apply filters
        const applyFilters = () => {
            const filters = {
                search: searchInput?.value || '',
                status: statusFilter?.value || ''
            };
            this.displayDepositors(this.allDepositors, filters);
        };

        // Set up event listeners
        if (searchInput) {
            searchInput.addEventListener('input', applyFilters);
        }
        
        if (statusFilter) {
            statusFilter.addEventListener('change', applyFilters);
        }
        
        if (resetFiltersBtn) {
            resetFiltersBtn.addEventListener('click', () => {
                if (searchInput) searchInput.value = '';
                if (statusFilter) statusFilter.value = '';
                this.displayDepositors(this.allDepositors);
            });
        }
    }

    // Get field value from depositor (utility method)
    getField(depositor, fieldName) {
        // Handle special case for fullName since depositors use fullName directly
        if (fieldName === 'fullName') {
            return depositor.fullName || depositor.customFields?.fullName || 'Unknown';
        }
        
        // Check custom fields first, then direct properties
        return depositor.customFields?.[fieldName] || depositor[fieldName] || '';
    }

    // Format status display
    formatStatus(status) {
        if (!status) return 'New';
        return status.charAt(0).toUpperCase() + status.slice(1);
    }    // Open depositor notes modal (mirrors openCustomerNotesModal)
    openDepositorNotesModal(depositor) {
        // Reset all modal buttons to ensure proper state
        if (typeof resetModalButtons === 'function') {
            resetModalButtons();
        }
        
        var depositorNoteId = document.getElementById('lead-note-id');
        var depositorNoteStatus = document.getElementById('lead-note-status');
        var depositorNotesContainer = document.getElementById('lead-notes-container');
        var ownLeadBtn = document.getElementById('own-lead-btn');
        var releaseLeadBtn = document.getElementById('release-lead-btn');
        var transferLeadBtn = document.getElementById('transfer-lead-btn');
        var moveToDepositorsBtn = document.getElementById('move-to-depositors-btn');
        
        // Hide the "Own Lead" button since this is already a depositor
        if (ownLeadBtn) {
            ownLeadBtn.style.display = 'none';
        }
        
        // Hide the "Move to Depositors" button since this is already a depositor
        if (moveToDepositorsBtn) {
            moveToDepositorsBtn.style.display = 'none';
        }
        
        // Hide Transfer Lead button for depositors
        if (transferLeadBtn) {
            transferLeadBtn.style.display = 'none';
        }
          // Show the "Release to Customers" button for depositors
        if (releaseLeadBtn) {
            releaseLeadBtn.style.display = 'inline-block';
            releaseLeadBtn.textContent = 'Release to Customers';
        }
        
        // Clear previous note textarea
        var noteContent = document.getElementById('lead-note-content');
        if (noteContent) {
            noteContent.value = '';
        }
        
        // Set depositor ID and status
        if (depositorNoteId) {
            depositorNoteId.value = depositor._id;
        }
        if (depositorNoteStatus) {
            depositorNoteStatus.value = depositor.status || 'new';
        }
        
        // Display previous notes if any
        if (depositorNotesContainer) {
            this.displayDepositorNotes(depositor, depositorNotesContainer);
        }
        
        // Update modal title
        const modalTitle = document.querySelector('#leadNotesModal .modal-title');
        if (modalTitle) {
            modalTitle.textContent = `Depositor: ${this.getField(depositor, 'fullName')}`;
        }
        
        var modal = new bootstrap.Modal(document.getElementById('leadNotesModal'));
        modal.show();
        
        // Add event listener to the save note button
        var saveNoteBtn = document.getElementById('save-lead-note-btn');
        if (saveNoteBtn) {
            // Remove existing listeners to prevent duplicates
            const newSaveNoteBtn = saveNoteBtn.cloneNode(true);
            saveNoteBtn.parentNode.replaceChild(newSaveNoteBtn, saveNoteBtn);
            
            newSaveNoteBtn.addEventListener('click', () => {
                this.saveDepositorNote(depositor._id);
            });
        }

        // Add event listener to the release depositor button
        if (releaseLeadBtn) {
            // Remove existing listeners to prevent duplicates
            const newReleaseBtn = releaseLeadBtn.cloneNode(true);
            releaseLeadBtn.parentNode.replaceChild(newReleaseBtn, releaseLeadBtn);
              newReleaseBtn.addEventListener('click', () => {                this.releaseDepositorToCustomers(depositor._id);
            });
        }
    }

    // Display depositor notes (mirrors displayCustomerNotes)
    displayDepositorNotes(depositor, container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!depositor.notes || depositor.notes.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-2">No notes yet</div>';
            return;
        }
        
        // Sort notes by newest first
        const sortedNotes = [...depositor.notes].sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );        // Create note elements
        sortedNotes.forEach(note => {
            const noteDate = new Date(note.createdAt).toLocaleString();
            // Fix for accessing user name properly - check both object formats
            let userName = 'Unknown User';
            if (note.createdBy) {
                if (typeof note.createdBy === 'object' && note.createdBy.name) {
                    userName = note.createdBy.name;
                } else if (typeof note.createdBy === 'string') {
                    // If only ID is present without population, get current user if it matches
                    const currentUser = this.apiManager.getCurrentUser();
                    if (currentUser && currentUser.id === note.createdBy) {
                        userName = currentUser.name;
                    }
                }
            }
            const noteDiv = document.createElement('div');
            noteDiv.className = 'note-item mb-2 border-bottom pb-2';
            noteDiv.innerHTML = `
                <div class="text-secondary small">${noteDate} - <strong>${userName}</strong></div>
                <div>${note.content}</div>
            `;
            container.appendChild(noteDiv);
        });
    }

    // Save depositor note (mirrors saveCustomerNote)
    async saveDepositorNote(depositorId) {
        const noteContent = document.getElementById('lead-note-content').value.trim();
        const noteStatus = document.getElementById('lead-note-status').value;
        
        // Note content is optional, but we need to update the status
        try {
            // Get the current user
            const currentUser = this.apiManager.getCurrentUser();
            
            // Prepare the data - only include the note if there's content
            const data = {
                status: noteStatus
            };
              // Only add the note if there's actual content
            if (noteContent) {
                data.note = {
                    content: noteContent,
                    createdBy: currentUser ? currentUser.id : null
                };
            }
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/depositors/${depositorId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error('Failed to update depositor');
            }
            
            // Close modal and reload depositors
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload depositors
            this.loadDepositors();
            
            // Show success message
            const message = noteContent ? 'Note added successfully' : 'Status updated successfully';
            this.apiManager.showAlert(message, 'success');
            
        } catch (err) {
            console.error('Error updating depositor:', err);
            this.apiManager.showAlert(`Failed to update depositor: ${err.message}`, 'danger');
        }
    }    // Release Depositor - Convert depositor back to customer
    async releaseDepositor(depositorId) {
        try {
            // Check if there's unsaved note content in the modal
            const noteContent = document.getElementById('lead-note-content')?.value?.trim();
            const noteStatus = document.getElementById('lead-note-status')?.value;
            
            // If there's note content, save it first before releasing the depositor
            if (noteContent) {
                await this.saveDepositorNote(depositorId);
                // Small delay to ensure the note is saved before proceeding
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/depositors/${depositorId}/release`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to release depositor');
            }
            
            const result = await response.json();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload depositors to reflect the changes
            await this.loadDepositors();
            
            // Show success message
            this.apiManager.showAlert('Depositor successfully released back to customers', 'success');
            
        } catch (err) {
            console.error('Error releasing depositor:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }    // Helper function to safely get field values
    getField(obj, fieldName) {
        if (!obj) return '';
        
        // First check direct properties
        if (obj[fieldName]) return obj[fieldName];
        
        // Then check customFields
        if (obj.customFields && obj.customFields[fieldName]) {
            return obj.customFields[fieldName];
        }
          return '';
    }

    // Check if a field is a phone field (for click-to-call)
    isPhoneField(fieldName) {
        return fieldName && (
            fieldName.toLowerCase().includes('phone') || 
            fieldName.toLowerCase().includes('tel') || 
            fieldName.toLowerCase().includes('mobile') || 
            fieldName.toLowerCase().includes('cell')
        );
    }

    // Format phone number for SIP calling
    formatPhoneForCall(phoneNumber) {
        if (!phoneNumber) return '';
        // Remove all non-numeric characters except +
        return phoneNumber.replace(/[^\d+]/g, '');
    }    // Format phone number for display with just a phone icon to save space
    formatPhoneForDisplay(phoneNumber) {
        if (!phoneNumber) return '';
        
        // Return a different phone icon to save maximum space
        return '☎️';
    }// Release depositor back to customers list (hierarchy system)
    async releaseDepositorToCustomers(depositorId) {
        try {
            // Check if there's unsaved note content in the modal
            const noteContent = document.getElementById('lead-note-content')?.value?.trim();
            const noteStatus = document.getElementById('lead-note-status')?.value;
              
            // If there's note content, save it first before releasing the depositor
            if (noteContent) {
                await this.saveDepositorNote(depositorId);
                // Small delay to ensure the note is saved before proceeding
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/depositors/${depositorId}/release-to-customers`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Failed to release depositor');
            }
            
            const result = await response.json();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload depositors to reflect the changes            
            await this.loadDepositors();
            
            // Show success message using the apiManager.showAlert
            this.apiManager.showAlert(result.message || 'Depositor successfully released to customers list', 'success');
            
        } catch (err) {
            console.error('Error releasing depositor:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }    // Update depositor status from dropdown
    async updateDepositorStatus(depositorId, newStatus) {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/depositors/${depositorId}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update depositor status');
            }
            
            // Update the depositor in our local array
            const depositorIndex = this.allDepositors.findIndex(depositor => depositor._id === depositorId);
            if (depositorIndex !== -1) {
                this.allDepositors[depositorIndex].status = newStatus;
            }
            
            // Visual feedback - briefly highlight the dropdown with classes
            const dropdown = document.querySelector(`[data-depositor-id="${depositorId}"]`);
            if (dropdown) {
                // Add animation and success feedback classes
                dropdown.classList.add('status-update-animation');
                dropdown.classList.add('success-feedback');
                
                // Apply new status color immediately
                this.applyStatusColors();
                
                // Remove animation classes after animation completes
                setTimeout(() => {
                    dropdown.classList.remove('success-feedback');
                    dropdown.classList.remove('status-update-animation');
                }, 1000);
            }
            
            // Show status update toast
            this.showStatusUpdateToast(newStatus);
            
        } catch (err) {
            console.error('Error updating depositor status:', err);
            this.apiManager.showAlert(`Error updating status: ${err.message}`, 'danger');
            
            // Revert the dropdown to the previous value
            const dropdown = document.querySelector(`[data-depositor-id="${depositorId}"]`);
            if (dropdown) {
                const depositor = this.allDepositors.find(d => d._id === depositorId);
                if (depositor) {
                    dropdown.value = depositor.status || 'new';
                }
            }
        }
    }

    // Show status update toast notification
    showStatusUpdateToast(status) {
        // Create toast container if it doesn't exist
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(toastContainer);
        }
        
        // Create unique ID for this toast
        const toastId = 'status-toast-' + Date.now();
        
        // Create toast HTML
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center text-white bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi bi-check-circle me-2"></i> Depositor status updated to "${this.formatStatus(status)}"
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        
        // Add toast to container
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        
        // Initialize and show the toast
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: 3000
        });
        toast.show();
        
        // Remove toast from DOM after it's hidden
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }    // Apply color styling to dropdowns based on selected status
    applyStatusColors() {
        document.querySelectorAll('.depositor-status-dropdown').forEach(dropdown => {
            const status = dropdown.value;
              // Remove existing status color classes
            dropdown.classList.remove('status-new', 'status-no-answer', 'status-voice-mail', 
                                     'status-call-back-qualified', 'status-call-back-not-qualified');
            
            // Add class based on current status
            switch(status) {
                case 'new':
                    dropdown.classList.add('status-new');
                    break;
                case 'No Answer':
                    dropdown.classList.add('status-no-answer');
                    break;
                case 'Voice Mail':
                    dropdown.classList.add('status-voice-mail');
                    break;
                case 'Call Back Qualified':
                    dropdown.classList.add('status-call-back-qualified');
                    break;
                case 'Call Back NOT Qualified':
                    dropdown.classList.add('status-call-back-not-qualified');
                    break;
            }
        });
    }
}

// Initialize the depositor manager when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.apiManager) {
        window.depositorManager = new DepositorManager(window.apiManager);
        window.depositorManager.init();
    } else {
        console.error('API Manager not initialized');
    }
});
