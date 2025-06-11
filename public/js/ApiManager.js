// ApiManager.js - Handles all API calls and authentication
class ApiManager {
    constructor() {
        this.API_URL = '/api';
        this.token = localStorage.getItem('token');
        this.currentUser = null;
    }

    // Global fetch wrapper with automatic auth handling
    async authenticatedFetch(url, options = {}) {
        const headers = {
            'Authorization': `Bearer ${this.token}`,
            ...options.headers
        };

        const response = await fetch(url, {
            ...options,
            headers
        });

        // If unauthorized, redirect to login
        if (response.status === 401) {
            console.log('Authentication failed, redirecting to login');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = '/login';
            throw new Error('Authentication failed');
        }

        return response;
    }

    // Update token
    setToken(newToken) {
        this.token = newToken;
        localStorage.setItem('token', newToken);
    }

    // Clear token
    clearToken() {
        this.token = null;
        localStorage.removeItem('token');
        localStorage.removeItem('user');
    }    // Get current user
    getCurrentUser() {
        if (!this.currentUser && this.token) {
            try {
                const payload = JSON.parse(atob(this.token.split('.')[1]));
                this.currentUser = {
                    id: payload.id,
                    role: payload.role,
                    name: payload.name
                };
            } catch (error) {
                console.error('Error decoding token:', error);
            }
        }
        return this.currentUser;
    }

    // Check if token is valid
    isTokenValid() {
        if (!this.token) return false;
        
        try {
            const payload = JSON.parse(atob(this.token.split('.')[1]));
            return payload.exp && payload.exp > Date.now() / 1000;
        } catch (error) {
            return false;
        }
    }

    // Convenience methods for HTTP requests
    async get(endpoint) {
        const response = await this.authenticatedFetch(`${this.API_URL}${endpoint}`);
        if (!response.ok) {
            throw new Error(`GET ${endpoint} failed: ${response.statusText}`);
        }
        return await response.json();
    }

    async post(endpoint, data) {
        const response = await this.authenticatedFetch(`${this.API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || `POST ${endpoint} failed`);
        }
        return await response.json();
    }

    async put(endpoint, data) {
        const response = await this.authenticatedFetch(`${this.API_URL}${endpoint}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || `PUT ${endpoint} failed`);
        }
        return await response.json();
    }

    async delete(endpoint) {
        const response = await this.authenticatedFetch(`${this.API_URL}${endpoint}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.message || `DELETE ${endpoint} failed`);
        }
        return await response.json();
    }

    // Show alert message (for consistency with expected interface)
    showAlert(message, type = 'info') {
        // Create a simple alert div
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
        alertDiv.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.body.appendChild(alertDiv);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// Create global instance
window.apiManager = new ApiManager();
