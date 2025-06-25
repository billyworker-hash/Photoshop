// Calendar.js - Simple Calendar Manager for Appointments
class CalendarManager {
    constructor(apiManager) {
        this.apiManager = apiManager;
        this.currentDate = new Date();
        this.appointments = [];
    }

    // Main entry point to load and render the calendar
    async loadCalendar() {
        // Fetch appointments from modules and localStorage
        this.appointments = await this.fetchAppointments();
        this.renderCalendar();
    }

    // Fetch appointments from modules and localStorage
    async fetchAppointments() {
        let appointments = [];
        // Gather appointments from Leads/Customers modules if available
        if (window.leadsManager && typeof window.leadsManager.getAppointments === 'function') {
            const leadAppointments = await window.leadsManager.getAppointments();
            appointments = appointments.concat(leadAppointments.map(a => ({ ...a, module: 'Lead' })));
        }
        // Add more modules here as needed
        // Fetch from localStorage (for demo, key: 'calendarAppointments')
        const local = JSON.parse(localStorage.getItem('calendarAppointments') || '[]');
        appointments = appointments.concat(local.map(a => ({ ...a, module: a.module || 'Manual' })));
        return appointments;
    }

    // Save a new appointment to localStorage
    saveAppointment(appt) {
        const local = JSON.parse(localStorage.getItem('calendarAppointments') || '[]');
        local.push(appt);
        localStorage.setItem('calendarAppointments', JSON.stringify(local));
    }

    // Delete an appointment by id (localStorage only)
    deleteAppointment(id) {
        let local = JSON.parse(localStorage.getItem('calendarAppointments') || '[]');
        local = local.filter(a => a.id !== id);
        localStorage.setItem('calendarAppointments', JSON.stringify(local));
    }

