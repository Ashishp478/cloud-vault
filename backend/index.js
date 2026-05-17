const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

// Load env vars
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  override: true
});

// Connect DB
connectDB();

const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const folderRoutes = require('./routes/folderRoutes');

const app = express();   // ← missing tha

// Middleware
app.use(
  cors({
    origin: [
      "http://cloudvault-storage-ashish28.s3-website.eu-north-1.amazonaws.com",
      "http://localhost:5173"
    ],
    methods: ["GET","POST","PUT","DELETE","OPTIONS"],
    credentials: true
  })
);

app.use(express.json()); // ← missing tha

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Server Error' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});