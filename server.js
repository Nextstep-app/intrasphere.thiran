const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./database');
const webpush = require('web-push');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = 'intrasphere-super-secret-key';

// Setup web-push
const publicVapidKey = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFL8eI5RoAlJI';
const privateVapidKey = '_r1-L8QpWqT6bUjE6Gf-_zYvR4pZ6B_wLw-Qf2_mXxw';
webpush.setVapidDetails('mailto:admin@intrasphere.com', publicVapidKey, privateVapidKey);

// Notification Helper
function notifyUsers(db, userIds, title, body, url = '/') {
    const query = (userIds && userIds.length > 0) ? `SELECT push_subscription FROM users WHERE id IN (${userIds.join(',')}) AND push_subscription IS NOT NULL` 
                          : `SELECT push_subscription FROM users WHERE push_subscription IS NOT NULL`;
    
    db.all(query, [], (err, rows) => {
        if (err || !rows) return;
        const payload = JSON.stringify({ title, body, icon: '/icons/intrasphere-logo.png', url });
        rows.forEach(row => {
            try {
                const sub = JSON.parse(row.push_subscription);
                webpush.sendNotification(sub, payload).catch(e => console.error("Push Error", e));
            } catch(e) {}
        });
    });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.resolve(__dirname, 'public')));