    // Render a full calendar with Bootstrap, year/month navigation and Today button
    renderCalendar() {
        const calendarEl = document.getElementById('simple-calendar');
        if (!calendarEl) return;
        const now = this.currentDate;
        const year = now.getFullYear();
        const month = now.getMonth();
        const monthNames = [
            'January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December'
        ];
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const daysInMonth = lastDay.getDate();
        // Header with navigation and Today button
        let html = `<div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <button class="btn btn-outline-secondary btn-sm me-2" id="prev-month-btn"><i class="bi bi-chevron-left"></i> Prev</button>
                <button class="btn btn-outline-primary btn-sm" id="today-btn"><i class="bi bi-calendar-event"></i> Today</button>
                <button class="btn btn-outline-secondary btn-sm ms-2" id="next-month-btn">Next <i class="bi bi-chevron-right"></i></button>
            </div>
            <h4 class="mb-0"><span class="badge bg-light text-dark fs-6">${monthNames[month]} ${year}</span></h4>
        </div>`;
        html += '<div class="table-responsive"><table class="table table-bordered table-striped align-middle text-center mb-0"><thead class="table-light"><tr>';
        const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        for (let d of days) html += `<th class="small">${d}</th>`;
        html += '</tr></thead><tbody>';
        let dayOfWeek = firstDay.getDay();
        for (let week = 0; week < 6; week++) {
            html += '<tr>';
            for (let dow = 0; dow < 7; dow++) {
                let date = week * 7 + dow - dayOfWeek + 1;
                if (date < 1 || date > daysInMonth) {
                    html += '<td class="bg-light"></td>';
                } else {
                    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(date).padStart(2,'0')}`;
                    // Use h-100 w-100 to fill space, no padding, and flex column for vertical layout
                    html += `<td class="h-100 w-100 align-top" style="vertical-align:top;"><div class="calendar-date d-flex flex-column align-items-start h-100 w-100" data-date="${dateStr}">
                        <span class="fw-bold mb-1">${date}</span>`;
                    // Show only appointments for this day, as a left-aligned, small, red list
                    const appts = this.appointments.filter(a => {
                        const apptDate = new Date(a.date);
                        return apptDate.getFullYear() === year && apptDate.getMonth() === month && apptDate.getDate() === date;
                    });
                    if (appts.length > 0) {
                        html += '<ul class="list-unstyled mb-0 w-100">';
                        for (let a of appts) {
                            html += `<li class="ps-2" style="font-size:0.85em;color:#c00;text-align:left;">${a.title}</li>`;
                        }
                        html += '</ul>';
                    }
                    html += '</div></td>';
                }
            }
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        calendarEl.innerHTML = html;
        // Render summary below calendar
        this.renderSummary();
        // Add event listeners for navigation and today
        document.getElementById('prev-month-btn').onclick = () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            this.renderCalendar();
        };
        document.getElementById('next-month-btn').onclick = () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            this.renderCalendar();
        };
        document.getElementById('today-btn').onclick = () => {
            this.currentDate = new Date();
            this.renderCalendar();
        };
        // Add click event to each date cell
        document.querySelectorAll('.calendar-date').forEach(el => {
            el.onclick = (e) => {
                const dateStr = el.getAttribute('data-date');
                window.openAppointmentModal(dateStr);
            };
        });
        // Add delete event for local appointments
        document.querySelectorAll('.btn-delete-appt').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const id = btn.getAttribute('data-appt-id');
                this.deleteAppointment(id);
                this.loadCalendar();
            };
        });
    }

    // Render a summary of appointments below the calendar
    renderSummary() {
        const summaryEl = document.getElementById('calendar-summary');
        if (!summaryEl) return;
        const appts = this.appointments || [];
        if (appts.length === 0) {
            summaryEl.innerHTML = '<div class="alert alert-info text-center">No appointments scheduled.</div>';
            return;
        }
        // Group by date
        const grouped = {};
        appts.forEach(a => {
            if (!grouped[a.date]) grouped[a.date] = [];
            grouped[a.date].push(a);
        });
        let html = '<h5 class="mb-3"><i class="bi bi-list-task me-2"></i>Appointments Summary</h5>';
        html += '<div class="accordion" id="appointmentsAccordion">';
        let idx = 0;
        Object.keys(grouped).sort().forEach(date => {
            const collapseId = `collapse${idx}`;
            const headingId = `heading${idx}`;
            html += `
            <div class="accordion-item">
                <h2 class="accordion-header" id="${headingId}">
                    <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                        <strong>${date}</strong> <span class="badge bg-primary ms-2">${grouped[date].length}</span>
                    </button>
                </h2>
                <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="${headingId}" data-bs-parent="#appointmentsAccordion">
                    <div class="accordion-body p-2">
                        <ul class="list-group list-group-flush mb-0">`;
            grouped[date].forEach(a => {
                html += `<li class="list-group-item d-flex flex-column flex-md-row align-items-md-center justify-content-between py-2">
                    <div>
                        <span class="fw-bold">${a.title}</span>
                        ${a.time ? `<span class=\"badge bg-secondary ms-2\">${a.time}</span>` : ''}
                        ${a.notes ? `<span class=\"text-muted ms-2\">(${a.notes})</span>` : ''}
                    </div>
                    <span class="badge bg-info text-dark mt-2 mt-md-0">${a.module || ''}</span>
                </li>`;
            });
            html += `</ul>
                    </div>
                </div>
            </div>`;
            idx++;
        });
        html += '</div>';
        summaryEl.innerHTML = html;
    }
}

// Expose globally
window.CalendarManager = CalendarManager;

// --- Integrate CalendarManager with app.js navigation ---
// Ensure global calendarManager instance
if (!window.calendarManager && window.apiManager) {
    window.calendarManager = new CalendarManager(window.apiManager);
}

// Patch showPage to load calendar when navigating to calendar page
const originalShowPage = typeof showPage === 'function' ? showPage : null;
window.showPage = async function(pageName) {
    if (pageName === 'calendar') {
        // Hide all pages
        document.querySelectorAll('.page-content').forEach(page => {
            page.style.display = 'none';
        });
        const calendarPage = document.getElementById('calendar-page');
        if (calendarPage) {
            calendarPage.style.display = 'block';
            // Load and render calendar
            if (window.calendarManager) {
                await window.calendarManager.loadCalendar();
            }
        }
        // Update navigation active state
        document.querySelectorAll('.sidebar .nav-link').forEach(l => l.classList.remove('active'));
        const activeNavLink = document.querySelector('.sidebar .nav-link[data-page="calendar"]');
        if (activeNavLink) activeNavLink.classList.add('active');
        return;
    }
    if (originalShowPage) return originalShowPage.apply(this, arguments);
};

// Appointment Modal logic (simple global for now)
window.openAppointmentModal = function(dateStr) {
    // Create modal if not exists
    let modal = document.getElementById('appointmentModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'appointmentModal';
        modal.tabIndex = -1;
        modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title">Create Appointment</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <div id="appointments-list"></div>
                    <form id="appointment-form">
                        <div class="mb-3">
                            <label for="appointment-title" class="form-label">Title</label>
                            <input type="text" class="form-control" id="appointment-title" required>
                        </div>
                        <div class="mb-3">
                            <label for="appointment-date" class="form-label">Date</label>
                            <input type="date" class="form-control" id="appointment-date" required>
                        </div>
                        <div class="mb-3">
                            <label for="appointment-time" class="form-label">Time</label>
                            <input type="time" class="form-control" id="appointment-time">
                        </div>
                        <div class="mb-3">
                            <label for="appointment-notes" class="form-label">Notes</label>
                            <textarea class="form-control" id="appointment-notes" rows="2"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="button" class="btn btn-primary" id="save-appointment-btn">Save Appointment</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(modal);
    }
    // Reset form fields
    const form = document.getElementById('appointment-form');
    if (form) form.reset();
    document.getElementById('appointment-title').value = '';
    document.getElementById('appointment-time').value = '';
    document.getElementById('appointment-notes').value = '';
    document.getElementById('appointment-date').value = dateStr;

    // Show appointments for this date in the modal
    const appointmentsList = document.getElementById('appointments-list');
    if (appointmentsList && window.calendarManager) {
        const appts = (window.calendarManager.appointments || []).filter(a => a.date === dateStr);
        if (appts.length > 0) {
            appointmentsList.innerHTML = '<div class="mb-2"><strong>Appointments for this date:</strong></div>' +
                appts.map(a => `<div class='alert alert-info py-1 px-2 mb-1'><b>${a.title}</b>${a.time ? ' @ ' + a.time : ''}<br><small>${a.notes || ''}</small></div>`).join('');
        } else {
            appointmentsList.innerHTML = '';
        }
    }
    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    // Save handler
    document.getElementById('save-appointment-btn').onclick = () => {
        const title = document.getElementById('appointment-title').value.trim();
        const date = document.getElementById('appointment-date').value;
        const time = document.getElementById('appointment-time').value;
        const notes = document.getElementById('appointment-notes').value.trim();
        if (!title || !date) return;
        // Save to localStorage
        const appt = {
            id: 'appt-' + Date.now() + '-' + Math.floor(Math.random()*10000),
            title,
            date,
            time,
            notes,
            module: 'Manual'
        };
        if (window.calendarManager) {
            window.calendarManager.saveAppointment(appt);
            window.calendarManager.loadCalendar();
        }
        bsModal.hide();
    };
};

// Add calendar cell styles for borders, hover, and pointer
(function addCalendarCellStyles() {
    if (document.getElementById('calendar-cell-style')) return;
    const style = document.createElement('style');
    style.id = 'calendar-cell-style';
    style.innerHTML = `
        .calendar-date {
            border: 1px solid #dee2e6;
            border-radius: 0.25rem;
            padding: 4px 0;
            cursor: pointer;
            transition: background 0.15s, box-shadow 0.15s;
            min-height: 60px;
            overflow-y: auto;
            background: #fff;
        }
        .calendar-date:hover {
            background: #e9ecef;
            box-shadow: 0 0 0 2px #0d6efd33;
        }
        .calendar-date .badge {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            max-width: 100%;
        }
    `;
    document.head.appendChild(style);
})();
