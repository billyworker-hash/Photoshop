// Calendar.js - Simple Calendar Manager for Appointments
class CalendarManager {
    // --- Desktop notification logic for upcoming meetings ---
    startAppointmentNotifications() {
        if (this.notificationInterval) clearInterval(this.notificationInterval);
        this.notifiedAppointments = this.notifiedAppointments || {};
        this.notificationInterval = setInterval(() => this.checkUpcomingAppointments(), 30000); // every 30s
    }

    stopAppointmentNotifications() {
        if (this.notificationInterval) clearInterval(this.notificationInterval);
        this.notificationInterval = null;
    }

    async checkUpcomingAppointments() {
        // Always fetch the latest appointments from all sources
        this.appointments = await this.fetchAppointments();
        if (!Array.isArray(this.appointments)) {
            console.log('[Calendar] No appointments array loaded');
            return;
        }
        this.appointments.forEach(appt => {
            // Always get the freshest system time for each check
            const now = new Date();
            if (!appt.date || !appt.time) {
                console.log('[Calendar] Skipping appointment (missing date/time):', appt);
                return;
            }
            // Parse date and time as local (not UTC) to avoid day shift
            const [year, month, day] = appt.date.split('-').map(Number);
            const [hour, minute] = (appt.time || '00:00').split(':').map(Number);
            const apptDateTime = new Date(year, month - 1, day, hour, minute);
            const diffMinutes = (apptDateTime - now) / 60000;
            console.log(`[Calendar] Checking: ${appt.title || appt.id} | Date: ${appt.date} ${appt.time} | diffMinutes: ${diffMinutes}`);
            const notifyTimes = [30, 10, 5];
            notifyTimes.forEach(mins => {
                const apptId = appt._id || appt.id;
                this.notifiedAppointments[apptId] = this.notifiedAppointments[apptId] || {};
                // If within the window (before or up to 30 seconds after) and not already notified, send notification
                if (
                    diffMinutes <= mins && diffMinutes > mins - 1 && !this.notifiedAppointments[apptId][mins]
                ) {
                    console.log(`[Calendar] Triggering notification for '${appt.title || appt.id}' (${mins} min)`);
                    this.showDesktopNotification(appt, mins);
                    this.notifiedAppointments[apptId][mins] = true;
                } else if (
                    diffMinutes <= mins - 1 && diffMinutes > mins - 1.5 && !this.notifiedAppointments[apptId][mins]
                ) {
                    // If missed (within 30 seconds after the window), still send notification
                    console.log(`[Calendar] Missed notification for '${appt.title || appt.id}' (${mins} min, diffMinutes: ${diffMinutes.toFixed(2)}). Sending now.`);
                    this.showDesktopNotification(appt, mins);
                    this.notifiedAppointments[apptId][mins] = true;
                } else if (this.notifiedAppointments[apptId][mins]) {
                    console.log(`[Calendar] Already notified for '${appt.title || appt.id}' (${mins} min)`);
                }
            });
        });
    }

    showDesktopNotification(appt, mins) {
        console.log(`[Calendar] showDesktopNotification called for '${appt.title || appt.id}' (${mins} min)`);
        if ('Notification' in window && Notification.permission === 'granted') {
            const body = `${appt.title || 'Meeting'}\n${appt.date} ${appt.time || ''}\n${appt.notes || ''}\nMeeting in ${mins} minutes.`;
            new Notification('Upcoming Meeting Reminder', {
                body,
                icon: '/favicon.ico' // Optional: path to your app icon
            });
            console.log('[Calendar] Desktop notification shown');
        } else {
            console.log('[Calendar] Notification not shown: permission not granted or not supported');
        }
        // Also show a Bootstrap modal for testing
        this.showMeetingModal(appt, mins);
    }

