const API_BASE = 'https://intrasphere-thiran.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
    // Clock setup
    const updateClocks = () => {
        const now = new Date();
        const dateString = now.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        const timeString = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const currentDateEl = document.getElementById('current-date');
        const currentTimeEl = document.getElementById('current-time');
        const headerClockEl = document.getElementById('header-clock');

        if (currentDateEl) currentDateEl.textContent = dateString;
        if (currentTimeEl) currentTimeEl.textContent = timeString;
        if (headerClockEl) headerClockEl.textContent = timeString;
    };

    setInterval(updateClocks, 1000);
    updateClocks();

    // Elements
    const loginView = document.getElementById('login-view');
    const portalView = document.getElementById('portal-view');
    const loginForm = document.getElementById('login-form');
    const loginError = document.getElementById('login-error');

    // Check existing login
    const token = localStorage.getItem('intrasphere_token');
    const userStr = localStorage.getItem('intrasphere_user');

    if (token && userStr) {
        try {
            const user = JSON.parse(userStr);
            initPortal(user);
        } catch (e) {
            console.error('Session restore failed:', e);
            localStorage.clear();
        }
    }

    // Login Logic
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const employeeId = document.getElementById('employee-id')?.value;
            const password = document.getElementById('password')?.value;
            const department = document.getElementById('department-select')?.value;

            if (loginError) loginError.textContent = '';

            const btn = loginForm.querySelector('button[type="submit"]');
            if (btn) btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Authenticating...';

            try {
                const response = await fetch(`${API_BASE}/api/login`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        employee_id: employeeId,
                        password
                    })
                });

                const data = await response.json();

                console.log('LOGIN RESPONSE:', data);

                if (response.ok) {
                    if (data.user.department !== department && department !== 'Leadership') {
                        if (loginError) {
                            loginError.textContent = 'Department mismatch for this Employee ID.';
                        }

                        if (btn) {
                            btn.innerHTML = 'Access Workspace <i class="fa-solid fa-arrow-right"></i>';
                        }

                        return;
                    }

                    localStorage.setItem('intrasphere_token', data.token);
                    localStorage.setItem('intrasphere_user', JSON.stringify(data.user));

                    initPortal(data.user);
                } else {
                    if (loginError) {
                        loginError.textContent = data.error || 'Authentication failed.';
                    }

                    if (btn) {
                        btn.innerHTML = 'Access Workspace <i class="fa-solid fa-arrow-right"></i>';
                    }
                }
            } catch (err) {
                console.error('LOGIN ERROR:', err);

                if (loginError) {
                    loginError.textContent = 'Backend connection failed.';
                }

                if (btn) {
                    btn.innerHTML = 'Access Workspace <i class="fa-solid fa-arrow-right"></i>';
                }
            }
        });
    }

    // Headers helper
    function headers() {
        return {
            'Content-Type': 'application/json',
            'x-access-token': localStorage.getItem('intrasphere_token')
        };
    }

    // Generic GET API
    async function apiGet(url) {
        try {
            const response = await fetch(`${API_BASE}${url}`, {
                headers: headers()
            });

            if (!response.ok) {
                console.error('GET FAILED:', response.status, url);
                return null;
            }

            return await response.json();
        } catch (err) {
            console.error('API GET ERROR:', err);
            return null;
        }
    }

    // Generic POST API
    async function apiPost(url, payload, successMsg) {
        try {
            const response = await fetch(`${API_BASE}${url}`, {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (response.ok) {
                if (successMsg) alert(successMsg);
                return data;
            }

            console.error('POST FAILED:', data);
            alert(data.error || 'Unknown error');
            return null;
        } catch (err) {
            console.error('API POST ERROR:', err);
            alert('Backend connection failed');
            return null;
        }
    }

    // Initialize Portal
    function initPortal(user) {
        console.log('Initializing portal...');

        if (loginView) loginView.classList.remove('active-view');
        if (portalView) portalView.classList.add('active-view');

        document.body.setAttribute('data-theme', user.department);

        const userNameEl = document.getElementById('user-name');
        const userRoleEl = document.getElementById('user-role');
        const userDeptBadgeEl = document.getElementById('user-dept-badge');
        const welcomeMessageEl = document.getElementById('welcome-message');

        if (userNameEl) userNameEl.textContent = user.name;
        if (userRoleEl) userRoleEl.textContent = user.role;
        if (userDeptBadgeEl) userDeptBadgeEl.textContent = user.department;
        if (welcomeMessageEl) {
            welcomeMessageEl.textContent = `Welcome back, ${user.name.split(' ')[0]}`;
        }

        fetchDashboardStats();
        fetchUsers();
        fetchCirculars();
        fetchAnnouncements();
        fetchTasks();
        fetchMeetings();
        fetchAttendance();
        fetchNotices();
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');

    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('intrasphere_token');
            localStorage.removeItem('intrasphere_user');
            window.location.reload();
        });
    }

    // Dashboard Stats
    async function fetchDashboardStats() {
        const data = await apiGet('/api/dashboard');

        console.log('Dashboard Data:', data);

        if (!data) return;

        const statCirculars = document.getElementById('stat-circulars');
        const statMeetings = document.getElementById('stat-meetings');
        const statTasks = document.getElementById('stat-tasks');
        const statNotices = document.getElementById('stat-notices');

        if (statCirculars) statCirculars.textContent = data.activeCirculars || 0;
        if (statMeetings) statMeetings.textContent = data.upcomingMeetings || 0;
        if (statTasks) statTasks.textContent = data.pendingTasks || 0;
        if (statNotices) statNotices.textContent = data.recentNotices || 0;
    }

    // Users
    async function fetchUsers() {
        const users = await apiGet('/api/users');

        console.log('Users:', users);
    }

    // Circulars
    async function fetchCirculars() {
        const list = document.getElementById('circulars-list');
        if (!list) return;

        const data = await apiGet('/api/circulars');

        if (!data) {
            list.innerHTML = '<li>Failed to load circulars.</li>';
            return;
        }

        list.innerHTML = data.map(c => `
            <li>
                <strong>${c.title}</strong>
                <p>${c.content}</p>
            </li>
        `).join('');
    }

    // Announcements
    async function fetchAnnouncements() {
        const list = document.getElementById('announcements-list-main');
        if (!list) return;

        const data = await apiGet('/api/announcements');

        console.log('Announcements:', data);

        if (!data) {
            list.innerHTML = '<li>Failed to load announcements.</li>';
            return;
        }

        list.innerHTML = data.map(a => `
            <li>
                <strong>${a.title}</strong>
                <p>${a.content}</p>
            </li>
        `).join('');
    }

    // Tasks
    async function fetchTasks() {
        const list = document.getElementById('tasks-list');
        if (!list) return;

        const data = await apiGet('/api/tasks');

        console.log('Tasks:', data);

        if (!data) {
            list.innerHTML = '<li>Failed to load tasks.</li>';
            return;
        }

        list.innerHTML = data.map(t => `
            <li>
                <strong>${t.title}</strong>
                <p>${t.description || ''}</p>
            </li>
        `).join('');
    }

    // Meetings
    async function fetchMeetings() {
        const list = document.getElementById('meetings-list');
        if (!list) return;

        const data = await apiGet('/api/meetings');

        console.log('Meetings:', data);

        if (!data) {
            list.innerHTML = '<li>Failed to load meetings.</li>';
            return;
        }

        list.innerHTML = data.map(m => `
            <li>
                <strong>${m.title}</strong>
            </li>
        `).join('');
    }

    // Attendance
    async function fetchAttendance() {
        const list = document.getElementById('attendance-list');
        if (!list) return;

        const data = await apiGet('/api/attendance');

        console.log('Attendance:', data);

        if (!data) {
            list.innerHTML = '<li>Failed to load attendance.</li>';
            return;
        }

        list.innerHTML = data.map(a => `
            <li>
                <strong>${a.name}</strong>
            </li>
        `).join('');
    }

    // Notices
    async function fetchNotices() {
        const list = document.getElementById('notices-list');
        if (!list) return;

        const data = await apiGet('/api/notices');

        console.log('Notices:', data);

        if (!data) {
            list.innerHTML = '<li>Failed to load notices.</li>';
            return;
        }

        list.innerHTML = data.map(n => `
            <li>
                <strong>${n.title}</strong>
                <p>${n.content}</p>
            </li>
        `).join('');
    }

    // Navigation
    const navLinks = document.querySelectorAll('.nav-links li');
    const modules = document.querySelectorAll('.module');

    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');

            const targetId = link.getAttribute('data-target');

            modules.forEach(m => m.classList.remove('active-module'));

            const targetModule = document.getElementById(targetId);
            if (targetModule) {
                targetModule.classList.add('active-module');
            }
        });
    });

    console.log('MAIN.JS LOADED SUCCESSFULLY');
});
