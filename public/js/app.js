// CRM Frontend JavaScript - Main Application Controller
// This file coordinates all modules and handles core application functionality

document.addEventListener('DOMContentLoaded', async function() {
    // Initialize all managers
    await initializeManagers();
    
    // Check authentication and show app
    checkAuthAndShowApp();
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up navigation
    setupNavigation();
});

// Initialize all module managers
async function initializeManagers() {
    // Initialize global instances (if not already done by module files)
    if (!window.dashboard) {
        window.dashboard = new Dashboard(window.apiManager);
    }
    if (!window.leadsManager) {
        window.leadsManager = new LeadsManager(window.apiManager);
    }
    if (!window.customerManager) {
        window.customerManager = new CustomerManager(window.apiManager);
    }
    if (!window.depositorManager) {
        window.depositorManager = new DepositorManager(window.apiManager);
    }
    if (!window.uploadManager) {
        window.uploadManager = new UploadManager(window.apiManager);
    }
    if (!window.fieldsManager) {
        window.fieldsManager = new FieldsModule();
    }
    
    // Initialize upload manager (async)
    await window.uploadManager.init();
}

// Check authentication and show app if valid
async function checkAuthAndShowApp() {
    if (window.apiManager.token) {
        if (window.apiManager.isTokenValid()) {
            await showApp();
        } else {
            console.log('Token expired, redirecting to login');
            window.apiManager.clearToken();
            window.location.href = '/login';
        }
    } else {
        // Redirect to login page
        window.location.href = '/login';
    }
}

// Set up all event listeners
function setupEventListeners() {
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    
    // Lead management buttons
    document.getElementById('save-lead-btn')?.addEventListener('click', () => window.leadsManager.handleAddLead());
    document.getElementById('update-lead-btn')?.addEventListener('click', () => window.leadsManager.handleUpdateLead());
    // NOTE: save-lead-note-btn listener removed - handled by modal-specific setup in Leads.js
    
    // User management button
    document.getElementById('save-user-btn')?.addEventListener('click', handleAddUser);
}

