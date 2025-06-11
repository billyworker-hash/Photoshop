// Customers.js - Handle customer list functionality (mirrors Leads.js structure)
class CustomerManager {
    constructor(apiManager) {
        this.apiManager = apiManager;
        this.allCustomers = [];
        this.currentCustomer = null;
    }

    // Load customers - main entry point (mirrors loadLeads)
    async loadCustomers() {
        try {
            // Fetch customers from the API
            this.allCustomers = await this.fetchCustomers();
            
            // Display customers with proper headers
            this.displayCustomers(this.allCustomers);
            
            // Set up search and filter event listeners
            this.setupCustomerFilters();
        } catch (err) {
            console.error('Error loading customers:', err);
        }
    }

    // Initialize customer management
    init() {
        const customersTab = document.getElementById('customers-tab');
        if (customersTab) {
            customersTab.addEventListener('click', () => {
                this.loadCustomers();
            });
        }
    }    // Fetch customers from API (mirrors fetchLeads)
    async fetchCustomers() {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/customers`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch customers');
            }
            
            return await response.json();
        } catch (err) {
            console.error('Error fetching customers:', err);
            return [];
        }
    }

    // Display customers with filtering (mirrors displayLeads)
    displayCustomers(customers, filters = {}) {
        const tableHeader = document.getElementById('customers-table-header');
        const tableBody = document.getElementById('customers-table-body');
        const noCustomersMessage = document.getElementById('no-customers-message');
        
        if (!tableBody) return;
        
        // Generate dynamic table headers
        this.generateTableHeaders(tableHeader);
        
        tableBody.innerHTML = '';
        
        // Apply filters if provided
        let filteredCustomers = [...customers];
        
        if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filteredCustomers = filteredCustomers.filter(customer => {
                // Search in standard fields
                const standardMatch = customer.fullName?.toLowerCase().includes(searchTerm) || 
                                    customer.email?.toLowerCase().includes(searchTerm) || 
                                    customer.phone?.toLowerCase().includes(searchTerm) ||
                                    customer.originalListName?.toLowerCase().includes(searchTerm);
                
                // Search in custom fields from original list
                let customMatch = false;
                if (customer.originalListLabels && Array.isArray(customer.originalListLabels)) {
                    customMatch = customer.originalListLabels.some(label => {
                        const value = customer.customFields?.[label.name];
                        return value && value.toString().toLowerCase().includes(searchTerm);
                    });
                }
                
                return standardMatch || customMatch;
            });
        }
        
        if (filters.status && filters.status !== '') {
            filteredCustomers = filteredCustomers.filter(customer => customer.status === filters.status);
        }
        
        // Show/hide no customers message
        if (filteredCustomers.length === 0) {
            tableBody.innerHTML = '';
            if (noCustomersMessage) noCustomersMessage.style.display = 'block';
        } else {
            if (noCustomersMessage) noCustomersMessage.style.display = 'none';
              // Display filtered customers
            filteredCustomers.forEach(customer => {
                const row = document.createElement('tr');
                row.innerHTML = this.generateCustomerRow(customer);
                row.style.cursor = 'pointer';
                row.dataset.customerId = customer._id;
                tableBody.appendChild(row);
                  // Add event listener to the entire row to open notes modal, but ignore clicks on dropdowns
                const rowClickHandler = (e) => {
                    // Don't trigger if the click was on a dropdown or its elements
                    if (e.target.classList.contains('customer-status-dropdown') || 
                        e.target.closest('.customer-status-dropdown')) {
                        return;
                    }
                    this.openCustomerNotesModal(customer);
                };                row.addEventListener('click', rowClickHandler);            });
            
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
        
        // Get all unique labels from all customers' original list labels
        const allLabels = new Map();
        this.allCustomers.forEach(customer => {
            if (customer.originalListLabels && Array.isArray(customer.originalListLabels)) {
                customer.originalListLabels.forEach(label => {
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

    // Generate customer row HTML (mirrors generateLeadRow)
    generateCustomerRow(customer) {
        let rowHtml = '';
        
        // Get all unique labels from all customers
        const allLabels = new Map();
        this.allCustomers.forEach(c => {
            if (c.originalListLabels && Array.isArray(c.originalListLabels)) {
                c.originalListLabels.forEach(label => {
                    if (!allLabels.has(label.name)) {
                        allLabels.set(label.name, label.label);
                    }
                });
            }
        });
          // Add data for each unique label
        allLabels.forEach((displayLabel, fieldName) => {
            const value = customer.customFields?.[fieldName] || '-';            // Check if this is a phone field and format it for click-to-call
            if (this.isPhoneField(fieldName) && value && value !== '-') {
                const formattedPhone = this.formatPhoneForCall(value);
                const displayPhone = this.formatPhoneForDisplay(value);
                rowHtml += `<td><span class="phone-link" data-phone="${formattedPhone}" title="Click to call with MicroSip" style="cursor: pointer; color: #0066cc; text-decoration: underline;">${displayPhone}</span></td>`;
            } else {
                rowHtml += `<td>${value}</td>`;
            }
        });
          // Add original list name
        rowHtml += `<td><span class="badge bg-secondary">${customer.originalListName || 'Unknown List'}</span></td>`;
        
        // Add status dropdown
        const statusOptions = ['new', 'No Answer', 'Voice Mail', 'Call Back Qualified', 'Call Back NOT Qualified', 'lead-released'];
        const currentStatus = customer.status || 'new';
        rowHtml += `
            <td>
                <select class="form-select form-select-sm customer-status-dropdown" 
                        data-customer-id="${customer._id}" 
                        onchange="window.customerManager.updateCustomerStatus('${customer._id}', this.value)">
                    ${statusOptions.map(status => 
                        `<option value="${status}" ${status === currentStatus ? 'selected' : ''}>${this.formatStatus(status)}</option>`
                    ).join('')}
                </select>
            </td>
        `;
        
        // Add created date
        const createdDate = new Date(customer.createdAt).toLocaleDateString();
        rowHtml += `<td>${createdDate}</td>`;
        
        return rowHtml;
    }    // Set up customer filters (mirrors setupLeadFilters)
    setupCustomerFilters() {
        const searchInput = document.getElementById('customer-search');
        const statusFilter = document.getElementById('customer-status-filter');
        const resetFiltersBtn = document.getElementById('reset-customer-filters');
        
        // Function to apply filters
        const applyFilters = () => {
            const filters = {
                search: searchInput?.value || '',
                status: statusFilter?.value || ''
            };
            this.displayCustomers(this.allCustomers, filters);
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
                applyFilters();
            });
        }
    }    // Format status display
    formatStatus(status) {
        if (!status) return 'Active';
        return status.charAt(0).toUpperCase() + status.slice(1);
    }    // Open customer notes modal (mirrors openLeadNotesModal)
    openCustomerNotesModal(customer) {
        // Reset all modal buttons to ensure proper state
        if (typeof resetModalButtons === 'function') {
            resetModalButtons();
        }
        
        var customerNoteId = document.getElementById('lead-note-id'); // Reusing lead modal elements
        var customerNoteStatus = document.getElementById('lead-note-status');
        var customerNotesContainer = document.getElementById('lead-notes-container');
        var ownLeadBtn = document.getElementById('own-lead-btn');
        var releaseLeadBtn = document.getElementById('release-lead-btn');
        var transferLeadBtn = document.getElementById('transfer-lead-btn');
        var moveToDepositorsBtn = document.getElementById('move-to-depositors-btn');
        
        // Hide the "Own Lead" button since this is already a customer
        if (ownLeadBtn) {
            ownLeadBtn.style.display = 'none';
        }
        
        // Hide the "Transfer Lead" button for customers
        if (transferLeadBtn) {
            transferLeadBtn.style.display = 'none';
        }
        
        // Show the "Release Customer" button for customers
        if (releaseLeadBtn) {
            releaseLeadBtn.style.display = 'inline-block';
            releaseLeadBtn.textContent = 'Release Customer';
            releaseLeadBtn.className = 'btn btn-warning';
        }
        
        // Show the "Move to Depositors" button for customers
        if (moveToDepositorsBtn) {
            moveToDepositorsBtn.style.display = 'inline-block';
        }
        
        // Clear previous note textarea
        var noteContent = document.getElementById('lead-note-content');
        if (noteContent) {
            noteContent.value = '';
        }
        
        // Set customer ID and status
        if (customerNoteId) {
            customerNoteId.value = customer._id;
        }
        if (customerNoteStatus) {
            customerNoteStatus.value = customer.status || 'active';
        }
        
        // Display previous notes if any
        if (customerNotesContainer) {
            this.displayCustomerNotes(customer, customerNotesContainer);
        }
        
        // Update modal title
        const modalTitle = document.querySelector('#leadNotesModal .modal-title');
        if (modalTitle) {
            modalTitle.textContent = `Notes for ${customer.fullName || 'Customer'}`;
        }
        
        var modal = new bootstrap.Modal(document.getElementById('leadNotesModal'));
        modal.show();
        
        // Add event listener to the save note button
        var saveNoteBtn = document.getElementById('save-lead-note-btn');
        if (saveNoteBtn) {
            // Remove any existing event listeners to prevent duplicates
            var newSaveBtn = saveNoteBtn.cloneNode(true);
            saveNoteBtn.parentNode.replaceChild(newSaveBtn, saveNoteBtn);
            
            // Add new event listener
            newSaveBtn.addEventListener('click', () => {
                this.saveCustomerNote(customer._id);
            });
        }        // Add event listener to the release customer button
        if (releaseLeadBtn) {
            // Remove any existing event listeners to prevent duplicates
            var newReleaseBtn = releaseLeadBtn.cloneNode(true);
            releaseLeadBtn.parentNode.replaceChild(newReleaseBtn, releaseLeadBtn);
            
            // Add new event listener
            newReleaseBtn.addEventListener('click', () => {
                this.releaseCustomer(customer._id);
            });
        }
        
        // Add event listener to the move to depositors button
        if (moveToDepositorsBtn) {
            // Remove any existing event listeners to prevent duplicates
            var newMoveBtn = moveToDepositorsBtn.cloneNode(true);
            moveToDepositorsBtn.parentNode.replaceChild(newMoveBtn, moveToDepositorsBtn);
            
            // Add new event listener
            newMoveBtn.addEventListener('click', () => {
                this.moveToDepositors(customer._id);
            });
        }
        
        // Set up the customer data for reference
        this.currentCustomer = customer;
    }

    // Display customer notes (mirrors displayLeadNotes)
    displayCustomerNotes(customer, container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!customer.notes || customer.notes.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-2">No notes yet</div>';
            return;
        }
        
        // Sort notes by newest first
        const sortedNotes = [...customer.notes].sort((a, b) => 
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

    // Save customer note (mirrors saveLeadNote)
    async saveCustomerNote(customerId) {
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
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/customers/${customerId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error('Failed to save customer note');
            }
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload customers to reflect changes
            this.loadCustomers();
              this.apiManager.showAlert('Note saved successfully', 'success');
        } catch (err) {
            console.error('Error saving customer note:', err);
            this.apiManager.showAlert('Failed to save note: ' + err.message, 'danger');
        }
    }    // Release Customer - Convert customer back to lead
    async releaseCustomer(customerId) {
        try {
            // Check if there's unsaved note content in the modal
            const noteContent = document.getElementById('lead-note-content')?.value?.trim();
            const noteStatus = document.getElementById('lead-note-status')?.value;
            
            // If there's note content, save it first before releasing the customer
            if (noteContent) {
                await this.saveCustomerNote(customerId);
                // Small delay to ensure the note is saved before proceeding
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/customers/${customerId}/release`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to release customer');
            }
            
