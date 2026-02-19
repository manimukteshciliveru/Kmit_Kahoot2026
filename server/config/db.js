const mongoose = require('mongoose');
const logger = require('../utils/logger'); // Assuming logger exists, if not use console

const connectDB = async () => {
  try {
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 50,
      minPoolSize: 5,
      family: 4,
    };

    mongoose.connection.on('connected', () => console.log('✅ MongoDB Connected successfully'));
    mongoose.connection.on('error', (err) => console.error('❌ MongoDB Connection Error:', err.message));
    mongoose.connection.on('disconnected', () => console.warn('⚠️ MongoDB Disconnected. Attempting to reconnect...'));
    mongoose.connection.on('reconnected', () => console.log('✅ MongoDB Reconnected'));

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI environment variable is not defined!');
    }

    try {
      const conn = await mongoose.connect(process.env.MONGODB_URI, options);
      console.log(`Host: ${conn.connection.host}`);
    } catch (primaryError) {
      console.error(`❌ Failed to connect to primary MONGODB_URI: ${primaryError.message}`);

      // Fallback for local development
      if (process.env.NODE_ENV === 'development') {
        console.log('🔄 Attempting fallback to local MongoDB (mongodb://127.0.0.1:27017/quizdb)...');
        try {
          const conn = await mongoose.connect('mongodb://127.0.0.1:27017/quizdb', options);
          console.log(`✅ Connected to Local Fallback Host: ${conn.connection.host}`);
        } catch (fallbackError) {
          console.error(`❌ Fallback connection also failed: ${fallbackError.message}`);
        }
      }
    }

  } catch (error) {
    console.error(`❌ Fatal MongoDB Connection Error: ${error.message}`);
  }
};

module.exports = connectDB;
