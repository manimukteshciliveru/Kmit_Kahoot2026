const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const subjectMap = {
    'DS': 'Data Structures',
    'OS': 'Operating Systems',
    'ML': 'Machine Learning',
    'ACD': 'Automata Theory and Compiler Design',
    'COA': 'Computer Organization and Architecture',
    'COI': 'Constitution of India'
};

const rawData = `
CSE A
DS: Ms. Deepa Ganu
OS: Ms. K. Priyanka
ML: Ms. Asha
ACD: Ms. B. Komala
COA: Mr. M. Kiran Kumar
COI: Ms. Surekha

CSE B
DS: Ms. Deepa Ganu
OS: Mr. R. Narender
ML: Ms. Asha
ACD: Ms. V. Anusha
COA: Dr. K. Seshacharyulu
COI: Ms. Lavanya

CSE C
DS: Ms. Deepa Ganu
OS: Ms. K. Jamuna Rani
ML: Ms. Priyanka Saxena
ACD: Ms. C. Rohini
COA: Ms. Athar Fathima
COI: Ms. Lavanya

CSE D
DS: Ms. Deepa Ganu
OS: Ms. B. Arti
ML: Ms. Priyanka Saxena
ACD: Ms. B. Komala
COA: Mr. M. Kiran Kumar
COI: Ms. M. V. Rama

CSE E
DS: Mr. P. Upendar
OS: Ms. A. Goutami
ML: Ms. B. Madhurika
ACD: Ms. V. Anusha
COA: Ms. Athar Fathima
COI: Ms. Surekha

CSE F
DS: Dr. G. Narendar
OS: Ms. A. Goutami
ML: Ms. Pavani
ACD: Ms. C. Rohini
COA: Dr. K. Seshacharyulu
COI: Ms. Sandhya

CSE G
DS: Ms. Ch. Mani Pushpa
OS: Ms. K. Jamuna Rani
ML: Ms. T. Rupa Devi
ACD: Ms. B. Komala
COA: Ms. Athar Fathima
COI: Ms. M. V. Rama

CSE H
DS: Mr. R. Narender
OS: Ms. Nasreen Sultana
ML: Ms. V. Anusha
ACD: Mr. M. Kiran Kumar
COA: Ms. Lavanya
COI: —

CSE I
DS: Ms. K. Priyanka
OS: Ms. B. Manasa
ML: Ms. C. Rohini
ACD: Dr. K. Seshacharyulu
COA: Ms. Lavanya
COI: —

CSM A
DS: Ms. Deepa Ganu
OS: Ms. K. Priyanka
ML: Ms. Asha
ACD: Ms. B. Komala
COA: Mr. M. Kiran Kumar
COI: Ms. Surekha

CSM B
DS: Ms. Deepa Ganu
OS: Mr. R. Narender
ML: Ms. Asha
ACD: Ms. V. Anusha
COA: Dr. K. Seshacharyulu
COI: Ms. Lavanya

CSM C
DS: Ms. Deepa Ganu
OS: Ms. K. Jamuna Rani
ML: Ms. Priyanka Saxena
ACD: Ms. C. Rohini
COA: Ms. Athar Fathima
COI: Ms. Lavanya

CSM D
DS: Ms. Deepa Ganu
OS: Ms. B. Arti
ML: Ms. Priyanka Saxena
ACD: Ms. B. Komala
COA: Mr. M. Kiran Kumar
COI: Ms. M. V. Rama

CSM E
DS: Mr. P. Upendar
OS: Ms. A. Goutami
ML: Ms. B. Madhurika
ACD: Ms. V. Anusha
COA: Ms. Athar Fathima
COI: Ms. Surekha
`;