            const result = await response.json();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
              // Reload customers to reflect changes
            await this.loadCustomers();
            
            // Show success message using the apiManager.showAlert
            this.apiManager.showAlert('Customer successfully released back to leads pool', 'success');
            
        } catch (err) {
            console.error('Error releasing customer:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }    // Move customer to depositors list
    async moveToDepositors(customerId) {
        try {
            // Check if there's unsaved note content in the modal
            const noteContent = document.getElementById('lead-note-content')?.value?.trim();
            const noteStatus = document.getElementById('lead-note-status')?.value;
            
            // If there's note content, save it first before moving the customer
            if (noteContent) {
                await this.saveCustomerNote(customerId);
                // Small delay to ensure the note is saved before proceeding
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/customers/${customerId}/move-to-depositors`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to move customer to depositors');
            }
            
            const result = await response.json();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload customers to reflect changes
            await this.loadCustomers();
            
            this.apiManager.showAlert('Customer successfully moved to depositors list', 'success');
            
        } catch (err) {
            console.error('Error moving customer to depositors:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }    // Update customer status from dropdown
    async updateCustomerStatus(customerId, newStatus) {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/customers/${customerId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update customer status');
            }
            
            // Update the customer in our local array
            const customerIndex = this.allCustomers.findIndex(customer => customer._id === customerId);
            if (customerIndex !== -1) {
                this.allCustomers[customerIndex].status = newStatus;
            }
            
            // Visual feedback - briefly highlight the dropdown with classes
            const dropdown = document.querySelector(`[data-customer-id="${customerId}"]`);
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
            console.error('Error updating customer status:', err);
            this.apiManager.showAlert(`Error updating status: ${err.message}`, 'danger');
            
            // Revert the dropdown to the previous value
            const dropdown = document.querySelector(`[data-customer-id="${customerId}"]`);
            if (dropdown) {
                const customer = this.allCustomers.find(c => c._id === customerId);
                if (customer) {
                    dropdown.value = customer.status || 'new';
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
                        <i class="bi bi-check-circle me-2"></i> Customer status updated to "${this.formatStatus(status)}"
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
    }

    // Apply color styling to dropdowns based on selected status
    applyStatusColors() {
        document.querySelectorAll('.customer-status-dropdown').forEach(dropdown => {
            const status = dropdown.value;
              // Remove existing status color classes
            dropdown.classList.remove('status-new', 'status-no-answer', 'status-voice-mail', 
                                     'status-call-back-qualified', 'status-call-back-not-qualified', 'status-lead-released');
            
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
                    break;                case 'Call Back NOT Qualified':
                    dropdown.classList.add('status-call-back-not-qualified');
                    break;
                case 'lead-released':
                    dropdown.classList.add('status-lead-released');
                    break;
            }
        });
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
    }

    // Format phone number for display with privacy (show only last 2 digits)
    formatPhoneForDisplay(phoneNumber) {
        if (!phoneNumber) return '';
        
        // Clean the phone number to get digits only
        const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
        
        if (cleanPhone.length < 2) {
            return phoneNumber; // Return original if too short
        }
        
        // Get last 2 digits
        const lastTwoDigits = cleanPhone.slice(-2);
        
        // Create masked version with x's and last 2 digits
        const maskedLength = cleanPhone.length - 2;
        const masked = 'x'.repeat(maskedLength) + lastTwoDigits;
        
        return masked;
    }
}

// Initialize the customer manager when the page is loaded
document.addEventListener('DOMContentLoaded', () => {
    if (window.apiManager) {
        window.customerManager = new CustomerManager(window.apiManager);
        window.customerManager.init();
    } else {
        console.error('API Manager not initialized');
    }
});
