const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        const faculty = await User.find({ role: { $in: ['faculty', 'admin'] } }).sort({ name: 1 }).lean();
        console.log('ID\tName\tPassword Hint');
        console.log('--------------------------------------------------');
        faculty.forEach(f => {
            let pwdPrefix = f.name.split(' ')[0];
            if (f.role === 'admin') pwdPrefix = 'admin'; // Specific case

            // If starts with Dr/Ms/Mr, might be second word? 
            // The import script uses split(' ')[0].
            // Wait, import script logic: const firstName = name.split(' ')[0]; const password = `${firstName}@123`;
            // Name format is "Ms. Deepa Ganu". So firstName is "Ms.". Password is "Ms.@123". This seems wrong user expectation?
            // Re-reading import script:
            // name = `${data.designation} ${name}`.trim() -> "Ms. Deepa Ganu"
            // const firstName = name.split(' ')[0] -> "Deepa" (because name var in loop was raw name without designation!)

            // In import script:
            // let name = facultyNameRaw; ... name = name.replace('Ms.', '')...
            // So 'name' variable in loop is JUST the name "Deepa Ganu".
            // Then specific designation is prepended for DB 'name' field.

            // So if DB name is "Ms. Deepa Ganu", the password was generated from "Deepa".
            // I can't easily reverse engineer it 100% without the original logic, but mostly it is the first name part after title.

            console.log(`${f.employeeId || '-'}\t${f.name}`);
        });
        process.exit(0);
    })
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