const parseData = () => {
    const facultyMap = new Map();

    const sections = rawData.trim().split('\n\n');

    sections.forEach(block => {
        const lines = block.trim().split('\n');
        const header = lines[0].trim();
        const [branch, section] = header.split(' ');

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = line.split(':');
            if (parts.length < 2) continue;

            const subjectCode = parts[0].trim();
            const facultyNameRaw = parts[1].trim();

            if (facultyNameRaw === '—' || !facultyNameRaw) continue;

            let designation = '';
            let name = facultyNameRaw;

            if (name.startsWith('Dr.')) {
                designation = 'Dr.';
                name = name.replace('Dr.', '').trim();
            } else if (name.startsWith('Ms.')) {
                designation = 'Ms.';
                name = name.replace('Ms.', '').trim();
            } else if (name.startsWith('Mr.')) {
                designation = 'Mr.';
                name = name.replace('Mr.', '').trim();
            }

            name = name.replace(/\s+/g, ' ');

            if (!facultyMap.has(name)) {
                facultyMap.set(name, {
                    name: name,
                    designation: designation,
                    assignments: []
                });
            }

            const subjectName = subjectMap[subjectCode] || subjectCode;

            facultyMap.get(name).assignments.push({
                branch,
                section,
                subject: subjectName
            });
        }
    });

    return facultyMap;
};

const getUniqueEmail = async (baseEmail) => {
    let email = baseEmail;
    let counter = 1;
    while (true) {
        const existing = await User.findOne({ email });
        if (!existing) return email;

        // If existing user is strictly a student, we might want to skip collision?
        // But better to just make unique.
        const [local, domain] = baseEmail.split('@');
        email = `${local}${counter}@${domain}`;
        counter++;
    }
};

const importFaculty = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected');

        // 1. Create Admin
        console.log('👑 Creating/Updating Admin...');
        const adminData = {
            name: 'Administrator',
            email: 'admin@cmrec.ac.in', // Fallback email
            employeeId: '1706032',
            password: 'admin@123$',
            role: 'admin',
            isActive: true
        };

        let admin = await User.findOne({ employeeId: '1706032' });
        if (!admin) {
            // Check if email taken by someone else
            const emailCheck = await User.findOne({ email: adminData.email });
            if (emailCheck) {
                adminData.email = 'admin.master@cmrec.ac.in'; // Alternative
            }
            await User.create(adminData);
            console.log('   Admin created.');
        } else {
            console.log('   Admin already exists.');
        }

        // 2. Process Faculty
        const facultyMap = parseData();
        console.log(`\nFound ${facultyMap.size} faculty members.`);

        let count = 0;
        const credentialsList = [];

        for (const [name, data] of facultyMap) {
            try {
                // Generate base email
                const emailName = name.toLowerCase().replace(/\./g, '').replace(/\s+/g, '.');
                let email = `${emailName}@cmrec.ac.in`;

                // Ensure unique email (unless it's the SAME faculty)
                // Since we don't have IDs, we assume Name+Designation is unique identity.
                // We'll search by Name first.

                let user = await User.findOne({
                    name: `${data.designation} ${name}`.trim(),
                    role: 'faculty'
                });

                if (!user) {
                    // New user, ensure email is unique
                    email = await getUniqueEmail(email);

                    const firstName = name.split(' ')[0];
                    const password = `${firstName}@123`;
                    const employeeId = `FAC${Math.floor(1000 + Math.random() * 9000)}`;

                    user = await User.create({
                        name: `${data.designation} ${name}`.trim(),
                        email,
                        password,
                        role: 'faculty',
                        employeeId,
                        designation: data.designation,
                        teachingAssignments: data.assignments,
                        isActive: true
                    });
                    console.log(`Created: ${user.name}`);

                    credentialsList.push({
                        Name: user.name,
                        Email: user.email,
                        Password: password,
                        Sections: data.assignments.map(a => `${a.branch}-${a.section}`).join(', ')
                    });
                } else {
                    // Update existing
                    user.teachingAssignments = data.assignments;
                    if (data.designation) user.designation = data.designation;
                    await user.save();
                    console.log(`Updated: ${user.name}`);

                    credentialsList.push({
                        Name: user.name,
                        Email: user.email,
                        Password: '(unchanged)',
                        Sections: data.assignments.map(a => `${a.branch}-${a.section}`).join(', ')
                    });
                }
                count++;
            } catch (innerErr) {
                console.error(`Failed to process ${name}:`, innerErr.message);
            }
        }

        console.log(`\n✅ Processed ${count} faculty members.`);

        console.log('\n🔐 Credentials Report:');
        console.table(credentialsList);

        process.exit(0);

    } catch (err) {
        console.error('Fatal Error:', err);
        process.exit(1);
    }
};

importFaculty();
