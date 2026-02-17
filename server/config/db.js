const mongoose = require('mongoose');
const logger = require('../utils/logger'); // Assuming logger exists, if not use console

const connectDB = async () => {
  try {
    const options = {
      serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
      socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
      maxPoolSize: 50, // Maintain up to 50 socket connections
      minPoolSize: 5, // Maintain at least 5 socket connections
      family: 4, // Use IPv4, skip IPv6
    };

    // Connection Events
    mongoose.connection.on('connected', () => {
      console.log('✅ MongoDB Connected successfully');
    });

    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB Connection Error:', err);
      // logger.error('MongoDB Connection Error', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️ MongoDB Disconnected. Attempting to reconnect...');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB Reconnected');
    });

    // Initial Connection
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log(`Host: ${conn.connection.host}`);

  } catch (error) {
    console.error(`❌ Fatal MongoDB Connection Error: ${error.message}`);
    console.error('Stack:', error.stack);
    // Don't exit process, allow retry logic (built-in validation) or external restarts
  }
};

module.exports = connectDB;
