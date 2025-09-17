// Leads.js - Handles lead management functionality
class LeadsManager {
    // Apply status color classes to all status dropdowns and options
    applyStatusColors() {
        // Statuses and their corresponding CSS classes
        const statusClassMap = {
            'New': 'status-new',
            'No Answer': 'status-no-answer',
            'Hang Up': 'status-hang-up',
            'Voice Mail': 'status-voice-mail',
            'Wrong Number': 'status-wrong-number',
            'Call Back Qualified': 'status-call-back-qualified',
            'Never Invested': 'status-never-invested',
            'Not Interested': 'status-not-interested'
        };
        const allStatusClasses = Object.values(statusClassMap);

        // For each status dropdown
        document.querySelectorAll('.lead-status-dropdown').forEach(select => {
            // Remove all status classes from the select
            select.classList.remove(...allStatusClasses);
            // Add the class for the selected status
            const status = select.value;
            if (statusClassMap[status]) {
                select.classList.add(statusClassMap[status]);
            }
            // Make bold
            select.style.fontWeight = 'bold';

            // For each option, apply the color class
            Array.from(select.options).forEach(option => {
                // Remove all status classes
                option.classList.remove(...allStatusClasses);
                // Add the class for this option's status
                if (statusClassMap[option.value]) {
                    option.classList.add(statusClassMap[option.value]);
                }
                // Make bold
                option.style.fontWeight = 'bold';
            });
        });
    }
    constructor(apiManager) {
        this.apiManager = apiManager;
        this.allLeadLists = [];
        this.selectedListId = null;
        this.eventListeners = []; // Track event listeners for cleanup
        this.filterListenersSetup = false; // Track if filter listeners are already set up
        // Guard used during state restore to avoid wiping restored UI
        this.restoringLeadsState = false;
        // Auto-refresh properties
        this.autoRefreshInterval = null;
        this.autoRefreshEnabled = false;
        this.refreshIntervalMs = 10000; // 10 seconds
        this.isLeadsPageActive = false;
        this.useOptimizedRefresh = true; // Use optimized refresh by default
        // Pagination properties - now for server-side pagination
        this.currentPage = 1;
        this.leadsPerPage = 100; // Default batch size for leads
        this.listsCurrentPage = 1;
        this.listsPerPage = 8; // Show 8 lead lists per page
        this.listsTotalPages = 1;
        this.currentLeads = []; // Current page leads from server
        this.currentFilters = {}; // Track current search/status filters
        // Sorting

        // Cache countries per listId to avoid repeated full-list scans
        this.countriesCache = {};
    }

    // Load leads




