const express = require('express');
const {
  uploadFile,
  getFiles,
  deleteFile,
  getTrashedFiles,
  restoreFile,
  permanentlyDeleteFile,
  downloadVersionFile,
  restoreVersion,
  downloadFile,
  renameFile,
  updateFileTags,
  summarizeFile,
  ocrFile,
  aiSearchFiles,
  toggleFavorite,
  shareFile,
  getStats,
  getActivities,
  searchFiles,
} = require('../controllers/fileController');
const { protect } = require('../middleware/authMiddleware');
const multer = require('multer');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Stats & activities (must be placed before dynamic /:id routes)
router.get('/stats', protect, getStats);
router.get('/activities', protect, getActivities);
router.get('/search', protect, searchFiles);
router.get('/ai-search', protect, aiSearchFiles);

// Recycle Bin Routes (Must be before /:id routes)
router.get('/trash', protect, getTrashedFiles);
router.put('/:id/restore', protect, restoreFile);
router.delete('/:id/permanent', protect, permanentlyDeleteFile);

// File Versioning Routes
router.get('/:id/versions/:versionKey/download', protect, downloadVersionFile);
router.post('/:id/versions/:versionKey/restore', protect, restoreVersion);

// AI & Tags Operations
router.put('/:id/tags', protect, updateFileTags);
router.post('/:id/summarize', protect, summarizeFile);
router.post('/:id/ocr', protect, ocrFile);

// File CRUD & Core Actions
router.route('/')
  .post(protect, upload.single('file'), uploadFile)
  .get(protect, getFiles);

router.route('/:id')
  .delete(protect, deleteFile);

router.get('/:id/download', protect, downloadFile);
router.put('/:id/rename', protect, renameFile);
router.put('/:id/favorite', protect, toggleFavorite);
router.post('/:id/share', protect, shareFile);

module.exports = router;