// Set up navigation between pages
function setupNavigation() {
    document.querySelectorAll('.sidebar .nav-link[data-page]').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const page = this.getAttribute('data-page');
            showPage(page);
            
            // Update active status
            document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

// Handle user logout
function handleLogout(e) {
    e.preventDefault();
    window.apiManager.clearToken();
    window.location.href = '/login';
}

// Show the application after successful authentication
async function showApp() {
    try {
        // Get current user info
        const currentUser = window.apiManager.getCurrentUser();

        // Validate token with server
        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/dashboard/stats`);        if (!response.ok) {
            throw new Error('Invalid token');
        }
        
        // Update UI with user information
        updateUserInterface(currentUser);

        // Show/hide admin features based on user role
        toggleAdminFeatures(currentUser.role === 'admin');// Initialize all modules with user context
        if (window.fieldsManager) {
            window.fieldsManager.init(window.apiManager, currentUser);
        }
        if (window.depositorManager) {
            window.depositorManager.init();
        }

        // Show dashboard by default
        showPage('dashboard');
    } catch (error) {
        console.log('Token validation failed, redirecting to login');
        window.apiManager.clearToken();
        window.location.href = '/login';
    }
}

// Toggle admin features visibility
function toggleAdminFeatures(isAdmin) {
    const adminMenu = document.getElementById('admin-menu');
    const addLeadBtn = document.getElementById('add-lead-btn-container');
    const customersTab = document.getElementById('customers-tab');
    const depositorsTab = document.getElementById('depositors-tab');
    
    if (adminMenu) adminMenu.style.display = isAdmin ? 'block' : 'none';
    if (addLeadBtn) addLeadBtn.style.display = isAdmin ? 'block' : 'none';
    // Hide Customers tab from admin users (customers are for agents only)
    if (customersTab) customersTab.style.display = isAdmin ? 'none' : 'block';
    // Hide Depositors tab from admin users (depositors are for agents only)
    if (depositorsTab) depositorsTab.style.display = isAdmin ? 'none' : 'block';
}

// Show a specific page and load its data
function showPage(pageName) {
    // Destroy existing charts before switching pages to prevent memory leaks
    if (window.dashboard) {
        window.dashboard.destroyCharts();
    }
    
    // Stop auto-refresh for all managers when switching pages
    if (window.leadsManager) {
        window.leadsManager.setPageActive(false);
    }
    
    // Hide all pages
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });
    
    // Show selected page
    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
        targetPage.style.display = 'block';
    }    // Load data for the page
    const currentUser = window.apiManager.getCurrentUser();
    switch(pageName) {
        case 'dashboard':
            if (window.dashboard) {
                window.dashboard.loadDashboardData();
            }
            break;
        case 'leads':
            if (window.leadsManager) {
                window.leadsManager.setPageActive(true);
                window.leadsManager.loadLeads();
            }
            break;case 'customers':
            // Only allow agents to access customers page
            if (currentUser && currentUser.role === 'agent' && window.customerManager) {
                window.customerManager.loadCustomers();
            } else if (currentUser && currentUser.role === 'admin') {
                // Redirect admin users back to dashboard
                showPage('dashboard');
                return;
            }
            break;
        case 'depositors':
            // Only allow agents to access depositors page
            if (currentUser && currentUser.role === 'agent' && window.depositorManager) {
                window.depositorManager.loadDepositors();
            } else if (currentUser && currentUser.role === 'admin') {
                // Redirect admin users back to dashboard
                showPage('dashboard');
                return;
            }
            break;
        case 'users':
            if (currentUser && currentUser.role === 'admin') {
                loadUsers();
            }
            break;
        case 'fields':
            if (currentUser && currentUser.role === 'admin' && window.fieldsManager) {
                window.fieldsManager.loadFields();
            }
            break;
        case 'upload':
            // Upload page doesn't need special loading
            break;
    }
}

// Load users (admin only functionality)
async function loadUsers() {
    try {
        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/users`);
        
        if (!response.ok) {
            throw new Error('Failed to fetch users');
        }
        
        const users = await response.json();
        displayUsers(users);
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

// Display users in the table
function displayUsers(users) {
    const tableBody = document.getElementById('users-table-body');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    
    users.forEach(user => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${user.name}</td>
            <td>${user.email}</td>
            <td>${user.role.charAt(0).toUpperCase() + user.role.slice(1)}</td>
            <td>
                <span class="badge bg-${user.status === 'active' ? 'success' : 'danger'}">
                    ${user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                </span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-${user.status === 'active' ? 'danger' : 'success'} toggle-status-btn" 
                        data-id="${user._id}" data-status="${user.status}">
                    ${user.status === 'active' ? 'Deactivate' : 'Activate'}
                </button>
            </td>
        `;
        tableBody.appendChild(row);
        
        // Add event listener to toggle status button
        row.querySelector('.toggle-status-btn').addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-id');
            const currentStatus = e.target.getAttribute('data-status');
            toggleUserStatus(userId, currentStatus === 'active' ? 'inactive' : 'active');
        });
    });
}

// Toggle user status (admin only)
async function toggleUserStatus(userId, newStatus) {
    try {
        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/users/${userId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (!response.ok) {
            throw new Error('Failed to update user status');
        }
        
        // Reload users
        loadUsers();
    } catch (err) {
        console.error('Error updating user status:', err);
        alert('Failed to update user status: ' + err.message);
    }
}

// Handle adding a new user (admin only)
async function handleAddUser() {
    const userData = {
        name: document.getElementById('user-name')?.value || '',
        email: document.getElementById('user-email')?.value || '',
        password: document.getElementById('user-password')?.value || '',
        role: document.getElementById('user-role')?.value || 'agent'
    };

    if (!userData.name || !userData.email || !userData.password) {
        alert('Please fill in all required fields');
        return;
    }

    try {
        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(userData)
        });
        
        if (!response.ok) {
            throw new Error('Failed to add user');
        }
        
        // Close modal and reload users
        const modal = bootstrap.Modal.getInstance(document.getElementById('addUserModal'));
        if (modal) modal.hide();
        
        // Clear form
        const form = document.getElementById('add-user-form');
        if (form) form.reset();
        
        // Reload users
        loadUsers();
        
        alert('User added successfully');
    } catch (err) {
        console.error('Error adding user:', err);
        alert('Failed to add user: ' + err.message);
    }
}

// Update UI with user information
function updateUserInterface(currentUser) {
    // Update sidebar user info
    const userNameSidebar = document.getElementById('user-name-sidebar');
    const userRoleSidebar = document.getElementById('user-role-sidebar');
    
    if (userNameSidebar) {
        userNameSidebar.textContent = currentUser.name;
    }
    if (userRoleSidebar) {
        userRoleSidebar.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    }
    
    // Update dashboard greeting
    const dashboardGreeting = document.getElementById('dashboard-greeting');
    if (dashboardGreeting) {
        const hour = new Date().getHours();
        let greeting = 'Good day';
        
        if (hour < 12) {
            greeting = 'Good morning';
        } else if (hour < 17) {
            greeting = 'Good afternoon';
        } else {
            greeting = 'Good evening';
        }
        
        dashboardGreeting.textContent = `${greeting}, ${currentUser.name}!`;
    }
    
    // Update current time
    updateCurrentTime();
    
    // Set up time update interval
    setInterval(updateCurrentTime, 1000);
}

// Update current time display
function updateCurrentTime() {
    const timeElement = document.getElementById('current-time');
    if (timeElement) {
        const now = new Date();
        timeElement.textContent = now.toLocaleString();
    }
}

// Reset all modal buttons to default state before opening
function resetModalButtons() {
    // Get all modal buttons
    const ownLeadBtn = document.getElementById('own-lead-btn');
    const releaseLeadBtn = document.getElementById('release-lead-btn');
    const transferLeadBtn = document.getElementById('transfer-lead-btn');
    const moveToDepositorsBtn = document.getElementById('move-to-depositors-btn');
    const takeOverLeadBtn = document.getElementById('take-over-lead-btn');
    
    // Hide all buttons by default
    if (ownLeadBtn) {
        ownLeadBtn.style.display = 'none';
        ownLeadBtn.textContent = 'Own Lead';
        ownLeadBtn.className = 'btn btn-success';
    }
    
    if (releaseLeadBtn) {
        releaseLeadBtn.style.display = 'none';
        releaseLeadBtn.textContent = 'Release Lead';
        releaseLeadBtn.className = 'btn btn-warning';
    }
    
    if (transferLeadBtn) {
        transferLeadBtn.style.display = 'none';
        transferLeadBtn.textContent = 'Transfer Lead';
        transferLeadBtn.className = 'btn btn-info';
    }
    
    if (moveToDepositorsBtn) {
        moveToDepositorsBtn.style.display = 'none';
        moveToDepositorsBtn.textContent = 'Move to Depositors';
        moveToDepositorsBtn.className = 'btn btn-danger';
    }
    
    if (takeOverLeadBtn) {
        takeOverLeadBtn.style.display = 'none';
        takeOverLeadBtn.textContent = 'Take over';
        takeOverLeadBtn.className = 'btn btn-warning';
    }
    
    // Reset modal title
    const modalTitle = document.querySelector('#leadNotesModal .modal-title');
    if (modalTitle) {
        modalTitle.textContent = 'Notes';
    }
}

// Expose the function globally for use by other modules
window.resetModalButtons = resetModalButtons;