    // Add this helper method to your class:
    async renderMeetingsForLead(lead) {
        const meetingsContainerId = 'lead-meetings-container';
        let meetingsContainer = document.getElementById(meetingsContainerId);
        if (!meetingsContainer) return;
        meetingsContainer.innerHTML = '<div class="text-muted">Loading meetings...</div>';
        try {
            const resp = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/meetings/for-lead/${lead._id}`);
            if (!resp.ok) throw new Error('Failed to fetch meetings');
            let meetings = await resp.json();
            if (!meetings.length) {
                meetingsContainer.innerHTML = '<div class="text-muted">No meetings for this lead.</div>';
            } else {
                meetings = meetings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                meetingsContainer.innerHTML = `
<div class="mb-2 fw-bold">Meetings for this Lead:</div>
<div class="border rounded p-2 bg-light" style="max-height: 200px; overflow-y: auto;">
    ${meetings.map(m => {
                    let createdDate = m.createdAt ? new Date(m.createdAt).toLocaleString('en-GB') : '';
                    let creatorName = 'Unknown User';
                    if (m.createdBy) {
                        if (typeof m.createdBy === 'object' && m.createdBy.name) {
                            creatorName = m.createdBy.name;
                        } else if (typeof m.createdBy === 'string') {
                            creatorName = m.createdBy;
                        }
                    } else if (m.userName) {
                        creatorName = m.userName;
                    }
                    let meetingDateTime = '';
                    if (m.date && m.time) {
                        const dateObj = new Date(`${m.date}T${m.time}`);
                        meetingDateTime = dateObj.toLocaleString('en-GB');
                    } else if (m.date) {
                        meetingDateTime = new Date(m.date).toLocaleDateString('en-GB');
                    }
                    return `
            <div class="note-item mb-2 border-bottom pb-2">
                <div class="text-secondary small">${createdDate} - <strong>${creatorName}</strong></div>
                <div><strong>${m.title || ''}</strong>${meetingDateTime ? ` <span class='ms-2'>${meetingDateTime}</span>` : ''}</div>
                <div>${m.notes || ''}</div>
            </div>
        `;
                }).join('')}
</div>
`;
            }
        } catch {
            meetingsContainer.innerHTML = '<div class="text-danger">Failed to load meetings.</div>';
        }
    }


    async loadLeads() {
        try {
            // Load custom fields first
            await this.loadCustomFields();

            // Load lead lists for cards display
            await this.loadLeadLists();

            // Update lead list counts
            await this.updateLeadListCounts();

            // Restore saved leads page state (selected list + filters) so countries are populated
            // if the user had a previously selected list in localStorage.
            await this.restoreLeadsPageState();

            // Do NOT auto-select a list on initial load

            this.displayLeadListCards(true);

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
    }    // Update lead counts for each list (efficient single API call)


    // Save current state (call before leaving Leads page)
    saveLeadsPageState() {
        const state = {
            selectedListId: this.selectedListId,
            currentPage: this.currentPage,
            currentFilters: this.currentFilters
        };
        localStorage.setItem('leadsPageState', JSON.stringify(state));
    }

    // Restore state (call when entering Leads page)
    async restoreLeadsPageState() {

        this.restoringLeadsState = true;
        const stateStr = localStorage.getItem('leadsPageState');
        if (!stateStr) {
            // No saved state, just load as usual
            await this.refreshCurrentView();
            this.restoringLeadsState = false;
            await this.refreshCurrentView();
            return;
        }
        try {
            const state = JSON.parse(stateStr);
            if (state.selectedListId) this.selectedListId = state.selectedListId;
            if (state.currentPage) this.currentPage = state.currentPage;
            if (state.currentFilters) this.currentFilters = state.currentFilters;

            // Ensure country container exists (setup may not have run yet during full reload)
            let wrapper = document.getElementById('lead-country-filter-container');
            if (!wrapper) {
                const dropdownMenu = document.querySelector('#lead-country-filter-col .dropdown-menu');
                if (dropdownMenu) {
                    wrapper = document.createElement('div');
                    wrapper.id = 'lead-country-filter-container';
                    // keep same inline scrolling behaviour used elsewhere
                    wrapper.style.maxHeight = '240px';
                    wrapper.style.overflowY = 'auto';
                    // insert at top of dropdown menu so Clear/Apply remain after it
                    dropdownMenu.insertBefore(wrapper, dropdownMenu.firstChild);
                }
            }

            // Populate countries for the saved/selected list so the Countries filter is ready
            if (this.selectedListId && wrapper) {
                try {
                    await this.populateCountryChecklistFromListId(this.selectedListId);
                } catch (err) {
                    console.warn('populateCountryChecklistFromListId failed during restore:', err);
                }
            }

            await this.refreshCurrentView();
            this.restoringLeadsState = false;
        } catch (e) {
            this.restoringLeadsState = false;
            await this.refreshCurrentView();
        }
    }


    //sorting function
    sortLeads() {
        if (!this.sortField) return;
        this.currentLeads.sort((a, b) => {
            let aValue = a.customFields?.[this.sortField] ?? '';
            let bValue = b.customFields?.[this.sortField] ?? '';
            // Fallback for main fields
            if (aValue === '' && a[this.sortField] !== undefined) aValue = a[this.sortField];
            if (bValue === '' && b[this.sortField] !== undefined) bValue = b[this.sortField];
            // Compare as strings (case-insensitive)
            aValue = (aValue ?? '').toString().toLowerCase();
            bValue = (bValue ?? '').toString().toLowerCase();
            if (aValue < bValue) return this.sortOrder === 'asc' ? -1 : 1;
            if (aValue > bValue) return this.sortOrder === 'asc' ? 1 : -1;
            return 0;
        });
    }

    async updateLeadListCounts() {
        try {
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/leads/counts`); if (response.ok) {
                const counts = await response.json();

                console.log(`[FRONTEND DEBUG] Received counts:`, counts);
                console.log(`[FRONTEND DEBUG] Current allLeadLists:`, this.allLeadLists.map(l => ({ id: l._id, name: l.name })));

                // Update each list with its count
                counts.forEach(countInfo => {
                    console.log(`[FRONTEND DEBUG] Processing count for listId: ${countInfo.listId}, count: ${countInfo.count}`);
                    const list = this.allLeadLists.find(l => l._id === countInfo.listId);
                    if (list) {
                        console.log(`[FRONTEND DEBUG] Found matching list: ${list.name}, updating count to ${countInfo.count}`);
                        list.leadCount = countInfo.count;
                    } else {
                        console.log(`[FRONTEND DEBUG] No matching list found for listId: ${countInfo.listId}`);
                    }
                });

                console.log(`[FRONTEND] Updated counts for ${counts.length} lead lists in single request`);
            } else {
                console.error('Failed to fetch lead counts');
                // Fallback: set all counts to 0
                this.allLeadLists.forEach(list => {
                    list.leadCount = 0;
                });
            }
        } catch (err) {
            console.error('Error fetching lead counts:', err);
            // Fallback: set all counts to 0
            this.allLeadLists.forEach(list => {
                list.leadCount = 0;
            });
        }
    }    // Refresh leads data only (without reinitializing UI components)
    async refreshLeadsData() {
        try {
            // Fetch fresh lead lists data to pick up visibility changes
            await this.loadLeadLists();

            // Update lead list counts BEFORE displaying cards
            await this.updateLeadListCounts();

            // Fetch fresh leads data for current page and filters
            const result = await this.fetchLeads(this.currentPage, this.leadsPerPage, this.currentFilters);
            this.currentLeads = result.leads;
            this.totalPages = result.pagination.totalPages;
            this.totalCount = result.pagination.totalCount;

            // Update lead list cards to reflect any visibility changes and updated counts
            this.displayLeadListCards(true);
            // Check if currently selected list is still visible to current user
            if (this.selectedListId) {
                const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);
                if (!selectedList) {
                    // Selected list is no longer visible, select first available list
                    if (this.allLeadLists.length > 0) {
                        this.selectLeadList(this.allLeadLists[0]._id);
                    } else {
                        this.selectedListId = null;
                    }
                    return; // selectLeadList will handle the display update
                }
            }

            // Re-display leads with current page            this.displayLeads(this.currentLeads);

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
                // Update total pages for lead lists
                this.listsTotalPages = Math.max(1, Math.ceil(this.allLeadLists.length / this.listsPerPage));
                // Clamp current page if needed
                if (this.listsCurrentPage > this.listsTotalPages) {
                    this.listsCurrentPage = this.listsTotalPages;
                }
            } else {
                this.allLeadLists = [];
                this.listsTotalPages = 1;
            }
        } catch (err) {
            console.error('Error loading lead lists:', err);
            this.allLeadLists = [];
            this.listsTotalPages = 1;
        }
    }
    displayLeadListCards(preventAutoSelect = false) {
        const cardsContainer = document.getElementById('lead-lists-cards');
        if (!cardsContainer) return;

        // Clean up existing event listeners
        this.cleanupCardEventListeners();

        cardsContainer.innerHTML = '';

        // If no lists are available, show a message
        if (this.allLeadLists.length === 0) {
            cardsContainer.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="bi bi-list-ul fs-1"></i>
                    <p class="mt-2">No lead lists available</p>
                    <small>Contact your administrator to create lead lists</small>
                </div>
            `;
            // Also clear pagination
            this.renderLeadListPagination();
            return;
        }
        // Paginate lead lists
        const startIdx = (this.listsCurrentPage - 1) * this.listsPerPage;
        const endIdx = Math.min(startIdx + this.listsPerPage, this.allLeadLists.length);
        const listsToShow = this.allLeadLists.slice(startIdx, endIdx);
        listsToShow.forEach(list => {
            const leadCount = list.leadCount || 0;
            const card = this.createLeadListCard({
                ...list,
                leadCount
            }, this.selectedListId === list._id);
            cardsContainer.appendChild(card);
        });

        // Render pagination controls for lead lists
        this.renderLeadListPagination();

        // Auto-select first list if none is selected (but not during refresh)
        if (!preventAutoSelect && !this.selectedListId && this.allLeadLists.length > 0) {
            this.selectLeadList(this.allLeadLists[0]._id);
        }
    }

    // Render pagination controls for lead lists
    renderLeadListPagination() {
        let container = document.getElementById('lead-lists-pagination');
        if (!container) return;
        container.innerHTML = '';
        if (this.listsTotalPages <= 1) return;

        const nav = document.createElement('nav');
        nav.setAttribute('aria-label', 'Lead lists pagination');
        const ul = document.createElement('ul');
        ul.className = 'pagination pagination-sm mb-0';

        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${this.listsCurrentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a>`;
        if (this.listsCurrentPage > 1) {
            prevLi.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                this.goToLeadListPage(this.listsCurrentPage - 1);
            });
        }
        ul.appendChild(prevLi);

        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.listsCurrentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(this.listsTotalPages, startPage + maxVisiblePages - 1);
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }
        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === this.listsCurrentPage ? 'active' : ''}`;
            li.innerHTML = `<a class="page-link" href="#">${i}</a>`;
            if (i !== this.listsCurrentPage) {
                li.querySelector('a').addEventListener('click', (e) => {
                    e.preventDefault();
                    this.goToLeadListPage(i);
                });
            }
            ul.appendChild(li);
        }

        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${this.listsCurrentPage === this.listsTotalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" aria-label="Next"><span aria-hidden="true">&raquo;</span></a>`;
        if (this.listsCurrentPage < this.listsTotalPages) {
            nextLi.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                this.goToLeadListPage(this.listsCurrentPage + 1);
            });
        }
        ul.appendChild(nextLi);
        nav.appendChild(ul);
        container.appendChild(nav);
    }

    // Go to a specific page of lead lists
    goToLeadListPage(page) {
        if (page < 1 || page > this.listsTotalPages) return;
        this.listsCurrentPage = page;
        this.displayLeadListCards(true);
    }
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

        return card;
    }

    // Select lead list for filtering
    async selectLeadList(listId) {
        this.selectedListId = listId;

        // Update card selection visual state
        document.querySelectorAll('.lead-list-card').forEach(card => {
            card.classList.remove('selected');
        });

        const selectedCard = document.querySelector(`[data-list-id="${listId || ''}"]`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
        }

        // Reset to first page when changing list
        this.currentPage = 1;

        // Update current filters to include the new list
        this.currentFilters = {
            ...this.currentFilters,
            listId: listId
        };

        // Fetch leads for the selected list
        await this.refreshCurrentView();

        // Populate the country checklist using a full-list scan (server-side, cached)
        // This will ensure country filter contains ALL countries for that list, not just current page
        try {
            await this.populateCountryChecklistFromListId(listId);
        } catch (err) {
            console.warn('Failed to populate full-country checklist for list', listId, err);
        }

        // Update the list filter dropdown to match
        const listFilter = document.getElementById('lead-list-filter');
        if (listFilter) {
            listFilter.value = listId || '';
        }
    }



    // Load custom fields
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
    }    // Fetch leads with pagination
    async fetchLeads(page = 1, limit = 100, filters = {}) {
        try {
            // Build query parameters
            const params = new URLSearchParams({
                page: page.toString(),
                limit: limit.toString()
            });

            // Add list filter if selected (use listId from filters or selectedListId)
            const listId = filters.listId || this.selectedListId;
            if (listId) {
                params.append('leadList', listId);
            }

            // Add search filter
            if (filters.search && filters.search.trim()) {
                params.append('search', filters.search.trim());
            }

            // Add status filter
            if (filters.status && filters.status !== '') {
                params.append('status', filters.status);
            }

            // Add country filter(s) - supports array or single value
            if (filters.country) {
                if (Array.isArray(filters.country)) {
                    filters.country.forEach(c => {
                        if (c) params.append('country', c);
                    });
                } else if (typeof filters.country === 'string' && filters.country.trim()) {
                    params.append('country', filters.country.trim());
                }
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
            console.error('Error fetching leads:', err);
            return {
                leads: [],
                pagination: {
                    currentPage: 1,
                    totalPages: 1,
                    totalCount: 0,
                    limit: limit, hasNext: false,
                    hasPrev: false
                }
            };
        }
    }

    // Display leads (now works with server-side pagination)
    displayLeads(leads) {
        this.sortLeads();
        const tableHeader = document.getElementById('leads-table-header');
        const tableBody = document.getElementById('leads-table-body');
        const noLeadsMessage = document.getElementById('no-leads-message');

        if (!tableBody) {
            return;
        }

        // Clean up existing row event listeners
        this.cleanupRowEventListeners();

        // If no list is selected, show message requiring list selection
        if (!this.selectedListId) {
            tableHeader.innerHTML = '';
            tableBody.innerHTML = '';
            if (noLeadsMessage) {
                noLeadsMessage.style.display = 'block';
                noLeadsMessage.innerHTML = `
                    <div class="alert alert-info text-center">
                        <i class="bi bi-list-ul fs-1"></i>
                        <p class="mt-2 mb-0">Please select a lead list to view leads</p>
                    </div>
                `;
            }
            this.updatePaginationControls();
            return;
        }

        // Generate dynamic table headers
        this.generateTableHeaders(tableHeader);

        tableBody.innerHTML = '';

        // Show/hide no leads message
        if (leads.length === 0) {
            tableBody.innerHTML = '';
            if (noLeadsMessage) noLeadsMessage.style.display = 'block';
            this.updatePaginationControls();
            return;
        } else {
            if (noLeadsMessage) noLeadsMessage.style.display = 'none';
        }

        // Display leads (these are already the correct page from server)
        leads.forEach(lead => {
            const row = document.createElement('tr');
            row.innerHTML = this.generateLeadRow(lead);
            row.dataset.leadId = lead._id;
            // Check if lead is owned
            const isOwned = lead.assignedTo && lead.assignedTo._id;

            // Apply owned-lead class immediately if owned
            if (isOwned) {
                row.classList.add('owned-lead');
            }

            // Make all leads clickable
            row.style.cursor = 'pointer';

            // Unified row click handler for both owned and unowned leads
            const rowClickHandler = (e) => {
                // Don't trigger if the click was on a dropdown, phone link, or their elements
                if (
                    e.target.classList.contains('lead-status-dropdown') ||
                    e.target.closest('.lead-status-dropdown') ||
                    e.target.classList.contains('phone-link') ||
                    e.target.closest('.phone-link')
                ) {
                    return;
                }

                // If user selected text (dragged to select), don't open modal
                if (window.getSelection && window.getSelection().toString().trim()) {
                    return;
                }

                // If user dragged the mouse (long press + move), skip triggering the click.
                // We recorded mousedown coords on the row; ignore if movement > threshold (5px)
                const downX = parseInt(row.dataset.mousedownX || '0', 10);
                const downY = parseInt(row.dataset.mousedownY || '0', 10);
                const dx = Math.abs((e.clientX || 0) - downX);
                const dy = Math.abs((e.clientY || 0) - downY);
                if (downX && (dx > 5 || dy > 5)) {
                    return;
                }

                // Always get the latest lead object from currentLeads
                const leadId = row.dataset.leadId;
                const latestLead = this.currentLeads.find(l => l._id === leadId);
                if (!latestLead) return;
                if (latestLead.assignedTo && latestLead.assignedTo._id) {
                    this.openLeadNotesModal(latestLead);
                } else {
                    this.openEditLeadModal(latestLead);
                }
            };

            // Track mousedown position to detect drag vs click (prevents opening modal on selection)
            const rowMouseDownHandler = (ev) => {
                // record start coords on the row element
                row.dataset.mousedownX = ev.clientX;
                row.dataset.mousedownY = ev.clientY;
            };
            row.addEventListener('mousedown', rowMouseDownHandler);

            row.addEventListener('click', rowClickHandler);
            this.eventListeners.push({
                element: row,
                event: 'click',
                handler: rowClickHandler
            });
            // Also track the mousedown handler so cleanup removes it
            this.eventListeners.push({
                element: row,
                event: 'mousedown',
                handler: rowMouseDownHandler
            });
            tableBody.appendChild(row);
        });


        // Add event listeners to phone spans to enable click-to-call
        const phoneLinks = tableBody.querySelectorAll('.phone-link');
        phoneLinks.forEach(span => {
            const phoneLinkHandler = (e) => {
                e.stopPropagation(); // Prevent the row click event
                const row = span.closest('tr');
                if (!row) return;

                // Remove highlight from any other row that might be highlighted
                const currentlyCallingRows = document.querySelectorAll('.calling-lead');
                currentlyCallingRows.forEach(r => {
                    r.classList.remove('calling-lead');
                    r.style.fontWeight = '';
                    Array.from(r.children).forEach(cell => cell.style.backgroundColor = '');
                });

                // Get the phone number from the data attribute
                const phoneNumber = span.getAttribute('data-phone');
                const sipUrl = `sip:${phoneNumber}`;

                // Try to open the SIP URL in a new way that doesn't block the UI
                try {
                    // Highlight the current row by styling all its cells
                    row.classList.add('calling-lead');
                    row.style.fontWeight = 'bold';
                    Array.from(row.children).forEach(cell => {
                        cell.style.backgroundColor = '#fffbe6';
                    });

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
                    row.classList.remove('calling-lead');
                    row.style.fontWeight = '';
                    Array.from(row.children).forEach(cell => cell.style.backgroundColor = '');
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
    }// Update pagination controls
    updatePaginationControls() {
        const paginationContainer = document.getElementById('leads-pagination');
        const paginationContainerTop = document.getElementById('leads-pagination-top');
        const paginationInfo = document.getElementById('pagination-info');
        const paginationInfoTop = document.getElementById('pagination-info-top');
        const leadsPerPageSelect = document.getElementById('leads-per-page');
        const leadsPerPageSelectTop = document.getElementById('leads-per-page-top');

        if (!paginationContainer && !paginationContainerTop) {
            return;
        }

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

        // Clear existing pagination for both containers
        [paginationContainer, paginationContainerTop].forEach(container => {
            if (container) {
                container.innerHTML = '';
            }
        });

        // Show pagination controls (they might be hidden initially)
        const topPaginationParent = paginationContainerTop?.parentElement;
        if (topPaginationParent) {
            topPaginationParent.style.display = 'flex';
        }

        // Always show pagination controls for better UX, even if there's only one page
        // Create pagination
        const pagination = document.createElement('nav');
        pagination.setAttribute('aria-label', 'Leads pagination');

        const ul = document.createElement('ul');
        ul.className = 'pagination pagination-sm mb-0';        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${this.currentPage === 1 || this.totalPages <= 1 ? 'disabled' : ''}`;
        const prevDisabled = this.currentPage === 1 || this.totalPages <= 1;
        const prevStyle = prevDisabled
            ? 'background-color: #6c757d; border-color: #6c757d; color: white; opacity: 0.65;'
            : 'background-color: #28a745; border-color: #28a745; color: white;';
        prevLi.innerHTML = `
            <a class="page-link" href="#" aria-label="Previous" style="${prevStyle}">
                <span aria-hidden="true">&laquo;</span>
            </a>
        `;
        if (this.currentPage > 1 && this.totalPages > 1) {
            prevLi.querySelector('a').addEventListener('click', async (e) => {
                e.preventDefault();
                await this.goToPage(this.currentPage - 1);
            });
        }
        ul.appendChild(prevLi);        // Page numbers
        const maxVisiblePages = 5;
        let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(Math.max(1, this.totalPages), startPage + maxVisiblePages - 1);

        // Adjust start page if we're near the end
        if (endPage - startPage < maxVisiblePages - 1) {
            startPage = Math.max(1, endPage - maxVisiblePages + 1);
        }

        // Always show at least page 1
        if (this.totalPages === 0) {
            startPage = 1;
            endPage = 1;
        }
        // First page + ellipsis
        if (startPage > 1) {
            const firstLi = document.createElement('li');
            firstLi.className = 'page-item';
            firstLi.innerHTML = '<a class="page-link" href="#" style="background-color: #28a745; border-color: #28a745; color: white;">1</a>';
            firstLi.querySelector('a').addEventListener('click', async (e) => {
                e.preventDefault();
                await this.goToPage(1);
            });
            ul.appendChild(firstLi);

            if (startPage > 2) {
                const ellipsisLi = document.createElement('li');
                ellipsisLi.className = 'page-item disabled';
                ellipsisLi.innerHTML = '<span class="page-link">...</span>';
                ul.appendChild(ellipsisLi);
            }
        }        // Page number buttons
        for (let i = startPage; i <= endPage; i++) {
            const li = document.createElement('li');
            li.className = `page-item ${i === this.currentPage ? 'active' : ''}`;
            const isActive = i === this.currentPage;
            const greenStyle = isActive
                ? 'background-color: #198754; border-color: #198754; color: white;'
                : 'background-color: #28a745; border-color: #28a745; color: white;';
            li.innerHTML = `<a class="page-link" href="#" style="${greenStyle}">${i}</a>`;

            if (i !== this.currentPage && this.totalPages > 1) {
                li.querySelector('a').addEventListener('click', async (e) => {
                    e.preventDefault();
                    await this.goToPage(i);
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
            lastLi.innerHTML = `<a class="page-link" href="#" style="background-color: #28a745; border-color: #28a745; color: white;">${this.totalPages}</a>`;
            lastLi.querySelector('a').addEventListener('click', async (e) => {
                e.preventDefault();
                await this.goToPage(this.totalPages);
            });
            ul.appendChild(lastLi);
        }        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${this.currentPage === this.totalPages || this.totalPages <= 1 ? 'disabled' : ''}`;
        const nextDisabled = this.currentPage === this.totalPages || this.totalPages <= 1;
        const nextStyle = nextDisabled
            ? 'background-color: #6c757d; border-color: #6c757d; color: white; opacity: 0.65;'
            : 'background-color: #28a745; border-color: #28a745; color: white;';
        nextLi.innerHTML = `
            <a class="page-link" href="#" aria-label="Next" style="${nextStyle}">
                <span aria-hidden="true">&raquo;</span>
            </a>
        `;
        if (this.currentPage < this.totalPages && this.totalPages > 1) {
            nextLi.querySelector('a').addEventListener('click', async (e) => {
                e.preventDefault();
                await this.goToPage(this.currentPage + 1);
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
                        await this.goToPage(this.currentPage - 1);
                    });
                }

                if (nextBtn && this.currentPage < this.totalPages) {
                    nextBtn.addEventListener('click', async (e) => {
                        e.preventDefault();
                        await this.goToPage(this.currentPage + 1);
                    });
                }

                // Re-attach page number click handlers
                pageLinks.forEach((link, index) => {
                    const pageText = link.textContent;
                    const pageNum = parseInt(pageText);
                    if (!isNaN(pageNum) && pageNum !== this.currentPage) {
                        link.addEventListener('click', async (e) => {
                            e.preventDefault();
                            await this.goToPage(pageNum);
                        });
                    }
                }); container.appendChild(paginationClone);
            } else {
                console.warn('Pagination container not found');
            }
        });
    }

    // Go to specific page
    async goToPage(page) {
        if (page < 1 || page > this.totalPages) return;
        this.currentPage = page;
        await this.refreshCurrentView();
    }

    // Refresh current view with pagination
    async refreshCurrentView() {
        // Get current search and status filters from UI
        const searchInput = document.getElementById('lead-search');
        const statusFilter = document.getElementById('lead-status-filter');

        this.currentFilters = {
            search: searchInput?.value || '',
            status: statusFilter?.value || '',
            listId: this.selectedListId // Include the selected list ID in filters
        };

        // If country filters were previously selected, keep them
        const checkedBoxes = Array.from(document.querySelectorAll('.lead-country-checkbox:checked'));
        if (checkedBoxes.length) {
            this.currentFilters.country = checkedBoxes.map(cb => cb.getAttribute('data-country'));
        }

        // Fetch leads for current page with current filters
        const result = await this.fetchLeads(this.currentPage, this.leadsPerPage, this.currentFilters);
        this.currentLeads = result.leads;
        this.totalPages = result.pagination.totalPages;
        this.totalCount = result.pagination.totalCount;

        // Display the fetched leads
        this.displayLeads(this.currentLeads);

        // NOTE: removed page-based country checklist population to avoid overwriting the
        // full-list checklist. Full-list checklist is populated by populateCountryChecklistFromListId
        // when a list is selected.
    }

    // Generate dynamic table headers
    generateTableHeaders(headerElement) {
        if (!headerElement) return;

        headerElement.innerHTML = '';

        let phoneLabels = [], otherLabels = [];

        if (this.selectedListId) {
            const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);
            if (selectedList && selectedList.labels && selectedList.labels.length > 0) {
                phoneLabels = selectedList.labels.filter(label => this.isPhoneField(label.name));
                otherLabels = selectedList.labels.filter(label => !this.isPhoneField(label.name));
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
            allLabels.forEach((displayLabel, fieldName) => {
                if (this.isPhoneField(fieldName)) {
                    phoneLabels.push({ name: fieldName, label: displayLabel });
                } else {
                    otherLabels.push({ name: fieldName, label: displayLabel });
                }
            });
        }

        // Render non-phone fields first
        otherLabels.forEach(label => {
            const th = document.createElement('th');
            th.textContent = label.label;

            // Add sort icon
            const sortIcon = document.createElement('span');
            sortIcon.style.marginLeft = '5px';
            sortIcon.innerHTML = (this.sortField === label.name)
                ? (this.sortOrder === 'asc' ? '▲' : '▼')
                : '⇅';
            th.appendChild(sortIcon);

            // Make the whole header clickable (except for phone fields)
            th.style.cursor = 'pointer';
            th.classList.add('sortable-header');
            th.addEventListener('click', () => {
                if (this.sortField === label.name) {
                    this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
                } else {
                    this.sortField = label.name;
                    this.sortOrder = 'asc';
                }
                this.sortLeads();
                this.displayLeads(this.currentLeads);
            });

            headerElement.appendChild(th);
        });

        // Add status column (sortable)
        const statusTh = document.createElement('th');
        statusTh.textContent = 'Status';

        // Add sort icon for status
        const statusSortIcon = document.createElement('span');
        statusSortIcon.style.marginLeft = '5px';
        statusSortIcon.innerHTML = (this.sortField === 'status')
            ? (this.sortOrder === 'asc' ? '▲' : '▼')
            : '⇅';
        statusTh.appendChild(statusSortIcon);

        // Make status header clickable for sorting
        statusTh.style.cursor = 'pointer';
        statusTh.classList.add('sortable-header');
        statusTh.addEventListener('click', () => {
            if (this.sortField === 'status') {
                this.sortOrder = this.sortOrder === 'asc' ? 'desc' : 'asc';
            } else {
                this.sortField = 'status';
                this.sortOrder = 'asc';
            }
            this.sortLeads();
            this.displayLeads(this.currentLeads);
        });

        headerElement.appendChild(statusTh);

        // Then render phone fields after status
        phoneLabels.forEach(label => {
            const th = document.createElement('th');
            th.textContent = label.label;
            th.style.cursor = 'default';
            headerElement.appendChild(th);
        });
    }

    // Generate lead row HTML
    generateLeadRow(lead) {
        let rowHtml = '';

        // Helper to render a cell for a label
        const renderCell = (labelName, value) => {
            if (this.isPhoneField(labelName) && value && value !== '-') {
                const formattedPhone = this.formatPhoneForCall(value);
                const displayPhone = this.formatPhoneForDisplay(value);
                return `<td>
                <span class="phone-link big-phone-link" data-phone="${formattedPhone}" title="Click to call with MicroSip">
                    <span style="font-size:2rem; vertical-align:middle;">${displayPhone}</span>
                </span>
            </td>`;
            } else {
                return `<td>${value}</td>`;
            }
        };

        let phoneLabels = [], otherLabels = [];

        if (this.selectedListId) {
            const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);
            if (selectedList && selectedList.labels && selectedList.labels.length > 0) {
                phoneLabels = selectedList.labels.filter(label => this.isPhoneField(label.name));
                otherLabels = selectedList.labels.filter(label => !this.isPhoneField(label.name));
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
            allLabels.forEach((displayLabel, fieldName) => {
                if (this.isPhoneField(fieldName)) {
                    phoneLabels.push({ name: fieldName, label: displayLabel });
                } else {
                    otherLabels.push({ name: fieldName, label: displayLabel });
                }
            });
        }

        // Render non-phone fields first
        otherLabels.forEach(label => {
            const value = lead.customFields?.[label.name] || '-';
            rowHtml += renderCell(label.name, value);
        });

        // Add status dropdown column
        const statusOptions = [
            'New',
            'No Answer',
            'Hang Up',
            'Voice Mail',
            'Wrong Number',
            'Call Back Qualified',
            'Never Invested',
            'Not Interested'
        ];

        let statusHtml = `
        <div class="status-dropdown-wrapper" data-bs-toggle="tooltip" data-bs-placement="top">
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

        // Then render phone fields after status
        phoneLabels.forEach(label => {
            const value = lead.customFields?.[label.name] || '-';
            rowHtml += renderCell(label.name, value);
        });

        return rowHtml;
    }


    // Filter leads by selected list (now triggers server fetch)
    async filterLeadsByList() {
        // Reset to first page when filtering
        this.currentPage = 1;

        // Refresh view with current filters
        await this.refreshCurrentView();
    }

    // Set up lead filters
    // Set up lead filters
    setupLeadFilters() {
        // Clean up existing filter listeners first
        this.cleanupFilterEventListeners();

        const searchInput = document.getElementById('lead-search');
        const statusFilter = document.getElementById('lead-status-filter');
        const listFilter = document.getElementById('lead-list-filter');
        const resetFiltersBtn = document.getElementById('reset-filters-btn');

        // Populate list filter dropdown
        this.populateListFilterDropdown();

        // Ensure a container exists for country checklist (prefer dropdown menu location)
        let countryContainerWrapper = document.getElementById('lead-country-filter-container');
        if (!countryContainerWrapper) {
            const dropdownMenu = document.querySelector('#lead-country-filter-col .dropdown-menu');
            if (dropdownMenu) {
                countryContainerWrapper = document.createElement('div');
                countryContainerWrapper.id = 'lead-country-filter-container';
                // keep same inline scrolling behaviour used elsewhere
                countryContainerWrapper.style.maxHeight = '240px';
                countryContainerWrapper.style.overflowY = 'auto';
                dropdownMenu.insertBefore(countryContainerWrapper, dropdownMenu.firstChild);
            } else if (listFilter && listFilter.parentNode) {
                countryContainerWrapper = document.createElement('div');
                countryContainerWrapper.id = 'lead-country-filter-container';
                countryContainerWrapper.className = 'mb-2';
                listFilter.parentNode.insertBefore(countryContainerWrapper, listFilter.nextSibling);
            }
        }

        // Do not clear if we're restoring or if checkboxes already exist (preserve restored checklist)
        const wrapper = document.getElementById('lead-country-filter-container');
        const hasCountryCheckboxes = wrapper && typeof wrapper.querySelectorAll === 'function'
            && wrapper.querySelectorAll('.lead-country-checkbox').length > 0;
        if (wrapper && !this.restoringLeadsState && !hasCountryCheckboxes) {
            wrapper.innerHTML = '';
        }

        // Function to apply filters
        const applyFilters = async () => {
            this.currentFilters = {
                search: searchInput?.value || '',
                status: statusFilter?.value || '',
                listId: this.selectedListId
            };

            // Gather selected countries from checklist
            const checkedBoxes = Array.from(document.querySelectorAll('.lead-country-checkbox:checked'));
            if (checkedBoxes.length) {
                this.currentFilters.country = checkedBoxes.map(cb => cb.getAttribute('data-country'));
            } else {
                delete this.currentFilters.country;
            }

            // Reset page and refresh
            this.currentPage = 1;
            await this.refreshCurrentView();
        };

        // Allow other code (checkbox handlers) to trigger the same applyFilters logic
        const applyFiltersEventHandler = () => { applyFilters(); };
        document.addEventListener('leads:apply-filters', applyFiltersEventHandler);
        this.eventListeners.push({
            element: document,
            event: 'leads:apply-filters',
            handler: applyFiltersEventHandler
        });

        // Search input (debounced)
        if (searchInput) {
            let searchTimeout;
            const debouncedSearch = () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(applyFilters, 500);
            };
            searchInput.addEventListener('input', debouncedSearch);
            this.eventListeners.push({
                element: searchInput,
                event: 'input',
                handler: debouncedSearch
            });
        }

        // Status filter
        if (statusFilter) {
            statusFilter.addEventListener('change', applyFilters);
            this.eventListeners.push({
                element: statusFilter,
                event: 'change',
                handler: applyFilters
            });
        }

        // List filter - ignore programmatic changes during restore
        if (listFilter) {
            const listFilterHandler = async (e) => {
                if (this.restoringLeadsState) return;
                const listId = e.target.value || null;
                await this.selectLeadList(listId);
            };
            listFilter.addEventListener('change', listFilterHandler);
            this.eventListeners.push({
                element: listFilter,
                event: 'change',
                handler: listFilterHandler
            });
        }

        // Reset filters button
        if (resetFiltersBtn) {
            const resetHandler = async () => {
                if (searchInput) searchInput.value = '';
                if (statusFilter) statusFilter.value = '';
                if (listFilter) listFilter.value = '';
                // Clear country filters UI (preserve container element)
                const w = document.getElementById('lead-country-filter-container');
                if (w) w.innerHTML = '';

                // Select first available list (keeps previous behavior)
                if (this.allLeadLists.length > 0) {
                    await this.selectLeadList(this.allLeadLists[0]._id);
                } else {
                    this.selectedListId = null;
                    this.currentFilters.listId = null;
                    await this.refreshCurrentView();
                }
            };
            resetFiltersBtn.addEventListener('click', resetHandler);
            this.eventListeners.push({
                element: resetFiltersBtn,
                event: 'click',
                handler: resetHandler
            });
        }

        // Clear button inside Countries dropdown - do NOT close dropdown
        const countryClearBtn = document.getElementById('lead-country-clear');
        if (countryClearBtn) {
            const countryClearHandler = async () => {
                const w = document.getElementById('lead-country-filter-container');
                if (w) {
                    const boxes = w.querySelectorAll('.lead-country-checkbox');
                    boxes.forEach(b => { b.checked = false; });
                }
                delete this.currentFilters.country;
                this.currentPage = 1;
                await this.refreshCurrentView();
                // intentionally do NOT hide dropdown (data-bs-auto-close="false" is used)
            };
            countryClearBtn.addEventListener('click', countryClearHandler);
            this.eventListeners.push({
                element: countryClearBtn,
                event: 'click',
                handler: countryClearHandler
            });
        }

        // If a selectedListId already exists (restored state), ensure the countries checklist is populated.
        // Use fire-and-forget but set restoring flag while populating so handlers ignore programmatic changes.
        if (this.selectedListId) {
            (async () => {
                try {
                    this.restoringLeadsState = true;
                    // Only populate if container exists and has no checkboxes yet
                    const w2 = document.getElementById('lead-country-filter-container');
                    const hasBoxes = w2 && typeof w2.querySelectorAll === 'function' && w2.querySelectorAll('.lead-country-checkbox').length > 0;
                    if (w2 && !hasBoxes) {
                        await this.populateCountryChecklistFromListId(this.selectedListId);
                    }
                } catch (err) {
                    console.warn('populateCountryChecklistFromListId failed after setup:', err);
                } finally {
                    this.restoringLeadsState = false;
                }
            })();
        }
    }


    // Fetch all pages for the selected list and collect unique countries (returns array)
    async getAllCountriesForList(listId) {
        if (!listId) return [];

        try {
            const url = `${this.apiManager.API_URL}/leads/countries?listId=${encodeURIComponent(listId)}`;
            console.debug('[FRONTEND] fetching countries from', url);
            const resp = await this.apiManager.authenticatedFetch(url);
            // surface auth / server errors so we don't silently paginate
            if (!resp.ok) {
                const body = await resp.text().catch(() => '');
                throw new Error(`Countries endpoint error: ${resp.status} ${resp.statusText} ${body}`);
            }
            const countries = await resp.json();
            if (!Array.isArray(countries)) {
                throw new Error('Countries endpoint returned unexpected payload');
            }
            // cleanup and unique/sort
            const cleaned = Array.from(new Set(countries.map(c => (c || '').toString().trim()).filter(Boolean)));
            return cleaned.sort((a, b) => a.localeCompare(b));
        } catch (err) {
            // Let caller know (populateCountryChecklistFromListId catches and logs)
            console.error('getAllCountriesForList failed:', err);
            throw err;
        }
    }

    // Small helper to render the checklist from a pre-built country array (reuse existing UI logic)
    async populateCountryChecklistFromListId(listId) {
        const wrapper = document.getElementById('lead-country-filter-container');
        if (!wrapper) return;

        // If no list selected, clear UI
        if (!listId) {
            wrapper.innerHTML = '';
            return;
        }

        // Show loading state
        wrapper.innerHTML = '<div class="text-muted">Loading countries...</div>';

        try {
            // Use cached countries when available
            this.countriesCache = this.countriesCache || {};
            let countries = this.countriesCache[listId];

            if (!countries) {
                countries = await this.getAllCountriesForList(listId);
                this.countriesCache[listId] = countries || [];
            }

            if (!countries || countries.length === 0) {
                wrapper.innerHTML = '';
                return;
            }

            // Render checklist (preserve existing selections)
            const titleHtml = `<label class="form-label mb-1">Country</label>`;
            const listHtml = countries.map(country => {
                const checked = Array.isArray(this.currentFilters.country) && this.currentFilters.country.includes(country) ? 'checked' : '';
                const safeId = `lead-country-${country.replace(/\s+/g, '_')}`;
                return `
                    <div class="form-check">
                        <input class="form-check-input lead-country-checkbox" type="checkbox" value="${country}" id="${safeId}" data-country="${country}" ${checked}>
                        <label class="form-check-label" for="${safeId}">${country}</label>
                    </div>
                `;
            }).join('');

            wrapper.innerHTML = `${titleHtml}<div id="lead-country-filter">${listHtml}</div>`;

            // Attach change listeners (replace nodes to avoid duplicate handlers)
            const checkboxes = wrapper.querySelectorAll('.lead-country-checkbox');
            checkboxes.forEach(cb => {
                const newCb = cb.cloneNode(true);
                cb.parentNode.replaceChild(newCb, cb);

                const handler = async () => {

                    // Trigger centralized filter application defined in setupLeadFilters
                    document.dispatchEvent(new CustomEvent('leads:apply-filters'));
                };

                newCb.addEventListener('change', handler);
                this.eventListeners.push({
                    element: newCb,
                    event: 'change',
                    handler: handler
                });
            });
        } catch (err) {
            console.error('Error populating country checklist for list', listId, err);
            wrapper.innerHTML = '';
        }
    }

    // Populate list filter dropdown
    populateListFilterDropdown() {
        const listFilter = document.getElementById('lead-list-filter');
        if (!listFilter) return;

        // Store the current selection before rebuilding
        const currentSelection = listFilter.value;

        listFilter.innerHTML = '<option value="">Select a List</option>';

        this.allLeadLists.forEach(list => {
            const option = document.createElement('option');
            option.value = list._id;
            option.textContent = list.name;
            listFilter.appendChild(option);
        });

        // Restore the previous selection if it still exists
        if (currentSelection && this.allLeadLists.find(list => list._id === currentSelection)) {
            listFilter.value = currentSelection;
        } else if (this.selectedListId && this.allLeadLists.find(list => list._id === this.selectedListId)) {
            // If no previous selection but there's a selectedListId, use that
            listFilter.value = this.selectedListId;
        }
    }

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
            this.apiManager.showAlert('Failed to add lead: ' + err.message, 'danger');
        }
    }    // Open edit lead modal
    openEditLeadModal(lead) {
        // Now we'll open the lead notes modal instead of the edit modal
        this.openLeadNotesModal(lead);
    }    // Open lead notes modal


    openLeadNotesModal(lead) {
        // Always keep a global reference to the last opened lead for modal sync
        window.lastOpenedLead = lead;
        // Reset all modal buttons to ensure proper state
        if (typeof resetModalButtons === 'function') {
            resetModalButtons();
        }

        console.log('Lead object for modal:', lead);
        const modalTitle = document.querySelector('#leadNotesModal .modal-title');
        if (modalTitle) {
            const firstName = lead.customFields?.firstName || lead.customFields?.['First Name'] || '';
            const lastName = lead.customFields?.lastName || lead.customFields?.['Last Name'] || '';
            let leadName = `${firstName} ${lastName}`.trim();
            if (!leadName) {
                leadName = lead.customFields?.fullName || lead.customFields?.['Full Name'] || '';
            }
            let email = lead.customFields?.email || lead.customFields?.Email || lead.email || '';
            modalTitle.innerHTML = leadName;
            if (email) {
                modalTitle.innerHTML += `<br><span style="font-size:0.95em;color:#555;">${email}</span>`;
            }
        }
        // Clean up any existing modal event listeners
        this.cleanupModalEventListeners();
        var leadNoteId = document.getElementById('lead-note-id');
        var leadNoteStatus = document.getElementById('lead-note-status');
        var leadNotesContainer = document.getElementById('lead-notes-container');
        var ownLeadBtn = document.getElementById('own-lead-btn');
        var releaseLeadBtn = document.getElementById('release-lead-btn');
        var transferLeadBtn = document.getElementById('transfer-lead-btn');

        // Clear previous note textarea and handle disabling for owned leads
        var noteContent = document.getElementById('lead-note-content');
        var noteStatus = document.getElementById('lead-note-status');
        // Use variables only if not already declared in this scope
        let _currentUser = this.apiManager.getCurrentUser();
        let _isLeadOwned = lead.assignedTo && lead.assignedTo._id;
        if (noteContent) {
            noteContent.value = '';
            // Grey out (disable) Add Note if lead is owned
            if (_isLeadOwned) {
                noteContent.disabled = true;
                noteContent.placeholder = 'Notes can only be added after owning (see Customers tab)';
            } else {
                noteContent.disabled = false;
                noteContent.placeholder = '';
            }
        }
        // Grey out (disable) status dropdown if lead is owned
        if (noteStatus) {
            if (_isLeadOwned) {
                noteStatus.disabled = true;
                noteStatus.title = 'Status can only be changed after owning (see Customers tab)';
            } else {
                noteStatus.disabled = false;
                noteStatus.title = '';
            }
        }
        // Also grey out status in table row for owned leads
        setTimeout(() => {
            try {
                const row = document.querySelector(`tr[data-lead-id='${lead._id}']`);
                if (row) {
                    const statusDropdown = row.querySelector('.lead-status-dropdown');
                    if (statusDropdown) {
                        if (_isLeadOwned) {
                            statusDropdown.disabled = true;
                            statusDropdown.title = 'Status can only be changed after owning (see Customers tab)';
                        } else {
                            statusDropdown.disabled = false;
                            statusDropdown.title = '';
                        }
                    }
                }
            } catch (e) { }
        }, 0);

        // Set lead ID and status
        if (leadNoteId) {
            leadNoteId.value = lead._id;
        }
        if (leadNoteStatus) {
            leadNoteStatus.value = lead.status || 'new';
        }
        // Render notes as usual
        if (leadNotesContainer) {
            this.displayLeadNotes(lead, leadNotesContainer);
        }

        // Add "Expand Notes" modal button below the Previous Notes section
        if (leadNotesContainer && !document.getElementById('open-notes-only-modal-btn')) {
            // Match Customers: Insert the button after the Previous Notes section (leadNotesContainer)
            const expandNotesBtn = document.createElement('button');
            expandNotesBtn.type = 'button';
            expandNotesBtn.className = 'btn btn-sm btn-outline-primary mt-2';
            expandNotesBtn.id = 'open-notes-only-modal-btn';
            expandNotesBtn.innerHTML = '<i class="bi bi-arrows-fullscreen me-1"></i> Expand Notes';
            if (leadNotesContainer.nextSibling) {
                leadNotesContainer.parentNode.insertBefore(expandNotesBtn, leadNotesContainer.nextSibling);
            } else {
                leadNotesContainer.parentNode.appendChild(expandNotesBtn);
            }
            expandNotesBtn.onclick = () => {
                let notesOnlyModalEl = document.getElementById('notesOnlyModal');
                if (!notesOnlyModalEl) {
                    notesOnlyModalEl = document.createElement('div');
                    notesOnlyModalEl.className = 'modal fade';
                    notesOnlyModalEl.id = 'notesOnlyModal';
                    notesOnlyModalEl.tabIndex = -1;
                    notesOnlyModalEl.innerHTML = `
                        <div class="modal-dialog modal-lg modal-dialog-centered">
                            <div class="modal-content">
                                <div class="modal-header">
                                    <h5 class="modal-title">All Notes</h5>
                                    <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                                </div>
                                <div class="modal-body" style="max-height:70vh; overflow-y:auto;">
                                    <div id="notes-only-modal-container"></div>
                                </div>
                            </div>
                        </div>`;
                    document.body.appendChild(notesOnlyModalEl);
                }
                // Always use the notes from the last opened lead object (kept in sync)
                const notesOnlyContainer = document.getElementById('notes-only-modal-container');
                if (notesOnlyContainer) {
                    notesOnlyContainer.innerHTML = '';
                    this.displayLeadNotes(window.lastOpenedLead, notesOnlyContainer);
                }
                const notesOnlyModal = bootstrap.Modal.getOrCreateInstance(notesOnlyModalEl);
                notesOnlyModal.show();
            };
        }

        // --- Add "Create Meeting" button below notes section ---
        if (leadNotesContainer) {
            // Ensure button exists (create once), but ALWAYS re-assign its click handler for the current lead.
            let createMeetingBtn = document.getElementById('create-meeting-btn');
            if (!createMeetingBtn) {
                createMeetingBtn = document.createElement('button');
                createMeetingBtn.type = 'button';
                createMeetingBtn.className = 'btn btn-outline-success mt-2';
                createMeetingBtn.id = 'create-meeting-btn';
                createMeetingBtn.innerHTML = '<i class="bi bi-calendar-plus me-1"></i> Create Meeting';
                leadNotesContainer.parentNode.appendChild(createMeetingBtn);
            }

            // Always (re)assign handler so it captures the current lead
            createMeetingBtn.onclick = () => {
                // Compute friendly lead name
                const firstName = lead.customFields?.firstName || lead.customFields?.['First Name'] || '';
                const lastName = lead.customFields?.lastName || lead.customFields?.['Last Name'] || '';
                let leadName = `${firstName} ${lastName}`.trim();
                if (!leadName) {
                    leadName = lead.customFields?.fullName || lead.customFields?.['Full Name'] || '';
                }

                // Create modal if needed (modal contents use stable IDs so we can update them)
                let modal = document.getElementById('leadMeetingModal');
                if (!modal) {
                    modal = document.createElement('div');
                    modal.className = 'modal fade';
                    modal.id = 'leadMeetingModal';
                    modal.tabIndex = -1;
                    modal.innerHTML = `
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Create Meeting for Lead</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <div class="modal-body">
                <form id="lead-meeting-form">
                    <div class="mb-3">
                        <label class="form-label">Lead Name</label>
                        <input type="text" class="form-control" id="lead-meeting-leadname" value="" readonly>
                    </div>
                    <div class="mb-3">
                        <label for="lead-meeting-title" class="form-label">Title</label>
                        <input type="text" class="form-control" id="lead-meeting-title" required>
                    </div>
                    <div class="mb-3">
                        <label for="lead-meeting-date" class="form-label">Date</label>
                        <input type="date" class="form-control" id="lead-meeting-date" required>
                    </div>
                    <div class="mb-3">
                        <label for="lead-meeting-time" class="form-label">Time</label>
                        <input type="time" class="form-control" id="lead-meeting-time">
                    </div>
                    <div class="mb-3">
                        <label for="lead-meeting-desc" class="form-label">Description</label>
                        <textarea class="form-control" id="lead-meeting-desc" rows="2"></textarea>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                <button type="button" class="btn btn-primary" id="save-lead-meeting-btn">Save Meeting</button>
            </div>
        </div>
    </div>
`;
                    document.body.appendChild(modal);
                }

                // Update lead name input so modal always shows current lead
                const leadNameInput = document.getElementById('lead-meeting-leadname');
                if (leadNameInput) leadNameInput.value = leadName || '';

                // Reset form fields
                const titleEl = document.getElementById('lead-meeting-title');
                const dateEl = document.getElementById('lead-meeting-date');
                const timeEl = document.getElementById('lead-meeting-time');
                const descEl = document.getElementById('lead-meeting-desc');
                if (titleEl) titleEl.value = '';
                if (dateEl) dateEl.value = '';
                if (timeEl) timeEl.value = '';
                if (descEl) descEl.value = '';

                // Show modal
                const bsModal = new bootstrap.Modal(modal);
                bsModal.show();

                // (Re)assign save handler to use the current lead
                const saveBtn = document.getElementById('save-lead-meeting-btn');
                if (saveBtn) {
                    saveBtn.onclick = async () => {
                        const title = document.getElementById('lead-meeting-title').value.trim();
                        const date = document.getElementById('lead-meeting-date').value;
                        const time = document.getElementById('lead-meeting-time').value;
                        const desc = document.getElementById('lead-meeting-desc').value.trim();
                        if (!title || !date) return;

                        const appt = {
                            title,
                            date,
                            time,
                            notes: desc,
                            module: 'Lead',
                            leadId: lead._id,
                            leadFullName: leadName
                        };
                        try {
                            await window.calendarManager.saveAppointment(appt);
                            this.apiManager.showAlert('Meeting created!', 'success');
                            bsModal.hide();
                            // Refresh meetings for the current lead
                            this.renderMeetingsForLead(lead);
                        } catch (err) {
                            this.apiManager.showAlert('Failed to create meeting: ' + err.message, 'danger');
                        }
                    };
                }
            };
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


        // Fetch and display meetings for this lead
        const meetingsContainerId = 'lead-meetings-container';
        let meetingsContainer = document.getElementById(meetingsContainerId);
        if (!meetingsContainer) {
            meetingsContainer = document.createElement('div');
            meetingsContainer.id = meetingsContainerId;
            meetingsContainer.className = 'mt-3';
            // Insert below notes section
            if (leadNotesContainer && leadNotesContainer.parentNode) {
                leadNotesContainer.parentNode.insertBefore(meetingsContainer, leadNotesContainer.nextSibling);
            }
        }
        meetingsContainer.innerHTML = '<div class="text-muted">Loading meetings...</div>';
        this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/meetings/for-lead/${lead._id}`)
            .then(async resp => {
                if (!resp.ok) throw new Error('Failed to fetch meetings');
                let meetings = await resp.json();
                if (!meetings.length) {
                    meetingsContainer.innerHTML = '<div class="text-muted">No meetings for this lead.</div>';
                } else {
                    // Sort meetings by createdAt descending (most recent first)
                    meetings = meetings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
                    meetingsContainer.innerHTML = `
<div class="mb-2 fw-bold">Meetings for this Lead:</div>
<div class="border rounded p-2 bg-light" style="max-height: 200px; overflow-y: auto;">
    ${meetings.map(m => {
                        // ...existing mapping code...
                        let createdDate = m.createdAt ? new Date(m.createdAt).toLocaleString('en-GB') : '';
                        let creatorName = 'Unknown User';
                        if (m.createdBy) {
                            if (typeof m.createdBy === 'object' && m.createdBy.name) {
                                creatorName = m.createdBy.name;
                            } else if (typeof m.createdBy === 'string') {
                                creatorName = m.createdBy;
                            }
                        } else if (m.userName) {
                            creatorName = m.userName;
                        }
                        let meetingDateTime = '';
                        if (m.date && m.time) {
                            const dateObj = new Date(`${m.date}T${m.time}`);
                            meetingDateTime = dateObj.toLocaleString('en-GB');
                        } else if (m.date) {
                            meetingDateTime = new Date(m.date).toLocaleDateString('en-GB');
                        }
                        return `
            <div class="note-item mb-2 border-bottom pb-2">
                <div class="text-secondary small">${createdDate} - <strong>${creatorName}</strong></div>
                <div><strong>${m.title || ''}</strong>${meetingDateTime ? ` <span class='ms-2'>${meetingDateTime}</span>` : ''}</div>
                <div>${m.notes || ''}</div>
            </div>
        `;
                    }).join('')}
</div>
`;
                }
            })
            .catch(() => {
                meetingsContainer.innerHTML = '<div class="text-danger">Failed to load meetings.</div>';
            });

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
            });
        }

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
            const noteDate = new Date(note.createdAt).toLocaleString('en-GB');
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
            // Replace newlines with <br> for display
            const noteContentHtml = note.content
                ? note.content.replace(/\n/g, '<br>')
                : '';
            const noteDiv = document.createElement('div');
            noteDiv.className = 'note-item mb-2 border-bottom pb-2';
            noteDiv.innerHTML = `
            <div class="text-secondary small">${noteDate} - <strong>${userName}</strong></div>
            <div>${noteContentHtml}</div>
        `;
            container.appendChild(noteDiv);
        });
    }

    // Save lead note (add note or update status) - now renders instantly and does not close modal
    async saveLeadNote(leadId) {
        const noteContent = document.getElementById('lead-note-content').value.trim();
        const noteStatus = document.getElementById('lead-note-status').value;

        try {
            const currentUser = this.apiManager.getCurrentUser();
            const data = { status: noteStatus };
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

            // Do NOT close the modal here

            // Update the notes in the modal instantly
            const updatedLead = await response.json();
            const leadNotesContainer = document.getElementById('lead-notes-container');
            if (leadNotesContainer) {
                this.displayLeadNotes(updatedLead, leadNotesContainer);
            }

            // --- Update the in-memory lead object in currentLeads ---
            const idx = this.currentLeads.findIndex(l => l._id === leadId);
            if (idx !== -1) {
                // Update the notes and status in the in-memory object
                this.currentLeads[idx].notes = updatedLead.notes;
                this.currentLeads[idx].status = updatedLead.status;
            }
            // If the lead object passed to openLeadNotesModal is different, update its notes too
            // (This covers the case where a reference to a lead object is held elsewhere)
            // Try to update the lead object in the modal if possible
            if (window.lastOpenedLead && window.lastOpenedLead._id === leadId) {
                window.lastOpenedLead.notes = updatedLead.notes;
                window.lastOpenedLead.status = updatedLead.status;
            }

            // Clear the textarea after saving
            const noteContentInput = document.getElementById('lead-note-content');
            if (noteContentInput) noteContentInput.value = '';

            // Show generic saved message
            this.showSavedToast();

            // Only show status toast if status was actually changed
            const prevStatus = this.currentLeads?.find(l => l._id === leadId)?.status;
            if (noteStatus && prevStatus && noteStatus !== prevStatus) {
                this.showStatusUpdateToast(noteStatus);
            }
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
            await this.refreshCurrentView();
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
        }
    }

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
                    <div class="modal-dialog modal-xl modal-dialog-centered">
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
            this.apiManager.showAlert('Please select a target list', 'warning');
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
            this.apiManager.showAlert('Failed to update lead: ' + err.message, 'danger');
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

    // Refresh lead list card counts    // Update lead status from dropdown
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
            const leadIndex = this.currentLeads.findIndex(lead => lead._id === leadId);
            if (leadIndex !== -1) {
                this.currentLeads[leadIndex].status = newStatus;
            }// Visual feedback - briefly highlight the dropdown with classes
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
                const lead = this.currentLeads.find(l => l._id === leadId);
                if (lead) {
                    dropdown.value = lead.status;
                }
            }
        }
    }

    // Show status update toast notification
    // Show a green toast for generic save actions ("Saved !")
    showSavedToast() {
        let toastContainer = document.querySelector('.toast-container');
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.className = 'toast-container position-fixed top-0 end-0 p-3';
            toastContainer.style.zIndex = 1080;
            document.body.appendChild(toastContainer);
        }
        const toastId = 'saved-toast-' + Date.now();
        const toastHtml = `
            <div id="${toastId}" class="toast align-items-center text-white bg-success border-0" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="d-flex">
                    <div class="toast-body">
                        <i class="bi bi-check-circle me-2"></i> Saved !
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
            </div>
        `;
        toastContainer.insertAdjacentHTML('beforeend', toastHtml);
        const toastElement = document.getElementById(toastId);
        const toast = new bootstrap.Toast(toastElement, { delay: 2000 });
        toast.show();
        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    }
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
    }    // Apply color styling to dropdowns based on selected status
    applyStatusColors() {
        document.querySelectorAll('.lead-status-dropdown').forEach(dropdown => {
            const status = dropdown.value;
            // Remove existing status color classes
            dropdown.classList.remove('status-new', 'status-no-answer', 'status-hang-up', 'status-voice-mail',
                'status-call-back-qualified', 'status-call-back-not-qualified');
            // Add class based on current status
            switch (status) {
                case 'new':
                    dropdown.classList.add('status-new');
                    break;
                case 'No Answer':
                    dropdown.classList.add('status-no-answer');
                    break;
                case 'Hang Up':
                    dropdown.classList.add('status-hang-up');
                    break;
                case 'Voice Mail':
                    dropdown.classList.add('status-voice-mail');
                    break;
                case 'No Service':
                    dropdown.classList.add('status-no-service');
                    break;
                case 'Call Back Qualified':
                    dropdown.classList.add('status-call-back-qualified');
                    break;
                case 'Call Back NOT Qualified':
                    dropdown.classList.add('status-call-back-not-qualified');
                    break;
                case 'Deposited':
                    dropdown.classList.add('status-Deposited');
                    break;
            }
        });
    }

    // Clean up card event listeners
    cleanupCardEventListeners() {        // Remove event listeners that are specific to cards
        this.eventListeners = this.eventListeners.filter(listener => {
            const isCardListener = listener.element.classList?.contains('lead-list-card');

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
            const el = listener.element;

            // Keep country checkbox listeners (they may have been attached during restore and should persist)
            const isCountryCheckbox = el?.classList && el.classList.contains('lead-country-checkbox');

            const isFilterListener = !isCountryCheckbox && (
                el.id === 'lead-search' ||
                el.id === 'lead-status-filter' ||
                el.id === 'lead-list-filter' ||
                el.id === 'reset-filters-btn' ||
                el.id === 'lead-country-clear' || // keep clear button removal
                // remove the document-level custom event handler if present
                (el === document && listener.event === 'leads:apply-filters')
            );

            if (isFilterListener) {
                listener.element.removeEventListener(listener.event, listener.handler);
                return false; // Remove from tracking array
            }
            return true; // Keep in tracking array
        });
    }   // Clean up modal event listeners
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
        this.autoRefreshEnabled = true; this.autoRefreshInterval = setInterval(async () => {
            // Only refresh if the leads page is active
            if (this.isLeadsPageActive) {
                if (this.useOptimizedRefresh) {
                    await this.refreshCurrentPageOnly();
                } else {
                    await this.refreshLeadsData();
                }
            }
        }, this.refreshIntervalMs);
    }    // Stop auto-refresh
    stopAutoRefresh() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
            this.autoRefreshInterval = null;
            this.autoRefreshEnabled = false;
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

    // Toggle between optimized and full refresh modes
    setOptimizedRefresh(enabled) {
        this.useOptimizedRefresh = enabled;
        console.log(`Auto-refresh mode: ${enabled ? 'Optimized (current page only)' : 'Full refresh'}`);
    }    // Optimized auto-refresh: only refresh current page data
    async refreshCurrentPageOnly() {
        try {
            // First, refresh lead lists data to pick up visibility changes and new counts
            await this.loadLeadLists();
            await this.updateLeadListCounts();

            // Update lead list cards to reflect any visibility changes and updated counts
            this.displayLeadListCards(true);

            // Check if currently selected list is still visible to current user
            if (this.selectedListId) {
                const selectedList = this.allLeadLists.find(list => list._id === this.selectedListId);
                if (!selectedList) {
                    // Selected list is no longer visible, select first available list
                    if (this.allLeadLists.length > 0) {
                        this.selectLeadList(this.allLeadLists[0]._id);
                    } else {
                        this.selectedListId = null;
                    }
                    return; // selectLeadList will handle the display update
                }
            }

            // Only proceed if we have a selected list
            if (!this.selectedListId) {
                return;
            }

            // Fetch only the current page of leads with current filters
            const result = await this.fetchLeads(this.currentPage, this.leadsPerPage, this.currentFilters);

            // Store the current leads data
            const newLeads = result.leads;
            const newTotalPages = result.pagination.totalPages;
            const newTotalCount = result.pagination.totalCount;

            // Check if pagination changed (new leads added/removed that affect total pages)
            const paginationChanged = (this.totalPages !== newTotalPages || this.totalCount !== newTotalCount);

            // Update our data
            this.currentLeads = newLeads;
            this.totalPages = newTotalPages;
            this.totalCount = newTotalCount;

            // Only update the row data (not the whole table)
            this.updateTableRowDataOnly(newLeads);

            // If pagination changed, update pagination controls
            if (paginationChanged) {
                this.updatePaginationInfo();
            }

            // Update the list filter dropdown to reflect any changes
            this.populateListFilterDropdown();

        } catch (err) {
            console.error('Error during optimized page refresh:', err);
            // On error, fall back to full refresh
            await this.refreshLeadsData();
        }
    }

    /**
     * Update only the data (cell values) in the table rows for leads that have changed.
     * This avoids rebuilding the entire table and preserves event listeners.
     */
    updateTableRowDataOnly(newLeads) {
        const tableBody = document.getElementById('leads-table-body');
        if (!tableBody) return;

        // Find the currently focused status dropdown (if any)
        const activeDropdown = document.activeElement && document.activeElement.classList.contains('lead-status-dropdown')
            ? document.activeElement
            : null;
        const activeLeadId = activeDropdown ? activeDropdown.getAttribute('data-lead-id') : null;

        newLeads.forEach(newLead => {
            const row = tableBody.querySelector(`tr[data-lead-id="${newLead._id}"]`);
            if (!row) return; // Row might not exist if pagination changed

            // If the status dropdown for this row is currently focused, skip updating the entire row
            if (activeLeadId && newLead._id === activeLeadId) {
                return;
            }

            // Parse the new row HTML for this lead (reuse your generateLeadRow)
            const tempRow = document.createElement('tr');
            tempRow.innerHTML = this.generateLeadRow(newLead);

            // Update each cell's innerHTML if changed
            Array.from(row.children).forEach((cell, idx) => {
                const newCell = tempRow.children[idx];
                if (newCell && cell.innerHTML !== newCell.innerHTML) {
                    cell.innerHTML = newCell.innerHTML;
                }
            });

            // Optionally, update row classes (e.g., owned-lead)
            if (newLead.assignedTo && newLead.assignedTo._id) {
                row.classList.add('owned-lead');
            } else {
                row.classList.remove('owned-lead');
            }
        });

        // Optionally, update status colors and tooltips
        this.applyStatusColors();
        const tooltips = tableBody.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltips.forEach(tooltip => {
            new bootstrap.Tooltip(tooltip);
        });
    }


    // Update only pagination info text (not the buttons)
    updatePaginationInfo() {
        const paginationInfo = document.getElementById('pagination-info');
        const paginationInfoTop = document.getElementById('pagination-info-top');

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

        // If total pages changed significantly, we may need to rebuild pagination
        // This happens when leads are added/removed affecting total count
        const currentPaginationPages = document.querySelectorAll('#leads-pagination .page-link').length;
        if (Math.abs(currentPaginationPages - this.totalPages) > 2) {
            // Significant change in pages, rebuild pagination
            this.updatePaginationControls();
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
    }    // Format phone number for display with just a phone icon to save space
    formatPhoneForDisplay(phoneNumber) {
        if (!phoneNumber) return '';

        // Return a different phone icon to save maximum space
        return '☎️';
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
