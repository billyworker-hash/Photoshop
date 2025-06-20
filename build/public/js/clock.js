// Clock System JavaScript
class ClockSystem {    constructor() {
        this.user = null;
        this.currentStatus = 'clocked-out';
        this.todayEntry = null;
        this.agents = [];
        this.currentDate = new Date();
        this.calendarEntries = [];
        
        this.init();
    }
    
    async init() {
        // Check authentication
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login';
            return;
        }
        
        try {
            // Get user info from token
            const payload = JSON.parse(atob(token.split('.')[1]));
            this.user = payload;
            
            // Update welcome message
            document.getElementById('userWelcome').textContent = `Welcome, ${this.user.name}`;
              // Show admin section if user is admin
            if (this.user.role === 'admin') {
                document.getElementById('adminSection').style.display = 'block';
                document.getElementById('calendarFilters').style.display = 'flex';
                document.getElementById('calendarAgentSelect').style.display = 'block';
                await this.loadAgents();
            }
            
            // Load today's status and entries
            await this.loadTodayStatus();
            await this.loadTimeEntries();
            await this.loadCalendarData();
            
            // Set up event listeners
            this.setupEventListeners();
            
            // Start clock
            this.updateClock();
            setInterval(() => this.updateClock(), 1000);
            
        } catch (error) {
            console.error('Initialization error:', error);
            this.showAlert('Error loading clock system', 'error');
            window.location.href = '/login';
        }
    }
    
    setupEventListeners() {
        document.getElementById('clockInBtn').addEventListener('click', () => this.clockIn());
        document.getElementById('clockOutBtn').addEventListener('click', () => this.clockOut());
          if (this.user.role === 'admin') {
            document.getElementById('updateRateBtn').addEventListener('click', () => this.updateHourlyRate());
            document.getElementById('addManualEntryBtn').addEventListener('click', () => this.addManualEntry());
            document.getElementById('manualDate').valueAsDate = new Date();
            document.getElementById('calendarViewSelect').addEventListener('change', () => this.loadCalendarData());
            document.getElementById('calendarAgentSelect').addEventListener('change', () => this.loadCalendarData());
        }
        
        // Calendar navigation
        document.getElementById('prevMonth').addEventListener('click', () => this.changeMonth(-1));
        document.getElementById('nextMonth').addEventListener('click', () => this.changeMonth(1));
    }
    
    updateClock() {
        const now = new Date();
        const timeString = now.toLocaleTimeString('en-US', { 
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
        const dateString = now.toLocaleDateString('en-US', { 
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        document.getElementById('currentTime').textContent = timeString;
        document.getElementById('currentDate').textContent = dateString;
    }
    
    async loadTodayStatus() {
        try {
            const response = await fetch('/api/clock/today', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.todayEntry = data.entry;
                this.updateStatusDisplay();
                this.updateTodaySummary();
            }
        } catch (error) {
            console.error('Error loading today status:', error);
        }
    }
    
    updateStatusDisplay() {
        const statusIndicator = document.getElementById('statusIndicator');
        const clockInBtn = document.getElementById('clockInBtn');
        const clockOutBtn = document.getElementById('clockOutBtn');
        
        if (this.todayEntry && this.todayEntry.status === 'clocked-in') {
            this.currentStatus = 'clocked-in';
            statusIndicator.className = 'status-indicator status-clocked-in';
            statusIndicator.textContent = 'Status: Clocked In';
            clockInBtn.style.display = 'none';
            clockOutBtn.style.display = 'block';
        } else {
            this.currentStatus = 'clocked-out';
            statusIndicator.className = 'status-indicator status-clocked-out';
            statusIndicator.textContent = 'Status: Clocked Out';
            clockInBtn.style.display = 'block';
            clockOutBtn.style.display = 'none';
        }
    }
    
    updateTodaySummary() {
        if (this.todayEntry) {
            const clockIn = this.todayEntry.clockIn ? new Date(this.todayEntry.clockIn).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
            const clockOut = this.todayEntry.clockOut ? new Date(this.todayEntry.clockOut).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
            const totalHours = this.todayEntry.totalHours || 0;
            const rate = this.todayEntry.hourlyRate || 0;
            const pay = this.todayEntry.totalPay || 0;
            
            document.getElementById('todayClockIn').textContent = clockIn;
            document.getElementById('todayClockOut').textContent = clockOut;
            document.getElementById('todayTotalHours').textContent = totalHours.toFixed(2);
            document.getElementById('todayRate').textContent = rate.toFixed(2);
            document.getElementById('todayPay').textContent = pay.toFixed(2);
            document.getElementById('todayHours').textContent = `Today's Hours: ${totalHours.toFixed(2)}`;
        } else {
            document.getElementById('todayClockIn').textContent = '--:--';
            document.getElementById('todayClockOut').textContent = '--:--';
            document.getElementById('todayTotalHours').textContent = '0.00';
            document.getElementById('todayRate').textContent = '0.00';
            document.getElementById('todayPay').textContent = '0.00';
            document.getElementById('todayHours').textContent = 'Today\'s Hours: 0.00';
        }
    }
    
    async clockIn() {
        try {
            this.setLoading(true);
            
            const response = await fetch('/api/clock/in', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showAlert('Successfully clocked in!', 'success');
                await this.loadTodayStatus();
                await this.loadTimeEntries();
            } else {
                this.showAlert(data.message || 'Error clocking in', 'error');
            }
        } catch (error) {
            console.error('Clock in error:', error);
            this.showAlert('Error clocking in', 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    async clockOut() {
        try {
            this.setLoading(true);
            
            const response = await fetch('/api/clock/out', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showAlert('Successfully clocked out!', 'success');
                await this.loadTodayStatus();
                await this.loadTimeEntries();
            } else {
                this.showAlert(data.message || 'Error clocking out', 'error');
            }
        } catch (error) {
            console.error('Clock out error:', error);
            this.showAlert('Error clocking out', 'error');
        } finally {
            this.setLoading(false);
        }
    }
      async loadAgents() {
        try {
            const response = await fetch('/api/users', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.agents = data || []; // Fixed: data is the array directly, not data.users
                this.populateAgentSelects();
            } else {
                console.error('Failed to load agents:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Error loading agents:', error);
        }
    }    populateAgentSelects() {
        const agentSelect = document.getElementById('agentSelect');
        const manualAgent = document.getElementById('manualAgent');
        
        agentSelect.innerHTML = '<option value="">Select Agent</option>';
        manualAgent.innerHTML = '<option value="">Select Agent</option>';
        
        // Also populate calendar agent select
        const calendarAgentSelect = document.getElementById('calendarAgentSelect');
        if (calendarAgentSelect) {
            calendarAgentSelect.innerHTML = '<option value="">All Agents</option>';
        }
        
        this.agents.forEach(agent => {
            const option1 = new Option(agent.name, agent._id); // Fixed: use _id instead of id
            const option2 = new Option(agent.name, agent._id); // Fixed: use _id instead of id
            agentSelect.add(option1);
            manualAgent.add(option2);
            
            if (calendarAgentSelect) {
                const option3 = new Option(agent.name, agent._id);
                calendarAgentSelect.add(option3);
            }
        });
    }
    
    async updateHourlyRate() {
        const agentId = document.getElementById('agentSelect').value;
        const rate = document.getElementById('hourlyRate').value;
        
        if (!agentId || !rate) {
            this.showAlert('Please select an agent and enter a rate', 'error');
            return;
        }
        
        try {
            this.setLoading(true);
            
            const response = await fetch('/api/clock/rate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    agentId: agentId,
                    hourlyRate: parseFloat(rate)
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showAlert('Hourly rate updated successfully!', 'success');
                document.getElementById('agentSelect').value = '';
                document.getElementById('hourlyRate').value = '';
                
                // Refresh today's status if it's the current user
                if (agentId === this.user.id) {
                    await this.loadTodayStatus();
                }
            } else {
                this.showAlert(data.message || 'Error updating rate', 'error');
            }
        } catch (error) {
            console.error('Update rate error:', error);
            this.showAlert('Error updating rate', 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    async addManualEntry() {
        const agentId = document.getElementById('manualAgent').value;
        const date = document.getElementById('manualDate').value;
        const clockIn = document.getElementById('manualClockIn').value;
        const clockOut = document.getElementById('manualClockOut').value;
        const rate = document.getElementById('manualRate').value;
        const notes = document.getElementById('manualNotes').value;
        
        if (!agentId || !date || !clockIn || !clockOut || !rate) {
            this.showAlert('Please fill in all required fields', 'error');
            return;
        }
        
        try {
            this.setLoading(true);
            
            const response = await fetch('/api/clock/manual', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    agentId: agentId,
                    date: date,
                    clockIn: clockIn,
                    clockOut: clockOut,
                    hourlyRate: parseFloat(rate),
                    notes: notes
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.showAlert('Manual entry added successfully!', 'success');
                
                // Clear form
                document.getElementById('manualAgent').value = '';
                document.getElementById('manualDate').valueAsDate = new Date();
                document.getElementById('manualClockIn').value = '';
                document.getElementById('manualClockOut').value = '';
                document.getElementById('manualRate').value = '';
                document.getElementById('manualNotes').value = '';
                
                await this.loadTimeEntries();
                  // Refresh today's status if it's the current user and today's date
                if (agentId === this.user.id && date === new Date().toISOString().split('T')[0]) {
                    await this.loadTodayStatus();
                }
                
                // Refresh calendar data
                await this.loadCalendarData();
            } else {
                this.showAlert(data.message || 'Error adding manual entry', 'error');
            }
        } catch (error) {
            console.error('Add manual entry error:', error);
            this.showAlert('Error adding manual entry', 'error');
        } finally {
            this.setLoading(false);
        }
    }
    
    async loadTimeEntries() {
        try {
            const response = await fetch('/api/clock/entries', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.displayTimeEntries(data.entries || []);
            }
        } catch (error) {
            console.error('Error loading time entries:', error);
        }
    }
    
    displayTimeEntries(entries) {
        const tbody = document.getElementById('entriesTableBody');
        tbody.innerHTML = '';
        
        if (entries.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #666;">No time entries found</td></tr>';
            return;
        }
        
        entries.forEach(entry => {
            const row = document.createElement('tr');
            const date = new Date(entry.date).toLocaleDateString();
            const clockIn = entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
            const clockOut = entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
            const hours = (entry.totalHours || 0).toFixed(2);
            const rate = (entry.hourlyRate || 0).toFixed(2);
            const pay = (entry.totalPay || 0).toFixed(2);
            const type = entry.isManualEntry ? 'Manual' : 'Auto';
              row.innerHTML = `
                <td>${date}</td>
                <td>${clockIn}</td>
                <td>${clockOut}</td>
                <td class="number">${hours}</td>
                <td class="number">₪${rate}</td>
                <td class="number">₪${pay}</td>
                <td>${type}</td>
            `;
            
            tbody.appendChild(row);
        });
    }
    
    showAlert(message, type = 'success') {
        const alertContainer = document.getElementById('alertContainer');
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type}`;
        alertDiv.textContent = message;
        
        alertContainer.innerHTML = '';
        alertContainer.appendChild(alertDiv);
        
        setTimeout(() => {
            alertDiv.remove();
        }, 5000);
    }
      setLoading(loading) {
        const container = document.querySelector('.clock-container');
        if (loading) {
            container.classList.add('loading');
        } else {
            container.classList.remove('loading');
        }
    }
    
    // Calendar methods
    changeMonth(direction) {
        this.currentDate.setMonth(this.currentDate.getMonth() + direction);
        this.loadCalendarData();
    }
    
    async loadCalendarData() {
        try {
            const year = this.currentDate.getFullYear();
            const month = this.currentDate.getMonth() + 1; // JavaScript months are 0-based
            
            let url = `/api/clock/calendar?year=${year}&month=${month}`;
            
            // Add agent filter for admin
            if (this.user.role === 'admin') {
                const viewMode = document.getElementById('calendarViewSelect').value;
                const selectedAgent = document.getElementById('calendarAgentSelect').value;
                
                if (viewMode === 'all' && selectedAgent) {
                    url += `&agentId=${selectedAgent}`;
                } else if (viewMode === 'my') {
                    url += `&agentId=${this.user.id}`;
                }
                // If viewMode is 'all' and no specific agent, show all agents
            } else {
                // Regular agents only see their own data
                url += `&agentId=${this.user.id}`;
            }
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.calendarEntries = data.entries || [];
                this.renderCalendar();
                this.updateMonthlySummary();
            }
        } catch (error) {
            console.error('Error loading calendar data:', error);
        }
    }
    
    renderCalendar() {
        const calendarGrid = document.getElementById('calendarGrid');
        const monthYearDisplay = document.getElementById('calendarMonthYear');
        
        // Update month/year display
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        monthYearDisplay.textContent = `${monthNames[this.currentDate.getMonth()]} ${this.currentDate.getFullYear()}`;
        
        // Clear calendar
        calendarGrid.innerHTML = '';
        
        // Add day headers
        const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayHeaders.forEach(day => {
            const headerCell = document.createElement('div');
            headerCell.className = 'calendar-header-cell';
            headerCell.textContent = day;
            calendarGrid.appendChild(headerCell);
        });
        
        // Get first day of month and number of days
        const firstDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), 1);
        const lastDay = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay()); // Start from Sunday
        
        // Create calendar days
        const today = new Date();
        for (let i = 0; i < 42; i++) { // 6 weeks max
            const currentDate = new Date(startDate);
            currentDate.setDate(startDate.getDate() + i);
            
            const dayElement = document.createElement('div');
            dayElement.className = 'calendar-day';
            
            // Check if day is in current month
            if (currentDate.getMonth() !== this.currentDate.getMonth()) {
                dayElement.classList.add('other-month');
            }
            
            // Check if today
            if (currentDate.toDateString() === today.toDateString()) {
                dayElement.classList.add('today');
            }
            
            // Find entries for this day
            const dateString = currentDate.toISOString().split('T')[0];
            const dayEntries = this.calendarEntries.filter(entry => {
                const entryDate = new Date(entry.date).toISOString().split('T')[0];
                return entryDate === dateString;
            });
            
            // Build day content
            const dayNumber = document.createElement('div');
            dayNumber.className = 'day-number';
            dayNumber.textContent = currentDate.getDate();
            dayElement.appendChild(dayNumber);
            
            if (dayEntries.length > 0) {
                dayElement.classList.add('has-entry');
                
                // Calculate totals for the day
                const totalHours = dayEntries.reduce((sum, entry) => sum + (entry.totalHours || 0), 0);
                const totalPay = dayEntries.reduce((sum, entry) => sum + (entry.totalPay || 0), 0);
                
                if (totalHours > 0) {
                    const hoursElement = document.createElement('div');
                    hoursElement.className = 'day-hours';
                    hoursElement.textContent = `${totalHours.toFixed(1)}h`;
                    dayElement.appendChild(hoursElement);
                }
                
                if (totalPay > 0) {
                    const payElement = document.createElement('div');
                    payElement.className = 'day-pay';
                    payElement.textContent = `₪${totalPay.toFixed(0)}`;
                    dayElement.appendChild(payElement);
                }
                
                // Add click handler to show day details
                dayElement.addEventListener('click', () => this.showDayDetails(dateString, dayEntries));
            }
            
            calendarGrid.appendChild(dayElement);
            
            // Stop if we've filled the month and reached the end of a week
            if (currentDate > lastDay && currentDate.getDay() === 6) {
                break;
            }
        }
    }
    
    updateMonthlySummary() {
        const totalHours = this.calendarEntries.reduce((sum, entry) => sum + (entry.totalHours || 0), 0);
        const totalPay = this.calendarEntries.reduce((sum, entry) => sum + (entry.totalPay || 0), 0);
        const daysWorked = this.calendarEntries.filter(entry => entry.totalHours > 0).length;
        const averageHours = daysWorked > 0 ? totalHours / daysWorked : 0;
        
        document.getElementById('monthlyHours').textContent = totalHours.toFixed(2);
        document.getElementById('monthlyPay').textContent = totalPay.toFixed(2);
        document.getElementById('monthlyDays').textContent = daysWorked;
        document.getElementById('monthlyAverage').textContent = averageHours.toFixed(2);
    }
    
    showDayDetails(dateString, entries) {
        const date = new Date(dateString).toLocaleDateString();
        let details = `Details for ${date}:\n\n`;
        
        entries.forEach(entry => {
            const agentName = entry.agent?.name || 'Unknown Agent';
            const clockIn = entry.clockIn ? new Date(entry.clockIn).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
            const clockOut = entry.clockOut ? new Date(entry.clockOut).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }) : '--:--';
            const hours = (entry.totalHours || 0).toFixed(2);
            const pay = (entry.totalPay || 0).toFixed(2);
            const type = entry.isManualEntry ? 'Manual' : 'Auto';
            
            details += `${agentName}:\n`;
            details += `  ${clockIn} - ${clockOut} (${hours}h)\n`;
            details += `  Pay: ₪${pay} | Type: ${type}\n`;
            if (entry.notes) {
                details += `  Notes: ${entry.notes}\n`;
            }
            details += '\n';
        });
        
        alert(details);
    }
}

// Initialize the clock system when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ClockSystem();
});
