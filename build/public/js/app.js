// CRM Frontend JavaScript - Main Application Controller
// This file coordinates all modules and handles core application functionality

document.addEventListener('DOMContentLoaded', async function () {

    // Request desktop notification permission on app load
    if ('Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
    }

    function showInactivityLogoutModal() {
        const modalEl = document.getElementById('inactivityLogoutModal');
        if (!modalEl) {
            handleLogout();
            return;
        }
        const modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
        modal.show();

        // When user clicks OK, proceed to logout
        const okBtn = document.getElementById('inactivity-logout-ok-btn');
        if (okBtn) {
            okBtn.onclick = () => {
                modal.hide();
                handleLogout();
            };
        }
    }

    // --- Inactivity auto-logout ---
    let inactivityTimeout;
    const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes (change to 5000 for testing)

    function resetInactivityTimer() {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            showInactivityLogoutModal();
        }, INACTIVITY_LIMIT_MS);
    }

    // Listen for user activity
    ['mousemove', 'keydown', 'mousedown', 'touchstart'].forEach(event => {
        window.addEventListener(event, resetInactivityTimer, true);
    });

    // Start timer on load
    resetInactivityTimer();


    // Wait for apiManager to be available
    await waitForApiManager();
    // Check authentication FIRST before doing anything else
    if (!window.apiManager.token || !window.apiManager.isTokenValid()) {
        // Hide loading screen before redirecting
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('d-flex');
            loadingScreen.classList.add('d-none');
        }
        window.apiManager.clearToken();
        window.location.href = '/login';
        return;
    }

    // Only proceed if authenticated
    try {
        // Initialize all managers
        await initializeManagers();

        // Show the app
        await showApp();

        // Set up event listeners
        setupEventListeners();

        // Set up navigation
        setupNavigation();
    } catch (error) {
        console.error('Error initializing app:', error);        // Hide loading screen even on error
        const loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) {
            loadingScreen.classList.remove('d-flex');
            loadingScreen.classList.add('d-none');
        }
        window.location.href = '/login';
    }
});

// Wait for apiManager to be available
function waitForApiManager() {
    return new Promise((resolve) => {
        if (window.apiManager) {
            resolve();
            return;
        }

        const checkApiManager = () => {
            if (window.apiManager) {
                resolve();
            } else {
                setTimeout(checkApiManager, 10);
            }
        };

        checkApiManager();
    });
}

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
    if (!window.calendarManager) {
        window.calendarManager = new CalendarManager(window.apiManager);
    }
    // Start global meeting notifications (works on all pages)
    if (window.calendarManager && typeof window.calendarManager.startAppointmentNotifications === 'function') {
        window.calendarManager.startAppointmentNotifications();
    }

    // Initialize upload manager (async)
    await window.uploadManager.init();
}

// Set up all event listeners
function setupEventListeners() {
    // Logout button
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);

    // Lead management buttons
    document.getElementById('save-lead-btn')?.addEventListener('click', () => window.leadsManager.handleAddLead());
    document.getElementById('update-lead-btn')?.addEventListener('click', () => window.leadsManager.handleUpdateLead());
    // NOTE: save-lead-note-btn listener removed - handled by modal-specific setup in Leads.js
    // User management buttons
    document.getElementById('save-user-btn')?.addEventListener('click', handleAddUser);
    document.getElementById('update-user-btn')?.addEventListener('click', handleUpdateUser);
}

