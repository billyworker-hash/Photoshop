// Upload.js - Handles lead list management functionality
class UploadManager {
    constructor(apiManager) {
        this.apiManager = apiManager;
        this.selectedListId = null;
        this.selectedList = null; // Store the selected list object with its labels
        this.createLabelIndex = 0;

        // Pagination properties for leads - now server-side pagination
        this.currentPage = 1;
        this.leadsPerPage = 10; // Default batch size
        this.totalPages = 1;
        this.totalCount = 0;
        this.currentLeads = []; // Current page leads from server
        this.currentFilters = {}; // Track current search/status filters

        this.eventListeners = []; // Track event listeners for cleanup
        this.filterListenersSetup = false; // Track if filter listeners are already set up
        this.listSearchSetup = false; // Track if list search is already set up

        // Pagination properties for lists
        this.listsCurrentPage = 1;
        this.listsPerPage = 6; // 6 lists per page
        this.listsTotalPages = 1;
        this.allLists = []; // Store all lists
    }

    // Initialize upload functionality
    async init() {
        await this.loadLeadLists();
        this.initializeModals();
    }    // Load all lead lists
    async loadLeadLists() {
        try {
            const lists = await this.apiManager.get('/lead-lists');
            this.renderLeadLists(lists);
        } catch (error) {
            console.error('Error loading lead lists:', error);
            this.showError('Failed to load lead lists');
        }
    }    // Render lead lists in the sidebar
    renderLeadLists(lists) {
        // Store all lists for pagination and search
        this.allLists = lists;

        // Set up search functionality if not already done
        if (!this.listSearchSetup) {
            this.setupListSearch();
            this.listSearchSetup = true;
        }

        // Use the filter and display method
        this.filterAndDisplayLists();
    }// Select a lead list
    async selectList(listId) {
        try {
            this.selectedListId = listId;
            await this.loadLeadLists(); // Refresh to update selection styling
            await this.loadSelectedListDetails(listId);
        } catch (error) {
            console.error('Error selecting list:', error);
            // If there was an error, clear the selection
            this.selectedListId = null;
            this.selectedList = null;
        }
    }    // Load details for selected list
    async loadSelectedListDetails(listId) {
        try {
            const list = await this.apiManager.get(`/lead-lists/${listId}`);

            // Fetch first batch of leads with pagination
            const result = await this.fetchLeadsForList(listId, 1, this.leadsPerPage, this.currentFilters);

            this.selectedList = list; // Store the list object with its labels
            this.currentLeads = result.leads;
            this.currentPage = result.pagination.currentPage;
            this.totalPages = result.pagination.totalPages;
            this.totalCount = result.pagination.totalCount;

            this.renderSelectedList(list, result);
        } catch (error) {
            console.error('Error loading list details:', error);

            // If list not found (404), clear selection and reload lists
            if (error.message && error.message.includes('Not Found')) {
                console.log('List not found, clearing selection and reloading lists');
                this.selectedListId = null;
                this.selectedList = null;
                this.showError('Selected list no longer exists. Please select another list.');

                // Clear the selected list display
                const container = document.getElementById('selected-list-container');
                if (container) {
                    container.innerHTML = '<p class="text-muted">No list selected</p>';
                }

                // Reload the list to refresh the UI
                await this.loadLeadLists();
            } else {
                this.showError('Failed to load list details');
            }
        }
    }    // Render selected list details
    renderSelectedList(list, result) {
        const selectedPanel = document.getElementById('selected-list-panel');
        const noSelectionPanel = document.getElementById('no-list-selected');
        const titleElement = document.getElementById('selected-list-title');
        const infoElement = document.getElementById('selected-list-info');
        const leadsElement = document.getElementById('selected-list-leads');

        if (!selectedPanel || !noSelectionPanel) return;

        selectedPanel.style.display = 'block';
        noSelectionPanel.style.display = 'none';

        if (titleElement) {
            titleElement.textContent = list.name;
        } if (infoElement) {
            // Check if user is admin to show visibility info
            const currentUser = this.apiManager.getCurrentUser();
            const isAdmin = currentUser && currentUser.role === 'admin';
            let visibilityInfo = '';
            if (isAdmin) {
                if (list.isVisibleToUsers !== false) {
                    visibilityInfo = `<p class="mb-1"><strong>Visibility:</strong> Visible to all agents</p>`;
                } else {
                    if (list.visibleToSpecificAgents && list.visibleToSpecificAgents.length > 0) {
                        const agentNames = list.visibleToSpecificAgents.map(agent =>
                            agent.name || agent
                        ).join(', ');
                        visibilityInfo = `<p class="mb-1"><strong>Visibility:</strong> <span class="text-info">Visible only to: ${agentNames}</span></p>`;
                    } else {
                        visibilityInfo = `<p class="mb-1"><strong>Visibility:</strong> <span class="text-warning">Hidden from all agents</span></p>`;
                    }
                }
            }

            infoElement.innerHTML = `
                <div class="row">
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Description:</strong> ${list.description || 'No description'}</p>
                        <p class="mb-1"><strong>Created:</strong> ${new Date(list.createdAt).toLocaleDateString()}</p>
                        
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Total Leads:</strong> ${this.totalCount || 0}</p>
           ${visibilityInfo}
                    </div>
                </div>
            `;
        } if (leadsElement) {
            this.renderListLeadsWithPagination();
        }
    }    // Render leads for the selected list with pagination (now server-side)
    renderListLeadsWithPagination() {
        // Reset to first page when selecting a new list if this is the first call
        if (!this.filterListenersSetup) {
            this.currentPage = 1;
        }

        // Set up filters if not already done
        if (!this.filterListenersSetup) {
            this.setupUploadFilters();
            this.filterListenersSetup = true;
        }

        // Display current leads with pagination
        this.displayLeadsWithPagination();
    }// Render leads for the selected list (legacy method - now calls pagination version)
    renderListLeads(leads) {
        this.renderListLeadsWithPagination(leads);
    }// Render individual lead row
    renderLeadRow(lead) {
        let customFieldsCells = '';

        // Add list-specific label data
        if (this.selectedList && this.selectedList.labels && this.selectedList.labels.length > 0) {
            this.selectedList.labels.forEach(label => {
                const value = lead.customFields?.[label.name] || '-';
                customFieldsCells += `<td>${value}</td>`;
            });
        }

        return `
            <tr data-lead-id="${lead._id}">
                ${customFieldsCells}
                <td>
                    <span class="badge status-${lead.status?.replace(/\s+/g, '-').toLowerCase()}">${lead.status}</span>
                </td>
                <td>
                    <button class="btn btn-sm btn-outline-danger" onclick="window.uploadManager.removeLead('${lead._id}')" title="Remove lead">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }// Initialize modals
    initializeModals() {        // Create modals if they don't exist
        this.createCreateListModal();
        this.createBulkAddModal();
    }// Show create list modal
    async showCreateListModal() {
        const modal = new bootstrap.Modal(document.getElementById('createListModal'));

        // Add default labels
        this.addDefaultLabels();

        // Setup agent selection
        await this.setupAgentSelection();

        modal.show();
    }

    // Show bulk add leads modal
    showBulkAddModal() {
        if (!this.selectedListId) {
            this.showError('Please select a list first');
            return;
        }
        const modal = new bootstrap.Modal(document.getElementById('bulkAddModal'));
        this.generateBulkAddForm();
        modal.show();
    }    // Create new lead list
    async createList(name, description, labels = [], isVisibleToUsers = true, visibleToSpecificAgents = []) {
        try {
            const newList = await this.apiManager.post('/lead-lists', {
                name: name.trim(),
                description: description.trim(),
                labels: labels,
                isVisibleToUsers: isVisibleToUsers,
                visibleToSpecificAgents: visibleToSpecificAgents
            }); this.showSuccess('Lead list created successfully');
            await this.loadLeadLists();

            // Navigate to the page containing the new list
            this.navigateToListPage(newList._id);

            // Also refresh Leads section if it exists, so agents see new lists immediately  
            if (window.leadsManager && typeof window.leadsManager.refreshLeadsData === 'function') {
                await window.leadsManager.refreshLeadsData();
            }

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('createListModal'));
            modal.hide();

            // Auto-select the new list
            await this.selectList(newList._id);

        } catch (error) {
            console.error('Error creating list:', error);
            this.showError('Failed to create lead list');
        }
    }

    // Update lead list    
    // Delete lead list    

    // Bulk add leads to selected list
    async bulkAddLeads(leadsData) {
        if (!this.selectedListId) {
            this.showError('No list selected');
            return;
        }

        try {
            // Show loading message for large uploads
            if (leadsData.length > 100) {
                this.showSuccess(`Processing ${leadsData.length} leads... This may take a moment.`);
            }

            const result = await this.apiManager.post(`/lead-lists/${this.selectedListId}/bulk-leads`, {
                leads: leadsData
            });

            this.showSuccess(`Successfully added ${result.inserted} leads to the list`);

            // Refresh the selected list
            await this.loadSelectedListDetails(this.selectedListId);
            await this.loadLeadLists(); // Refresh to update lead counts

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('bulkAddModal'));
            modal.hide();

        } catch (error) {
            console.error('Error adding leads:', error);
            if (error.message.includes('timeout')) {
                this.showError('Upload timed out. Please try with smaller batches or contact support.');
            } else {
                this.showError('Failed to add leads to list: ' + error.message);
            }
        }
    }

    // Generate bulk add form based on list-specific labels
    generateBulkAddForm() {
        const formContainer = document.getElementById('bulk-add-form-container');
        if (!formContainer) return;

        let formHtml = `
            <div class="row mb-4">
                <div class="col-12">
                    <div class="alert alert-info">
                        <h6><i class="bi bi-info-circle me-2"></i>Bulk Lead Entry Instructions:</h6>
                        <ul class="mb-0">
                            <li><strong>Paste multiple values:</strong> Enter one value per line in each field</li>
                            <li><strong>Example:</strong> Paste "John Doe\\nJane Smith\\nBob Johnson" in Full Name</li>
                            <li><strong>Matching:</strong> Each line will create a separate lead (line 1 with line 1, etc.)</li>
                            <li><strong>Note:</strong> All fields are now custom labels - configure them when creating the list</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="row">
        `;        // Add list-specific dynamic labels (Full Name and Email)
        if (this.selectedList && this.selectedList.labels) {
            this.selectedList.labels.forEach(label => {
                if (label.type === 'select') {
                    formHtml += `
                        <div class="col-md-6 mb-3">
                            <label class="form-label">${label.label}${label.required ? ' *' : ''}</label>
                            <select class="form-select" name="${label.name}" ${label.required ? 'required' : ''}>
                                <option value="">Select ${label.label}</option>
                                ${label.options ? label.options.map(option => `<option value="${option}">${option}</option>`).join('') : ''}
                            </select>
                            <small class="text-muted">This will apply to all leads</small>
                        </div>
                    `;
                } else {
                    formHtml += `
                        <div class="col-md-6 mb-3">
                            <label class="form-label">${label.label}${label.required ? ' *' : ''}</label>
                            <textarea class="form-control bulk-input" name="${label.name}" rows="8" 
                                      placeholder="Enter one ${label.label.toLowerCase()} per line... ${label.required ? '(Required)' : '(Optional)'}"
                                      ${label.required ? 'required' : ''}></textarea>
                            <small class="text-muted">One ${label.label.toLowerCase()} per line</small>
                        </div>
                    `;
                }
            });
        }        // Add Status field as hardcoded default field
        formHtml += `
            <div class="col-md-6 mb-3">
                <label class="form-label">Status *</label>
                <select class="form-select" name="status" required>
                    <option value="new">New</option>
                    <option value="No Answer">No Answer</option>
                    <option value="Voice Mail">Voice Mail</option>
                    <option value="Call Back Qualified">Call Back Qualified</option>
                    <option value="Call Back NOT Qualified">Call Back NOT Qualified</option>
                    <option value="deposited">Deposited</option>
                    <option value="active">Active</option>
                    <option value="withdrawn">Withdrawn</option>
                    <option value="inactive">Inactive</option>
                </select>
                <small class="text-muted">This will apply to all leads</small>
            </div>
        `;

        formHtml += `
            </div>
            <div class="row mt-3">
                <div class="col-12">
                    <div class="alert alert-secondary">
                        <small><strong>Preview:</strong> <span id="leads-preview">Enter values in any field to see how many leads will be created</span></small>
                    </div>
                </div>
            </div>
        `;

        formContainer.innerHTML = formHtml;

        // Add event listeners to all textarea inputs for preview
        const textareas = formContainer.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            textarea.addEventListener('input', () => this.updateLeadsPreview());
        });
    }    // Update leads preview based on textarea inputs
    updateLeadsPreview() {
        const previewElement = document.getElementById('leads-preview');
        if (!previewElement) return;

        const textareas = document.querySelectorAll('#bulk-add-form-container textarea');
        let maxLines = 0;
        let sampleValues = [];

        textareas.forEach(textarea => {
            const lines = textarea.value
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);

            if (lines.length > maxLines) {
                maxLines = lines.length;
                sampleValues = lines.slice(0, 3);
            }
        });

        if (maxLines === 0) {
            previewElement.textContent = 'Enter values in any field to see how many leads will be created';
        } else {
            let warningClass = '';
            let warningText = '';

            if (maxLines > 500) {
                warningClass = 'text-warning';
                warningText = ' ⚠️ Large upload - may take several minutes';
            } else if (maxLines > 1000) {
                warningClass = 'text-danger';
                warningText = ' ⚠️ Very large upload - consider splitting into batches';
            }

            previewElement.innerHTML = `<strong class="${warningClass}">${maxLines} lead${maxLines === 1 ? '' : 's'} will be created:</strong> ${sampleValues.join(', ')}${maxLines > 3 ? ` and ${maxLines - 3} more...` : ''}${warningText}`;
        }
    }// Process bulk add form submission
    async processBulkAddForm(formData) {
        // Get hardcoded status field
        const defaultStatus = formData.get('status') || 'new';

        // Parse custom fields from selected list labels
        const customFieldArrays = {};
        const customFieldSingleValues = {};

        if (!this.selectedList || !this.selectedList.labels || this.selectedList.labels.length === 0) {
            this.showError('No custom labels defined for this list. Please edit the list to add custom labels first.');
            return;
        }

        let hasTextAreaData = false;

        this.selectedList.labels.forEach(label => {
            const value = formData.get(label.name);
            if (value) {
                if (label.type === 'select') {
                    customFieldSingleValues[label.name] = value;
                } else {
                    const parsedArray = this.parseTextareaInput(value);
                    if (parsedArray.length > 0) {
                        customFieldArrays[label.name] = parsedArray;
                        hasTextAreaData = true;
                    }
                }
            }
        });

        if (!hasTextAreaData) {
            this.showError('Please enter data in at least one text field');
            return;
        }

        // Determine the maximum number of leads to create
        const maxLeads = Math.max(...Object.values(customFieldArrays).map(arr => arr.length));        // Create leads array
        const leads = [];
        for (let i = 0; i < maxLeads; i++) {
            const lead = {
                status: defaultStatus,
                leadList: this.selectedListId
            };

            // Add custom fields
            const customFields = {};

            // Add single-value custom fields
            Object.keys(customFieldSingleValues).forEach(fieldName => {
                customFields[fieldName] = customFieldSingleValues[fieldName];
            });

            // Add array-based custom fields
            Object.keys(customFieldArrays).forEach(fieldName => {
                const array = customFieldArrays[fieldName];
                customFields[fieldName] = (typeof array[i] !== 'undefined') ? array[i] : '';
            });

            // Combine firstName and lastName into fullName for the lead object
            const firstName = customFields.firstName || '';
            const lastName = customFields.lastName || '';
            if (firstName || lastName) {
                lead.fullName = `${firstName} ${lastName}`.trim();
            }

            lead.customFields = customFields;
            leads.push(lead);
        }

        if (leads.length === 0) {
            this.showError('No valid leads to create');
            return;
        }

        await this.bulkAddLeads(leads);
    }

    // Parse textarea input into array (one value per line)
    parseTextareaInput(text) {
        if (!text) return [];
        return text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }    // Create Create List Modal
    createCreateListModal() {
        if (document.getElementById('createListModal')) return;

        const modalHtml = `
    <div class="modal fade" id="createListModal" tabindex="-1">
        <div class="modal-dialog modal-dialog-centered" style="max-width: 420px;">
            <div class="modal-content">
                <div class="modal-header py-2">
                    <h5 class="modal-title">Create New Lead List</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <form id="createListForm" onsubmit="event.preventDefault(); window.uploadManager.handleCreateList(event);">
                    <div class="modal-body pt-2 pb-1">
                        <div class="mb-2">
                            <label class="form-label mb-1">List Name *</label>
                            <input type="text" class="form-control form-control-sm" name="name" required 
                                   placeholder="e.g., leads2025, Q1 Prospects">
                        </div>
                        <div class="mb-2">
                            <label class="form-label mb-1">Description</label>
                            <textarea class="form-control form-control-sm" name="description" rows="2" 
                                      placeholder="Optional description for this lead list"></textarea>
                        </div>
                        <div class="mb-2">
                            <div class="form-check">
                                <input class="form-check-input" type="checkbox" name="isVisibleToUsers" id="create-list-visible" checked>
                                <label class="form-check-label" for="create-list-visible">
                                    <strong>Visible to All Agents</strong>
                                </label>
                                <div class="form-text">When checked, all agents can see this list. When unchecked, you can choose specific agents.</div>
                            </div>
                        </div>
                        <div class="mb-2" id="specific-agents-section" style="display: none;">
                            <label class="form-label mb-1">Select Specific Agents</label>
                            <div id="agents-selection" class="border rounded p-2">
                                <!-- Agent checkboxes will be loaded here -->
                            </div>
                            <div class="form-text">Choose which agents can see this list when not visible to all agents.</div>
                        </div>
                        <hr class="my-2">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <h6 class="mb-0">Custom Labels</h6>
                            <button type="button" class="btn btn-xs btn-outline-primary px-2 py-1" style="font-size:0.9em;" onclick="window.uploadManager.addCustomLabelToCreateModal()">
                                <i class="bi bi-plus me-1"></i> Add
                            </button>
                        </div>
                        <div id="create-labels-container" class="mb-1">
                            <!-- Custom labels will be added here -->
                        </div>
                    </div>
                    <div class="modal-footer py-2">
                        <button type="button" class="btn btn-secondary btn-sm" data-bs-dismiss="modal">Cancel</button>
                        <button type="submit" class="btn btn-primary btn-sm">Create List</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
`;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }// Create Bulk Add Modal
    createBulkAddModal() {
        if (document.getElementById('bulkAddModal')) return;

        const modalHtml = `
        <div class="modal fade" id="bulkAddModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Bulk Add Leads to List</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <form id="bulkAddForm" onsubmit="event.preventDefault(); window.uploadManager.handleBulkAdd(event);">
                        <div class="modal-body">
                            <div id="bulk-add-form-container">
                                <!-- Form will be generated dynamically -->
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="submit" class="btn btn-primary">
                                <i class="bi bi-upload me-2"></i>Create Leads
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Add custom label field to create form
    addCustomLabel() {
        const container = document.getElementById('custom-labels-container');
        if (!container) return;

        const labelIndex = container.children.length;
        const labelHtml = `
            <div class="custom-label-row mb-3 p-3 border rounded">
                <div class="row">
                    <div class="col-md-4">
                        <label class="form-label">Field Name</label>
                        <input type="text" class="form-control" name="labels[${labelIndex}][name]" 
                               placeholder="e.g., companySize" required>
                        <small class="text-muted">Internal field name (no spaces)</small>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Display Label</label>
                        <input type="text" class="form-control" name="labels[${labelIndex}][label]" 
                               placeholder="e.g., Company Size" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Field Type</label>
                        <select class="form-select" name="labels[${labelIndex}][type]">
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="email">Email</option>
                            <option value="phone">Phone</option>
                            <option value="select">Select</option>
                            <option value="textarea">Textarea</option>
                        </select>
                    </div>
                    <div class="col-md-1">
                        <label class="form-label">&nbsp;</label>
                        <button type="button" class="btn btn-sm btn-outline-danger d-block" 
                                onclick="this.closest('.custom-label-row').remove()">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
                <div class="row mt-2">
                    <div class="col-md-6">
                        <div class="form-check">
                            <input class="form-check-input" type="checkbox" name="labels[${labelIndex}][required]" value="true">
                            <label class="form-check-label">Required field</label>
                        </div>
                    </div>
                    <div class="col-md-6">
                        <input type="text" class="form-control" name="labels[${labelIndex}][options]" 
                               placeholder="Options (comma separated)" style="display: none;">
                        <small class="text-muted" style="display: none;">For select fields only</small>
                    </div>
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', labelHtml);

        // Add event listener for type change
        const typeSelect = container.lastElementChild.querySelector('select[name*="[type]"]');
        const optionsInput = container.lastElementChild.querySelector('input[name*="[options]"]');
        const optionsHelp = container.lastElementChild.querySelector('small');

        typeSelect.addEventListener('change', function () {
            if (this.value === 'select') {
                optionsInput.style.display = 'block';
                optionsHelp.style.display = 'block';
                optionsInput.required = true;
            } else {
                optionsInput.style.display = 'none';
                optionsHelp.style.display = 'none';
                optionsInput.required = false;
            }
        });
    }

    // Add custom label specifically for create list modal
    addCustomLabelToCreateModal() {
        const container = document.getElementById('create-labels-container');
        if (!container) return;

        const labelIndex = this.createLabelIndex; // Always use the incrementing index
        this.createLabelIndex++;

        // More compact and narrow row, input, and button, with Delete button before the input
        const labelHtml = `
        <div class="custom-label-row row align-items-center g-1 mb-1" style="max-width: 320px; margin-left:0; margin-right:0; padding:0;">
            <div class="col-4 text-end" style="padding-right:2px;">
                <button type="button" class="btn btn-xs btn-outline-danger px-1 py-1" style="font-size:0.85em; min-width:28px; height:28px; line-height:1;" 
                        onclick="this.closest('.custom-label-row').remove()" title="Remove">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
            <div class="col-8" style="padding-left:2px;">
                <input type="text" class="form-control form-control-sm" name="labels[${labelIndex}][name]" 
                       placeholder="Field Name (e.g., Company Size)" required style="max-width: 150px; font-size:0.92em; padding:2px 6px; height:28px;">
            </div>
        </div>
    `;

        container.insertAdjacentHTML('beforeend', labelHtml);
    }

    // Add default labels to create form
    addDefaultLabels() {
        const container = document.getElementById('create-labels-container');
        if (!container) return;

        container.innerHTML = '';
        this.createLabelIndex = 0; // Reset index when opening modal

        const defaultLabels = [
            { name: 'firstName', label: 'First Name' },
            { name: 'lastName', label: 'Last Name' },
            { name: 'email', label: 'Email' },
            { name: 'phone', label: 'Phone' },
            { name: 'amount', label: 'Amount' },
            { name: 'date', label: 'Date' },
            { name: 'brand', label: 'Brand' }
        ];

        defaultLabels.forEach((defaultLabel) => {
            this.addCustomLabelToCreateModal();
            const lastRow = container.lastElementChild;
            // Only set the name field, which is used for both name and label
            const nameInput = lastRow.querySelector(`input[name="labels[${this.createLabelIndex-1}][name]"]`);
            if (nameInput) nameInput.value = defaultLabel.label;
        });
    }

    // Handle create list form submission
    async handleCreateList(event) {
        event.preventDefault();

        const formData = new FormData(event.target);
        const name = formData.get('name');
        const description = formData.get('description');
        const isVisibleToUsers = formData.get('isVisible') === 'on';

        // Collect selected agents if not visible to all
        let visibleToSpecificAgents = [];
        if (!isVisibleToUsers) {
            const agentCheckboxes = document.querySelectorAll('input[name="specificAgents"]:checked');
            visibleToSpecificAgents = Array.from(agentCheckboxes).map(checkbox => checkbox.value);
        }
        // Process custom labels (Field Name only, used for both name and label)
        const labels = [];
        const container = document.getElementById('create-labels-container');
        const labelRows = container?.querySelectorAll('.custom-label-row') || [];

        labelRows.forEach((row) => {
            const nameInput = row.querySelector('input[name*="[name]"]');
            if (!nameInput) return;
            const value = nameInput.value.trim();
            if (value) {
                labels.push({ name: value, label: value });
            }
        });

        await this.createList(name, description, labels, isVisibleToUsers, visibleToSpecificAgents);
        event.target.reset();

        // Clear custom labels
        if (container) container.innerHTML = '';
    }

    // Handle bulk add form submission
    async handleBulkAdd(event) {
        const formData = new FormData(event.target);
        await this.processBulkAddForm(formData); event.target.reset();
    }

    // Edit the currently selected list
    editSelectedList() {
        if (!this.selectedListId) {
            this.showError('No list selected');
            return;
        }
        this.editList(this.selectedListId);
    }

    // Delete the currently selected list
    deleteSelectedList() {
        if (!this.selectedListId) {
            this.showError('No list selected');
            return;
        }
        this.deleteList(this.selectedListId);
    }

    // Show edit list modal with current list data
    async editList(listId) {
        try {
            const list = await this.apiManager.get(`/lead-lists/${listId}`);

            // Populate form fields
            document.getElementById('editListId').value = list._id;
            document.getElementById('editListName').value = list.name;
            document.getElementById('editListDescription').value = list.description || '';
            document.getElementById('edit-list-visible').checked = list.isVisibleToUsers;

            // Setup agent selection with current selections
            await this.setupEditAgentSelection(list.visibleToSpecificAgents || []);

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('editListModal'));
            modal.show();

        } catch (error) {
            console.error('Error loading list for edit:', error);
            this.showError('Failed to load list details');
        }
    }

    // Load agents list for edit modal
    async loadEditAgentsList(selectedAgents = []) {
        try {
            const users = await this.apiManager.get('/users');
            const agents = users.filter(user => user.role === 'agent');

            const container = document.getElementById('editSpecificAgentsList');
            container.innerHTML = agents.map(agent => `
                <div class="form-check">
                    <input class="form-check-input" type="checkbox" 
                           id="editAgent_${agent._id}" 
                           name="editSpecificAgents" 
                           value="${agent._id}"
                           ${selectedAgents.includes(agent._id) ? 'checked' : ''}>
                    <label class="form-check-label" for="editAgent_${agent._id}">
                        ${agent.name} (${agent.username})
                    </label>
                </div>
            `).join('');

        } catch (error) {
            console.error('Error loading agents:', error);
        }
    }

    // Toggle specific agents section in edit modal
    toggleEditSpecificAgents() {
        const isVisibleToUsers = document.getElementById('editIsVisibleToUsers').checked;
        const specificAgentsSection = document.getElementById('editSpecificAgentsSection');
        specificAgentsSection.style.display = isVisibleToUsers ? 'none' : 'block';
    }


    // Update lead list
    async updateList(listId, name, description, isVisibleToUsers = true, visibleToSpecificAgents = []) {
        try {
            await this.apiManager.put(`/lead-lists/${listId}`, {
                name: name.trim(),
                description: description.trim(),
                isVisibleToUsers: isVisibleToUsers,
                visibleToSpecificAgents: visibleToSpecificAgents
            });

            this.showSuccess('Lead list updated successfully');
            await this.loadLeadLists();

            if (this.selectedListId === listId) {
                await this.loadSelectedListDetails(listId);
            }

            // Also refresh Leads section if it exists, so agents see immediate changes
            if (window.leadsManager && typeof window.leadsManager.refreshLeadsData === 'function') {
                await window.leadsManager.refreshLeadsData();
            }

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editListModal'));
            modal.hide();

        } catch (error) {
            console.error('Error updating list:', error);
            this.showError('Failed to update lead list');
        }
    }    // Delete lead list
    async deleteList(listId) {
        const confirmed = await window.confirmationModal.confirmDelete(
            'this list',
            'list',
            'This will also remove all leads in the list.'
        );

        if (!confirmed) {
            return;
        }

        try {
            await this.apiManager.delete(`/lead-lists/${listId}?hard=true`);
            this.showSuccess('Lead list deleted successfully');

            if (this.selectedListId === listId) {
                this.selectedListId = null;
                document.getElementById('selected-list-panel').style.display = 'none';
                document.getElementById('no-list-selected').style.display = 'block';
            }

            await this.loadLeadLists();

        } catch (error) {
            console.error('Error deleting list:', error);
            this.showError('Failed to delete lead list');
        }
    }    // Confirm delete list from edit modal
    async confirmDeleteList() {
        const listId = document.getElementById('editListId').value;
        const listName = document.getElementById('editListName').value;

        const confirmed = await window.confirmationModal.confirmDelete(
            listName,
            'list',
            'This will permanently delete the list and all associated leads. This action cannot be undone.'
        );

        if (confirmed) {
            this.deleteList(listId);

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editListModal'));
            modal.hide();
        }
    }    // Confirm delete list from card view
    async confirmDeleteListFromCard(listId, listName, leadCount) {
        const confirmed = await window.confirmationModal.confirmDelete(
            listName,
            'list',
            `This list contains ${leadCount} lead${leadCount !== 1 ? 's' : ''}. This will permanently delete the list and all associated leads. This action cannot be undone.`
        );

        if (confirmed) {
            this.deleteListById(listId);
        }
    }

    // Delete list by ID (for card view delete)
    async deleteListById(listId) {
        try {
            await this.apiManager.delete(`/lead-lists/${listId}?hard=true`);
            this.showSuccess('Lead list deleted successfully');

            // Reload the lists
            await this.loadLeadLists();

            // If this was the selected list, clear the selection
            if (this.selectedListId === listId) {
                this.selectedListId = null;
                this.selectedList = null;
                this.allLeads = [];
                this.filteredLeads = [];
                this.renderLeads([]);
            }
        } catch (error) {
            console.error('Error deleting lead list:', error);
            this.showError('Failed to delete lead list');
        }
    }    // Remove lead from list
    async removeLead(leadId) {
        const confirmed = await window.confirmationModal.confirmDelete(
            'this lead',
            'lead',
            'This will remove the lead from the current list.'
        );

        if (!confirmed) {
            return;
        }

        try {
            await this.apiManager.delete(`/leads/${leadId}`);
            this.showSuccess('Lead removed successfully');

            // Refresh the selected list
            if (this.selectedListId) {
                await this.loadSelectedListDetails(this.selectedListId);
                await this.loadLeadLists(); // Refresh to update lead counts
            }

        } catch (error) {
            console.error('Error removing lead:', error);
            this.showError('Failed to remove lead');
        }
    }    // Toggle list visibility for admins
    async toggleListVisibility(listId, currentVisibility) {
        try {
            const response = await this.apiManager.put(`/lead-lists/${listId}`, {
                isVisibleToUsers: !currentVisibility
            });

            this.showSuccess(`List visibility ${!currentVisibility ? 'enabled' : 'disabled'} successfully`);
            await this.loadLeadLists();

            if (this.selectedListId === listId) {
                await this.loadSelectedListDetails(listId);
            }

            // Also refresh Leads section if it exists, so agents see immediate changes
            if (window.leadsManager && typeof window.leadsManager.refreshLeadsData === 'function') {
                await window.leadsManager.refreshLeadsData();
            }

        } catch (error) {
            console.error('Error updating list visibility:', error);
            this.showError('Failed to update list visibility');
        }
    }

    // Load agents for selection
    async loadAgents() {
        try {
            const agents = await this.apiManager.get('/users?role=agent');
            return agents.filter(agent => agent.status === 'active');
        } catch (error) {
            console.error('Error loading agents:', error);
            return [];
        }
    }

    // Setup agent selection in create modal
    async setupAgentSelection() {
        const agents = await this.loadAgents();
        const agentsContainer = document.getElementById('agents-selection');
        const visibilityCheckbox = document.getElementById('create-list-visible');
        const specificAgentsSection = document.getElementById('specific-agents-section');

        if (!agentsContainer || !visibilityCheckbox || !specificAgentsSection) return;

        // Render agent checkboxes
        agentsContainer.innerHTML = agents.map(agent => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="specificAgents" value="${agent._id}" id="agent-${agent._id}">
                <label class="form-check-label" for="agent-${agent._id}">
                    ${agent.name} (${agent.email})
                </label>
            </div>
        `).join('');

        // Handle visibility toggle
        visibilityCheckbox.addEventListener('change', function () {
            if (this.checked) {
                specificAgentsSection.style.display = 'none';
                // Uncheck all agent checkboxes when switching to "visible to all"
                const agentCheckboxes = agentsContainer.querySelectorAll('input[name="specificAgents"]');
                agentCheckboxes.forEach(checkbox => checkbox.checked = false);
            } else {
                specificAgentsSection.style.display = 'block';
            }
        });
    }    // Setup agent selection in edit modal
    async setupEditAgentSelection(selectedAgents = []) {
        const agents = await this.loadAgents();
        const agentsContainer = document.getElementById('edit-agents-selection');
        const visibilityCheckbox = document.getElementById('edit-list-visible');
        const specificAgentsSection = document.getElementById('edit-specific-agents-section');

        if (!agentsContainer || !visibilityCheckbox || !specificAgentsSection) return;

        // Extract agent IDs from the selectedAgents array (handles both ID strings and agent objects)
        const selectedAgentIds = selectedAgents.map(agent =>
            typeof agent === 'string' ? agent : agent._id
        );

        // Render agent checkboxes
        agentsContainer.innerHTML = agents.map(agent => `
            <div class="form-check">
                <input class="form-check-input" type="checkbox" name="editSpecificAgents" value="${agent._id}" id="edit-agent-${agent._id}" 
                       ${selectedAgentIds.includes(agent._id) ? 'checked' : ''}>
                <label class="form-check-label" for="edit-agent-${agent._id}">
                    ${agent.name} (${agent.email})
                </label>
            </div>
        `).join('');

        // Handle visibility toggle
        visibilityCheckbox.addEventListener('change', function () {
            if (this.checked) {
                specificAgentsSection.style.display = 'none';
                // Uncheck all agent checkboxes when switching to "visible to all"
                const agentCheckboxes = agentsContainer.querySelectorAll('input[name="editSpecificAgents"]');
                agentCheckboxes.forEach(checkbox => checkbox.checked = false);
            } else {
                specificAgentsSection.style.display = 'block';
            }
        });

        // Set initial visibility of the section
        if (!visibilityCheckbox.checked) {
            specificAgentsSection.style.display = 'block';
        }
    }

