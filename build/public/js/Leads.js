// Leads.js - Handles lead management functionality
class LeadsManager {    constructor(apiManager) {
        this.apiManager = apiManager;
        this.allLeads = [];
        this.allLeadLists = [];
        this.selectedListId = null;
        this.eventListeners = []; // Track event listeners for cleanup
        this.filterListenersSetup = false; // Track if filter listeners are already set up
        
        // Auto-refresh properties
        this.autoRefreshInterval = null;
        this.autoRefreshEnabled = false;
        this.refreshIntervalMs = 5000; // 5 seconds
        this.isLeadsPageActive = false;
        
        // Pagination properties
        this.currentPage = 1;
        this.leadsPerPage = 10; // Default to 10 leads per page
        this.totalPages = 1;
        this.filteredLeads = [];
    }// Load leads
    async loadLeads() {
        try {
            // Load custom fields first
            await this.loadCustomFields();
            
            // Load lead lists for cards display
            await this.loadLeadLists();
              this.allLeads = await this.fetchLeads();
            
            // Display lead list cards
            this.displayLeadListCards();
            
            // Display leads with proper headers
            this.displayLeads(this.allLeads);
            
            // Initialize custom fields in forms
            this.initializeCustomFields();
            
            // Load agents for the lead assignment dropdown
            const currentUser = this.apiManager.getCurrentUser();
            if (currentUser && currentUser.role === 'admin') {
                this.loadAgentsForDropdown();
            }
            
            // Set up search and filter event listeners only once
            if (!this.filterListenersSetup) {
                this.setupLeadFilters();
                this.filterListenersSetup = true;
            }

            // Mark leads page as active and start auto-refresh
            this.isLeadsPageActive = true;
            this.startAutoRefresh();
        } catch (err) {
            console.error('Error loading leads:', err);
        }
    }    // Refresh leads data only (without reinitializing UI components)
    async refreshLeadsData() {
        try {
            // Fetch fresh lead lists data to pick up visibility changes
            await this.loadLeadLists();
            
            // Fetch fresh leads data
            const newLeads = await this.fetchLeads();
            
            // Update the leads array
            this.allLeads = newLeads;
            
            // Update lead list cards to reflect any visibility changes
            this.displayLeadListCards();
            
            // Check if currently selected list is still visible to current user
            if (this.selectedListId) {
                const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);
                if (!selectedList) {
                    // Selected list is no longer visible, reset to "All Lists"
                    this.selectLeadList(null);
                    return; // selectLeadList will handle the display update
                }
            }
            
            // Re-display leads with current filters
            let filteredLeads = [...this.allLeads];
            
            // Apply current list filter
            if (this.selectedListId) {
                filteredLeads = filteredLeads.filter(lead => lead.leadList === this.selectedListId);
            }
            
            // Apply current search and status filters
            const searchInput = document.getElementById('lead-search');
            const statusFilter = document.getElementById('lead-status-filter');
            
            const filters = {
                search: searchInput?.value || '',
                status: statusFilter?.value || ''
            };
            
            // Update display with current filters
            this.displayLeads(filteredLeads, filters);
            
            // Update the list filter dropdown to reflect any changes
            this.populateListFilterDropdown();
            
        } catch (err) {
            console.error('Error refreshing leads data:', err);
            // Don't show error to user for background refresh failures
        }
    }

    // Load lead lists
    async loadLeadLists() {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/lead-lists`);
            if (response.ok) {
                this.allLeadLists = await response.json();
            } else {
                this.allLeadLists = [];
            }
        } catch (err) {
            console.error('Error loading lead lists:', err);
            this.allLeadLists = [];
        }
    }    // Display lead list cards
    displayLeadListCards() {
        const cardsContainer = document.getElementById('lead-lists-cards');
        if (!cardsContainer) return;

        // Clean up existing event listeners
        this.cleanupCardEventListeners();

        cardsContainer.innerHTML = '';

        // Add "All Lists" card
        const allListsCard = this.createLeadListCard({
            _id: null,
            name: 'All Lists',
            description: 'View all leads from all lists',
            leadCount: this.allLeads.length
        }, this.selectedListId === null);

        cardsContainer.appendChild(allListsCard);        // Add individual list cards
        this.allLeadLists.forEach(list => {
            const leadCount = this.allLeads.filter(lead => lead.leadList === list._id).length;
            const card = this.createLeadListCard({
                ...list,
                leadCount
            }, this.selectedListId === list._id);
            cardsContainer.appendChild(card);
        });
    }    // Create individual lead list card
    createLeadListCard(list, isSelected = false) {
        const card = document.createElement('div');
        card.className = `lead-list-card ${isSelected ? 'selected' : ''}`;
        card.dataset.listId = list._id || '';
        
        const currentUser = this.apiManager.getCurrentUser();
        const isAdmin = currentUser && currentUser.role === 'admin';
        
        card.innerHTML = `
            <div class="card-header">
                <h5 class="card-title">${list.name}</h5>
                <span class="lead-count-badge">${list.leadCount} leads</span>
                ${list._id && isAdmin ? `
                    <div class="card-actions">
                        <button class="btn btn-sm btn-outline-primary edit-list-btn" title="Edit List">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger delete-list-btn" title="Delete List">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                ` : ''}
            </div>
            <div class="card-body">
                <p class="card-description">${list.description || 'No description'}</p>
                ${list._id ? `<p class="card-labels">Labels: ${list.labels ? list.labels.map(l => l.label).join(', ') : 'None'}</p>` : ''}
            </div>
        `;

        // Add click event listener for card selection (but not on action buttons)
        const cardClickHandler = (e) => {
            if (!e.target.closest('.card-actions')) {
                this.selectLeadList(list._id);
            }
        };
        card.addEventListener('click', cardClickHandler);
        
        // Track this event listener for cleanup
        this.eventListeners.push({
            element: card,
            event: 'click',
            handler: cardClickHandler
        });

        // Add event listeners for admin actions
        if (list._id && isAdmin) {
            const editBtn = card.querySelector('.edit-list-btn');
            const deleteBtn = card.querySelector('.delete-list-btn');
            
            if (editBtn) {
                const editHandler = (e) => {
                    e.stopPropagation();
                    this.openEditListModal(list);
                };
                editBtn.addEventListener('click', editHandler);
                
                // Track this event listener for cleanup
                this.eventListeners.push({
                    element: editBtn,
                    event: 'click',
                    handler: editHandler
                });
            }
            
            if (deleteBtn) {
                const deleteHandler = (e) => {
                    e.stopPropagation();
                    this.confirmDeleteList(list);
                };
                deleteBtn.addEventListener('click', deleteHandler);
                
                // Track this event listener for cleanup
                this.eventListeners.push({
                    element: deleteBtn,
                    event: 'click',
                    handler: deleteHandler
                });
            }
        }

        return card;
    }// Select lead list for filtering
    selectLeadList(listId) {
        this.selectedListId = listId;
        
        // Update card selection visual state
        document.querySelectorAll('.lead-list-card').forEach(card => {
            card.classList.remove('selected');
        });
        
        const selectedCard = document.querySelector(`[data-list-id="${listId || ''}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }

        // Filter leads by selected list and refresh table headers
        this.filterLeadsByList();
        
        // Update the list filter dropdown to match
        const listFilter = document.getElementById('lead-list-filter');
        if (listFilter) {
            listFilter.value = listId || '';
        }
    }// Load custom fields
    async loadCustomFields() {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/lead-fields`);
            if (response.ok) {
                this.customFields = await response.json();
            } else {
                this.customFields = [];
            }
        } catch (err) {
            console.error('Error loading custom fields:', err);
            this.customFields = [];
        }
    }

    // Fetch leads
    async fetchLeads() {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch leads');
            }
            
            return await response.json();
        } catch (err) {
            console.error('Error fetching leads:', err);
            return [];
        }
    }    // Display leads with filtering and pagination
    displayLeads(leads, filters = {}) {
        const tableHeader = document.getElementById('leads-table-header');
        const tableBody = document.getElementById('leads-table-body');
        const noLeadsMessage = document.getElementById('no-leads-message');
        
        if (!tableBody) return;
        
        // Clean up existing row event listeners
        this.cleanupRowEventListeners();
        
        // Generate dynamic table headers
        this.generateTableHeaders(tableHeader);
        
        tableBody.innerHTML = '';
        
        // Apply filters if provided
        let filteredLeads = [...leads];
          if (filters.search) {
            const searchTerm = filters.search.toLowerCase();
            filteredLeads = filteredLeads.filter(lead => {
                // Search in standard fields
                const standardMatch = lead.fullName?.toLowerCase().includes(searchTerm) || 
                                    lead.email?.toLowerCase().includes(searchTerm) || 
                                    lead.phone?.toLowerCase().includes(searchTerm);
                
                // Search in list-specific custom fields
                let customMatch = false;
                if (this.selectedListId) {
                    const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);
                    if (selectedList && selectedList.labels) {
                        customMatch = selectedList.labels.some(label => {
                            const value = lead.customFields?.[label.name];
                            return value && value.toString().toLowerCase().includes(searchTerm);
                        });
                    }
                } else {
                    // Search in all possible custom fields when no list is selected
                    if (lead.customFields) {
                        customMatch = Object.values(lead.customFields).some(value => 
                            value && value.toString().toLowerCase().includes(searchTerm)
                        );
                    }
                }
                
                return standardMatch || customMatch;
            });
        }
        
        if (filters.status && filters.status !== '') {
            filteredLeads = filteredLeads.filter(lead => lead.status === filters.status);
        }
        
        // Store filtered leads for pagination
        this.filteredLeads = filteredLeads;
        
        // Calculate pagination
        this.totalPages = Math.ceil(filteredLeads.length / this.leadsPerPage);
        if (this.currentPage > this.totalPages) {
            this.currentPage = Math.max(1, this.totalPages);
        }
        
        // Show/hide no leads message
        if (filteredLeads.length === 0) {
            tableBody.innerHTML = '';
            if (noLeadsMessage) noLeadsMessage.style.display = 'block';
            this.updatePaginationControls();
            return;
        } else {
            if (noLeadsMessage) noLeadsMessage.style.display = 'none';
        }
        
        // Calculate start and end indices for current page
        const startIndex = (this.currentPage - 1) * this.leadsPerPage;
        const endIndex = Math.min(startIndex + this.leadsPerPage, filteredLeads.length);
        const currentPageLeads = filteredLeads.slice(startIndex, endIndex);
        
        // Display current page leads
        currentPageLeads.forEach(lead => {
            const row = document.createElement('tr');
            row.innerHTML = this.generateLeadRow(lead);
            row.dataset.leadId = lead._id;
              // Check if lead is owned
            const isOwned = lead.assignedTo && lead.assignedTo._id;
            
            // Make all leads clickable
            row.style.cursor = 'pointer';
            
            if (isOwned) {
                // Owned lead styling - make it visually distinct but still clickable
                row.classList.add('owned-lead');
                row.style.backgroundColor = '#f8f9fa';
                // Remove opacity reduction to make it more clickable                // Add event listener to open lead notes modal for owned leads
                const ownedRowClickHandler = (e) => {
                    // Don't trigger if the click was on a dropdown or its elements
                    if (e.target.classList.contains('lead-status-dropdown') || 
                        e.target.closest('.lead-status-dropdown')) {
                        return;
                    }
                    this.openLeadNotesModal(lead);
                };
                row.addEventListener('click', ownedRowClickHandler);
                
                // Track this event listener for cleanup
                this.eventListeners.push({
                    element: row,
                    event: 'click',
                    handler: ownedRowClickHandler
                });            } else {                // Unowned lead - clickable to open edit modal
                const rowClickHandler = (e) => {
                    // Don't trigger if the click was on a dropdown or its elements
                    if (e.target.classList.contains('lead-status-dropdown') || 
                        e.target.closest('.lead-status-dropdown')) {
                        return;
                    }
                    this.openEditLeadModal(lead);
                };
                row.addEventListener('click', rowClickHandler);
                
                // Track this event listener for cleanup
                this.eventListeners.push({
                    element: row,
                    event: 'click',
                    handler: rowClickHandler
                });
            }
              tableBody.appendChild(row);        });
        
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
            
            // Track this event listener for cleanup
            this.eventListeners.push({
                element: span,
                event: 'click',
                handler: phoneLinkHandler
            });
        });
        
        // Apply status colors to all dropdowns
        this.applyStatusColors();
        
        // Initialize Bootstrap tooltips
        const tooltips = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltips.forEach(tooltip => {
            new bootstrap.Tooltip(tooltip);
        });
          // Update pagination controls
        this.updatePaginationControls();
    }

    // Update pagination controls
    updatePaginationControls() {
        const paginationContainer = document.getElementById('leads-pagination');
        const paginationInfo = document.getElementById('pagination-info');
        const leadsPerPageSelect = document.getElementById('leads-per-page');
        
        if (!paginationContainer) return;
        
        // Update pagination info
        if (paginationInfo) {
            const totalLeads = this.filteredLeads.length;
            if (totalLeads === 0) {
                paginationInfo.textContent = 'No leads to display';
            } else {
                const startIndex = (this.currentPage - 1) * this.leadsPerPage + 1;
                const endIndex = Math.min(this.currentPage * this.leadsPerPage, totalLeads);
                paginationInfo.textContent = `Showing ${startIndex}-${endIndex} of ${totalLeads} leads`;
            }
        }
        
        // Set up leads per page selector if not already done
        if (leadsPerPageSelect && !leadsPerPageSelect.dataset.listenerAdded) {
            leadsPerPageSelect.value = this.leadsPerPage.toString();
            leadsPerPageSelect.addEventListener('change', (e) => {
                this.leadsPerPage = parseInt(e.target.value);
                this.currentPage = 1; // Reset to first page
                this.refreshCurrentView();
            });
            leadsPerPageSelect.dataset.listenerAdded = 'true';
        }
        
        // Clear existing pagination
        paginationContainer.innerHTML = '';
        
        if (this.totalPages <= 1) {
            return; // No pagination needed
        }
        
        // Create pagination
        const pagination = document.createElement('nav');
        pagination.setAttribute('aria-label', 'Leads pagination');
        
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
            prevLi.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                this.goToPage(this.currentPage - 1);
            });
        }
        ul.appendChild(prevLi);
        
        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
        
        // Adjust start page if we're near the end
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        
        // First page + ellipsis
        if (startPage > 1) {
            const firstLi = document.createElement('li');
            firstLi.className = 'page-item';
            firstLi.innerHTML = '<a class="page-link" href="#">1</a>';
            firstLi.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                this.goToPage(1);
            });
            ul.appendChild(firstLi);
            
            if (startPage > 2) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.className = 'page-item disabled';
                ellipsisLi.innerHTML = '<span class="page-link">...</span>';
                ul.appendChild(ellipsisLi);
            }
        }
        
        // Page number buttons
        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === this.currentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            
            if (i !== this.currentPage) {
                li.querySelector('a').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.goToPage(i);
                });
            }
            ul.appendChild(li);
        }
        
        // Last page + ellipsis
        if (endPage < this.totalPages) {
            if (endPage < this.totalPages - 1) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.className = 'page-item disabled';
                ellipsisLi.innerHTML = '<span class="page-link">...</span>';
                ul.appendChild(ellipsisLi);
            }
            
            const lastLi = document.createElement('li');
            lastLi.className = 'page-item';
            lastLi.innerHTML = `<a class="page-link" href="#">${this.totalPages}</a>`;
            lastLi.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                this.goToPage(this.totalPages);
            });
            ul.appendChild(lastLi);
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
            nextLi.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                this.goToPage(this.currentPage + 1);
            });
        }
        ul.appendChild(nextLi);
        
        pagination.appendChild(ul);
        paginationContainer.appendChild(pagination);
    }
    
    // Go to specific page
    goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        this.refreshCurrentView();
    }
    
    // Refresh current view with pagination
    refreshCurrentView() {
        // Apply current filters and refresh display
        let filteredLeads = [...this.allLeads];
        
        // Apply current list filter
        if (this.selectedListId) {
            filteredLeads = filteredLeads.filter(lead => lead.leadList === this.selectedListId);
        }
        
        // Apply current search and status filters
        const searchInput = document.getElementById('lead-search');
        const statusFilter = document.getElementById('lead-status-filter');
        
        const filters = {
            search: searchInput?.value || '',
            status: statusFilter?.value || ''
        };
        
        this.displayLeads(filteredLeads, filters);
    }

    // Generate dynamic table headers
    generateTableHeaders(headerElement) {
        if (!headerElement) return;
        
        headerElement.innerHTML = '';
        
        // No more standard hardcoded columns - all fields are now custom
        
        // Add list-specific label columns if a list is selected
        if (this.selectedListId) {
            const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);
            if (selectedList && selectedList.labels && selectedList.labels.length > 0) {
                selectedList.labels.forEach(label => {
                    const th = document.createElement('th');
                    th.textContent = label.label;
                    headerElement.appendChild(th);
                });
            }
        } else {
            // If no specific list is selected, show all possible labels from all lists
            const allLabels = new Map();
            this.allLeadLists.forEach(list => {
                if (list.labels) {
                    list.labels.forEach(label => {
                        allLabels.set(label.name, label.label);
                    });
                }
            });
            
            // Add unique labels
            allLabels.forEach((displayLabel, fieldName) => {
                const th = document.createElement('th');
                th.textContent = displayLabel;
                headerElement.appendChild(th);
            });
        }
        
        // Add status column
        const statusTh = document.createElement('th');
        statusTh.textContent = 'Status';
        headerElement.appendChild(statusTh);
    }    // Generate lead row HTML
    generateLeadRow(lead) {
        let rowHtml = '';
        
        // Add list-specific label data
        if (this.selectedListId) {
            const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);            if (selectedList && selectedList.labels && selectedList.labels.length > 0) {                selectedList.labels.forEach(label => {
                    const value = lead.customFields?.[label.name] || '-';                    // Check if this is a phone field and format it for click-to-call
                    if (this.isPhoneField(label.name) && value && value !== '-') {
                        const formattedPhone = this.formatPhoneForCall(value);
                        const displayPhone = this.formatPhoneForDisplay(value);
                        rowHtml += `<td><span class="phone-link" data-phone="${formattedPhone}" title="Click to call with MicroSip" style="cursor: pointer; color: #0066cc; text-decoration: underline;">${displayPhone}</span></td>`;
                    } else {
                        rowHtml += `<td>${value}</td>`;
                    }
                });
            }
        } else {
            // If no specific list is selected, show all possible labels from all lists
            const allLabels = new Map();
            this.allLeadLists.forEach(list => {
                if (list.labels) {
                    list.labels.forEach(label => {
                        allLabels.set(label.name, label.label);
                    });
                }
            });            // Add data for each unique label
            allLabels.forEach((displayLabel, fieldName) => {
                const value = lead.customFields?.[fieldName] || '-';
                
                // Check if this is a phone field and format it for click-to-call
                if (this.isPhoneField(fieldName) && value && value !== '-') {
                    const formattedPhone = this.formatPhoneForCall(value);
                    const displayPhone = this.formatPhoneForDisplay(value);
                    rowHtml += `<td><span class="phone-link" data-phone="${formattedPhone}" title="Click to call with MicroSip" style="cursor: pointer; color: #0066cc; text-decoration: underline;">${displayPhone}</span></td>`;
                } else {
                    rowHtml += `<td>${value}</td>`;
                }
            });}
        
        // Add status dropdown instead of badge
        const statusOptions = [
            'new',
            'No Answer', 
            'Voice Mail',
            'Call Back Qualified',
            'Call Back NOT Qualified',
            'lead-released'
        ];
        
        let statusHtml = `
            <div class="status-dropdown-wrapper" data-bs-toggle="tooltip" data-bs-placement="top" title="Click to change status">
                <select class="form-select form-select-sm lead-status-dropdown" 
                        data-lead-id="${lead._id}"
                        title="Change lead status" 
                        aria-label="Change lead status"
                        onchange="window.leadsManager.updateLeadStatus('${lead._id}', this.value)">
                    ${statusOptions.map(option => 
                        `<option value="${option}" ${lead.status === option ? 'selected' : ''}>${this.formatStatus(option)}</option>`
                    ).join('')}
                </select>
            </div>
        `;
        
        // Add ownership indicator if lead is owned
        if (lead.assignedTo && lead.assignedTo.name) {
            statusHtml += `<br><small class="text-muted ownership-indicator mt-1">
                <i class="fas fa-user"></i> Owned by ${lead.assignedTo.name}
            </small>`;
        }
        
        rowHtml += `<td>${statusHtml}</td>`;
        
        return rowHtml;
    }// Filter leads by selected list
    filterLeadsByList() {
        let filteredLeads = [...this.allLeads];
        
        if (this.selectedListId) {
            filteredLeads = filteredLeads.filter(lead => lead.leadList === this.selectedListId);
        }
        
        // Apply other filters as well
        const searchInput = document.getElementById('lead-search');
        const statusFilter = document.getElementById('lead-status-filter');
        
        const filters = {
            search: searchInput?.value || '',
            status: statusFilter?.value || ''
        };
        
        this.displayLeads(filteredLeads, filters);
    }    // Set up lead filters
    setupLeadFilters() {
        // Clean up existing filter listeners first
        this.cleanupFilterEventListeners();
        
        const searchInput = document.getElementById('lead-search');
        const statusFilter = document.getElementById('lead-status-filter');
        const listFilter = document.getElementById('lead-list-filter');
        const resetFiltersBtn = document.getElementById('reset-filters-btn');
        
        // Populate list filter dropdown
        this.populateListFilterDropdown();
        
        // Function to apply filters
        const applyFilters = () => {
            let filteredLeads = [...this.allLeads];
              // Filter by selected list
            const selectedListId = listFilter?.value || this.selectedListId;
            if (selectedListId) {
                filteredLeads = filteredLeads.filter(lead => lead.leadList === selectedListId);
            }
            
            const filters = {
                search: searchInput?.value || '',
                status: statusFilter?.value || ''
            };
            this.displayLeads(filteredLeads, filters);
        };

        // Set up event listeners and track them
        if (searchInput) {
            searchInput.addEventListener('input', applyFilters);
            this.eventListeners.push({
                element: searchInput,
                event: 'input',
                handler: applyFilters
            });
        }
        
        if (statusFilter) {
            statusFilter.addEventListener('change', applyFilters);
            this.eventListeners.push({
                element: statusFilter,
                event: 'change',
                handler: applyFilters
            });
        }
        
        if (listFilter) {
            const listFilterHandler = (e) => {
                const listId = e.target.value || null;
                this.selectLeadList(listId);
            };
            listFilter.addEventListener('change', listFilterHandler);
            this.eventListeners.push({
                element: listFilter,
                event: 'change',
                handler: listFilterHandler
            });
        }
        
        if (resetFiltersBtn) {
            const resetHandler = () => {
                if (searchInput) searchInput.value = '';
                if (statusFilter) statusFilter.value = '';
                if (listFilter) listFilter.value = '';
                this.selectLeadList(null);
            };
            resetFiltersBtn.addEventListener('click', resetHandler);
            this.eventListeners.push({
                element: resetFiltersBtn,
                event: 'click',
                handler: resetHandler
            });
        }
    }

    // Populate list filter dropdown
    populateListFilterDropdown() {
        const listFilter = document.getElementById('lead-list-filter');
        if (!listFilter) return;

        listFilter.innerHTML = '<option value="">All Lists</option>';
        
        this.allLeadLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list._id;
            option.textContent = list.name;
            listFilter.appendChild(option);
        });    }

    // Load agents for dropdown
    async loadAgentsForDropdown() {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/users?role=agent`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch agents');
            }
            
            const agents = await response.json();
            const addDropdown = document.getElementById('lead-agent');
            const editDropdown = document.getElementById('edit-lead-agent');
            
            // Clear existing options
            if (addDropdown) {
                addDropdown.innerHTML = '<option value="">Select Agent</option>';
            }
            if (editDropdown) {
                editDropdown.innerHTML = '<option value="">Select Agent</option>';
            }
            
            // Add active agents to dropdowns
            agents.filter(agent => agent.status === 'active').forEach(agent => {
                const option = document.createElement('option');
                option.value = agent._id;
                option.textContent = agent.name;
                
                if (addDropdown) addDropdown.appendChild(option.cloneNode(true));
                if (editDropdown) editDropdown.appendChild(option);
            });
        } catch (err) {
            console.error('Error loading agents:', err);
        }
    }    // Handle adding a new lead
    async handleAddLead() {
        const form = document.getElementById('add-lead-form');
        if (!form) return;
        
        const leadData = {
            fullName: document.getElementById('lead-name')?.value || '',
            email: document.getElementById('lead-email')?.value || '',
            phone: document.getElementById('lead-phone')?.value || '',
            country: document.getElementById('lead-country')?.value || '',
            language: document.getElementById('lead-language')?.value || '',
            assignedTo: document.getElementById('lead-agent')?.value || null
        };

        // Extract custom fields
        if (window.fieldsManager) {
            leadData.customFields = window.fieldsManager.extractCustomFieldsFromForm(form);
        }

        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(leadData)
            });
            
            if (!response.ok) {
                throw new Error('Failed to add lead');
            }
            
            // Close modal and reload leads
            const modal = bootstrap.Modal.getInstance(document.getElementById('addLeadModal'));
            if (modal) modal.hide();
            
            // Clear form
            form.reset();
            
            // Reload leads
            this.loadLeads();
        } catch (err) {
            console.error('Error adding lead:', err);
            alert('Failed to add lead: ' + err.message);
        }
    }    // Open edit lead modal
    openEditLeadModal(lead) {
        // Now we'll open the lead notes modal instead of the edit modal
        this.openLeadNotesModal(lead);
    }    // Open lead notes modal
    openLeadNotesModal(lead) {
        // Reset all modal buttons to ensure proper state
        if (typeof resetModalButtons === 'function') {
            resetModalButtons();
        }
        
        // Clean up any existing modal event listeners
        this.cleanupModalEventListeners();
          var leadNoteId = document.getElementById('lead-note-id');
        var leadNoteStatus = document.getElementById('lead-note-status');
        var leadNotesContainer = document.getElementById('lead-notes-container');
        var ownLeadBtn = document.getElementById('own-lead-btn');
        var releaseLeadBtn = document.getElementById('release-lead-btn');
        var transferLeadBtn = document.getElementById('transfer-lead-btn');
        
        // Clear previous note textarea
        var noteContent = document.getElementById('lead-note-content');
        if (noteContent) {
            noteContent.value = '';
        }
        
        // Set lead ID and status
        if (leadNoteId) {
            leadNoteId.value = lead._id;
        }
        if (leadNoteStatus) {
            leadNoteStatus.value = lead.status || 'new';
        }
          // Display previous notes if any
        if (leadNotesContainer) {
            this.displayLeadNotes(lead, leadNotesContainer);
        }
          // Handle button visibility based on lead ownership
        const currentUser = this.apiManager.getCurrentUser();
        const isLeadOwned = lead.assignedTo && lead.assignedTo._id;
        const isOwnedByCurrentUser = isLeadOwned && currentUser && lead.assignedTo._id === currentUser.id;
        const isAdmin = currentUser && currentUser.role === 'admin';
        
        // Access the take over button
        var takeOverLeadBtn = document.getElementById('take-over-lead-btn');
        
        if (ownLeadBtn) {
            // Hide Own Lead button for admins or if lead is already owned
            if (isAdmin || isLeadOwned) {
                ownLeadBtn.style.display = 'none';
            } else {
                ownLeadBtn.style.display = 'inline-block';
            }
        }        // Release functionality is not available on the Leads page
        // Once a lead is owned and converted to a customer, it should only 
        // be released from the Customers page
        if (releaseLeadBtn) {
            releaseLeadBtn.style.display = 'none';
        }
        
        if (takeOverLeadBtn) {
            // Show Take Over button if lead is owned by someone else (not the current user)
            if (isLeadOwned && !isOwnedByCurrentUser && !isAdmin) {
                takeOverLeadBtn.style.display = 'inline-block';
            } else {
                takeOverLeadBtn.style.display = 'none';
            }
        }
          if (transferLeadBtn) {
            if (isAdmin) {
                transferLeadBtn.style.display = 'inline-block';
            } else {
                transferLeadBtn.style.display = 'none';
            }
        }
        
        // Handle ownership notice visibility
        const ownershipNotice = document.getElementById('lead-ownership-notice');
        const ownerNameSpan = document.getElementById('lead-owner-name');
        
        if (ownershipNotice && ownerNameSpan) {
            if (isLeadOwned && lead.assignedTo && lead.assignedTo.name) {
                // Show ownership notice with owner's name
                ownerNameSpan.textContent = lead.assignedTo.name;
                ownershipNotice.style.display = 'block';
            } else {
                // Hide ownership notice for unowned leads
                ownershipNotice.style.display = 'none';
            }
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
            const saveNoteHandler = () => {
                this.saveLeadNote(lead._id);
            };
            newSaveBtn.addEventListener('click', saveNoteHandler);
            
            // Track this event listener for cleanup
            this.eventListeners.push({
                element: newSaveBtn,
                event: 'click',
                handler: saveNoteHandler,
                type: 'modal'
            });        }

        // Release lead functionality is not available on the Leads page
        // Lead release is handled from the Customers page only

        // Add event listener to the transfer lead button
        if (transferLeadBtn) {
            // Remove any existing event listeners to prevent duplicates
            var newTransferBtn = transferLeadBtn.cloneNode(true);
            transferLeadBtn.parentNode.replaceChild(newTransferBtn, transferLeadBtn);
            
            // Add new event listener
            const transferLeadHandler = () => {
                this.showTransferLeadModal(lead._id);
            };
            newTransferBtn.addEventListener('click', transferLeadHandler);
            
            // Track this event listener for cleanup
            this.eventListeners.push({
                element: newTransferBtn,
                event: 'click',
                handler: transferLeadHandler,
                type: 'modal'
            });
        }
        
        // Add event listener to the take over lead button
        var takeOverLeadBtn = document.getElementById('take-over-lead-btn');
        if (takeOverLeadBtn) {
            // Remove any existing event listeners to prevent duplicates
            var newTakeOverBtn = takeOverLeadBtn.cloneNode(true);
            takeOverLeadBtn.parentNode.replaceChild(newTakeOverBtn, takeOverLeadBtn);
            
            // Add new event listener
            const takeOverLeadHandler = () => {
                this.takeOverLead(lead._id);
            };
            newTakeOverBtn.addEventListener('click', takeOverLeadHandler);
            
            // Track this event listener for cleanup
            this.eventListeners.push({
                element: newTakeOverBtn,
                event: 'click',
                handler: takeOverLeadHandler,
                type: 'modal'
            });
        }
          // Add event listener to the own lead button
        if (ownLeadBtn) {
            // Remove any existing event listeners to prevent duplicates
            var newOwnBtn = ownLeadBtn.cloneNode(true);
            ownLeadBtn.parentNode.replaceChild(newOwnBtn, ownLeadBtn);
            
            // Add new event listener
            const ownLeadHandler = () => {
                this.ownLead(lead._id);
            };
            newOwnBtn.addEventListener('click', ownLeadHandler);
            
            // Track this event listener for cleanup
            this.eventListeners.push({
                element: newOwnBtn,
                event: 'click',
                handler: ownLeadHandler,
                type: 'modal'
            });
        }
    }

    // Display lead notes
    displayLeadNotes(lead, container) {
        if (!container) return;
        
        container.innerHTML = '';
        
        if (!lead.notes || lead.notes.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-2">No notes yet</div>';
            return;
        }
          // Sort notes by newest first
        const sortedNotes = [...lead.notes].sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
        );
        
        // Get current user for ID comparison
        const currentUser = this.apiManager.getCurrentUser();
        
        // Create note elements
        sortedNotes.forEach(note => {
            const noteDate = new Date(note.createdAt).toLocaleString();
            // Fix for accessing user name properly - check both object formats
            let userName = 'Unknown User';
            if (note.createdBy) {
                if (typeof note.createdBy === 'object' && note.createdBy.name) {
                    userName = note.createdBy.name;
                } else if (typeof note.createdBy === 'string') {
                    // If only ID is present without population, get current user if it matches
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
      // Save lead note
    async saveLeadNote(leadId) {
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
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/${leadId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            if (!response.ok) {
                throw new Error('Failed to update lead');
            }
            
            // Close modal and reload leads
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload leads
            this.loadLeads();
              // Show success message
            const message = noteContent ? 'Note added successfully' : 'Status updated successfully';
            this.apiManager.showAlert(message, 'success');
            
        } catch (err) {
            console.error('Error updating lead:', err);
            this.apiManager.showAlert('Failed to update lead: ' + err.message, 'danger');
        }
    }    // Own Lead - Transfer a lead to the agent's personal customer list
    async ownLead(leadId) {
        try {
            // Check if there's unsaved note content in the modal
            const noteContent = document.getElementById('lead-note-content')?.value?.trim();
            const noteStatus = document.getElementById('lead-note-status')?.value;
            
            // If there's note content, save it first before owning the lead
            if (noteContent) {
                await this.saveLeadNote(leadId);
                // Small delay to ensure the note is saved before proceeding
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/${leadId}/own`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to own lead');
            }
            
            const result = await response.json();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload leads to reflect the changes
            await this.loadLeads();
            
            // Show success message
            this.apiManager.showAlert('Lead successfully owned and customer record created', 'success');
            
        } catch (err) {
            console.error('Error claiming lead:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }    // Release Lead - Give back an owned lead to the general pool
    async releaseLead(leadId) {
        try {
            // Check if there's unsaved note content in the modal
            const noteContent = document.getElementById('lead-note-content')?.value?.trim();
            const noteStatus = document.getElementById('lead-note-status')?.value;
            
            // If there's note content, save it first before releasing the lead
            if (noteContent) {
                await this.saveLeadNote(leadId);
                // Small delay to ensure the note is saved before proceeding
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/${leadId}/release`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to release lead');
            }
            
            const result = await response.json();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload leads to reflect the changes
            await this.loadLeads();
            
            // Show success message
            this.apiManager.showAlert('Lead successfully released back to general pool', 'success');
            
        } catch (err) {
            console.error('Error releasing lead:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }    }

    // Take Over Lead - Allow agents to take ownership of leads owned by other agents
    async takeOverLead(leadId) {
        try {
            // Check if there's unsaved note content in the modal
            const noteContent = document.getElementById('lead-note-content')?.value?.trim();
            const noteStatus = document.getElementById('lead-note-status')?.value;
            
            // If there's note content, save it first before taking over the lead
            if (noteContent) {
                await this.saveLeadNote(leadId);
                // Small delay to ensure the note is saved before proceeding
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/${leadId}/take-over`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error('Failed to take over lead');
            }
            
            const result = await response.json();
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (modal) modal.hide();
            
            // Reload leads to reflect the changes
            await this.loadLeads();
            
            // Show success message
            this.apiManager.showAlert('Lead successfully taken over', 'success');
            
        } catch (err) {
            console.error('Error taking over lead:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }

    // Show Transfer Lead Modal - Admin only functionality
    async showTransferLeadModal(leadId) {
        try {
            // Load all lead lists for the dropdown
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/lead-lists`);
            if (!response.ok) {
                throw new Error('Failed to load lead lists');
            }
            
            const leadLists = await response.json();
            
            // Create modal HTML
            const modalHtml = `
                <div class="modal fade" id="transferLeadModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">Transfer Lead to List</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label for="transfer-target-list" class="form-label">Select Target List</label>
                                    <select class="form-select" id="transfer-target-list" required>
                                        <option value="">Choose a list...</option>
                                        ${leadLists.map(list => `
                                            <option value="${list._id}">${list.name}</option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div class="alert alert-info">
                                    <small>This will move the lead to the selected list and add a note about the transfer.</small>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                                <button type="button" class="btn btn-primary" onclick="window.leadsManager.transferLead('${leadId}')">Transfer Lead</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Remove existing modal if present
            const existingModal = document.getElementById('transferLeadModal');
            if (existingModal) {
                existingModal.remove();
            }

            // Add modal to body
            document.body.insertAdjacentHTML('beforeend', modalHtml);

            // Show modal
            const modal = new bootstrap.Modal(document.getElementById('transferLeadModal'));
            modal.show();
            
        } catch (err) {
            console.error('Error showing transfer modal:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }

    // Transfer Lead - Admin only functionality
    async transferLead(leadId) {
        const targetListSelect = document.getElementById('transfer-target-list');
        const targetListId = targetListSelect?.value;
        
        if (!targetListId) {
            alert('Please select a target list');
            return;
        }
        
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/${leadId}/transfer`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ targetListId })
            });
            
            if (!response.ok) {
                throw new Error('Failed to transfer lead');
            }
            
            const result = await response.json();
            
            // Close transfer modal
            const transferModal = bootstrap.Modal.getInstance(document.getElementById('transferLeadModal'));
            if (transferModal) transferModal.hide();
            
            // Close lead notes modal
            const notesModal = bootstrap.Modal.getInstance(document.getElementById('leadNotesModal'));
            if (notesModal) notesModal.hide();
            
            // Reload leads to reflect the changes
            await this.loadLeads();
            
            // Show success message
            this.apiManager.showAlert(result.message, 'success');
            
        } catch (err) {
            console.error('Error transferring lead:', err);
            this.apiManager.showAlert(`Error: ${err.message}`, 'danger');
        }
    }

    // Populate custom fields in edit form
    populateCustomFieldsInEditForm(lead) {
        const container = document.getElementById('edit-lead-custom-fields');
        if (!container || !window.fieldsManager) return;

        // Clear existing custom fields
        container.innerHTML = '';

        // Render custom fields with lead data
        window.fieldsManager.renderCustomFieldsInForm(container, lead);
    }    // Populate custom fields in add form
    populateCustomFieldsInAddForm() {
        const container = document.getElementById('add-lead-custom-fields');
        if (!container || !window.fieldsManager) return;

        // Clear existing custom fields
        container.innerHTML = '';

        // Render empty custom fields
        window.fieldsManager.renderCustomFieldsInForm(container);
    }

    // Initialize forms with custom fields
    initializeCustomFields() {
        // Populate add form
        this.populateCustomFieldsInAddForm();
    }    // Handle updating a lead
    async handleUpdateLead() {
        const form = document.getElementById('edit-lead-form');
        if (!form) return;

        const leadId = document.getElementById('edit-lead-id')?.value;
        const leadData = {
            fullName: document.getElementById('edit-lead-name')?.value || '',
            email: document.getElementById('edit-lead-email')?.value || '',
            phone: document.getElementById('edit-lead-phone')?.value || '',
            status: document.getElementById('edit-lead-status')?.value || '',
            assignedTo: document.getElementById('edit-lead-agent')?.value || null
        };

        // Extract custom fields
        if (window.fieldsManager) {
            leadData.customFields = window.fieldsManager.extractCustomFieldsFromForm(form);
        }

        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/${leadId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(leadData)
            });
            
            if (!response.ok) {
                throw new Error('Failed to update lead');
            }
            
            // Close modal and reload leads
            const modal = bootstrap.Modal.getInstance(document.getElementById('editLeadModal'));
            if (modal) modal.hide();
            
            // Reload leads
            this.loadLeads();
        } catch (err) {
            console.error('Error updating lead:', err);
            alert('Failed to update lead: ' + err.message);
        }
    }    // Format lead status
    formatStatus(status) {
        if (!status) return '-';
        // For new status values that already have proper formatting, return as-is
        if (status.includes(' ') || status === 'new') {
            return status.charAt(0).toUpperCase() + status.slice(1);
        }
        // For legacy hyphenated statuses, convert hyphens to spaces and capitalize
        return status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Open edit list modal
    openEditListModal(list) {
        // Create and show edit modal
        const modalHtml = `
            <div class="modal fade" id="editListModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Edit Lead List</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <form id="edit-list-form">
                                <div class="mb-3">
                                    <label for="edit-list-name" class="form-label">List Name</label>
                                    <input type="text" class="form-control" id="edit-list-name" value="${list.name}" required>
                                </div>                                <div class="mb-3">
                                    <label for="edit-list-description" class="form-label">Description</label>
                                    <textarea class="form-control" id="edit-list-description" rows="3">${list.description || ''}</textarea>
                                </div>
                                <div class="mb-3">
                                    <div class="form-check">
                                        <input class="form-check-input" type="checkbox" id="edit-list-visible" ${list.isVisibleToUsers !== false ? 'checked' : ''}>
                                        <label class="form-check-label" for="edit-list-visible">
                                            <strong>Visible to Agents</strong>
                                        </label>
                                        <div class="form-text">When unchecked, only admins can see this list. Agents will not see it in their lead list selection.</div>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">Custom Labels</label>
                                    <div id="edit-labels-container"></div>
                                    <button type="button" class="btn btn-sm btn-outline-primary" onclick="window.leadsManager.addEditLabelField()">
                                        <i class="bi bi-plus"></i> Add Label
                                    </button>
                                </div>
                            </form>                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-danger me-auto" onclick="window.leadsManager.confirmDeleteList('${list._id}', '${list.name}')">
                                <i class="bi bi-trash me-1"></i>Delete List
                            </button>
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-primary" onclick="window.leadsManager.handleEditList('${list._id}')">Save Changes</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Remove existing modal if present
        const existingModal = document.getElementById('editListModal');
        if (existingModal) {
            existingModal.remove();
        }

        // Add modal to body
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // Populate existing labels
        this.populateEditLabels(list.labels || []);

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('editListModal'));
        modal.show();
    }

    // Populate edit labels
    populateEditLabels(labels) {
        const container = document.getElementById('edit-labels-container');
        if (!container) return;

        container.innerHTML = '';
        
        labels.forEach((label, index) => {
            this.addEditLabelField(label, index);
        });
    }

    // Add edit label field
    addEditLabelField(existingLabel = null, index = null) {
        const container = document.getElementById('edit-labels-container');
        if (!container) return;

        const labelIndex = index !== null ? index : container.children.length;
        const labelDiv = document.createElement('div');
        labelDiv.className = 'label-field mb-2';
        labelDiv.innerHTML = `
            <div class="row g-2 align-items-center">
                <div class="col-5">
                    <input type="text" class="form-control form-control-sm" 
                           placeholder="Field name (e.g., company)" 
                           value="${existingLabel?.name || ''}"
                           name="edit-label-name-${labelIndex}">
                </div>
                <div class="col-5">
                    <input type="text" class="form-control form-control-sm" 
                           placeholder="Display label (e.g., Company)" 
                           value="${existingLabel?.label || ''}"
                           name="edit-label-display-${labelIndex}">
                </div>
                <div class="col-2">
                    <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.parentElement.parentElement.parentElement.remove()">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        `;
        container.appendChild(labelDiv);
    }    // Handle edit list
    async handleEditList(listId) {
        const form = document.getElementById('edit-list-form');
        if (!form) return;

        const name = document.getElementById('edit-list-name')?.value?.trim();
        const description = document.getElementById('edit-list-description')?.value?.trim();
        const isVisibleToUsers = document.getElementById('edit-list-visible')?.checked || false;

        if (!name) {
            alert('Please enter a list name');
            return;
        }

        // Collect labels
        const labels = [];
        const labelFields = document.querySelectorAll('#edit-labels-container .label-field');
        
        labelFields.forEach((field, index) => {
            const nameInput = field.querySelector(`[name="edit-label-name-${index}"]`);
            const displayInput = field.querySelector(`[name="edit-label-display-${index}"]`);
            
            if (nameInput && displayInput && nameInput.value.trim() && displayInput.value.trim()) {
                labels.push({
                    name: nameInput.value.trim(),
                    label: displayInput.value.trim(),
                    type: 'text'
                });
            }
        });

        const listData = {
            name,
            description,
            labels,
            isVisibleToUsers
        };

        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/lead-lists/${listId}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(listData)
            });

            if (!response.ok) {
                throw new Error('Failed to update lead list');
            }

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editListModal'));
            if (modal) modal.hide();            // Reload data
            await this.loadLeadLists();
            this.displayLeadListCards();
            
            // Refresh table if the edited list is currently selected
            if (this.selectedListId === listId) {
                this.filterLeadsByList();
            }

            alert('Lead list updated successfully!');
        } catch (err) {
            console.error('Error updating lead list:', err);
            alert('Failed to update lead list: ' + err.message);
        }
    }    // Confirm delete list
    confirmDeleteList(listId, listName) {
        const message = `Are you sure you want to delete "${listName}"?\n\nThis will permanently delete the list and all associated leads. This action cannot be undone.`;

        if (confirm(message)) {
            this.deleteList(listId);
        }
    }

    // Delete list
    async deleteList(listId) {
        try {
            // Always use hard delete to ensure complete cleanup
            const url = `${this.apiManager.API_URL}/lead-lists/${listId}?hard=true`;

            const response = await this.apiManager.authenticatedFetch(url, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete lead list');
            }

            // Reload data
            await this.loadLeadLists();
            await this.loadLeads();
            
            // Reset selection if deleted list was selected
            if (this.selectedListId === listId) {
                this.selectLeadList(null);
            }

            alert('Lead list deleted successfully!');
        } catch (err) {
            console.error('Error deleting lead list:', err);
            alert('Failed to delete lead list: ' + err.message);
        }
    }    // Refresh lead list card counts
    refreshLeadListCards() {
        const cardsContainer = document.getElementById('lead-lists-cards');
        if (!cardsContainer) return;

        // Update lead counts for existing cards
        const cards = cardsContainer.querySelectorAll('.lead-list-card');
        cards.forEach(card => {
            const listId = card.dataset.listId;
            const leadCountBadge = card.querySelector('.lead-count-badge');
            
            if (leadCountBadge) {
                if (listId === '') {
                    // "All Lists" card
                    leadCountBadge.textContent = `${this.allLeads.length} leads`;
                } else {
                    // Individual list card
                    const leadCount = this.allLeads.filter(lead => lead.leadList === listId).length;
                    leadCountBadge.textContent = `${leadCount} leads`;
                }
            }
        });
    }    // Update lead status from dropdown
    async updateLeadStatus(leadId, newStatus) {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/${leadId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: newStatus })
            });
            
            if (!response.ok) {
                throw new Error('Failed to update lead status');
            }
            
            // Update the lead in our local array
            const leadIndex = this.allLeads.findIndex(lead => lead._id === leadId);
            if (leadIndex !== -1) {
                this.allLeads[leadIndex].status = newStatus;
            }            // Visual feedback - briefly highlight the dropdown with classes
            const dropdown = document.querySelector(`[data-lead-id="${leadId}"]`);
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
            console.error('Error updating lead status:', err);
            this.apiManager.showAlert(`Error updating status: ${err.message}`, 'danger');
            
            // Revert the dropdown to the previous value
            const dropdown = document.querySelector(`[data-lead-id="${leadId}"]`);
            if (dropdown) {
                const lead = this.allLeads.find(l => l._id === leadId);
                if (lead) {
                    dropdown.value = lead.status;
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
                        <i class="bi bi-check-circle me-2"></i> Status updated to "${this.formatStatus(status)}"
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
        document.querySelectorAll('.lead-status-dropdown').forEach(dropdown => {
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
    }

    // Clean up card event listeners
    cleanupCardEventListeners() {
        // Remove event listeners that are specific to cards
        this.eventListeners = this.eventListeners.filter(listener => {
            const isCardListener = listener.element.classList?.contains('lead-list-card') ||
                                 listener.element.classList?.contains('edit-list-btn') ||
                                 listener.element.classList?.contains('delete-list-btn');
            
            if (isCardListener) {
                listener.element.removeEventListener(listener.event, listener.handler);
                return false; // Remove from tracking array
            }
            return true; // Keep in tracking array
        });
    }    // Clean up row event listeners
    cleanupRowEventListeners() {
        // Remove event listeners that are specific to table rows
        this.eventListeners = this.eventListeners.filter(listener => {
            const isRowListener = listener.element.tagName === 'TR';
            
            if (isRowListener) {
                listener.element.removeEventListener(listener.event, listener.handler);
                return false; // Remove from tracking array
            }
            return true; // Keep in tracking array
        });
    }    // Clean up filter event listeners
    cleanupFilterEventListeners() {
        // Remove event listeners that are specific to filter elements
        this.eventListeners = this.eventListeners.filter(listener => {
            const isFilterListener = listener.element.id === 'lead-search' ||
                                   listener.element.id === 'lead-status-filter' ||
                                   listener.element.id === 'lead-list-filter' ||
                                   listener.element.id === 'reset-filters-btn';
            
            if (isFilterListener) {
                listener.element.removeEventListener(listener.event, listener.handler);
                return false; // Remove from tracking array
            }
            return true; // Keep in tracking array
        });
    }    // Clean up modal event listeners
    cleanupModalEventListeners() {
        // Remove event listeners that are specific to modal elements
        this.eventListeners = this.eventListeners.filter(listener => {
            const isModalListener = listener.type === 'modal' ||
                                   listener.element.id === 'save-lead-note-btn' ||
                                   listener.element.id === 'own-lead-btn' ||
                                   listener.element.id === 'release-lead-btn' ||
                                   listener.element.id === 'transfer-lead-btn';
            
            if (isModalListener) {
                listener.element.removeEventListener(listener.event, listener.handler);
                return false; // Remove from tracking array
            }
            return true; // Keep in tracking array
        });
    }

    // Clean up all event listeners
    cleanup() {
        this.eventListeners.forEach(listener => {
            listener.element.removeEventListener(listener.event, listener.handler);
        });
        this.eventListeners = [];
        this.filterListenersSetup = false;
    }    // Start auto-refresh
    startAutoRefresh() {
        // Clear any existing interval
        this.stopAutoRefresh();
        
        // Always enable auto-refresh when this method is called
        this.autoRefreshEnabled = true;
        
        this.autoRefreshInterval = setInterval(async () => {
            // Only refresh if the leads page is active
            if (this.isLeadsPageActive) {
                await this.refreshLeadsData();
            }
        }, this.refreshIntervalMs);
        
        console.log('Auto-refresh started for leads (5 second interval)');
    }

    // Stop auto-refresh
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            this.autoRefreshEnabled = false;
            console.log('Auto-refresh stopped for leads');
        }
    }    // Set leads page active state
    setPageActive(isActive) {
        this.isLeadsPageActive = isActive;
        
        if (isActive) {
            this.startAutoRefresh();
        } else {
            this.stopAutoRefresh();
        }
    }

    // Check if a field is a phone field (for click-to-call)
    isPhoneField(fieldName) {
        return fieldName && (
            fieldName.toLowerCase().includes('phone') || 
            fieldName.toLowerCase().includes('tel') || 
            fieldName.toLowerCase().includes('mobile') || 
            fieldName.toLowerCase().includes('cell')
        );
    }    // Format phone number for SIP calling
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

// Create global instance
window.leadsManager = new LeadsManager(window.apiManager);

// Add page cleanup on beforeunload to prevent memory leaks
window.addEventListener('beforeunload', () => {
    if (window.leadsManager) {
        window.leadsManager.cleanup();
    }
});

// Also cleanup when navigating between pages in SPA
document.addEventListener('page:before-change', () => {
    if (window.leadsManager) {
        window.leadsManager.cleanup();
    }
});

// Detect when page visibility changes (tab switching, window minimizing, etc.)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Page became visible - check if leads page is currently active
        const leadsPage = document.getElementById('leads-page');
        const isLeadsPageVisible = leadsPage && leadsPage.style.display !== 'none';
        
        if (isLeadsPageVisible && window.leadsManager) {
            // Restart auto-refresh for leads page
            window.leadsManager.setPageActive(true);
        }
    } else {
        // Page became hidden - stop auto-refresh to save resources
        if (window.leadsManager) {
            window.leadsManager.setPageActive(false);
        }
    }
});

// Also handle window focus/blur events for better responsiveness
window.addEventListener('focus', () => {
    // Window gained focus - check if leads page is active
    const leadsPage = document.getElementById('leads-page');
    const isLeadsPageVisible = leadsPage && leadsPage.style.display !== 'none';
    
    if (isLeadsPageVisible && window.leadsManager) {
        window.leadsManager.setPageActive(true);
    }
});

window.addEventListener('blur', () => {
    // Window lost focus - pause auto-refresh
    if (window.leadsManager) {
        window.leadsManager.setPageActive(false);
    }
});
