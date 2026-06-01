const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const supabase = require('./database'); // This is now Supabase client
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = 'intrasphere-super-secret-key';

// Setup web-push
const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFL8eI5RoAlJI';
const privateVapidKey = '_r1-L8QpWqT6bUjE6Gf-_zYvR4pZ6B_wLw-Qf2_mXxw';
webpush.setVapidDetails('mailto:admin@intrasphere.com', publicVapidKey, privateVapidKey);

// Notification Helper
async function notifyUsers(supabase, userIds, title, body, url = '/') {
    let query = supabase.from('users').select('push_subscription').not('push_subscription', 'is', null);
    
    if (userIds && userIds.length > 0) {
        query = query.in('id', userIds);
    }
    
    const { data: rows, error } = await query;
    
    if (error || !rows) return;
    
    const payload = JSON.stringify({ title, body, icon: '/icons/intrasphere-logo.png', url });
    rows.forEach(row => {
        try {
            const sub = JSON.parse(row.push_subscription);
            webpush.sendNotification(sub, payload).catch(e => console.error("Push Error", e));
        } catch(e) {}
    });
}

// Path Detection Logic
const fs = require('fs');
const publicPath = path.resolve(__dirname, 'public');
const rootPath = __dirname;
const servePath = fs.existsSync(publicPath) ? publicPath : rootPath;

app.use(cors());
app.use(express.json());

// If files are in root (GitHub), map common paths
if (servePath === rootPath) {
    app.get('/js/main.js', (req, res) => res.sendFile(path.join(rootPath, 'main.js')));
    app.get('/css/style.css', (req, res) => res.sendFile(path.join(rootPath, 'style.css')));
}

app.use(express.static(servePath));

// Login Endpoint
app.post('/api/login', async (req, res) => {
    const { employee_id, password } = req.body;
    
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('employee_id', employee_id)
        .single();
        
    if (error || !user) return res.status(401).json({ error: "Invalid credentials" });

    const passwordIsValid = bcrypt.compareSync(password, user.password);
    if (!passwordIsValid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user.id, department: user.department, role: user.role, name: user.name }, JWT_SECRET, {
        expiresIn: 86400 // 24 hours
    });

    res.status(200).json({
        auth: true,
        token: token,
        user: {
            name: user.name,
            employee_id: user.employee_id,
            department: user.department,
            role: user.role
        }
    });
});

// Middleware to verify token
const verifyToken = (req, res, next) => {
    const token = req.headers['x-access-token'];
    if (!token) return res.status(403).json({ auth: false, message: 'No token provided.' });
    
    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(500).json({ auth: false, message: 'Failed to authenticate token.' });
        req.userId = decoded.id;
        req.userDept = decoded.department;
        req.userRole = decoded.role;
        next();
    });
};

// API: Get Current User Profile
app.get('/api/profile', verifyToken, async (req, res) => {
    const { data: user, error } = await supabase
        .from('users')
        .select('id, name, role, department, employee_id')
        .eq('id', req.userId)
        .single();
        
    if (error || !user) return res.status(500).json({ error: "User not found" });
    res.status(200).json(user);
});

// API: Save Push Subscription
app.post('/api/subscribe', verifyToken, async (req, res) => {
    const subscription = req.body;
    const { error } = await supabase
        .from('users')
        .update({ push_subscription: JSON.stringify(subscription) })
        .eq('id', req.userId);
        
    if(error) return res.status(500).json({ error: error.message });
    res.status(201).json({});
});

// API: Get Dashboard Stats
app.get('/api/dashboard', verifyToken, async (req, res) => {
    const [{ count: activeCirculars }, { count: upcomingMeetings }, { count: pendingTasks }, { count: recentNotices }] = await Promise.all([
        supabase.from('circulars').select('*', { count: 'exact', head: true }),
        supabase.from('meetings').select('*', { count: 'exact', head: true }),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).neq('status', 'Completed'),
        supabase.from('notices').select('*', { count: 'exact', head: true }).eq('status', 'Active')
    ]);
    
    res.status(200).json({ activeCirculars, upcomingMeetings, pendingTasks, recentNotices });
});

