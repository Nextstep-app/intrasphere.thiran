const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'intrasphere.db');
const db = new sqlite3.Database(dbPath);

const initializeDB = () => {
    db.serialize(() => {
        // Users Table
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            role TEXT NOT NULL,
            department TEXT NOT NULL,
            employee_id TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            push_subscription TEXT
        )`);

        // Circulars Table
        db.run(`CREATE TABLE IF NOT EXISTS circulars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL,
            priority TEXT NOT NULL,
            departments TEXT NOT NULL, -- comma separated
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`);

        // Announcements Table
        db.run(`CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            type TEXT NOT NULL, -- Emergency, Internal, etc
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`);

        // Meetings Table
        db.run(`CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            agenda TEXT NOT NULL,
            datetime DATETIME NOT NULL,
            departments TEXT NOT NULL,
            meeting_link TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`);

        // Tasks Table
        db.run(`CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            deadline DATETIME NOT NULL,
            status TEXT DEFAULT 'Pending',
            assigned_to INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (assigned_to) REFERENCES users (id),
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`);

        // Notices Table
        db.run(`CREATE TABLE IF NOT EXISTS notices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reference_number TEXT UNIQUE NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            status TEXT DEFAULT 'Active',
            issued_to INTEGER,
            employee_response TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_by INTEGER,
            FOREIGN KEY (issued_to) REFERENCES users (id),
            FOREIGN KEY (created_by) REFERENCES users (id)
        )`);

        // Attendance Table
        db.run(`CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date DATE NOT NULL,
            status TEXT NOT NULL, -- Present, Absent, Leave
            check_in_time DATETIME,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Seed Users
        db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
            if (row.count === 0) {
                const initialUsers = [
                    ['Varshith', 'CEO', 'Leadership', 'THR-26-LD-001', 'Varshith@001'],
                    ['Dharshan S', 'COO', 'Leadership', 'THR-26-LD-002', 'Dharshan@002'],
                    ['Brundavanam Bose', 'Project Manager & Overall Execution Lead', 'Leadership', 'THR-26-LD-003', 'Brunda@003'],
                    ['Rahav', 'Product Manager', 'Product Development', 'THR-26-PD-003', 'Rahav@011'],
                    ['Hari', 'Career Research Analyst', 'Research', 'THR-26-RS-004', 'Hariharan@012'],
                    ['Prakathesh', 'Tech Support Lead & Frontend Developer', 'Frontend Engineering', 'THR-26-FE-005', 'Prakathesh@006'],
                    ['Nabeela', 'Backend Developer', 'Backend Engineering', 'THR-26-BE-006', 'Nabeela@009'],
                    ['Keerthana', 'AI/ML Developer', 'Artificial Intelligence', 'THR-26-AI-007', 'Keerthana@010'],
                    ['Mogesh', 'Data Intelligence Analyst', 'Data Analytics', 'THR-26-DA-008', 'Mogesh@013'],
                    ['Kanmani', 'Supporting Growth Manager & QA Tester', 'Quality Assurance', 'THR-26-QA-009', 'Kanmani@008'],
                    ['Mukunthan', 'Tech Lead & UI/UX Designer', 'UX/UI Design', 'THR-26-UX-010', 'Mukunthan@005'],
                    ['Akash', 'Growth Manager & Social Media Manager', 'Marketing', 'THR-26-MK-011', 'Akash@007'],
                    ['Navasri', 'Content & Communication Manager', 'Content Team', 'THR-26-CT-012', 'Navasri@017'],
                    ['Arpit', 'Business Developer', 'Business Development', 'THR-26-BD-013', 'Arpit@016'],
                    ['Supriya', 'Investor Relations Manager', 'Investor Relations', 'THR-26-IR-014', 'Supriya@014'],
                    ['Lohidharani', 'HR Admin', 'Community Management', 'THR-26-CM-015', 'Lohi@004'],
                    ['Nishanthini', 'Events & Webinar Coordinator', 'Events', 'THR-26-EV-016', 'Nishanthini@018'],
                    ['Samuel', 'Junior Full Stack Developer', 'Legal Affairs', 'THR-26-LA-018', 'Samuel@014'],
                    ['Vaishali', 'Operations Monitoring Manager', 'Administration', 'THR-26-OM-021', 'Vaishali@021'],
                    ['System Admin', 'Master Administrative Access', 'Leadership', 'THR-26-SA-020', 'Admin@2026']
                ];

                const stmt = db.prepare("INSERT INTO users (name, role, department, employee_id, password) VALUES (?, ?, ?, ?, ?)");
                
                initialUsers.forEach(user => {
                    // Hash passwords before inserting
                    const hashedPassword = bcrypt.hashSync(user[4], 8);
                    stmt.run(user[0], user[1], user[2], user[3], hashedPassword);
                });
                
                stmt.finalize();
                console.log("Database seeded with 20 members.");
            }
        });
    });
};

initializeDB();

module.exports = db;
