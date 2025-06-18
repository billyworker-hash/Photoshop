// Upload.js - Handles lead list management functionality
class UploadManager {
    constructor(apiManager) {
        this.apiManager = apiManager;
        this.selectedListId = null;
        this.selectedList = null; // Store the selected list object with its labels
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
    }

    // Render lead lists in the sidebar
    renderLeadLists(lists) {
        const container = document.getElementById('lead-lists-container');
        if (!container) return;

        if (lists.length === 0) {
            container.innerHTML = `
                <div class="text-center text-muted">
                    <i class="bi bi-list-ul fs-1"></i>
                    <p class="mt-2">No lists created yet</p>
                    <button class="btn btn-sm btn-outline-primary" onclick="window.uploadManager.showCreateListModal()">
                        Create First List
                    </button>
                </div>
            `;
            return;
        }        const listsHtml = lists.map(list => {
            // Check if user is admin to show visibility controls
            const currentUser = this.apiManager.getCurrentUser();
            const isAdmin = currentUser && currentUser.role === 'admin';
              // Create visibility toggle button for admins
            const visibilityButton = isAdmin ? `
                <button class="btn btn-sm ${list.isVisibleToUsers ? 'btn-success' : 'btn-outline-secondary'}" 
                        onclick="event.stopPropagation(); window.uploadManager.toggleListVisibility('${list._id}', ${list.isVisibleToUsers})"
                        title="${list.isVisibleToUsers ? 'Click to hide from agents' : 'Click to show to agents'}">
                    <i class="bi ${list.isVisibleToUsers ? 'bi-eye' : 'bi-eye-slash'} me-1"></i>
                    ${list.isVisibleToUsers ? 'Visible' : 'Hidden'}
                </button>
            ` : '';
            
            return `
            <div class="list-item p-3 border-bottom cursor-pointer ${this.selectedListId === list._id ? 'bg-light' : ''}" 
                 onclick="window.uploadManager.selectList('${list._id}')">
                <div class="d-flex justify-content-between align-items-center">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${list.name}</h6>
                        <small class="text-muted">${list.description || 'No description'}</small>                        <div class="mt-1">
                            <small class="badge bg-secondary">${list.leadCount || 0} leads</small>
                            ${list.isVisibleToUsers === false ? 
                                (list.visibleToSpecificAgents && list.visibleToSpecificAgents.length > 0 ? 
                                    `<small class="badge bg-info text-dark ms-1"><i class="bi bi-person-check"></i> Visible only to: ${list.visibleToSpecificAgents.map(agent => agent.name).join(', ')}</small>` :
                                    '<small class="badge bg-warning text-dark ms-1"><i class="bi bi-eye-slash"></i> Hidden</small>'
                                ) : ''
                            }
                        </div>
                    </div>                    <div class="d-flex gap-1">
                        ${visibilityButton}
                    </div>
                </div>
            </div>
        `}).join('');

        container.innerHTML = listsHtml;
    }    // Select a lead list
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
    }// Load details for selected list
    async loadSelectedListDetails(listId) {
        try {
            const list = await this.apiManager.get(`/lead-lists/${listId}`);
            const leads = await this.apiManager.get(`/leads?leadList=${listId}`);

            this.selectedList = list; // Store the list object with its labels
            this.renderSelectedList(list, leads);
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
    }

    // Render selected list details
    renderSelectedList(list, leads) {
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
        }        if (infoElement) {
            // Check if user is admin to show visibility info
            const currentUser = this.apiManager.getCurrentUser();
            const isAdmin = currentUser && currentUser.role === 'admin';
              let visibilityInfo = '';
            if (isAdmin) {
                if (list.isVisibleToUsers !== false) {
                    visibilityInfo = `<p class="mb-1"><strong>Visibility:</strong> Visible to all agents</p>`;                } else {
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
                        ${visibilityInfo}
                    </div>
                    <div class="col-md-6">
                        <p class="mb-1"><strong>Total Leads:</strong> ${leads.length}</p>
                        <p class="mb-1"><strong>Last Updated:</strong> ${new Date(list.updatedAt).toLocaleDateString()}</p>
                    </div>
                </div>
            `;
        }

        if (leadsElement) {
            this.renderListLeads(leads);
        }
    }    // Render leads for the selected list
    renderListLeads(leads) {
        const leadsElement = document.getElementById('selected-list-leads');
        if (!leadsElement) return;

        if (leads.length === 0) {
            leadsElement.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-person-plus fs-1"></i>
                    <p class="mt-2">No leads in this list yet</p>
                    <button class="btn btn-primary" onclick="window.uploadManager.showBulkAddModal()">
                        Add First Leads
                    </button>
                </div>
            `;
            return;
        }        // Generate table headers dynamically based on list labels
        const headers = [];
        if (this.selectedList && this.selectedList.labels) {
            this.selectedList.labels.forEach(label => {
                headers.push(label.label);
            });
        }        // Add Status as a standard header
        headers.push('Status');
        headers.push('Actions');

        const tableHtml = `
            <div class="table-responsive">
                <table class="table table-sm table-hover">
                    <thead class="table-light">
                        <tr>
                            ${headers.map(header => `<th>${header}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${leads.map(lead => this.renderLeadRow(lead)).join('')}
                    </tbody>
                </table>
            </div>
        `;

        leadsElement.innerHTML = tableHtml;
    }    // Render individual lead row
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
            });

            this.showSuccess('Lead list created successfully');
            await this.loadLeadLists();

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
    }// Update lead list    // Delete lead list    // Bulk add leads to selected list
    async bulkAddLeads(leadsData) {
        if (!this.selectedListId) {
            this.showError('No list selected');
            return;
        }

        try {
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
            this.showError('Failed to add leads to list');
        }
    }    // Generate bulk add form based on list-specific labels
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
            previewElement.innerHTML = `<strong>${maxLines} lead${maxLines === 1 ? '' : 's'} will be created:</strong> ${sampleValues.join(', ')}${maxLines > 3 ? ` and ${maxLines - 3} more...` : ''}`;
        }
    }    // Process bulk add form submission
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
                customFields[fieldName] = array[i] || array[array.length - 1] || '';
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
                <div class="modal-dialog modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Create New Lead List</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <form id="createListForm" onsubmit="event.preventDefault(); window.uploadManager.handleCreateList(event);">
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label class="form-label">List Name *</label>
                                    <input type="text" class="form-control" name="name" required 
                                           placeholder="e.g., leads2025, Q1 Prospects">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Description</label>
                                    <textarea class="form-control" name="description" rows="3" 
                                              placeholder="Optional description for this lead list"></textarea>
                                </div>                                <div class="mb-3">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" name="isVisibleToUsers" id="create-list-visible" checked>
                                        <label class="form-check-label" for="create-list-visible">
                                            <strong>Visible to All Agents</strong>
                                        </label>
                                        <div class="form-text">When checked, all agents can see this list. When unchecked, you can choose specific agents.</div>
                                    </div>
                                </div>
                                
                                <div class="mb-3" id="specific-agents-section" style="display: none;">
                                    <label class="form-label">Select Specific Agents</label>
                                    <div id="agents-selection" class="border rounded p-3">
                                        <!-- Agent checkboxes will be loaded here -->
                                    </div>
                                    <div class="form-text">Choose which agents can see this list when not visible to all agents.</div>
                                </div>
                                
                                <hr>
                                <h6>Custom Labels for this List</h6>
                                <p class="text-muted">Define custom fields specific to this lead list.</p>
                                
                                <div id="custom-labels-container">
                                    <!-- Custom labels will be added here -->
                                </div>
                                
                                <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.uploadManager.addCustomLabel()">
                                    <i class="bi bi-plus me-1"></i> Add Custom Label
                                </button>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Create List</button>
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
                <div class="modal-dialog modal-xl">
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

        document.body.insertAdjacentHTML('beforeend', modalHtml);    }

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
    }    // Add default labels to create form
    addDefaultLabels() {
        const container = document.getElementById('custom-labels-container');
        if (!container) return;

        // Clear any existing labels
        container.innerHTML = '';

        const defaultLabels = [
            { name: 'firstName', label: 'First Name', type: 'text', required: true },
            { name: 'lastName', label: 'Last Name', type: 'text', required: true },
            { name: 'email', label: 'Email', type: 'email', required: false },
            { name: 'phone', label: 'Phone', type: 'text' },
            { name: 'currency', label: 'Currency', type: 'text' },
            { name: 'amount', label: 'Amount', type: 'number' },
            { name: 'date', label: 'Date', type: 'text' },
            { name: 'brand', label: 'Brand', type: 'text' }
        ];

        defaultLabels.forEach((defaultLabel, index) => {
            this.addCustomLabel();
            const container = document.getElementById('custom-labels-container');
            const lastRow = container.lastElementChild;

            lastRow.querySelector(`input[name="labels[${index}][name]"]`).value = defaultLabel.name;
            lastRow.querySelector(`input[name="labels[${index}][label]"]`).value = defaultLabel.label;
            lastRow.querySelector(`select[name="labels[${index}][type]"]`).value = defaultLabel.type;

            if (defaultLabel.required) {
                lastRow.querySelector(`input[name="labels[${index}][required]"]`).checked = true;
            }
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

        // Process custom labels
        const labels = [];
        const container = document.getElementById('create-labels-container');
        const labelRows = container?.querySelectorAll('.custom-label-row') || [];

        labelRows.forEach((row, index) => {
            const labelName = formData.get(`labels[${index}][name]`);
            const labelLabel = formData.get(`labels[${index}][label]`);
            const labelType = formData.get(`labels[${index}][type]`);
            const labelRequired = formData.get(`labels[${index}][required]`) === 'true';
            const labelOptions = formData.get(`labels[${index}][options]`);

            if (labelName && labelLabel) {
                const label = {
                    name: labelName.trim(),
                    label: labelLabel.trim(),
                    type: labelType,
                    required: labelRequired
                };

                if (labelType === 'select' && labelOptions) {
                    label.options = labelOptions.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
                }

                labels.push(label);
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
        await this.processBulkAddForm(formData);        event.target.reset();
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
        this.deleteList(this.selectedListId);    }

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
        specificAgentsSection.style.display = isVisibleToUsers ? 'none' : 'block';    }

    // Handle edit list form submission
    async handleEditList(event) {
        event.preventDefault();
        
        const formData = new FormData(event.target);
        const listId = formData.get('listId');
        const name = formData.get('name');
        const description = formData.get('description');
        const isVisibleToUsers = formData.get('isVisible') === 'on';

        // Collect selected agents if not visible to all
        let visibleToSpecificAgents = [];
        if (!isVisibleToUsers) {
            const agentCheckboxes = document.querySelectorAll('input[name="editSpecificAgents"]:checked');
            visibleToSpecificAgents = Array.from(agentCheckboxes).map(checkbox => checkbox.value);
        }

        await this.updateList(listId, name, description, isVisibleToUsers, visibleToSpecificAgents);
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
    }

    // Delete lead list
    async deleteList(listId) {
        if (!confirm('Are you sure you want to delete this list? This will also remove all leads in the list.')) {
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
    }

    // Confirm delete list from edit modal
    confirmDeleteList() {
        const listId = document.getElementById('editListId').value;
        const listName = document.getElementById('editListName').value;
        
        if (confirm(`Are you sure you want to delete "${listName}"?\n\nThis will permanently delete the list and all associated leads. This action cannot be undone.`)) {
            this.deleteList(listId);
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editListModal'));
            modal.hide();
        }
    }

    // Remove lead from list
    async removeLead(leadId) {
        if (!confirm('Are you sure you want to remove this lead from the list?')) {
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
        visibilityCheckbox.addEventListener('change', function() {
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
        visibilityCheckbox.addEventListener('change', function() {
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
        this.apiManager.showAlert(message, 'danger', 'list-error');    }
}

// Create global instance
window.uploadManager = new UploadManager(window.apiManager);
