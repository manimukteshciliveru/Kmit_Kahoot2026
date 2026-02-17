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
    const facultyMap = new Map(); // Name -> { assignments: [], designation: '' }

    const sections = rawData.trim().split('\n\n');

    sections.forEach(block => {
        const lines = block.trim().split('\n');
        const header = lines[0].trim(); // e.g., "CSE A"
        const [branch, section] = header.split(' ');

        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Format "Subject: Faculty Name"
            // Note: The input format I used above simplifies the user's table for parsing
            // I need to be careful with the splitting
            const parts = line.split(':');
            if (parts.length < 2) continue;

            const subjectCode = parts[0].trim();
            const facultyNameRaw = parts[1].trim();

            if (facultyNameRaw === '—' || !facultyNameRaw) continue;

            // Extract title (Ms., Mr., Dr.) and clean name
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

            // Normalize name (remove extra spaces)
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

const importFaculty = async () => {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected');

        // 1. Create Admin
        console.log('👑 Creating/Updating Admin...');
        const adminData = {
            name: 'Administrator',
            email: 'admin@cmrec.ac.in', // Using a standard email, user asked for specific ID/Pass
            employeeId: '1706032',
            password: 'admin@123$',
            role: 'admin',
            isActive: true
        };

        let admin = await User.findOne({ employeeId: '1706032' });
        if (admin) {
            admin.password = adminData.password;
            admin.role = 'admin';
            await admin.save();
            console.log('   Admin updated.');
        } else {
            await User.create(adminData);
            console.log('   Admin created.');
        }

        // 2. Process Faculty
        const facultyMap = parseData();
        console.log(`\nFound ${facultyMap.size} faculty members.`);

        let count = 0;
        const credentialsList = [];

        for (const [name, data] of facultyMap) {
            // Generate email: firstname.lastname@cmrec.ac.in
            const emailName = name.toLowerCase().replace(/\./g, '').replace(/\s+/g, '.');
            const email = `${emailName}@cmrec.ac.in`;

            // Generate password: Firstname@123
            const firstName = name.split(' ')[0];
            const password = `${firstName}@123`;

            // Unique ID? Let's use a random 4 digit sequence for now or generated
            const employeeId = `FAC${Math.floor(1000 + Math.random() * 9000)}`;

            let user = await User.findOne({ email }); // simplistic check

            if (user) {
                // Update assignments
                user.teachingAssignments = data.assignments;
                user.designation = data.designation;
                user.role = 'faculty'; // Ensure role
                await user.save();
                // console.log(`Updated ${name}`);
            } else {
                // Create
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
                // console.log(`Created ${name}`);
            }

            credentialsList.push({
                Name: user.name,
                Email: user.email,
                Password: password,
                Assignments: data.assignments.length
            });
            count++;
        }

        console.log(`\n✅ Processed ${count} faculty members.`);

        console.log('\n🔐 Faculty Credentials:');
        console.table(credentialsList);

        process.exit(0);

    } catch (err) {
        console.error('Error:', err);
        process.exit(1);
    }
};

importFaculty();
