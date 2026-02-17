require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

const updateEmailsAndDeleteDemo = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('--- Updating Faculty Emails ---');
        const faculty = await User.find({ role: 'faculty' });

        let updateCount = 0;
        for (const user of faculty) {
            let newEmail = user.email;

            // Check for demo faculty account specifically to DELETE it
            if (user.email === 'faculty@demo.com') {
                console.log(`Deleting Demo Faculty: ${user.name} (${user.email})`);
                await User.deleteOne({ _id: user._id });
                continue; // Skip the rest of the loop for this deleted user
            }

            // Update domain for other faculty
            if (user.email.includes('@cmrec.ac.in')) {
                newEmail = user.email.replace('@cmrec.ac.in', '@kmit.ac.in');
            } else if (user.email.includes('@demo.com')) {
                newEmail = user.email.replace('@demo.com', '@kmit.ac.in');
            }

            if (newEmail !== user.email) {
                // Check if the new email already exists (to avoid duplicates)
                const existingUser = await User.findOne({ email: newEmail });
                if (existingUser) {
                    console.warn(`Skipping update for ${user.name}: ${newEmail} already exists.`);
                } else {
                    user.email = newEmail;
                    await user.save();
                    console.log(`Updated ${user.name}: ${user.email}`);
                    updateCount++;
                }
            }
        }

        console.log('\n--- Deleting Demo Student Accounts ---');
        // Delete student demo accounts
        const demoStudentEmails = ['student@demo.com', 'student@kmit.ac.in'];
        const deleteResult = await User.deleteMany({ email: { $in: demoStudentEmails } });
        console.log(`Deleted ${deleteResult.deletedCount} demo student account(s).`);

        // Also delete any other users with role 'student' and 'demo' in their name or email if specific ones missed
        const otherDemoStudents = await User.deleteMany({
            role: 'student',
            $or: [
                { email: /@demo\.com$/ },
                { name: /Demo Student/i }
            ]
        });
        console.log(`Deleted ${otherDemoStudents.deletedCount} additional demo/placeholder student account(s).`);


        console.log(`\nSuccess! Updated ${updateCount} faculty emails and cleaned up demo accounts.`);
        process.exit(0);
    } catch (err) {
        console.error('Error updating emails/deleting accounts:', err);
        process.exit(1);
    }
};

updateEmailsAndDeleteDemo();