// Login Endpoint
app.post('/api/login', (req, res) => {
    const { employee_id, password } = req.body;
    
    db.get("SELECT * FROM users WHERE employee_id = ?", [employee_id], (err, user) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!user) return res.status(401).json({ error: "Invalid credentials" });

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
app.get('/api/profile', verifyToken, (req, res) => {
    db.get("SELECT id, name, role, department, employee_id FROM users WHERE id = ?", [req.userId], (err, user) => {
        if (err || !user) return res.status(500).json({ error: "User not found" });
        res.status(200).json(user);
    });
});

// API: Save Push Subscription
app.post('/api/subscribe', verifyToken, (req, res) => {
    const subscription = req.body;
    db.run("UPDATE users SET push_subscription = ? WHERE id = ?", [JSON.stringify(subscription), req.userId], (err) => {
        if(err) return res.status(500).json({ error: err.message });
        res.status(201).json({});
    });
});

// API: Get Dashboard Stats
app.get('/api/dashboard', verifyToken, (req, res) => {
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM circulars) as activeCirculars,
            (SELECT COUNT(*) FROM meetings) as upcomingMeetings,
            (SELECT COUNT(*) FROM tasks WHERE status != 'Completed') as pendingTasks,
            (SELECT COUNT(*) FROM notices WHERE status = 'Active') as recentNotices
    `, [], (err, row) => {
        if(err) return res.status(500).json({ error: err.message });
        res.status(200).json(row);
    });
});

// API: Get Profile Analytics
app.get('/api/profile/analytics', verifyToken, (req, res) => {
    const userId = req.userId;
    db.get(`
        SELECT 
            (SELECT COUNT(*) FROM tasks WHERE assigned_to = ?) as total_tasks,
            (SELECT COUNT(*) FROM tasks WHERE assigned_to = ? AND status = 'Completed') as completed_tasks,
            (SELECT COUNT(*) FROM notices WHERE issued_to = ?) as active_notices,
            (SELECT COUNT(*) FROM attendance WHERE user_id = ?) as days_present
    `, [userId, userId, userId, userId], (err, row) => {
        if(err) return res.status(500).json({ error: err.message });
        res.status(200).json(row);
    });
});

// --- API Endpoints for Modules ---

// Users (for dropdowns)
app.get('/api/users', verifyToken, (req, res) => {
    db.all("SELECT id, name, department, role FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(rows);
    });
});

// Circulars
app.get('/api/circulars', verifyToken, (req, res) => {
    db.all("SELECT * FROM circulars ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/circulars', verifyToken, (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can publish circulars." });
    }
    const { title, content, category, priority, departments } = req.body;
    db.run("INSERT INTO circulars (title, content, category, priority, departments, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        [title, content, category, priority, departments, req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            notifyUsers(db, null, `New Circular: ${title}`, content.substring(0, 50) + "...");
            res.json({ id: this.lastID, title, content, category, priority, departments });
        });
});

// Announcements
app.get('/api/announcements', verifyToken, (req, res) => {
    db.all("SELECT * FROM announcements ORDER BY created_at DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/announcements', verifyToken, (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can broadcast announcements." });
    }
    const { title, content, type } = req.body;
    db.run("INSERT INTO announcements (title, content, type, created_by) VALUES (?, ?, ?, ?)",
        [title, content, type, req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            notifyUsers(db, null, `Announcement: ${title}`, content.substring(0, 50) + "...");
            res.json({ id: this.lastID, title, content, type });
        });
});

// Tasks
app.get('/api/tasks', verifyToken, (req, res) => {
    db.all("SELECT tasks.*, users.name as assigned_name FROM tasks LEFT JOIN users ON tasks.assigned_to = users.id ORDER BY deadline ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/tasks', verifyToken, (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can assign tasks." });
    }
    const { title, description, deadline, assigned_to } = req.body;
    db.run("INSERT INTO tasks (title, description, deadline, assigned_to, created_by) VALUES (?, ?, ?, ?, ?)",
        [title, description, deadline, assigned_to, req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            notifyUsers(db, [assigned_to], `New Task Assigned`, `You have a new task: ${title}`);
            res.json({ id: this.lastID, title, description, deadline, assigned_to, status: 'Pending' });
        });
});
app.put('/api/tasks/:id/status', verifyToken, (req, res) => {
    // Only CEO, COO, Project Manager
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only CEO, COO, or PM can update task status." });
    }
    
    const { status } = req.body;
    db.run("UPDATE tasks SET status = ? WHERE id = ?", [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, status });
    });
});

// Meetings
app.get('/api/meetings', verifyToken, (req, res) => {
    db.all("SELECT * FROM meetings ORDER BY datetime ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/meetings', verifyToken, (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Project Manager & Overall Execution Lead', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can schedule meetings." });
    }
    const { title, agenda, datetime, departments, meeting_link } = req.body;
    db.run("INSERT INTO meetings (title, agenda, datetime, departments, meeting_link, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        [title, agenda, datetime, departments, meeting_link, req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            notifyUsers(db, null, `Meeting Scheduled: ${title}`, `Scheduled for ${new Date(datetime).toLocaleString()}`);
            res.json({ id: this.lastID, title, agenda, datetime, departments, meeting_link });
        });
});

// Attendance
app.get('/api/attendance', verifyToken, (req, res) => {
    db.all("SELECT attendance.*, users.name FROM attendance JOIN users ON attendance.user_id = users.id ORDER BY date DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});
app.post('/api/attendance', verifyToken, (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only CEO, COO, or HR can mark attendance." });
    }

    const { status, target_user_id, target_date } = req.body;
    const date = target_date || new Date().toISOString().split('T')[0];
    const check_in_time = new Date().toISOString();
    
    // Check if already marked for that day
    db.get("SELECT id FROM attendance WHERE user_id = ? AND date = ?", [target_user_id, date], (err, row) => {
        if (row) return res.status(400).json({ error: "Attendance already marked for this user on this day." });
        
        db.run("INSERT INTO attendance (user_id, date, status, check_in_time) VALUES (?, ?, ?, ?)",
            [target_user_id, date, status, check_in_time], function(err) {
                if (err) return res.status(500).json({ error: err.message });
                res.json({ id: this.lastID, date, status, check_in_time });
            });
    });
});

// Notices
app.get('/api/notices', verifyToken, (req, res) => {
    const adminRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (adminRoles.includes(req.userRole)) {
        db.all("SELECT notices.*, users.name as issued_to_name FROM notices LEFT JOIN users ON notices.issued_to = users.id ORDER BY created_at DESC", [], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    } else {
        db.all("SELECT notices.*, users.name as issued_to_name FROM notices LEFT JOIN users ON notices.issued_to = users.id WHERE issued_to = ? ORDER BY created_at DESC", [req.userId], (err, rows) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json(rows);
        });
    }
});

app.post('/api/notices', verifyToken, (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized. Only specific executives can issue notices." });
    }
    const { title, content, issued_to } = req.body;
    const refNum = `NT-${new Date().toISOString().split('T')[0].replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    db.run("INSERT INTO notices (reference_number, title, content, issued_to, created_by) VALUES (?, ?, ?, ?, ?)",
        [refNum, title, content, issued_to, req.userId], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            notifyUsers(db, [issued_to], `Official Notice Issued`, `Ref: ${refNum} - ${title}`);
            res.json({ id: this.lastID, reference_number: refNum, title, content, issued_to, status: 'Active' });
        });
});

app.put('/api/notices/:id/status', verifyToken, (req, res) => {
    const allowedRoles = ['CEO', 'COO', 'Administration Head, Student Community Manager & HR Admin', 'Master Administrative Access'];
    if (!allowedRoles.includes(req.userRole)) {
        return res.status(403).json({ error: "Unauthorized." });
    }
    const { status } = req.body;
    db.run("UPDATE notices SET status = ? WHERE id = ?", [status, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, status });
    });
});

app.put('/api/notices/:id/response', verifyToken, (req, res) => {
    const { response } = req.body;
    db.run("UPDATE notices SET employee_response = ?, status = 'Pending Review' WHERE id = ? AND issued_to = ?", [response, req.params.id, req.userId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(403).json({ error: "Unauthorized or notice not found." });
        res.json({ success: true });
    });
});

// Serve frontend application for all other routes
app.get('*', (req, res) => {
    const indexPath = path.resolve(__dirname, 'public', 'index.html');
    if (!require('fs').existsSync(indexPath)) {
        console.error("CRITICAL ERROR: index.html not found at", indexPath);
        console.log("Current Directory Contents:", require('fs').readdirSync(__dirname));
        if (require('fs').existsSync(path.join(__dirname, 'public'))) {
            console.log("Public Directory Contents:", require('fs').readdirSync(path.join(__dirname, 'public')));
        }
        return res.status(404).send("Frontend files missing. Please check deployment.");
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
