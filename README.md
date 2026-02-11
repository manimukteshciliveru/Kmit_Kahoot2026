# Kahoot! Clone - QuizMaster Pro

A real-time quiz platform built with the MERN stack (MongoDB, Express, React, Node.js).

## Prerequisites

- Node.js (v14 or higher)
- MongoDB (Atlas connection string or local instance)

## Project Structure

- `client/`: React frontend (Vite)
- `server/`: Express backend

## Setup & Installation

1.  **Install Server Dependencies:**
    ```bash
    cd server
    npm install
    ```

2.  **Install Client Dependencies:**
    ```bash
    cd client
    npm install
    ```

3.  **Environment Variables:**
    -   **Server:** Create a `.env` file in the `server/` directory based on `.env.example`.
        ```env
        MONGODB_URI=your_mongodb_connection_string
        JWT_SECRET=your_secret_key
        PORT=5000
        ```
    -   **Client:** Create a `.env` file in the `client/` directory based on `.env.example`.
        ```env
        VITE_API_URL=http://localhost:5000/api
        VITE_SOCKET_URL=http://localhost:5000
        ```

## Running the Application

You need to run both the backend and frontend in separate terminals.

### 1. Start the Backend (Server)

```bash
cd server
npm run dev
```
Runs on [http://localhost:5000](http://localhost:5000)

### 2. Start the Frontend (Client)

```bash
cd client
npm run dev
```
Runs on [http://localhost:5173](http://localhost:5173)

## Features

-   Real-time quizzes with Socket.io
-   AI-powered question generation
-   Faculty dashboard for quiz creation
-   Student participation via game pin
