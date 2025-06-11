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
            document.getElementById('pending-breakdown').textContent = 
                `New: ${stats.statusBreakdown.new} | No Answer: ${stats.statusBreakdown['No Answer']} | Voice Mail: ${stats.statusBreakdown['Voice Mail']}`;
            document.getElementById('conversion-rate').textContent = `${qualifiedRate}% qualified rate`;
            document.getElementById('conversion-rate-bar').style.width = `${qualifiedRate}%`;
            document.getElementById('conversion-rate-bar').setAttribute('aria-valuenow', qualifiedRate);
            
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
            // Create charts after a small delay to ensure DOM is ready
            setTimeout(() => {
                try {
                    this.createLeadTrendsChart(stats.monthlyTrends);
                } catch (chartError) {
                    console.error('Error creating charts:', chartError);
                }            }, 100);
            
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

    // Create lead trends chart
    createLeadTrendsChart(monthlyTrends) {
        try {
            const canvas = document.getElementById('lead-trends-chart');
            if (!canvas) {
                console.error('Lead trends chart canvas not found');
                return;
            }
            
            const ctx = canvas.getContext('2d');
            
            // Clear any existing charts
            if (window.leadTrendsChart) {
                window.leadTrendsChart.destroy();
                window.leadTrendsChart = null;
            }
            
            // Process the monthly trends data
            const labels = [];
            const data = [];
            
            if (monthlyTrends && monthlyTrends.length > 0) {
                monthlyTrends.forEach(item => {
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    const monthIdx = item._id.month - 1;
                    const monthName = monthNames[monthIdx];
                    labels.push(`${monthName} ${item._id.year}`);
                    data.push(item.count);
                });
            } else {
                // Fallback sample data
                labels.push('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun');
                data.push(5, 12, 18, 15, 25, 30);
            }
            
            window.leadTrendsChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'New Leads',
                        data: data,
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        intersect: false,
                        mode: 'index'
                    },
                    plugins: {
                        legend: {
                            position: 'top',
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false
                        }
                    },
                    scales: {
                        x: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Month'
                            }
                        },
                        y: {
                            display: true,
                            title: {
                                display: true,
                                text: 'Number of Leads'
                            },
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }                }
            });
        } catch (error) {
            console.error('Error creating lead trends chart:', error);        }
    }

    // Destroy charts to prevent memory leaks
    destroyCharts() {
        if (window.leadTrendsChart) {
            window.leadTrendsChart.destroy();
            window.leadTrendsChart = null;
        }
    }
}

// Create global instance
window.dashboard = new Dashboard(window.apiManager);