    showMeetingModal(appt, mins) {
        // Helper to actually show the modal
        const showModal = () => {
            // Remove existing modal if present
            let modal = document.getElementById('meetingReminderModal');
            if (modal) modal.remove();

            modal = document.createElement('div');
            modal.className = 'modal fade';
            modal.id = 'meetingReminderModal';
            modal.tabIndex = -1;
            modal.innerHTML = `
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header bg-warning">
                            <h5 class="modal-title">Meeting Reminder</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body">
                            <p><b>${appt.title || 'Meeting'}</b></p>
                            <p>Date: <b>${appt.date}</b></p>
                            <p>Time: <b>${appt.time || ''}</b></p>
                            <p>${appt.notes ? `<i>${appt.notes}</i>` : ''}</p>
                            <hr>
                            <p class="mb-0 text-danger">This meeting starts in <b>${mins}</b> minutes!</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Dismiss</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        };

        // Check if any modal is currently visible
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
            // Wait for the current modal to be fully hidden, then show the meeting modal
            const handler = () => {
                openModal.removeEventListener('hidden.bs.modal', handler);
                setTimeout(showModal, 100); // slight delay to allow backdrop to clear
            };
            openModal.addEventListener('hidden.bs.modal', handler);
        } else {
            showModal();
        }
    }
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
        // (Notifications are now started globally from app.js)
    }

    // Fetch appointments from API (meetings)
    async fetchAppointments() {
        let appointments = [];
        // Gather appointments from Leads/Customers modules if available
        if (window.leadsManager && typeof window.leadsManager.getAppointments === 'function') {
            const leadAppointments = await window.leadsManager.getAppointments();
            appointments = appointments.concat(leadAppointments.map(a => ({ ...a, module: 'Lead' })));
        }
        // Fetch from backend API
        try {
            const apiAppointments = await this.apiManager.get('/meetings');
            appointments = appointments.concat(apiAppointments.map(a => ({ ...a, module: a.module || 'Manual' })));
        } catch (err) {
            window.apiManager && window.apiManager.showAlert && window.apiManager.showAlert('Failed to fetch meetings: ' + err.message, 'danger');
        }
        return appointments;
    }

    // Save a new appointment to backend
    async saveAppointment(appt) {
        try {
            await this.apiManager.post('/meetings', appt);
        } catch (err) {
            window.apiManager && window.apiManager.showAlert && window.apiManager.showAlert('Failed to save meeting: ' + err.message, 'danger');
        }
    }

    // Delete an appointment by id (API)
    async deleteAppointment(id) {
        try {
            await this.apiManager.delete(`/meetings/${id}`);
        } catch (err) {
            window.apiManager && window.apiManager.showAlert && window.apiManager.showAlert('Failed to delete meeting: ' + err.message, 'danger');
        }
    }

    // Render a full calendar with fixed-size boxes (no shifting)
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
        // Appointments Summary and Calendar in separate divs
        let html = '';
        html += '<div class="calendar-summary-container mb-4"><div id="calendar-summary"></div></div>';
        html += '<div class="calendar-main-container">';
        // Header with navigation and Today button
        html += `<div class="d-flex justify-content-between align-items-center mb-3">
            <div>
                <button class="btn btn-outline-secondary btn-sm me-2" id="prev-month-btn"><i class="bi bi-chevron-left"></i> Prev</button>
                <button class="btn btn-outline-primary btn-sm" id="today-btn"><i class="bi bi-calendar-event"></i> Today</button>
                <button class="btn btn-outline-secondary btn-sm ms-2" id="next-month-btn">Next <i class="bi bi-chevron-right"></i></button>
            </div>
            <h4 class="mb-0"><span class="badge bg-light text-dark fs-6">${monthNames[month]} ${year}</span></h4>
        </div>`;
        // Calendar grid with fixed-size boxes
        html += `<div class="calendar-grid-fixed">
            <div class="calendar-row calendar-header-row">
                <div class="calendar-cell calendar-header-cell">Sun</div>
                <div class="calendar-cell calendar-header-cell">Mon</div>
                <div class="calendar-cell calendar-header-cell">Tue</div>
                <div class="calendar-cell calendar-header-cell">Wed</div>
                <div class="calendar-cell calendar-header-cell">Thu</div>
                <div class="calendar-cell calendar-header-cell">Fri</div>
                <div class="calendar-cell calendar-header-cell">Sat</div>
            </div>`;
        let dayOfWeek = firstDay.getDay();
        let date = 1 - dayOfWeek;
        for (let week = 0; week < 6; week++) {
            html += '<div class="calendar-row">';
            for (let dow = 0; dow < 7; dow++) {
                let cellDate = new Date(year, month, date);
                let isOtherMonth = cellDate.getMonth() !== month;
                let cellClass = 'calendar-cell calendar-day-fixed';
                if (isOtherMonth) cellClass += ' other-month';
                if (
                    cellDate.toDateString() === (new Date()).toDateString()
                ) cellClass += ' today';
                // Use local date string for matching appointments
                const dateStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`;
                html += `<div class="${cellClass}" data-date="${dateStr}">`;
                html += `<div class="day-number">${cellDate.getDate()}</div>`;
                // Appointments for this day
                const appts = this.appointments.filter(a => a.date === dateStr);
                if (appts.length > 0) {
                    html += '<ul class="calendar-appts">';
                    for (let a of appts) {
                        // Check if meeting is in the past (date+time < now)
                        let isPast = false;
                        if (a.date) {
                            const [year, month, day] = a.date.split('-').map(Number);
                            const [hour, minute] = (a.time || '00:00').split(':').map(Number);
                            const apptDateTime = new Date(year, month - 1, day, hour, minute);
                            isPast = apptDateTime < new Date();
                        }
                        html += `<li class="calendar-appt" style="${isPast ? 'color:green;font-weight:bold;' : ''}">${a.title}</li>`;
                    }
                    html += '</ul>';
                }
                html += '</div>';
                date++;
            }
            html += '</div>';
        }
        html += '</div>'; // close calendar-grid-fixed
        html += '</div>'; // close calendar-main-container
        calendarEl.innerHTML = html;
        // Render summary at the top (now inside calendarEl)
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
        document.querySelectorAll('.calendar-day-fixed').forEach(el => {
            el.onclick = (e) => {
                const dateStr = el.getAttribute('data-date');
                window.openAppointmentModal && window.openAppointmentModal(dateStr);
            };
        });
    }

    // Render a summary of appointments below the calendar
    renderSummary() {
        const summaryEl = document.getElementById('calendar-summary');
        if (!summaryEl) return;
        const appts = this.appointments || [];
        let html = '';
        html += '<div class="card mb-3"><div class="card-body">';
        if (appts.length === 0) {
            html += '<div class="alert alert-info text-center mb-0">No appointments scheduled.</div>';
            html += '</div></div>';
            summaryEl.innerHTML = html;
            return;
        }
        // Group by date
        const grouped = {};
        appts.forEach(a => {
            if (!grouped[a.date]) grouped[a.date] = [];
            grouped[a.date].push(a);
        });
        // Show total number of meetings
        html += `<div class="mb-2"><strong>Total Meetings:</strong> <span class="badge bg-primary">${appts.length}</span></div>`;
        html += '<h5 class="mb-3"><i class="bi bi-list-task me-2"></i>Appointments Summary</h5>';
        html += '<div class="accordion" id="appointmentsAccordion">';
        // Pagination logic
        const allDates = Object.keys(grouped).sort();
        const datesPerPage = 5;
        let currentPage = parseInt(summaryEl.getAttribute('data-page') || '1', 10);
        const totalPages = Math.max(1, Math.ceil(allDates.length / datesPerPage));
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;
        const startIdx = (currentPage - 1) * datesPerPage;
        const endIdx = startIdx + datesPerPage;
        let idx = startIdx;
        allDates.slice(startIdx, endIdx).forEach(date => {
            const collapseId = `collapse${idx}`;
            const headingId = `heading${idx}`;
            html += `
        <div class="accordion-item">
            <h2 class="accordion-header" id="${headingId}">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                    <strong>${new Date(date).toLocaleDateString('en-GB')}</strong> <span class="badge bg-primary ms-2" data-badge-date="${date}">${grouped[date].length}</span>
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse" aria-labelledby="${headingId}" data-bs-parent="#appointmentsAccordion">
                <div class="accordion-body p-2">
                    <ul class="list-group list-group-flush mb-0" data-date="${date}">`;
            grouped[date].forEach(a => {
                html += `<li class="list-group-item d-flex flex-column flex-md-row align-items-md-center justify-content-between py-2" data-appt-id="${a._id || a.id}">
                <div>
                    <span class="fw-bold">${a.title}</span>
                    ${a.time ? `<span class="badge bg-secondary ms-2">${a.time}</span>` : ''}
                    ${a.notes ? `<span class="text-muted ms-2">(${a.notes})</span>` : ''}
                </div>
                <div>
                    <span class="badge bg-info text-dark mt-2 mt-md-0">${a.module || ''}</span>
                    <button class="btn btn-sm btn-danger ms-2 delete-appt-btn" data-appt-id="${a._id || a.id}" title="Delete Appointment">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </li>`;
            });
            html += `</ul>
                </div>
            </div>
        </div>`;
            idx++;
        });
        html += '</div>';
        // Pagination controls
        html += '<div class="d-flex justify-content-between align-items-center mt-3">';
        html += `<button class="btn btn-sm btn-outline-secondary" id="summary-prev-page" ${currentPage === 1 ? 'disabled' : ''}>&laquo; Prev</button>`;
        html += `<span>Page ${currentPage} of ${totalPages}</span>`;
        html += `<button class="btn btn-sm btn-outline-secondary" id="summary-next-page" ${currentPage === totalPages ? 'disabled' : ''}>Next &raquo;</button>`;
        html += '</div>';
        html += '</div></div>';
        summaryEl.innerHTML = html;
        summaryEl.setAttribute('data-page', currentPage);

        // Restore open accordion after delete
        const openAccordion = summaryEl.querySelector('.accordion-collapse.show');
        const openId = openAccordion ? openAccordion.id : null;

        // Add event listeners for pagination
        const prevBtn = document.getElementById('summary-prev-page');
        const nextBtn = document.getElementById('summary-next-page');
        if (prevBtn) prevBtn.onclick = () => {
            summaryEl.setAttribute('data-page', currentPage - 1);
            this.renderSummary();
        };
        if (nextBtn) nextBtn.onclick = () => {
            summaryEl.setAttribute('data-page', currentPage + 1);
            this.renderSummary();
        };

        // Add event listeners for delete buttons
        summaryEl.querySelectorAll('.delete-appt-btn').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const apptId = btn.getAttribute('data-appt-id');
                const li = btn.closest('li[data-appt-id]');
                if (apptId && li && window.calendarManager) {
                    await window.calendarManager.deleteAppointment(apptId);
                    // Remove from in-memory appointments array
                    this.appointments = this.appointments.filter(a => (a._id || a.id) != apptId);

                    // Remove from UI
                    const ul = li.parentElement;
                    li.remove();

                    // Update the badge count in the header
                    if (ul) {
                        const badge = ul.closest('.accordion-item')
                            .querySelector('.accordion-button .badge.bg-primary');
                        if (badge) {
                            const count = ul.querySelectorAll('li').length;
                            badge.textContent = count;
                        }
                        // If the group is now empty, remove the group from the UI
                        if (ul.querySelectorAll('li').length === 0) {
                            const accordionBody = ul.closest('.accordion-body');
                            if (accordionBody) {
                                const accordionItem = accordionBody.closest('.accordion-item');
                                if (accordionItem) accordionItem.remove();
                            }
                        }
                    }
                }
            };
        });

        // Re-open the previously open accordion if still present
        if (openId) {
            setTimeout(() => {
                const el = document.getElementById(openId);
                if (el) new bootstrap.Collapse(el, { toggle: true });
            }, 0);
        }
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
window.showPage = async function (pageName) {
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
window.openAppointmentModal = function (dateStr) {
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

    // Helper to render appointments list in the modal
    function renderAppointmentsList(dateStr) {
        const appointmentsList = document.getElementById('appointments-list');
        if (appointmentsList && window.calendarManager) {
            const appts = (window.calendarManager.appointments || []).filter(a => a.date === dateStr);
            if (appts.length > 0) {
                appointmentsList.innerHTML = '<div class="mb-2"><strong>Appointments for this date:</strong></div>' +
                    appts.map(a => {
                        // Check if meeting is in the past (date+time < now)
                        let isPast = false;
                        if (a.date) {
                            const [year, month, day] = a.date.split('-').map(Number);
                            const [hour, minute] = (a.time || '00:00').split(':').map(Number);
                            const apptDateTime = new Date(year, month - 1, day, hour, minute);
                            isPast = apptDateTime < new Date();
                        }
                        const colorStyle = isPast
                            ? 'color:green;font-weight:bold;'
                            : 'color:red;font-weight:bold;';
                        return `
                        <div class='alert alert-info py-1 px-2 mb-1 d-flex justify-content-between align-items-center'>
                            <div>
                                <b style='${colorStyle}'>${a.title}</b>${a.time ? ' @ ' + a.time : ''}<br><small>${a.notes || ''}</small>
                            </div>
                            <button class="btn btn-sm btn-danger ms-2 delete-appt-btn" data-appt-id="${a._id || a.id}"><i class="bi bi-trash"></i></button>
                        </div>
                        `;
                    }).join('');
            } else {
                appointmentsList.innerHTML = '';
            }
            // Add delete handlers
            setTimeout(() => {
                document.querySelectorAll('.delete-appt-btn').forEach(btn => {
                    btn.onclick = async (e) => {
                        e.stopPropagation();
                        const apptId = btn.getAttribute('data-appt-id');
                        if (apptId && window.calendarManager) {
                            await window.calendarManager.deleteAppointment(apptId);
                            // Remove from in-memory appointments array BEFORE re-rendering modal list
                            window.calendarManager.appointments = window.calendarManager.appointments.filter(a => (a._id || a.id) != apptId);
                            // Update the list in the modal
                            renderAppointmentsList(dateStr);
                            // Also re-render the main calendar after deletion
                            window.calendarManager.renderCalendar();
                        }
                    };
                });
            }, 0);
        }
    }

    // Render appointments list in the modal
    renderAppointmentsList(dateStr);

    // Show modal
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    // Save handler
    document.getElementById('save-appointment-btn').onclick = async () => {
        const title = document.getElementById('appointment-title').value.trim();
        const date = document.getElementById('appointment-date').value;
        const time = document.getElementById('appointment-time').value;
        const notes = document.getElementById('appointment-notes').value.trim();
        if (!title || !date) return;
        // Save to backend
        const appt = {
            title,
            date,
            time,
            notes,
            module: 'Manual'
        };
        if (window.calendarManager) {
            await window.calendarManager.saveAppointment(appt);
            await window.calendarManager.loadCalendar();
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
        .calendar-appts {
            max-height: 70px;
            overflow-y: auto;
            margin-bottom: 0;
            padding-left: 0;
        }
        .calendar-appt {
            list-style: none;
            padding: 2px 0 2px 0;
            margin: 0;
        }
    `;
    document.head.appendChild(style);
})();
