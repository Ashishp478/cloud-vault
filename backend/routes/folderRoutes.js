const express = require('express');
const { createFolder, getFolders, deleteFolder } = require('../controllers/folderController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.route('/')
  .post(protect, createFolder)
  .get(protect, getFolders);

router.route('/:id')
  .delete(protect, deleteFolder);

module.exports = router;