// Set up navigation between pages
function setupNavigation() {
    document.querySelectorAll('.sidebar .nav-link[data-page]').forEach(link => {
        link.addEventListener('click', function (e) {
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
    if (e && typeof e.preventDefault === 'function') {
        e.preventDefault();
    }
    window.apiManager.clearToken();
    window.location.href = '/login';
}

// Show the application after successful authentication
async function showApp() {
    try {
        // Get current user info
        const currentUser = window.apiManager.getCurrentUser();

        // Validate token with server
        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/dashboard/stats`); if (!response.ok) {
            throw new Error('Invalid token');
        }        // Hide loading screen and show the app
        const loadingScreen = document.getElementById('loading-screen');
        const appContent = document.getElementById('app-content');
        if (loadingScreen) {
            loadingScreen.classList.remove('d-flex');
            loadingScreen.classList.add('d-none');
        }

        if (appContent) {
            appContent.classList.remove('d-none');
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
        }        // Show dashboard by default
        setTimeout(() => {
            showPage('dashboard');
            // Ensure dashboard is definitely visible
            const dashboardPage = document.getElementById('dashboard-page');
            if (dashboardPage) {
                dashboardPage.style.display = 'block';
                console.log('Dashboard page forced to display');
            }
        }, 100);
    } catch (error) {
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
async function showPage(pageName) {
    // Destroy existing charts before switching pages to prevent memory leaks
    if (window.dashboard) {
        window.dashboard.destroyCharts();
    }

    // --- Save Leads page state if leaving leads ---
    const currentVisiblePage = document.querySelector('.page-content:not([style*="display: none"])');
    if (currentVisiblePage && currentVisiblePage.id === 'leads-page' && window.leadsManager) {
        window.leadsManager.saveLeadsPageState();
    }

    // Stop auto-refresh for all managers when switching pages
    if (window.leadsManager) {
        window.leadsManager.setPageActive(false);
    }

    // Hide all pages
    document.querySelectorAll('.page-content').forEach(page => {
        page.style.display = 'none';
    });    // Show selected page
    const targetPage = document.getElementById(`${pageName}-page`);
    if (targetPage) {
        targetPage.style.display = 'block';
    } else {
        console.error(`Page not found: ${pageName}-page`);
    }// Update navigation active status
    document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
    const activeNavLink = document.querySelector(`.sidebar .nav-link[data-page="${pageName}"]`);
    if (activeNavLink) {
        activeNavLink.classList.add('active');
        console.log(`Navigation updated for: ${pageName}`);
    }// Load data for the page
    const currentUser = window.apiManager.getCurrentUser();
    switch (pageName) {
        case 'dashboard':
            if (window.dashboard) {
                window.dashboard.loadDashboardData();
            }
            break;
        case 'leads':
            if (window.leadsManager) {
                await window.leadsManager.setPageActive(true);
                await window.leadsManager.loadLeadLists(); // <-- Ensure lists are loaded first
                await window.leadsManager.restoreLeadsPageState();
                await window.leadsManager.loadLeads();
            }
            break;
        case 'customers':
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
        case 'calendar':
            // Show the calendar page and let CalendarManager populate its content
            const calendarPage = document.getElementById('calendar-page');
            if (calendarPage) {
                calendarPage.style.display = 'block';
                if (window.calendarManager) {
                    await window.calendarManager.loadCalendar();
                }
            } else {
                console.error('Calendar page container not found');
            }
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
            </td>            <td>
                <div class="btn-group" role="group">
                    <button class="btn btn-sm btn-outline-primary edit-user-btn" 
                            data-id="${user._id}" data-name="${user.name}" data-email="${user.email}" data-role="${user.role}">
                        <i class="bi bi-pencil"></i> Edit
                    </button>
                    <button class="btn btn-sm btn-outline-${user.status === 'active' ? 'danger' : 'success'} toggle-status-btn" 
                            data-id="${user._id}" data-status="${user.status}">
                        ${user.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    <button class="btn btn-sm btn-outline-danger delete-user-btn" 
                            data-id="${user._id}" data-name="${user.name}">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </td>
        `; tableBody.appendChild(row);

        // Add event listeners to action buttons
        row.querySelector('.toggle-status-btn').addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-id');
            const currentStatus = e.target.getAttribute('data-status');
            toggleUserStatus(userId, currentStatus === 'active' ? 'inactive' : 'active');
        });

        row.querySelector('.edit-user-btn').addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-id');
            const userName = e.target.getAttribute('data-name');
            const userEmail = e.target.getAttribute('data-email');
            const userRole = e.target.getAttribute('data-role');
            openEditUserModal(userId, userName, userEmail, userRole);
        });

        row.querySelector('.delete-user-btn').addEventListener('click', (e) => {
            const userId = e.target.getAttribute('data-id');
            const userName = e.target.getAttribute('data-name');
            deleteUser(userId, userName);
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
        window.apiManager.showAlert('Failed to update user status: ' + err.message, 'danger');
    }
}

// Handle adding a new user (admin only)
async function handleAddUser() {
    const userData = {
        name: document.getElementById('user-name')?.value || '',
        email: document.getElementById('user-email')?.value || '',
        password: document.getElementById('user-password')?.value || '',
        role: document.getElementById('user-role')?.value || 'agent'
    }; if (!userData.name || !userData.email || !userData.password) {
        window.apiManager.showAlert('Please fill in all required fields', 'warning');
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

        window.apiManager.showAlert('User added successfully', 'success');
    } catch (err) {
        console.error('Error adding user:', err);
        window.apiManager.showAlert('Failed to add user: ' + err.message, 'danger');
    }
}

// Open edit user modal
function openEditUserModal(userId, userName, userEmail, userRole) {
    document.getElementById('edit-user-id').value = userId;
    document.getElementById('edit-user-name').value = userName;
    document.getElementById('edit-user-email').value = userEmail;
    document.getElementById('edit-user-role').value = userRole;
    document.getElementById('edit-user-password').value = ''; // Clear password field

    const editUserModal = new bootstrap.Modal(document.getElementById('editUserModal'));
    editUserModal.show();
}

// Handle updating a user (admin only)
async function handleUpdateUser() {
    try {
        const userId = document.getElementById('edit-user-id').value;
        const name = document.getElementById('edit-user-name').value.trim();
        const email = document.getElementById('edit-user-email').value.trim();
        const password = document.getElementById('edit-user-password').value.trim();
        const role = document.getElementById('edit-user-role').value;

        if (!name || !email) {
            window.apiManager.showAlert('Please fill in all required fields', 'warning');
            return;
        }

        const updateData = { name, email, role };

        // Only include password if it was provided
        if (password) {
            updateData.password = password;
        }

        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updateData)
        });

        if (response.ok) {
            // Close modal
            const editUserModal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            editUserModal.hide();
            // Reload users list
            loadUsers();

            window.apiManager.showAlert('User updated successfully', 'success');
        } else {
            const errorData = await response.json();
            window.apiManager.showAlert(errorData.message || 'Failed to update user', 'danger');
        }
    } catch (err) {
        console.error('Error updating user:', err);
        window.apiManager.showAlert('Error updating user. Please try again.', 'danger');
    }
}

