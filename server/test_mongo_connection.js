const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is missing in .env');
        return;
    }

    console.log('Attempting to connect to MongoDB Atlas...');
    try {
        const conn = await mongoose.connect(uri);
        console.log('✅ Connected successfully!');

        // Check which database we are connected to
        console.log(`Currently connected to database: "${mongoose.connection.name}"`);

        // List all databases in the cluster (requires admin privileges usually, but Atlas users often have it)
        try {
            const admin = new mongoose.mongo.Admin(mongoose.connection.db);
            const list = await admin.listDatabases();
            console.log('Available Databases in Cluster:');
            list.databases.forEach(db => {
                console.log(` - ${db.name} (Size: ${db.sizeOnDisk} bytes)`);
            });
        } catch (e) {
            console.log('Could not list databases (insufficient permissions or other error):', e.message);
        }

        // List collections in current DB
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log(`\nCollections in "${mongoose.connection.name}":`, collections.map(c => c.name));

        // Count documents in 'users' collection
        if (collections.find(c => c.name === 'users')) {
            const userCount = await mongoose.connection.db.collection('users').countDocuments();
            console.log(`Number of documents in 'users' collection: ${userCount}`);
        }

    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
    }
}

testConnection();
