document.addEventListener('DOMContentLoaded', () => {
    // Clock setup
    const updateClocks = () => {
        const now = new Date();
        const dateString = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const timeString = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const currentDateEl = document.getElementById('current-date');
        const currentTimeEl = document.getElementById('current-time');
        const headerClockEl = document.getElementById('header-clock');

        if(currentDateEl) currentDateEl.textContent = dateString;
        if(currentTimeEl) currentTimeEl.textContent = timeString;
        if(headerClockEl) headerClockEl.textContent = timeString;
    };
    setInterval(updateClocks, 1000);
    updateClocks();

    // Elements
    const loginView = document.getElementById('login-view');
    const portalView = document.getElementById('portal-view');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    // Check if already logged in
    const token = localStorage.getItem('intrasphere_token');
    const userStr = localStorage.getItem('intrasphere_user');

    if (token && userStr) {
        try {
            const user = JSON.parse(userStr);
            initPortal(user);
        } catch (e) {
            localStorage.clear();
        }
    }

    // Login Logic
    if(loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const employeeId = document.getElementById('employee-id').value;
            const password = document.getElementById('password').value;
            const department = document.getElementById('department-select').value;
            
            loginError.textContent = "";
            const btn = loginForm.querySelector('button[type="submit"]');
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ employee_id: employeeId, password: password })
                });

                const data = await response.json();

                if (response.ok) {
                    if (data.user.department !== department && department !== 'Leadership') {
                        // Allow Leadership to login to other dept views if needed, otherwise strict
                        loginError.textContent = "Department mismatch for this Employee ID.";
                        btn.innerHTML = 'Access Workspace <i class="fa-solid fa-arrow-right"></i>';
                        return;
                    }

                    localStorage.setItem('intrasphere_token', data.token);
                    localStorage.setItem('intrasphere_user', JSON.stringify(data.user));
                    initPortal(data.user);
                } else {
                    loginError.textContent = data.error || "Authentication failed.";
                    btn.innerHTML = 'Access Workspace <i class="fa-solid fa-arrow-right"></i>';
                }
            } catch (err) {
                loginError.textContent = "System error. Could not connect to internal server.";
                btn.innerHTML = 'Access Workspace <i class="fa-solid fa-arrow-right"></i>';
            }
        });
    }

    // Initialize Portal After Login
    function initPortal(user) {
        // Switch Views
        loginView.classList.remove('active-view');
        portalView.classList.add('active-view');

        // Set Theme
        document.body.setAttribute('data-theme', user.department);

        // Populate User Info
        document.getElementById('user-name').textContent = user.name;
        document.getElementById('user-role').textContent = user.role;
        document.getElementById('user-dept-badge').textContent = user.department;
        document.getElementById('welcome-message').textContent = `Welcome back, ${user.name.split(' ')[0]}`;

        // Fetch Dashboard Stats
        fetchDashboardStats();

        // Push Notifications Registration
        if ('serviceWorker' in navigator && 'PushManager' in window) {
            navigator.serviceWorker.register('/sw.js').then(async (registration) => {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFL8eI5RoAlJI';
                    
                    // Simple function to convert Base64 URL-safe to Uint8Array
                    const urlBase64ToUint8Array = (base64String) => {
                        const padding = '='.repeat((4 - base64String.length % 4) % 4);
                        const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
                        const rawData = window.atob(base64);
                        const outputArray = new Uint8Array(rawData.length);
                        for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
                        return outputArray;
                    };

                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
                    });

                    // Send subscription to backend
                    await fetch('/api/subscribe', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'x-access-token': localStorage.getItem('intrasphere_token')
                        },
                        body: JSON.stringify(subscription)
                    });
                }
            }).catch(console.error);
        }
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('intrasphere_token');
            localStorage.removeItem('intrasphere_user');
            window.location.reload();
        });
    }

    // Navigation Logic
    const navLinks = document.querySelectorAll('.nav-links li');
    const modules = document.querySelectorAll('.module');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Update Active Link
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            // Update Active Module
            const targetId = link.getAttribute('data-target');
            modules.forEach(m => m.classList.remove('active-module'));
            const targetModule = document.getElementById(targetId);
            if(targetModule) targetModule.classList.add('active-module');
        });
    });

    // Fetch Dashboard Stats
    async function fetchDashboardStats() {
        const token = localStorage.getItem('intrasphere_token');
        if(!token) return;

        try {
            const res = await fetch('/api/dashboard', {
                headers: { 'x-access-token': token }
            });
            if(res.ok) {
                const data = await res.json();
                document.getElementById('stat-circulars').textContent = data.activeCirculars;
                document.getElementById('stat-meetings').textContent = data.upcomingMeetings;
                document.getElementById('stat-tasks').textContent = data.pendingTasks;
                document.getElementById('stat-notices').textContent = data.recentNotices;
            }
        } catch (err) {
            console.error("Failed to load dashboard stats", err);
        }
    }

    // --- Phase 3 Module Logic ---
    const headers = () => ({
        'Content-Type': 'application/json',
        'x-access-token': localStorage.getItem('intrasphere_token')
    });

    // Populate Users
    async function fetchUsers() {
        if(!localStorage.getItem('intrasphere_token')) return;
        try {
            const res = await fetch('/api/users', { headers: headers() });
            if(res.ok) {
                const users = await res.json();
                const assigneeSelect = document.getElementById('task-assignee');
                const attUserSelect = document.getElementById('att-user');
                const noticeUserSelect = document.getElementById('notice-user');
                
                let optionsHtml = '<option value="" disabled selected>Select...</option>';
                users.forEach(u => {
                    optionsHtml += `<option value="${u.id}">${u.name} (${u.role} - ${u.department})</option>`;
                });
                
                if(assigneeSelect) assigneeSelect.innerHTML = optionsHtml;
                if(attUserSelect) attUserSelect.innerHTML = optionsHtml;
                if(noticeUserSelect) noticeUserSelect.innerHTML = optionsHtml;
            }
        } catch(e) {}
    }

    // Circulars
    const circularForm = document.getElementById('circular-form');
    if(circularForm) {
        const userRole = JSON.parse(localStorage.getItem('intrasphere_user') || '{}').role;
        const canCreate = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'].includes(userRole);
        if(!canCreate) {
            circularForm.style.display = 'none';
            document.getElementById('circ-unauth-msg').style.display = 'block';
        }
        
        circularForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = circularForm.querySelector('button');
            btn.innerHTML = "Publishing...";
            const payload = {
                title: document.getElementById('circ-title').value,
                content: document.getElementById('circ-content').value,
                category: document.getElementById('circ-category').value,
                priority: document.getElementById('circ-priority').value,
                departments: document.getElementById('circ-depts').value
            };
            try {
                await fetch('/api/circulars', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
                circularForm.reset();
                fetchCirculars();
            } catch(e) {}
            btn.innerHTML = "Publish Circular";
        });
    }

    async function fetchCirculars() {
        const list = document.getElementById('circulars-list');
        if(!list) return;
        try {
            const res = await fetch('/api/circulars', { headers: headers() });
            if(res.ok) {
                const data = await res.json();
                list.innerHTML = '';
                if(data.length === 0) list.innerHTML = '<li>No active circulars.</li>';
                data.forEach(c => {
                    list.innerHTML += `
                        <li style="display:flex; flex-direction:column; gap:5px;">
                            <div style="display:flex; justify-content:space-between;">
                                <strong>${c.title}</strong>
                                <span class="tag tag-internal">${c.priority}</span>
                            </div>
                            <p style="color:var(--text-muted); font-size:0.8rem;">${c.content}</p>
                            <small style="color:var(--primary);">${new Date(c.created_at).toLocaleString()}</small>
                        </li>
                    `;
                });
            }
        } catch(e) {}
    }

    // Announcements
    const announcementForm = document.getElementById('announcement-form');
    if(announcementForm) {
        const userRole = JSON.parse(localStorage.getItem('intrasphere_user') || '{}').role;
        const canCreate = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'].includes(userRole);
        if(!canCreate) {
            announcementForm.style.display = 'none';
            document.getElementById('ann-unauth-msg').style.display = 'block';
        }

        announcementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                title: document.getElementById('ann-title').value,
                content: document.getElementById('ann-content').value,
                type: document.getElementById('ann-type').value
            };
            try {
                await fetch('/api/announcements', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
                announcementForm.reset();
                fetchAnnouncements();
            } catch(e) {}
        });
    }

    async function fetchAnnouncements() {
        const list = document.getElementById('announcements-list-main');
        const dashList = document.getElementById('announcements-list'); // In Dashboard
        if(!list) return;
        try {
            const res = await fetch('/api/announcements', { headers: headers() });
            if(res.ok) {
                const data = await res.json();
                const html = data.length === 0 ? '<li>No active announcements.</li>' : data.map(a => `
                    <li style="margin-bottom:10px;">
                        <span class="tag ${a.type === 'Emergency' ? 'tag-emergency' : 'tag-internal'}">${a.type}</span> 
                        <strong>${a.title}</strong>
                        <p style="font-size:0.8rem; margin-top:5px; color:var(--text-muted);">${a.content}</p>
                    </li>
                `).join('');
                list.innerHTML = html;
                if(dashList) dashList.innerHTML = html;
            }
        } catch(e) {}
    }

    // Tasks
    const taskForm = document.getElementById('task-form');
    if(taskForm) {
        const userRole = JSON.parse(localStorage.getItem('intrasphere_user') || '{}').role;
        const canCreate = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'].includes(userRole);
        if(!canCreate) {
            taskForm.style.display = 'none';
            document.getElementById('task-unauth-msg').style.display = 'block';
        }

        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                title: document.getElementById('task-title').value,
                description: document.getElementById('task-desc').value,
                deadline: document.getElementById('task-deadline').value,
                assigned_to: document.getElementById('task-assignee').value
            };
            try {
                await fetch('/api/tasks', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
                taskForm.reset();
                fetchTasks();
            } catch(e) {}
        });
    }

    async function fetchTasks() {
        const list = document.getElementById('tasks-list');
        if(!list) return;
        try {
            const res = await fetch('/api/tasks', { headers: headers() });
            if(res.ok) {
                const data = await res.json();
                const userRole = JSON.parse(localStorage.getItem('intrasphere_user')).role;
                const canUpdateTask = ['CEO', 'COO', 'Project Manager & Overall Execution Lead'].includes(userRole);
                
                list.innerHTML = data.length === 0 ? '<li>No tasks found.</li>' : data.map(t => `
                    <li style="display:flex; flex-direction:column; gap:5px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <strong>${t.title}</strong>
                            <div>
                                <span class="tag tag-internal">${t.status}</span>
                                ${canUpdateTask ? `<button class="btn-primary toggle-task" data-id="${t.id}" data-status="${t.status === 'Completed' ? 'Pending' : 'Completed'}" style="padding: 4px 8px; font-size: 0.7rem; margin-left: 10px;">Mark ${t.status === 'Completed' ? 'Pending' : 'Completed'}</button>` : ''}
                            </div>
                        </div>
                        <p style="color:var(--text-muted); font-size:0.8rem;">Assigned to: ${t.assigned_name}</p>
                        <small style="color:var(--danger);">Deadline: ${new Date(t.deadline).toLocaleString()}</small>
                    </li>
                `).join('');
                
                document.querySelectorAll('.toggle-task').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const taskId = e.target.getAttribute('data-id');
                        const newStatus = e.target.getAttribute('data-status');
                        await fetch(`/api/tasks/${taskId}/status`, {
                            method: 'PUT',
                            headers: headers(),
                            body: JSON.stringify({ status: newStatus })
                        });
                        fetchTasks();
                    });
                });
            }
        } catch(e) {}
    }

    // Meetings
    const meetingForm = document.getElementById('meeting-form');
    if(meetingForm) {
        const userRole = JSON.parse(localStorage.getItem('intrasphere_user') || '{}').role;
        const canCreate = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'].includes(userRole);
        if(!canCreate) {
            meetingForm.style.display = 'none';
            document.getElementById('meet-unauth-msg').style.display = 'block';
        }

        meetingForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                title: document.getElementById('meet-title').value,
                agenda: document.getElementById('meet-agenda').value,
                datetime: document.getElementById('meet-datetime').value,
                departments: document.getElementById('meet-depts').value,
                meeting_link: document.getElementById('meet-link').value
            };
            try {
                await fetch('/api/meetings', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
                meetingForm.reset();
                fetchMeetings();
            } catch(e) {}
        });
    }

    async function fetchMeetings() {
        const list = document.getElementById('meetings-list');
        if(!list) return;
        try {
            const res = await fetch('/api/meetings', { headers: headers() });
            if(res.ok) {
                const data = await res.json();
                list.innerHTML = data.length === 0 ? '<li>No upcoming meetings.</li>' : data.map(m => `
                    <li style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${m.title}</strong>
                            <p style="color:var(--text-muted); font-size:0.8rem;">${new Date(m.datetime).toLocaleString()}</p>
                        </div>
                        ${m.meeting_link ? `<a href="${m.meeting_link}" target="_blank" class="btn-primary" style="padding: 6px 12px; font-size:0.8rem; text-decoration:none; border-radius:6px; display:inline-block;"><i class="fa-solid fa-video"></i> Join Now</a>` : ''}
                    </li>
                `).join('');
            }
        } catch(e) {}
    }

    // Attendance
    const attendanceForm = document.getElementById('attendance-form');
    if(attendanceForm) {
        // Init form state based on role
        const userRole = JSON.parse(localStorage.getItem('intrasphere_user') || '{}').role;
        const canMarkAtt = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin'].includes(userRole);
        
        if (canMarkAtt) {
            attendanceForm.style.display = 'block';
            document.getElementById('att-date').valueAsDate = new Date(); // default to today
        } else {
            const unauthMsg = document.getElementById('att-unauth-msg');
            if(unauthMsg) unauthMsg.style.display = 'block';
        }

        attendanceForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msg = document.getElementById('att-msg');
            msg.textContent = "";
            const payload = {
                status: document.getElementById('att-status').value,
                target_user_id: document.getElementById('att-user').value,
                target_date: document.getElementById('att-date').value
            };
            try {
                const res = await fetch('/api/attendance', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
                if(!res.ok) {
                    const err = await res.json();
                    msg.textContent = err.error;
                    msg.style.color = "var(--danger)";
                } else {
                    msg.textContent = "Attendance marked successfully.";
                    msg.style.color = "var(--success)";
                    fetchAttendance();
                }
            } catch(e) {}
        });
    }

    async function fetchAttendance() {
        const list = document.getElementById('attendance-list');
        if(!list) return;
        try {
            const res = await fetch('/api/attendance', { headers: headers() });
            if(res.ok) {
                const data = await res.json();
                list.innerHTML = data.length === 0 ? '<li>No attendance records.</li>' : data.map(a => `
                    <li style="display:flex; justify-content:space-between;">
                        <span>${a.name}</span>
                        <span><span class="tag ${a.status === 'Present' ? 'tag-internal' : 'tag-emergency'}">${a.status}</span> ${a.date}</span>
                    </li>
                `).join('');
            }
        } catch(e) {}
    }

    // Notices
    const noticeForm = document.getElementById('notice-form');
    if(noticeForm) {
        const userRole = JSON.parse(localStorage.getItem('intrasphere_user') || '{}').role;
        const canCreate = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'].includes(userRole);
        if(!canCreate) {
            noticeForm.style.display = 'none';
            document.getElementById('notice-unauth-msg').style.display = 'block';
        }

        noticeForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                title: document.getElementById('notice-title').value,
                content: document.getElementById('notice-content').value,
                issued_to: document.getElementById('notice-user').value
            };
            try {
                await fetch('/api/notices', { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
                noticeForm.reset();
                fetchNotices();
            } catch(e) {}
        });
    }

    async function fetchNotices() {
        const list = document.getElementById('notices-list');
        if(!list) return;
        try {
            const res = await fetch('/api/notices', { headers: headers() });
            if(res.ok) {
                const data = await res.json();
                const userRole = JSON.parse(localStorage.getItem('intrasphere_user')).role;
                const canManage = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'].includes(userRole);

                list.innerHTML = data.length === 0 ? '<li>No active notices.</li>' : data.map(n => `
                    <li style="display:flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                            <div>
                                <strong>${n.title}</strong> <span style="color:var(--text-muted); font-size:0.75rem;">(${n.reference_number})</span>
                                <p style="color:var(--text-muted); font-size:0.8rem; margin-top:2px;">${n.content}</p>
                                <small style="color:var(--danger); display:block; margin-top:2px;">Issued to: ${n.issued_to_name}</small>
                            </div>
                            <span class="tag tag-emergency">${n.status}</span>
                        </div>
                        
                        ${n.employee_response ? `
                            <div style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 4px; margin-top: 5px; font-size: 0.8rem;">
                                <strong>Employee Response:</strong> ${n.employee_response}
                            </div>
                        ` : ''}

                        <div style="margin-top: 5px; display:flex; gap: 10px; align-items:center;">
                            ${canManage ? `
                                <select class="notice-status-select" data-id="${n.id}" style="padding:4px; font-size:0.8rem; background: rgba(0,0,0,0.2); border:1px solid var(--border); color:var(--text-main);">
                                    <option value="Active" ${n.status === 'Active' ? 'selected' : ''}>Active</option>
                                    <option value="Pending Review" ${n.status === 'Pending Review' ? 'selected' : ''}>Pending Review</option>
                                    <option value="Resolved" ${n.status === 'Resolved' ? 'selected' : ''}>Resolved</option>
                                    <option value="Escalated" ${n.status === 'Escalated' ? 'selected' : ''}>Escalated</option>
                                </select>
                            ` : `
                                ${(!n.employee_response && n.status === 'Active') ? `
                                    <div style="display:flex; gap:5px; width:100%;">
                                        <input type="text" id="resp-${n.id}" placeholder="Type your response..." style="flex:1; padding:4px 8px; font-size:0.8rem; background:rgba(0,0,0,0.2); border:1px solid var(--border); color:var(--text-main);">
                                        <button class="btn-primary submit-resp" data-id="${n.id}" style="padding:4px 8px; font-size:0.8rem;">Submit</button>
                                    </div>
                                ` : ''}
                            `}
                        </div>
                    </li>
                `).join('');

                // Event listeners for admin status change
                document.querySelectorAll('.notice-status-select').forEach(sel => {
                    sel.addEventListener('change', async (e) => {
                        await fetch(`/api/notices/${e.target.dataset.id}/status`, {
                            method: 'PUT',
                            headers: headers(),
                            body: JSON.stringify({ status: e.target.value })
                        });
                        fetchNotices();
                    });
                });

                // Event listeners for employee response
                document.querySelectorAll('.submit-resp').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const id = e.target.dataset.id;
                        const resp = document.getElementById(`resp-${id}`).value;
                        if(!resp) return;
                        await fetch(`/api/notices/${id}/response`, {
                            method: 'PUT',
                            headers: headers(),
                            body: JSON.stringify({ response: resp })
                        });
                        fetchNotices();
                    });
                });
            }
        } catch(e) {}
    }

    // Trigger initial data load if logged in
    if (localStorage.getItem('intrasphere_token')) {
        fetchUsers();
        fetchCirculars();
        fetchAnnouncements();
        fetchTasks();
        fetchMeetings();
        fetchAttendance();
        fetchNotices();
    }

    // --- Phase 4: Charts and Profile Analytics ---
    let activityChartInstance = null;
    let performanceChartInstance = null;

    function renderCharts(dashData, profData) {
        // Setup shared chart styling
        Chart.defaults.color = '#9CA3AF';
        Chart.defaults.font.family = "'Inter', sans-serif";

        const actCtx = document.getElementById('activityChart');
        if(actCtx) {
            if(activityChartInstance) activityChartInstance.destroy();
            activityChartInstance = new Chart(actCtx, {
                type: 'bar',
                data: {
                    labels: ['Circulars', 'Meetings', 'Tasks', 'Notices'],
                    datasets: [{
                        label: 'Active Items',
                        data: [dashData.activeCirculars || 0, dashData.upcomingMeetings || 0, dashData.pendingTasks || 0, dashData.recentNotices || 0],
                        backgroundColor: [
                            'rgba(56, 189, 248, 0.6)',
                            'rgba(167, 139, 250, 0.6)',
                            'rgba(52, 211, 153, 0.6)',
                            'rgba(251, 191, 36, 0.6)'
                        ],
                        borderColor: [
                            'rgba(56, 189, 248, 1)',
                            'rgba(167, 139, 250, 1)',
                            'rgba(52, 211, 153, 1)',
                            'rgba(251, 191, 36, 1)'
                        ],
                        borderWidth: 1,
                        borderRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } }, x: { grid: { display: false } } }
                }
            });
        }

        const perfCtx = document.getElementById('performanceChart');
        if(perfCtx && profData) {
            if(performanceChartInstance) performanceChartInstance.destroy();
            const completed = profData.completed_tasks || 0;
            const pending = (profData.total_tasks || 0) - completed;
            performanceChartInstance = new Chart(perfCtx, {
                type: 'doughnut',
                data: {
                    labels: ['Completed Tasks', 'Pending Tasks'],
                    datasets: [{
                        data: [completed, pending],
                        backgroundColor: ['rgba(52, 211, 153, 0.8)', 'rgba(255,255,255,0.1)'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom' }
                    },
                    cutout: '75%'
                }
            });
        }
    }

    async function fetchProfileAnalytics() {
        const userStr = localStorage.getItem('intrasphere_user');
        if(!userStr) return null;
        const user = JSON.parse(userStr);
        
        document.getElementById('prof-name').textContent = user.name;
        document.getElementById('prof-role').textContent = user.role;
        document.getElementById('prof-dept').textContent = user.department;
        document.getElementById('prof-id').textContent = user.employee_id;

        try {
            const res = await fetch('/api/profile/analytics', { headers: headers() });
            if(res.ok) {
                const data = await res.json();
                document.getElementById('prof-stat-tasks').textContent = data.completed_tasks || 0;
                // Assuming 22 working days max for attendance demo
                const attRate = Math.min(100, Math.round(((data.days_present || 0) / 22) * 100));
                document.getElementById('prof-stat-att').textContent = `${attRate}%`;
                document.getElementById('prof-stat-notices').textContent = data.active_notices || 0;
                return data;
            }
        } catch(e) {}
        return null;
    }

    // Override fetchDashboardStats to also render charts
    async function fetchDashboardStats() {
        const token = localStorage.getItem('intrasphere_token');
        if(!token) return;

        try {
            const res = await fetch('/api/dashboard', { headers: headers() });
            if(res.ok) {
                const dashData = await res.json();
                document.getElementById('stat-circulars').textContent = dashData.activeCirculars || 0;
                document.getElementById('stat-meetings').textContent = dashData.upcomingMeetings || 0;
                document.getElementById('stat-tasks').textContent = dashData.pendingTasks || 0;
                document.getElementById('stat-notices').textContent = dashData.recentNotices || 0;
                
                const profData = await fetchProfileAnalytics();
                renderCharts(dashData, profData);
            }
        } catch (err) {
            console.error("Failed to load dashboard stats", err);
        }
    }
    
    // Make sure we load the analytics logic if logged in
    if (localStorage.getItem('intrasphere_token')) {
        // Redefine the call to fetchDashboardStats to ensure it uses the overridden one that renders charts.
        // Actually, JavaScript hoisting means the redefined function above will be called in `initPortal` and here.
        fetchDashboardStats();
    }
});