// Delete user with confirmation
async function deleteUser(userId, userName) {
    const confirmed = await window.confirmationModal.confirmDelete(
        userName,
        'user',
        'This action cannot be undone.'
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/users/${userId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            // Reload users list
            loadUsers();
            window.apiManager.showAlert('User deleted successfully', 'success');
        } else {
            const errorData = await response.json();
            window.apiManager.showAlert(errorData.message || 'Failed to delete user', 'danger');
        }
    } catch (err) {
        console.error('Error deleting user:', err);
        window.apiManager.showAlert('Error deleting user. Please try again.', 'danger');
    }
}

// Deactivate all users (admin only)
async function deactivateAllUsers() {
    const confirmed = await window.confirmationModal.confirmDestructive(
        'Are you sure you want to deactivate ALL users?',
        'Deactivate All Users',
        'This will deactivate all users except yourself. This action can be reversed by reactivating users individually.'
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await window.apiManager.authenticatedFetch(`${window.apiManager.API_URL}/users/deactivate-all`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const result = await response.json();
            // Reload users list to reflect changes
            loadUsers();
            window.apiManager.showAlert(
                `Successfully deactivated ${result.deactivatedCount} user(s)`,
                'success'
            );
        } else {
            const errorData = await response.json();
            window.apiManager.showAlert(errorData.message || 'Failed to deactivate users', 'danger');
        }
    } catch (err) {
        console.error('Error deactivating all users:', err);
        window.apiManager.showAlert('Error deactivating users. Please try again.', 'danger');
    }
}

// Update UI with user information
function updateUserInterface(currentUser) {
    // Update sidebar greeting
    const userGreetingSidebar = document.getElementById('user-greeting-sidebar');
    if (userGreetingSidebar) {
        userGreetingSidebar.textContent = `Welcome ${currentUser.name}`;
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
    // Removed current time update logic
}

// Removed updateCurrentTime function

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
window.deactivateAllUsers = deactivateAllUsers;

// Remove Calendar tab injection from JS

// Add Calendar page container if not present
if (!document.getElementById('calendar-page')) {
    const appContent = document.getElementById('app-content');
    if (appContent) {
        const calendarPage = document.createElement('div');
        calendarPage.id = 'calendar-page';
        calendarPage.className = 'page-content d-none';
        calendarPage.innerHTML = `
            <div class="container py-4">
                <h2><i class="bi bi-calendar"></i> Appointments Calendar</h2>
                <div id="simple-calendar"></div>
            </div>
        `;
        appContent.appendChild(calendarPage);
    }
}

// Render a simple calendar (month view) and show appointments
function renderSimpleCalendar(appointments) {
    const calendarEl = document.getElementById('simple-calendar');
    if (!calendarEl) return;
    // Get current month/year
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    // Build calendar grid
    let html = '<table class="table table-bordered"><thead><tr>';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let d of days) html += `<th>${d}</th>`;
    html += '</tr></thead><tbody><tr>';
    let dayOfWeek = firstDay.getDay();
    for (let i = 0; i < dayOfWeek; i++) html += '<td></td>';
    for (let date = 1; date <= daysInMonth; date++) {
        if ((dayOfWeek % 7) === 0 && date !== 1) html += '</tr><tr>';
        html += `<td><div><strong>${date}</strong></div>`;
        // Show appointments for this day
        const appts = appointments.filter(a => {
            const apptDate = new Date(a.date);
            return apptDate.getFullYear() === year && apptDate.getMonth() === month && apptDate.getDate() === date;
        });
        for (let a of appts) {
            html += `<div class="badge bg-info text-dark my-1 w-100" title="${a.module}">${a.title}</div>`;
        }
        html += '</td>';
        dayOfWeek++;
    }
    while ((dayOfWeek % 7) !== 0) { html += '<td></td>'; dayOfWeek++; }
    html += '</tr></tbody></table>';
    calendarEl.innerHTML = html;
}

// Load appointments from Leads and other modules
async function loadAppointments() {
    let appointments = [];
    // Example: Load from Leads
    if (window.leadsManager && window.leadsManager.getAppointments) {
        const leadAppointments = await window.leadsManager.getAppointments();
        appointments = appointments.concat(leadAppointments.map(a => ({ ...a, module: 'Lead' })));
    }
    // Add more modules here as needed
    return appointments;
}
