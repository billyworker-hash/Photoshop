// Dashboard.js - Handles dashboard functionality
class Dashboard {
    constructor(apiManager) {
        this.apiManager = apiManager;
    }

    // Load dashboard data
    async loadDashboardData() {
        try {
            // Fetch dashboard stats from the API
            const response = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/dashboard/stats`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch dashboard statistics');
            }
              const stats = await response.json();

            // Calculate total pending leads
            const pendingLeads = stats.statusBreakdown.new + 
                                stats.statusBreakdown['No Answer'] + 
                                stats.statusBreakdown['Voice Mail'];
            
            // Calculate qualified rate
            const qualifiedRate = stats.totalLeads > 0 
                ? Math.round((stats.statusBreakdown['Call Back Qualified'] / stats.totalLeads) * 100) 
                : 0;
            
            // Update the UI
            document.getElementById('total-leads').textContent = stats.totalLeads;
            document.getElementById('converted-leads').textContent = stats.statusBreakdown['Call Back Qualified'];
            document.getElementById('pending-leads').textContent = pendingLeads;
            // Render a full status breakdown as badges
            this.renderStatusBreakdown(stats.statusBreakdown || {});
            
            // Calculate month-over-month growth
            let growth = '+0%';
            if (stats.monthlyTrends && stats.monthlyTrends.length >= 2) {
                const currentMonth = stats.monthlyTrends[stats.monthlyTrends.length - 1].count;
                const lastMonth = stats.monthlyTrends[stats.monthlyTrends.length - 2].count;
                if (lastMonth > 0) {
                    const growthRate = Math.round(((currentMonth - lastMonth) / lastMonth) * 100);
                    growth = (growthRate >= 0 ? '+' : '') + growthRate + '% from last month';
                }
            }
            document.getElementById('total-leads-trend').textContent = growth;            

            // Render agents cards if provided
            try {
                this.renderAgentCards(stats.customersByAgent || [], stats.depositorsByAgent || []);
            } catch (renderErr) {
                console.error('Error rendering agent cards:', renderErr);
            }

            // Charts removed: nothing to create
            
        } catch (err) {
            console.error('Error loading dashboard data:', err);
        }    }

    // Format lead status
    formatStatus(status) {
        if (!status) return '-';
        // For new status values that already have proper formatting, return as-is
        if (status.includes(' ') || status === 'new') {
            return status.charAt(0).toUpperCase() + status.slice(1);
        }
        // For legacy hyphenated statuses, convert hyphens to spaces and capitalize
        return status.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    // Render small list-group cards for customers/depositors per agent
    renderAgentCards(customersByAgent, depositorsByAgent) {
        try {
            const custContainer = document.getElementById('customers-by-agent-cards');
            const depContainer = document.getElementById('depositors-by-agent-cards');

            if (custContainer) {
                custContainer.innerHTML = '';
                if (!customersByAgent || customersByAgent.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'text-muted small';
                    empty.textContent = 'No customers to show';
                    custContainer.appendChild(empty);
                } else {
                    customersByAgent.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'list-group-item d-flex justify-content-between align-items-center';
                        const name = document.createElement('div');
                        name.innerHTML = `<strong>${item.agentName || 'Unassigned'}</strong>`;
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-primary rounded-pill';
                        badge.textContent = item.count || 0;
                        el.appendChild(name);
                        el.appendChild(badge);
                        custContainer.appendChild(el);
                    });
                }
            }

            if (depContainer) {
                depContainer.innerHTML = '';
                if (!depositorsByAgent || depositorsByAgent.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'text-muted small';
                    empty.textContent = 'No depositors to show';
                    depContainer.appendChild(empty);
                } else {
                    depositorsByAgent.forEach(item => {
                        const el = document.createElement('div');
                        el.className = 'list-group-item d-flex justify-content-between align-items-center';
                        const name = document.createElement('div');
                        name.innerHTML = `<strong>${item.agentName || 'Unassigned'}</strong>`;
                        const badge = document.createElement('span');
                        badge.className = 'badge bg-success rounded-pill';
                        badge.textContent = item.count || 0;
                        el.appendChild(name);
                        el.appendChild(badge);
                        depContainer.appendChild(el);
                    });
                }
            }
        } catch (err) {
            console.error('Error in renderAgentCards:', err);
        }
    }

    // Render status breakdown as badges in the pending-breakdown container
    renderStatusBreakdown(statusCounts) {
        try {
            const container = document.getElementById('pending-breakdown');
            if (!container) return;
            container.innerHTML = '';

            // Define order and badge styles for statuses
            const order = [
                'new',
                'No Answer',
                'Voice Mail',
                'Hang Up',
                'Wrong Number',
                'Call Back NOT Qualified',
                'Call Back Qualified',
                'deposited'
            ];

            const styleMap = {
                'new': 'bg-primary',
                'No Answer': 'bg-warning text-dark',
                'Voice Mail': 'bg-warning text-dark',
                'Hang Up': 'bg-warning text-dark',
                'Wrong Number': 'bg-secondary',
                'Call Back NOT Qualified': 'bg-danger',
                'Call Back Qualified': 'bg-success',
                'deposited': 'bg-success'
            };

            order.forEach(status => {
                const count = statusCounts[status] || 0;
                const badge = document.createElement('span');
                const cls = styleMap[status] || 'bg-secondary';
                badge.className = `badge ${cls} me-2 mb-1`;
                badge.textContent = `${status}: ${count}`;
                container.appendChild(badge);
            });
        } catch (err) {
            console.error('Error rendering status breakdown:', err);
        }
    }

    // Destroy charts to prevent memory leaks
    destroyCharts() {
        // no-op (charts removed)
    }
}

// Create global instance
window.dashboard = new Dashboard(window.apiManager);