// API: Get Profile Analytics
app.get('/api/profile/analytics', verifyToken, async (req, res) => {
    const userId = req.userId;
    
    const [{ count: total_tasks }, { count: completed_tasks }, { count: active_notices }, { count: days_present }] = await Promise.all([
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to', userId),
        supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('assigned_to', userId).eq('status', 'Completed'),
        supabase.from('notices').select('*', { count: 'exact', head: true }).eq('issued_to', userId),
        supabase.from('attendance').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ]);
    
    res.status(200).json({ total_tasks, completed_tasks, active_notices, days_present });
});

// --- API Endpoints for Modules ---

// Users (for dropdowns)
app.get('/api/users', verifyToken, async (req, res) => {
    const { data: rows, error } = await supabase
        .from('users')
        .select('id, name, department, role');
        
    if (error) return res.status(500).json({ error: "Database error" });
    res.json(rows);
});

// Circulars
app.get('/api/circulars', verifyToken, async (req, res) => {
    const { data: rows, error } = await supabase
        .from('circulars')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(rows);
});

app.post('/api/circulars', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can publish circulars." });
    }
    const { title, content, category, priority, departments } = req.body;
    
    const { data, error } = await supabase
        .from('circulars')
        .insert([{ title, content, category, priority, departments, created_by: req.userId }])
        .select()
        .single();
        
    if (error) {
        console.error("Circular Creation Error:", error);
        return res.status(500).json({ error: "Failed to save circular. " + error.message });
    }
    
    notifyUsers(supabase, null, `New Circular: ${title}`, content.substring(0, 50) + "...");
    res.json(data);
});

// Announcements
app.get('/api/announcements', verifyToken, async (req, res) => {
    const { data: rows, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(rows || []);
});

app.post('/api/announcements', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can broadcast announcements." });
    }
    const { title, content, type } = req.body;
    
    const { data, error } = await supabase
        .from('announcements')
        .insert([{ title, content, type, created_by: req.userId }])
        .select()
        .single();
        
    if (error) {
        console.error("Announcement Creation Error:", error);
        return res.status(500).json({ error: "Failed to broadcast announcement. " + error.message });
    }
    
    notifyUsers(supabase, null, `Announcement: ${title}`, content.substring(0, 50) + "...");
    res.json(data);
});

// Tasks
app.get('/api/tasks', verifyToken, async (req, res) => {
    const { data: rows, error } = await supabase
        .from('tasks')
        .select('*, users:assigned_to(name)')
        .order('deadline', { ascending: true });
        
    if (error) return res.status(500).json({ error: error.message });
    
    const formattedRows = rows.map(row => ({
        ...row,
        assigned_name: row.users?.name,
        users: undefined
    }));
    
    res.json(formattedRows);
});

app.post('/api/tasks', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can assign tasks." });
    }
    const { title, description, deadline, assigned_to } = req.body;
    
    const { data, error } = await supabase
        .from('tasks')
        .insert([{ title, description, deadline, assigned_to, created_by: req.userId, status: 'Pending' }])
        .select()
        .single();
        
    if (error) {
        console.error("Task Assignment Error:", error);
        return res.status(500).json({ error: "Failed to assign task. " + error.message });
    }
    
    notifyUsers(supabase, [assigned_to], `New Task Assigned`, `You have a new task: ${title}`);
    res.json(data);
});

app.put('/api/tasks/:id/status', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only CEO, COO, or PM can update task status." });
    }
    
    const { status } = req.body;
    const { error } = await supabase
        .from('tasks')
        .update({ status })
        .eq('id', req.params.id);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, status });
});

// Meetings
app.get('/api/meetings', verifyToken, async (req, res) => {
    const { data: rows, error } = await supabase
        .from('meetings')
        .select('*')
        .order('datetime', { ascending: true });
        
    if (error) return res.status(500).json({ error: error.message });
    res.json(rows || []);
});