    // Show success message
    showSuccess(message) {
        this.apiManager.showAlert(message, 'success', 'list-success');
    }

    // Show error message
    showError(message) {
        this.apiManager.showAlert(message, 'danger', 'list-error');
    }    // Set up event listeners for upload filters
    setupUploadFilters() {
        const searchInput = document.getElementById('upload-lead-search');
        const statusFilter = document.getElementById('upload-lead-status-filter');

        // Set up search input listener with debouncing
        if (searchInput) {
            let searchTimeout;
            const debouncedSearch = () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(async () => {
                    this.currentPage = 1; // Reset to first page when filtering
                    await this.applyFiltersAndDisplay();
                }, 500); // 500ms delay
            };

            searchInput.addEventListener('input', debouncedSearch);
        }

        // Set up status filter listener
        if (statusFilter) {
            statusFilter.addEventListener('change', async () => {
                this.currentPage = 1; // Reset to first page when filtering
                await this.applyFiltersAndDisplay();
            });
        }
    }// Apply filters and display leads with pagination (now server-side)
    async applyFiltersAndDisplay() {
        if (!this.selectedListId) return;

        // Get current filter values
        const searchInput = document.getElementById('upload-lead-search');
        const statusFilter = document.getElementById('upload-lead-status-filter');

        this.currentFilters = {
            search: searchInput?.value || '',
            status: statusFilter?.value || ''
        };

        // Reset to first page when applying new filters
        this.currentPage = 1;

        // Fetch leads with current filters
        const result = await this.fetchLeadsForList(
            this.selectedListId,
            this.currentPage,
            this.leadsPerPage,
            this.currentFilters
        );

        this.currentLeads = result.leads;
        this.totalPages = result.pagination.totalPages;
        this.totalCount = result.pagination.totalCount;
        // Display the fetched leads
        this.displayLeadsWithPagination();
    }

    // Display leads with pagination
    displayLeadsWithPagination() {
        const leadsContainer = document.getElementById('selected-list-leads');
        if (!leadsContainer) return;

        // Generate table headers
        this.generateTableHeaders();

        // Display current leads
        this.displayCurrentLeads();

        // Update pagination controls
        this.updateUploadPaginationControls();
    }

    // Generate table headers for upload section
    generateTableHeaders() {
        const leadsContainer = document.getElementById('selected-list-leads');
        if (!leadsContainer) return;

        let headerHtml = '';

        // Add list-specific label columns if a list is selected
        if (this.selectedList && this.selectedList.labels && this.selectedList.labels.length > 0) {
            this.selectedList.labels.forEach(label => {
                headerHtml += `<th>${label.label}</th>`;
            });
        }

        // Add status and actions columns
        headerHtml += `<th>Status</th><th>Actions</th>`;

        // Find or create table header
        let tableHeader = leadsContainer.querySelector('thead tr');
        if (!tableHeader) {
            // Create table structure if it doesn't exist
            leadsContainer.innerHTML = `
                <table class="table table-striped">
                    <thead>
                        <tr>${headerHtml}</tr>
                    </thead>
                    <tbody id="upload-leads-tbody">
                    </tbody>
                </table>
            `;
        } else {
            tableHeader.innerHTML = headerHtml;
        }
    }

    // Display current leads in upload section
    displayCurrentLeads() {
        const tbody = document.getElementById('upload-leads-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (this.currentLeads.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="100%" class="text-center text-muted py-4">
                        No leads found
                    </td>
                </tr>
            `;
            return;
        }

        this.currentLeads.forEach(lead => {
            const row = document.createElement('tr');
            row.innerHTML = this.renderLeadRow(lead);
            row.dataset.leadId = lead._id;
            tbody.appendChild(row);
        });

        // Show pagination section
        const paginationSection = document.getElementById('upload-pagination-section');
        if (paginationSection) {
            paginationSection.style.display = 'flex';
        }
    }    // Update pagination controls for upload section
    updateUploadPaginationControls() {
        const paginationContainer = document.getElementById('upload-leads-pagination');
        const paginationContainerTop = document.getElementById('upload-leads-pagination-top');
        const paginationInfo = document.getElementById('upload-pagination-info');
        const paginationInfoTop = document.getElementById('upload-pagination-info-top');
        const leadsPerPageSelect = document.getElementById('upload-leads-per-page');
        const leadsPerPageSelectTop = document.getElementById('upload-leads-per-page-top');

        if (!paginationContainer && !paginationContainerTop) return;

        // Update pagination info for both top and bottom
        const infoText = this.totalCount === 0
            ? 'No leads to display'
            : (() => {
                const startIndex = (this.currentPage - 1) * this.leadsPerPage + 1;
                const endIndex = Math.min(this.currentPage * this.leadsPerPage, this.totalCount);
                return `Showing ${startIndex}-${endIndex} of ${this.totalCount} leads`;
            })();

        if (paginationInfo) {
            paginationInfo.textContent = infoText;
        }
        if (paginationInfoTop) {
            paginationInfoTop.textContent = infoText;
        }

        // Set up leads per page selectors if not already done
        [leadsPerPageSelect, leadsPerPageSelectTop].forEach(select => {
            if (select && !select.dataset.listenerAdded) {
                select.value = this.leadsPerPage.toString();
                select.addEventListener('change', async (e) => {
                    this.leadsPerPage = parseInt(e.target.value);
                    this.currentPage = 1; // Reset to first page

                    // Sync both selectors
                    [leadsPerPageSelect, leadsPerPageSelectTop].forEach(s => {
                        if (s && s !== e.target) {
                            s.value = e.target.value;
                        }
                    });

                    await this.refreshCurrentView();
                });
                select.dataset.listenerAdded = 'true';
            }
        });

        // Show pagination sections
        const paginationSection = document.getElementById('upload-pagination-section');
        const paginationSectionTop = document.getElementById('upload-pagination-section-top');
        if (paginationSection) {
            paginationSection.style.display = 'flex';
        }
        if (paginationSectionTop) {
            paginationSectionTop.style.display = 'flex';
        }

        // Clear existing pagination for both containers
        [paginationContainer, paginationContainerTop].forEach(container => {
            if (container) {
                container.innerHTML = '';
            }
        });
        if (this.totalPages <= 1) {
            return; // No pagination needed
        }
        // Create pagination
        const pagination = document.createElement('nav');
        pagination.setAttribute('aria-label', 'Upload leads pagination');

        const ul = document.createElement('ul');
        ul.className = 'pagination pagination-sm mb-0';

        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${this.currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `
            <a class="page-link" href="#" aria-label="Previous">
                <span aria-hidden="true">&laquo;</span>
            </a>
        `;
        if (this.currentPage > 1) {
            prevLi.querySelector('a').addEventListener('click', async (e) => {
                e.preventDefault();
                await this.goToUploadPage(this.currentPage - 1);
            });
        }
        ul.appendChild(prevLi);

        // Page numbers (simplified version)
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);

        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === this.currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;

            if (i !== this.currentPage) {
                li.querySelector('a').addEventListener('click', async (e) => {
                    e.preventDefault();
                    await this.goToUploadPage(i);
                });
            }
            ul.appendChild(li);
        }

        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${this.currentPage === this.totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `
            <a class="page-link" href="#" aria-label="Next">
                <span aria-hidden="true">&raquo;</span>
            </a>
        `;
        if (this.currentPage < this.totalPages) {
            nextLi.querySelector('a').addEventListener('click', async (e) => {
                e.preventDefault();
                await this.goToUploadPage(this.currentPage + 1);
            });
        }
        ul.appendChild(nextLi);

        pagination.appendChild(ul);

        // Add pagination to both containers
        [paginationContainer, paginationContainerTop].forEach(container => {
            if (container) {
                const paginationClone = pagination.cloneNode(true);

                // Re-attach event listeners to the cloned pagination
                const prevBtn = paginationClone.querySelector('.page-item:first-child a');
                const nextBtn = paginationClone.querySelector('.page-item:last-child a');
                const pageLinks = paginationClone.querySelectorAll('.page-link');

                if (prevBtn && this.currentPage > 1) {
                    prevBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        await this.goToUploadPage(this.currentPage - 1);
                    });
                }

                if (nextBtn && this.currentPage < this.totalPages) {
                    nextBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        await this.goToUploadPage(this.currentPage + 1);
                    });
                }

                // Re-attach page number click handlers
                pageLinks.forEach((link, index) => {
                    const pageText = link.textContent;
                    const pageNum = parseInt(pageText);
                    if (!isNaN(pageNum) && pageNum !== this.currentPage) {
                        link.addEventListener('click', async (e) => {
                            e.preventDefault();
                            await this.goToUploadPage(pageNum);
                        });
                    }
                });

                container.appendChild(paginationClone);
            }
        });
    }

    // Go to specific page
    async goToUploadPage(page) {
        if (page < 1 || page > this.totalPages || !this.selectedListId) return;

        this.currentPage = page;

        // Fetch leads for the new page
        const result = await this.fetchLeadsForList(
            this.selectedListId,
            this.currentPage,
            this.leadsPerPage,
            this.currentFilters
        );

        this.currentLeads = result.leads;
        this.totalPages = result.pagination.totalPages;
        this.totalCount = result.pagination.totalCount;

        // Display the fetched leads
        this.displayLeadsWithPagination();
    }

    // Render lists pagination
    renderListsPagination() {
        if (this.listsTotalPages <= 1) {
            return ''; // No pagination needed
        }

        let paginationHtml = `
            <div class="d-flex justify-content-between align-items-center mt-3">
                <small class="text-muted">
                    Showing ${(this.listsCurrentPage - 1) * this.listsPerPage + 1}-${Math.min(this.listsCurrentPage * this.listsPerPage, this.allLists.length)} of ${this.allLists.length} lists
                </small>
                <nav aria-label="Lists pagination">
                    <ul class="pagination pagination-sm mb-0">
        `;

        // Previous button
        paginationHtml += `
            <li class="page-item ${this.listsCurrentPage === 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); ${this.listsCurrentPage > 1 ? 'window.uploadManager.goToListsPage(' + (this.listsCurrentPage - 1) + ')' : ''}" aria-label="Previous">
                    <span aria-hidden="true">&laquo;</span>
                </a>
            </li>
        `;

        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.listsCurrentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.listsTotalPages, startPage + maxVisiblePages - 1);

        // Adjust start page if we're near the end
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // First page + ellipsis
        if (startPage > 1) {
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.uploadManager.goToListsPage(1)">1</a>
                </li>
            `;
            if (startPage > 2) {
                paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
        }

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            paginationHtml += `
                <li class="page-item ${i === this.listsCurrentPage ? 'active' : ''}">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.uploadManager.goToListsPage(${i})">${i}</a>
                </li>
            `;
        }

        // Last page + ellipsis
        if (endPage < this.listsTotalPages) {
            if (endPage < this.listsTotalPages - 1) {
                paginationHtml += `<li class="page-item disabled"><span class="page-link">...</span></li>`;
            }
            paginationHtml += `
                <li class="page-item">
                    <a class="page-link" href="#" onclick="event.preventDefault(); window.uploadManager.goToListsPage(${this.listsTotalPages})">${this.listsTotalPages}</a>
                </li>
            `;
        }

        // Next button
        paginationHtml += `
            <li class="page-item ${this.listsCurrentPage === this.listsTotalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" onclick="event.preventDefault(); ${this.listsCurrentPage < this.listsTotalPages ? 'window.uploadManager.goToListsPage(' + (this.listsCurrentPage + 1) + ')' : ''}" aria-label="Next">
                    <span aria-hidden="true">&raquo;</span>
                </a>
            </li>
        `;

        paginationHtml += `
                    </ul>
                </nav>
            </div>
        `;

        return paginationHtml;
    }    // Go to specific lists page
    goToListsPage(page) {
        if (page < 1 || page > this.listsTotalPages) return;
        this.listsCurrentPage = page;
        this.filterAndDisplayLists(); // Use filtered display instead of renderLeadLists
    }    // Navigate to the page containing a specific list
    navigateToListPage(listId) {
        if (!this.allLists || this.allLists.length === 0) return;

        const searchInput = document.getElementById('list-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

        let filteredLists = [...this.allLists];

        // Apply search filter
        if (searchTerm) {
            filteredLists = filteredLists.filter(list =>
                list.name.toLowerCase().includes(searchTerm) ||
                (list.description && list.description.toLowerCase().includes(searchTerm))
            );
        }

        // Find the index of the list
        const listIndex = filteredLists.findIndex(list => list._id === listId);

        if (listIndex !== -1) {
            // List is visible with current search, navigate to its page
            const targetPage = Math.ceil((listIndex + 1) / this.listsPerPage);
            this.listsCurrentPage = targetPage;

            // Update pagination and display
            this.listsTotalPages = Math.ceil(filteredLists.length / this.listsPerPage);
            this.renderFilteredLeadLists(filteredLists);
        } else if (searchTerm) {
            // List is not visible due to search filter, clear search to show the new list
            if (searchInput) {
                searchInput.value = '';
            }
            // Recalculate without search filter
            filteredLists = [...this.allLists];
            const newListIndex = filteredLists.findIndex(list => list._id === listId);

            if (newListIndex !== -1) {
                const targetPage = Math.ceil((newListIndex + 1) / this.listsPerPage);
                this.listsCurrentPage = targetPage;

                // Update pagination and display
                this.listsTotalPages = Math.ceil(filteredLists.length / this.listsPerPage);
                this.renderFilteredLeadLists(filteredLists);
            }
        }
    }

    // Set up list search functionality
    setupListSearch() {
        const searchInput = document.getElementById('list-search');
        const clearButton = document.getElementById('clear-list-search');

        if (searchInput) {
            searchInput.addEventListener('input', () => {
                this.filterAndDisplayLists();
            });
        }

        if (clearButton) {
            clearButton.addEventListener('click', () => {
                searchInput.value = '';
                this.filterAndDisplayLists();
            });
        }
    }    // Filter and display lists based on search
    filterAndDisplayLists() {
        const searchInput = document.getElementById('list-search');
        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

        let filteredLists = [...this.allLists];

        // Apply search filter
        if (searchTerm) {
            filteredLists = filteredLists.filter(list =>
                list.name.toLowerCase().includes(searchTerm) ||
                (list.description && list.description.toLowerCase().includes(searchTerm))
            );
            // Reset pagination to first page only when searching
            this.listsCurrentPage = 1;
        }

        // Update pagination based on filtered results
        this.listsTotalPages = Math.ceil(filteredLists.length / this.listsPerPage);

        // Ensure current page is within bounds
        if (this.listsCurrentPage > this.listsTotalPages) {
            this.listsCurrentPage = Math.max(1, this.listsTotalPages);
        }
        // Render the filtered lists
        this.renderFilteredLeadLists(filteredLists);
    }

    // Render filtered lead lists
    renderFilteredLeadLists(lists) {
        const container = document.getElementById('lead-lists-container');
        if (!container) return;

        if (lists.length === 0) {
            const searchInput = document.getElementById('list-search');
            const searchTerm = searchInput ? searchInput.value.trim() : '';

            if (searchTerm) {
                container.innerHTML = `
                    <div class="text-center text-muted">
                        <i class="bi bi-search fs-1"></i>
                        <p class="mt-2">No lists found matching "${searchTerm}"</p>
                        <button class="btn btn-sm btn-outline-secondary" onclick="document.getElementById('list-search').value = ''; window.uploadManager.filterAndDisplayLists();">
                            Clear Search
                        </button>
                    </div>
                `;
            } else {
                container.innerHTML = `
                    <div class="text-center text-muted">
                        <i class="bi bi-list-ul fs-1"></i>
                        <p class="mt-2">No lists created yet</p>
                        <button class="btn btn-sm btn-outline-primary" onclick="window.uploadManager.showCreateListModal()">
                            Create First List
                        </button>
                    </div>
                `;
            }
            return;
        }

        // Get current page lists from filtered results
        const startIndex = (this.listsCurrentPage - 1) * this.listsPerPage;
        const endIndex = Math.min(startIndex + this.listsPerPage, lists.length);
        const currentPageLists = lists.slice(startIndex, endIndex);

        // Check if user is admin to show visibility controls
        const currentUser = this.apiManager.getCurrentUser();
        const isAdmin = currentUser && currentUser.role === 'admin'; const listsHtml = currentPageLists.map(list => {
            // Create visibility toggle button and delete button for admins
            const adminButtons = isAdmin ? `
                <div class="btn-group" role="group">
                    <button class="btn btn-sm ${list.isVisibleToUsers ? 'btn-success' : 'btn-outline-secondary'}" 
                            onclick="event.stopPropagation(); window.uploadManager.toggleListVisibility('${list._id}', ${list.isVisibleToUsers})"
                            title="${list.isVisibleToUsers ? 'Click to hide from agents' : 'Click to show to agents'}">
                        <i class="bi ${list.isVisibleToUsers ? 'bi-eye' : 'bi-eye-slash'} me-1"></i>
                        ${list.isVisibleToUsers ? 'Visible' : 'Hidden'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger" 
                            onclick="event.stopPropagation(); window.uploadManager.confirmDeleteListFromCard('${list._id}', '${list.name.replace(/'/g, "\\'")}', ${list.leadCount || 0})"
                            title="Delete this list">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            ` : '';

            return `
            <div class="col-md-6 mb-3">
                <div class="card h-100 cursor-pointer ${this.selectedListId === list._id ? 'border-primary bg-light' : ''}" 
                     onclick="window.uploadManager.selectList('${list._id}')">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="card-title mb-0">${list.name}</h6>
                            ${adminButtons}
                        </div>
                        <p class="card-text text-muted small">${list.description || 'No description'}</p>
                        <div class="mt-auto">
                            <div class="d-flex justify-content-between align-items-center">
                                <small class="badge bg-secondary">${list.leadCount || 0} leads</small>
                                <small class="text-muted">${new Date(list.createdAt).toLocaleDateString()}</small>
                            </div>
                            ${list.isVisibleToUsers === false ?
                    (list.visibleToSpecificAgents && list.visibleToSpecificAgents.length > 0 ?
                        `<div class="mt-1"><small class="badge bg-info text-dark"><i class="bi bi-person-check"></i> Visible only to: ${list.visibleToSpecificAgents.map(agent => agent.name).join(', ')}</small></div>` :
                        '<div class="mt-1"><small class="badge bg-warning text-dark"><i class="bi bi-eye-slash"></i> Hidden</small></div>'
                    ) : ''
                }
                        </div>
                    </div>
                </div>
            </div>
        `}).join('');

        container.innerHTML = `
            <div class="row">
                ${listsHtml}
            </div>
            ${this.renderListsPagination()}
        `;
    }

    // Fetch leads with pagination for a specific list
    async fetchLeadsForList(listId, page = 1, limit = 10, filters = {}) {
        try {
            // Build query parameters
            const params = new URLSearchParams({
                leadList: listId,
                page: page.toString(),
                limit: limit.toString()
            });

            // Add search filter
            if (filters.search && filters.search.trim()) {
                params.append('search', filters.search.trim());
            }

            // Add status filter
            if (filters.status && filters.status !== '') {
                params.append('status', filters.status);
            }

            const response = await this.apiManager.authenticatedFetch(
                `${this.apiManager.API_URL}/leads?${params.toString()}`
            );

            if (!response.ok) {
                throw new Error('Failed to fetch leads');
            }

            const data = await response.json();

            // Handle both old format (array) and new format (object with pagination)
            if (Array.isArray(data)) {
                // Legacy format - return as-is for backward compatibility
                return {
                    leads: data,
                    pagination: {
                        currentPage: 1,
                        totalPages: 1,
                        totalCount: data.length,
                        limit: data.length,
                        hasNext: false,
                        hasPrev: false
                    }
                };
            } else {
                // New format with pagination
                return data;
            }
        } catch (err) {
            console.error('Error fetching leads for list:', err);
            return {
                leads: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    totalCount: 0,
                    limit: limit,
                    hasNext: false,
                    hasPrev: false
                }
            };
        }
    }

    // Show edit list modal
    async showEditListModal() {
        if (!this.selectedList) return;
        document.getElementById('editListModal')?.remove();
        // Load agents for selection
        const agents = await this.loadAgents();
        const selectedAgentIds = (this.selectedList.visibleToSpecificAgents || []).map(a => typeof a === 'string' ? a : a._id);
        let modalHtml = `
            <div class="modal fade" id="editListModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit Lead List</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <form id="editListForm" onsubmit="event.preventDefault(); window.uploadManager.handleEditList(event);">
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">List Name *</label>
                                    <input type="text" class="form-control" name="name" required value="${this.selectedList.name || ''}">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" name="description" rows="3">${this.selectedList.description || ''}</textarea>
                                </div>
                                <div class="mb-3">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" name="isVisibleToUsers" id="edit-list-visible" ${this.selectedList.isVisibleToUsers !== false ? 'checked' : ''}>
                                        <label class="form-check-label" for="edit-list-visible">
                                            <strong>Visible to All Agents</strong>
                                        </label>
                                        <div class="form-text">When checked, all agents can see this list. When unchecked, you can choose specific agents.</div>
                                    </div>
                                </div>
                                <div class="mb-3" id="edit-specific-agents-section" style="display: ${this.selectedList.isVisibleToUsers === false ? 'block' : 'none'};">
                                    <label class="form-label">Select Specific Agents</label>
                                    <div id="edit-agents-selection" class="border rounded p-3">
                                        ${agents.map(agent => `
                                            <div class="form-check">
                                                <input class="form-check-input" type="checkbox" name="editSpecificAgents" value="${agent._id}" id="edit-agent-${agent._id}" ${selectedAgentIds.includes(agent._id) ? 'checked' : ''}>
                                                <label class="form-check-label" for="edit-agent-${agent._id}">
                                                    ${agent.name} (${agent.email})
                                                </label>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="form-text">Choose which agents can see this list when not visible to all agents.</div>
                                </div>
                                <hr>
                                <h6>Custom Labels for this List</h6>
                                <p class="text-muted">Edit, add, or remove custom fields for this lead list.</p>
                                <div id="edit-custom-labels-container">
                                    <!-- Custom labels will be added here -->
                                </div>
                                <button type="button" class="btn btn-sm btn-outline-primary" id="add-edit-custom-label-btn">
                                    <i class="bi bi-plus me-1"></i> Add Custom Label
                                </button>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Changes</button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        this.renderEditCustomLabels();
        document.getElementById('add-edit-custom-label-btn').onclick = () => this.addEditCustomLabel();
        // Visibility toggle logic
        const visibilityCheckbox = document.getElementById('edit-list-visible');
        const specificAgentsSection = document.getElementById('edit-specific-agents-section');
        visibilityCheckbox.addEventListener('change', function () {
            if (this.checked) {
                specificAgentsSection.style.display = 'none';
                // Uncheck all agent checkboxes
                const agentCheckboxes = document.querySelectorAll('input[name="editSpecificAgents"]');
                agentCheckboxes.forEach(cb => cb.checked = false);
            } else {
                specificAgentsSection.style.display = 'block';
            }
        });
        const modal = new bootstrap.Modal(document.getElementById('editListModal'));
        modal.show();
    }

    // Keep this version!
    handleEditList(e) {
        const form = e.target;
        const formData = new FormData(form);
        this.selectedList.name = formData.get('name').trim();
        this.selectedList.description = formData.get('description').trim();
        this.selectedList.isVisibleToUsers = formData.get('isVisibleToUsers') === 'on';
        let visibleToSpecificAgents = [];
        if (!this.selectedList.isVisibleToUsers) {
            const agentCheckboxes = form.querySelectorAll('input[name="editSpecificAgents"]:checked');
            visibleToSpecificAgents = Array.from(agentCheckboxes).map(cb => cb.value);
        }
        this.selectedList.visibleToSpecificAgents = visibleToSpecificAgents;
        // Labels
        const labels = [];
        let idx = 0;
        while (formData.has(`label_name_${idx}`)) {
            const name = formData.get(`label_name_${idx}`).trim();
            const label = formData.get(`label_label_${idx}`).trim();
            const type = formData.get(`label_type_${idx}`);
            const required = formData.get(`label_required_${idx}`) === 'on';
            let options = [];
            if (type === 'select') {
                options = (formData.get(`label_options_${idx}`) || '').split(',').map(opt => opt.trim()).filter(opt => opt);
            }
            if (name && label) {
                labels.push({ name, label, type, required, options });
            }
            idx++;
        }
        this.selectedList.labels = labels;
        this.apiManager.put(`/lead-lists/${this.selectedList._id}`, this.selectedList)
            .then(() => {
                this.apiManager.showAlert('List updated successfully', 'success');
                bootstrap.Modal.getInstance(document.getElementById('editListModal')).hide();
                this.loadLeadLists && this.loadLeadLists();
            })
            .catch(err => {
                this.apiManager.showAlert('Error updating list', 'danger');
            });
    }

    renderEditCustomLabels() {
        const container = document.getElementById('edit-custom-labels-container');
        if (!container) return;
        container.innerHTML = '';
        (this.selectedList.labels || []).forEach((label, idx) => {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'mb-2 border rounded p-2 position-relative';
            labelDiv.innerHTML = `
                <div class="row g-2 align-items-center">
                    <div class="col-md-4">
                        <input type="text" class="form-control" name="label_name_${idx}" value="${label.name}" placeholder="Field Name" required>
                    </div>
                    <div class="col-md-4">
                        <input type="text" class="form-control" name="label_label_${idx}" value="${label.label}" placeholder="Display Label" required>
                    </div>
                    <div class="col-md-2">
                        <select class="form-select" name="label_type_${idx}">
                            <option value="text" ${label.type === 'text' ? 'selected' : ''}>Text</option>
                            <option value="number" ${label.type === 'number' ? 'selected' : ''}>Number</option>
                            <option value="email" ${label.type === 'email' ? 'selected' : ''}>Email</option>
                            <option value="phone" ${label.type === 'phone' ? 'selected' : ''}>Phone</option>
                            <option value="select" ${label.type === 'select' ? 'selected' : ''}>Dropdown</option>
                            <option value="textarea" ${label.type === 'textarea' ? 'selected' : ''}>Text Area</option>
                        </select>
                    </div>
                    <div class="col-md-1">
                        <input type="checkbox" class="form-check-input" name="label_required_${idx}" ${label.required ? 'checked' : ''} title="Required">
                    </div>
                    <div class="col-md-1">
                        <button type="button" class="btn btn-sm btn-danger remove-label-btn" data-label-idx="${idx}"><i class="bi bi-x"></i></button>
                    </div>
                </div>
                <div class="row mt-2" style="display:${label.type === 'select' ? 'block' : 'none'}" id="label-options-row-${idx}">
                    <div class="col-12">
                        <input type="text" class="form-control" name="label_options_${idx}" value="${(label.options || []).join(', ')}" placeholder="Comma-separated options for dropdown">
                    </div>
                </div>
            `;
            container.appendChild(labelDiv);
        });
        container.querySelectorAll('.remove-label-btn').forEach(btn => {
            btn.onclick = (e) => {
                const idx = parseInt(btn.dataset.labelIdx);
                this.selectedList.labels.splice(idx, 1);
                this.renderEditCustomLabels();
            };
        });
        container.querySelectorAll('select[name^="label_type_"]').forEach((select, idx) => {
            select.onchange = (e) => {
                const row = document.getElementById(`label-options-row-${idx}`);
                if (row) row.style.display = select.value === 'select' ? 'block' : 'none';
            };
        });
    }

    addEditCustomLabel() {
        // Sync current UI values to this.selectedList.labels before adding new
        const container = document.getElementById('edit-custom-labels-container');
        if (container) {
            const updatedLabels = [];
            const rows = container.querySelectorAll('.row.g-2.align-items-center');
            rows.forEach((row, idx) => {
                const name = row.querySelector(`input[name="label_name_${idx}"]`)?.value.trim() || '';
                const label = row.querySelector(`input[name="label_label_${idx}"]`)?.value.trim() || '';
                const type = row.querySelector(`select[name="label_type_${idx}"]`)?.value || 'text';
                const required = row.querySelector(`input[name="label_required_${idx}"]`)?.checked || false;
                let options = [];
                if (type === 'select') {
                    const optionsInput = container.querySelector(`input[name="label_options_${idx}"]`);
                    options = optionsInput ? optionsInput.value.split(',').map(opt => opt.trim()).filter(opt => opt) : [];
                }
                if (name && label) {
                    updatedLabels.push({ name, label, type, required, options });
                } else if (name || label) {
                    // If user started typing but didn't finish, still keep the row
                    updatedLabels.push({ name, label, type, required, options });
                }
            });
            this.selectedList.labels = updatedLabels;
        }
        // Now add the new blank label
        this.selectedList.labels.push({ name: '', label: '', type: 'text', required: false, options: [] });
        this.renderEditCustomLabels();
    }
}

// Create global instance
window.uploadManager = new UploadManager(window.apiManager);
