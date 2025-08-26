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

            // NEW: fetch upcoming meetings and render only future meetings
            try {
                let meetings = [];
                const mResp = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/meetings`);
                if (mResp.ok) {
                    meetings = await mResp.json();
                } else {
                    console.warn('Failed to fetch meetings, status:', mResp.status);
                }
                this.renderAgentMeetings(meetings || []);
            } catch (meetErr) {
                console.error('Failed to load meetings for dashboard:', meetErr);
            }

            // Charts removed: nothing to create

        } catch (err) {
            console.error('Error loading dashboard data:', err);
        }
    }

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

            // Determine viewer role
            const currentUser = this.apiManager && typeof this.apiManager.getCurrentUser === 'function'
                ? this.apiManager.getCurrentUser()
                : null;
            const isAgent = currentUser && currentUser.role === 'agent';

            // Update header titles for admin/agent (keeps header)
            if (custContainer) {
                const card = custContainer.closest('.card');
                if (card) {
                    const titleEl = card.querySelector('.card-title');
                    if (titleEl) titleEl.textContent = isAgent ? 'Customers' : 'Customers by Agent';
                }
            }
            if (depContainer) {
                const card = depContainer.closest('.card');
                if (card) {
                    const titleEl = card.querySelector('.card-title');
                    if (titleEl) titleEl.textContent = isAgent ? 'Depositors' : 'Depositors by Agent';
                }
            }

            // Render simplified large stat for agents (big number like other dashboard cards)
            if (isAgent) {
                const custCount = Array.isArray(customersByAgent) && customersByAgent.length
                    ? customersByAgent.reduce((s, it) => s + (it.count || 0), 0)
                    : 0;
                const depCount = Array.isArray(depositorsByAgent) && depositorsByAgent.length
                    ? depositorsByAgent.reduce((s, it) => s + (it.count || 0), 0)
                    : 0;

                // Render only the big number (remove inner label)
                const renderLargeStat = (container, count, iconClass = '', badgeClass = 'bg-primary') => {
                    if (!container) return;
                    const card = container.closest('.card');
                    const cardBody = card ? card.querySelector('.card-body') : null;

                    if (cardBody) {
                        // No inner label text — only icon (top-right) and large count
                        cardBody.innerHTML = `
                        <div class="d-flex flex-column">
                            <div class="d-flex justify-content-end align-items-center mb-2">
                                ${iconClass ? `<i class="${iconClass} fs-4"></i>` : ''}
                            </div>
                            <h2 class="card-text mt-2">${count}</h2>
                        </div>
                    `;
                        return;
                    }

                    // Fallback: show only the badge count
                    container.innerHTML = '';
                    const el = document.createElement('div');
                    el.className = 'list-group-item d-flex justify-content-end align-items-center';
                    el.innerHTML = `<span class="badge ${badgeClass} rounded-pill">${count}</span>`;
                    container.appendChild(el);
                };

                renderLargeStat(custContainer, custCount, 'bi bi-people-fill text-primary', 'bg-primary');
                renderLargeStat(depContainer, depCount, 'bi bi-currency-dollar text-success', 'bg-success');

                return;
            }

            // Admin / default behavior: show per-agent rows
            if (!isAgent) {
                // Clear containers
                if (custContainer) custContainer.innerHTML = '';
                if (depContainer) depContainer.innerHTML = '';

                // Build a combined map of agents -> { id, name, customers, depositors }
                const agentMap = new Map();

                const getAgentInfo = (item) => {
                    // Prefer explicit agentName returned by the aggregation if present
                    const agentNameField = item.agentName || item.agent_name || item.name || '';

                    // Determine id from common fields
                    let id = 'unassigned';
                    if (item.agent && typeof item.agent === 'object') {
                        id = String(item.agent._id || item.agent.id || item.agent);
                    } else if (item.agent && typeof item.agent === 'string') {
                        id = item.agent;
                    } else if (item.agentId) {
                        id = String(item.agentId);
                    } else if (item._id) {
                        id = String(item._id);
                    }

                    // If agentName looks like an ObjectId, ignore it so we can replace it with a real name later
                    const looksLikeObjectId = (s) => typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);
                    let name = agentNameField && !looksLikeObjectId(agentNameField) ? agentNameField : '';

                    // If no friendly name available, leave empty (will be filled by /users fetch if possible)
                    if (!name) name = '';

                    return { id: id || 'unassigned', name: name || '', count: item.count || 0 };
                };

                (customersByAgent || []).forEach(it => {
                    const { id, name, count } = getAgentInfo(it);
                    const existing = agentMap.get(id);
                    if (existing) {
                        existing.customers = (existing.customers || 0) + count;
                        if (!existing.name && name) existing.name = name;
                    } else {
                        agentMap.set(id, { id, name, customers: count, depositors: 0 });
                    }
                });

                (depositorsByAgent || []).forEach(it => {
                    const { id, name, count } = getAgentInfo(it);
                    const existing = agentMap.get(id);
                    if (existing) {
                        existing.depositors = (existing.depositors || 0) + count;
                        if (!existing.name && name) existing.name = name;
                    } else {
                        agentMap.set(id, { id, name, customers: 0, depositors: count });
                    }
                });

                // Helper to render agent rows
                const renderAgents = (agentsArr) => {
                    if (custContainer) custContainer.innerHTML = '';
                    if (depContainer) depContainer.innerHTML = '';

                    if (!agentsArr || agentsArr.length === 0) {
                        if (custContainer) custContainer.innerHTML = '<div class="text-muted small p-2">No data</div>';
                        if (depContainer) depContainer.innerHTML = '<div class="text-muted small p-2">No data</div>';
                        return;
                    }

                    const isObjectId = (s) => typeof s === 'string' && /^[0-9a-fA-F]{24}$/.test(s);

                    // Prepare two independent sorted lists: customers and depositors
                    const sortedCustomers = agentsArr.slice().sort((a, b) => (b.customers || 0) - (a.customers || 0));
                    const sortedDepositors = agentsArr.slice().sort((a, b) => (b.depositors || 0) - (a.depositors || 0));

                    // Determine the max length for scroll behavior
                    const maxItems = Math.max(sortedCustomers.length, sortedDepositors.length);
                    const ITEM_HEIGHT = 48; // px approximate height of a list item
                    const maxVisible = 5;
                    const maxHeightPx = ITEM_HEIGHT * maxVisible;

                    // Apply scrolling styles based on maxItems
                    if (custContainer) {
                        if (maxItems > maxVisible) {
                            custContainer.style.maxHeight = maxHeightPx + 'px';
                            custContainer.style.overflowY = 'auto';
                        } else {
                            custContainer.style.maxHeight = '';
                            custContainer.style.overflowY = '';
                        }
                    }
                    if (depContainer) {
                        if (maxItems > maxVisible) {
                            depContainer.style.maxHeight = maxHeightPx + 'px';
                            depContainer.style.overflowY = 'auto';
                        } else {
                            depContainer.style.maxHeight = '';
                            depContainer.style.overflowY = '';
                        }
                    }

                    // Render customers column (sorted by customers)
                    sortedCustomers.forEach((a, idx) => {
                        const rawName = a.name || '';
                        const displayName = (!rawName || rawName === a.id || isObjectId(rawName)) ? ('Agent ' + (idx + 1)) : rawName;

                        if (custContainer) {
                            const custRow = document.createElement('div');
                            custRow.className = 'list-group-item d-flex justify-content-between align-items-center';
                            custRow.innerHTML = '<div class="fw-semibold">' + displayName + '</div>' +
                                '<div><span class="badge bg-primary rounded-pill">' + (a.customers || 0) + '</span></div>';
                            custContainer.appendChild(custRow);
                        }
                    });

                    // Render depositors column (sorted by depositors)
                    sortedDepositors.forEach((a, idx) => {
                        const rawName = a.name || '';
                        const displayName = (!rawName || rawName === a.id || isObjectId(rawName)) ? ('Agent ' + (idx + 1)) : rawName;

                        if (depContainer) {
                            const depRow = document.createElement('div');
                            depRow.className = 'list-group-item d-flex justify-content-between align-items-center';
                            depRow.innerHTML = '<div class="fw-semibold">' + displayName + '</div>' +
                                '<div><span class="badge bg-success rounded-pill">' + (a.depositors || 0) + '</span></div>';
                            depContainer.appendChild(depRow);
                        }
                    });
                };

                // Initial render from aggregated data (may be incomplete)
                let agents = Array.from(agentMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                renderAgents(agents);

                // Attempt to fetch full agent list (admin only) and ensure every agent is shown
                (async () => {
                    try {
                        if (!this.apiManager || typeof this.apiManager.authenticatedFetch !== 'function') return;
                        const resp = await this.apiManager.authenticatedFetch(`${this.apiManager.API_URL}/users`);
                        if (!resp.ok) return; // skip if cannot fetch
                        const data = await resp.json();
                        const users = Array.isArray(data) ? data : (Array.isArray(data.users) ? data.users : []);
                        if (!users || users.length === 0) return;

                        let added = false;
                        users.filter(u => u.role === 'agent').forEach(u => {
                            const id = String(u._id || u.id || u);
                            if (!agentMap.has(id)) {
                                added = true;
                                agentMap.set(id, { id, name: u.name || u.username || ('Agent ' + id), customers: 0, depositors: 0 });
                            } else {
                                // ensure name is present
                                const ex = agentMap.get(id);
                                if ((!ex.name || ex.name === 'Unassigned') && (u.name || u.username)) ex.name = u.name || u.username;
                            }
                        });

                        if (added) {
                            agents = Array.from(agentMap.values()).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                            renderAgents(agents);
                        }
                    } catch (err) {
                        // silently ignore user fetch errors
                        console.warn('Could not fetch users to augment agent list:', err);
                    }
                })();

                return;
            }
            // ...existing code...
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
                'Deposited'
            ];

            const styleMap = {
                'new': 'bg-primary',
                'No Answer': 'bg-warning text-dark',
                'Voice Mail': 'bg-warning text-dark',
                'Hang Up': 'bg-warning text-dark',
                'Wrong Number': 'bg-secondary',
                'Call Back NOT Qualified': 'bg-danger',
                'Call Back Qualified': 'bg-success',
                'Deposited': 'bg-success'
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

    // Render a simple upcoming meetings list (only future meetings)
    renderAgentMeetings(meetings) {
        try {
            const container = document.getElementById('agent-meetings-list');
            if (!container) return;
            container.innerHTML = '';

            const now = new Date();

            const parseMeetingDate = (m) => {
                if (!m) return null;
                // Common formats: m.datetime, m.date + m.time, m.date, m.timestamp
                if (m.datetime) {
                    const dt = new Date(m.datetime);
                    if (!isNaN(dt)) return dt;
                }
                if (m.timestamp) {
                    const dt = new Date(m.timestamp);
                    if (!isNaN(dt)) return dt;
                }
                if (m.date) {
                    const time = m.time || m.startTime || '00:00';
                    const iso = `${m.date}T${time}`;
                    const dt = new Date(iso);
                    if (!isNaN(dt)) return dt;
                }
                return null;
            };

            const upcoming = (meetings || [])
                .map(m => ({ m, dt: parseMeetingDate(m) }))
                .filter(x => x.dt && x.dt >= now)
                .sort((a, b) => a.dt - b.dt)
                .slice(0, 10);

            if (upcoming.length === 0) {
                container.innerHTML = '<div class="text-muted small p-2">No upcoming meetings</div>';
                return;
            }

            const formatRelative = (dt) => {
                const diffMs = dt - new Date();
                const diffSec = Math.round(diffMs / 1000);
                if (diffSec < 60) return `${diffSec}s`;
                const diffMin = Math.round(diffSec / 60);
                if (diffMin < 60) return `${diffMin}m`;
                const diffHr = Math.round(diffMin / 60);
                if (diffHr < 24) return `${diffHr}h`;
                const diffDays = Math.round(diffHr / 24);
                return `${diffDays}d`;
            };

            upcoming.forEach(item => {
                const m = item.m;
                const dt = item.dt;
                const displayDate = dt.toLocaleDateString();
                const displayTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                const el = document.createElement('div');
                el.className = 'list-group-item d-flex justify-content-between align-items-start';
                el.innerHTML = `
					<div>
						<div class="fw-bold">${m.title || (m.leadFullName ? 'Meeting • ' + (m.leadFullName) : 'Meeting')}</div>
						<div class="small text-muted">${displayDate}${m.time ? ' • ' + displayTime : ''}${m.leadFullName ? ' • ' + m.leadFullName : ''}</div>
					</div>
					<div class="text-end ms-2">
						<span class="badge bg-primary rounded-pill">${formatRelative(dt)}</span>
					</div>
				`;
                container.appendChild(el);
            });
        } catch (err) {
            console.error('Error rendering agent meetings:', err);
        }
    }

    // Destroy charts to prevent memory leaks
    destroyCharts() {
        // no-op (charts removed)
    }
}

// Create global instance
window.dashboard = new Dashboard(window.apiManager);
