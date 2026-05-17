const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
  override: true
});

connectDB();

const authRoutes = require('./routes/authRoutes');
const fileRoutes = require('./routes/fileRoutes');
const folderRoutes = require('./routes/folderRoutes');

const app = express();

// CORS
app.use(cors({
    origin: [
        "http://cloudvault-storage-ashish28.s3-website.eu-north-1.amazonaws.com",
        "http://localhost:5173"
    ],
    credentials: true
}));

app.use(express.json());

// Test route
app.get('/', (req,res)=>{
   res.send('Backend is running 🚀');
});

app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/folders', folderRoutes);

// Error handler
app.use((err,req,res,next)=>{
    console.error(err.stack);
    res.status(500).json({
        message: err.message
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT,()=>{
   console.log(`Server running on ${PORT}`);
});