app.post('/api/meetings', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can schedule meetings." });
    }
    const { title, agenda, datetime, departments, meeting_link } = req.body;
    
    const { data, error } = await supabase
        .from('meetings')
        .insert([{ title, agenda, datetime, departments, meeting_link, created_by: req.userId }])
        .select()
        .single();
        
    if (error) {
        console.error("Meeting Scheduling Error:", error);
        return res.status(500).json({ error: "Failed to schedule meeting. " + error.message });
    }
    
    notifyUsers(supabase, null, `Meeting Scheduled: ${title}`, `Scheduled for ${new Date(datetime).toLocaleString()}`);
    res.json(data);
});

// Attendance
app.get('/api/attendance', verifyToken, async (req, res) => {
    const { data: rows, error } = await supabase
        .from('attendance')
        .select('*, users:user_id(name)')
        .order('date', { ascending: false });
        
    if (error) return res.status(500).json({ error: error.message });
    
    const formattedRows = rows.map(row => ({
        ...row,
        name: row.users?.name,
        users: undefined
    }));
    
    res.json(formattedRows);
});

app.post('/api/attendance', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only CEO, COO, or HR can mark attendance." });
    }

    const { status, target_user_id, target_date } = req.body;
    const date = target_date || new Date().toISOString().split('T')[0];
    const check_in_time = new Date().toISOString();
    
    const { data: existing, error: findError } = await supabase
        .from('attendance')
        .select('id')
        .eq('user_id', target_user_id)
        .eq('date', date)
        .single();
        
    if (existing) return res.status(400).json({ error: "Attendance already marked for this user on this day." });
    
    const { data, error } = await supabase
        .from('attendance')
        .insert([{ user_id: target_user_id, date, status, check_in_time }])
        .select()
        .single();
        
    if (error) {
        console.error("Attendance Marking Error:", error);
        return res.status(500).json({ error: "Failed to mark attendance. " + error.message });
    }
    res.json(data);
});

// Notices
app.get('/api/notices', verifyToken, async (req, res) => {
    const adminRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    
    let query = supabase
        .from('notices')
        .select('*, users:issued_to(name)')
        .order('created_at', { ascending: false });
        
    if (!adminRoles.includes(req.userRole)) {
        query = query.eq('issued_to', req.userId);
    }
    
    const { data: rows, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    
    const formattedRows = rows.map(row => ({
        ...row,
        issued_to_name: row.users?.name,
        users: undefined
    }));
    
    res.json(formattedRows);
});

app.post('/api/notices', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can issue notices." });
    }
    const { title, content, issued_to } = req.body;
    const refNum = `NT-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const { data, error } = await supabase
        .from('notices')
        .insert([{ reference_number: refNum, title, content, issued_to, created_by: req.userId, status: 'Active' }])
        .select()
        .single();
        
    if (error) {
        console.error("Notice Issuance Error:", error);
        return res.status(500).json({ error: "Failed to issue notice. " + error.message });
    }
    
    notifyUsers(supabase, [issued_to], `Official Notice Issued`, `Ref: ${refNum} - ${title}`);
    res.json(data);
});

app.put('/api/notices/:id/status', verifyToken, async (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized." });
    }
    const { status } = req.body;
    const { error } = await supabase
        .from('notices')
        .update({ status })
        .eq('id', req.params.id);
        
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, status });
});

app.put('/api/notices/:id/response', verifyToken, async (req, res) => {
    const { response } = req.body;
    
    const { data, error } = await supabase
        .from('notices')
        .update({ employee_response: response, status: 'Pending Review' })
        .eq('id', req.params.id)
        .eq('issued_to', req.userId)
        .select();
        
    if (error) return res.status(500).json({ error: error.message });
    if (!data || data.length === 0) return res.status(403).json({ error: "Unauthorized or notice not found." });
    
    res.json({ success: true });
});

// Serve frontend application for all other routes
app.get('*', (req, res) => {
    const indexPath = path.resolve(servePath, 'index.html');
    if (!fs.existsSync(indexPath)) {
        console.error("CRITICAL ERROR: index.html not found at", indexPath);
        return res.status(404).send("Frontend files missing. Please ensure index.html is in the root or public folder.");
    }
    res.sendFile(indexPath);
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`INTRASPHERE System Online: Port ${PORT}`);
        console.log(`Workspace Status: ACTIVE`);
        console.log(`Internal Monitoring: ENABLED`);
    });
}

module.exports = app;
