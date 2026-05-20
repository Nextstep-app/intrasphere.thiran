document.addEventListener('DOMContentLoaded', () => {
                return null;
            }
        } catch (e) {
            console.error("API POST Error:", e);
            alert("Connection error. Please try again.");
            return null;
        }
    }

    async function apiGet(url) {
        try {
            const res = await fetch(url, { headers: headers() });
            if (res.ok) return await res.json();
            return null;
        } catch (e) {
            console.error("API GET Error:", e);
            return null;
        }
    }

    // Fetch Dashboard Stats and Render Charts
    async function fetchDashboardStats() {
        const data = await apiGet('/api/dashboard');
        if (data) {
            if(document.getElementById('stat-circulars')) document.getElementById('stat-circulars').textContent = data.activeCirculars || 0;
            if(document.getElementById('stat-meetings')) document.getElementById('stat-meetings').textContent = data.upcomingMeetings || 0;
            if(document.getElementById('stat-tasks')) document.getElementById('stat-tasks').textContent = data.pendingTasks || 0;
            if(document.getElementById('stat-notices')) document.getElementById('stat-notices').textContent = data.recentNotices || 0;
            
            const profData = await fetchProfileAnalytics();
            renderCharts(data, profData);
        }
    }

    async function fetchProfileAnalytics() {
        const userStr = localStorage.getItem('intrasphere_user');
        if(!userStr) return null;
        const user = JSON.parse(userStr);
        
        if(document.getElementById('prof-name')) document.getElementById('prof-name').textContent = user.name;
        if(document.getElementById('prof-role')) document.getElementById('prof-role').textContent = user.role;
        if(document.getElementById('prof-dept')) document.getElementById('prof-dept').textContent = user.department;
        if(document.getElementById('prof-id')) document.getElementById('prof-id').textContent = user.employee_id;

        const data = await apiGet('/api/profile/analytics');
        if (data) {
            if(document.getElementById('prof-stat-tasks')) document.getElementById('prof-stat-tasks').textContent = data.completed_tasks || 0;
            const attRate = Math.min(100, Math.round(((data.days_present || 0) / 22) * 100));
            if(document.getElementById('prof-stat-att')) document.getElementById('prof-stat-att').textContent = `${attRate}%`;
            if(document.getElementById('prof-stat-notices')) document.getElementById('prof-stat-notices').textContent = data.active_notices || 0;
            return data;
        }
        return null;
    }

    async function fetchUsers() {
        const users = await apiGet('/api/users');
        if (users) {
            const selects = ['task-assignee', 'att-user', 'notice-user'];
            selects.forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                    let html = '<option value="" disabled selected>Select...</option>';
                    users.forEach(u => {
                        html += `<option value="${u.id}">${u.name} (${u.role} - ${u.department})</option>`;
                    });
                    el.innerHTML = html;
                }
            });
        }
    }
