const File = require('../models/File');
const Activity = require('../models/Activity');
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const { generateSummary, performOCR, semanticSearch } = require('../services/aiService');

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME;

const logActivity = async (userId, actionType, fileName) => {
  try {
    await Activity.create({ user: userId, actionType, fileName });
  } catch (e) {
    console.error('Activity log failed:', e.message);
  }
};

// Stream to buffer helper (crucial for fetching S3 objects in Node)
const streamToBuffer = async (stream) => {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(chunk));
    stream.on('error', (err) => reject(err));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
};

// ─── Quota Helper ────────────────────────────────────────────────────────────
const calculateStorageUsed = async (userId) => {
  const usage = await File.aggregate([
    { $match: { user: userId } },
    {
      $group: {
        _id: null,
        activeSize: { $sum: '$size' },
        // Sum sizes inside the versions array for each file
        versionsSize: { $sum: { $sum: '$versions.size' } },
      },
    },
  ]);
  const activeSize = usage[0]?.activeSize || 0;
  const versionsSize = usage[0]?.versionsSize || 0;
  return activeSize + versionsSize;
};

// ─── Upload File & Keep Versions ──────────────────────────────────────────────
const uploadFile = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

  const category = req.body.folder || 'Others'; // Smart views folder category
  const folderId = req.body.folderId && req.body.folderId !== 'null' ? req.body.folderId : null; // Custom directories
  const isEncrypted = req.body.isEncrypted === 'true';

  try {
    // 1. Quota Check (5 GB = 5,368,709,120 bytes)
    const MAX_STORAGE = 5 * 1024 * 1024 * 1024;
    const currentUsed = await calculateStorageUsed(req.user._id);
    if (currentUsed + req.file.size > MAX_STORAGE) {
      return res.status(400).json({ message: 'Storage quota exceeded (5 GB limit)' });
    }

    const s3Key = crypto.randomBytes(32).toString('hex') + '-' + req.file.originalname;

    // Upload new buffer to S3
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    // 2. Check for File Versioning (Collision based in same folder/directory)
    const existingFile = await File.findOne({
      user: req.user._id,
      originalName: req.file.originalname,
      folderId: folderId,
      isTrashed: false,
    });

    if (existingFile) {
      // Archive current active details to version history
      existingFile.versions.push({
        s3Key: existingFile.s3Key,
        originalName: existingFile.originalName,
        size: existingFile.size,
        mimeType: existingFile.mimeType,
        createdAt: existingFile.createdAt,
      });

      // Update active properties to new upload
      existingFile.s3Key = s3Key;
      existingFile.size = req.file.size;
      existingFile.mimeType = req.file.mimetype;
      existingFile.isEncrypted = isEncrypted;
      existingFile.createdAt = new Date();
      existingFile.aiSummary = undefined; // Reset AI cache on update
      existingFile.extractedText = undefined;

      await existingFile.save();
      await logActivity(req.user._id, 'Upload', `${existingFile.originalName} (Version ${existingFile.versions.length + 1})`);
      return res.status(200).json(existingFile);
    }

    // 3. Create normal new File
    const file = await File.create({
      user: req.user._id,
      originalName: req.file.originalname,
      s3Key,
      mimeType: req.file.mimetype,
      size: req.file.size,
      folder: category,
      folderId,
      isEncrypted,
    });

    await logActivity(req.user._id, 'Upload', file.originalName);
    res.status(201).json(file);
  } catch (err) {
    console.error('UPLOAD ERROR:', err);
    res.status(500).json({ message: 'Error uploading file', error: err.message });
  }
};

// ─── Get Active Files ─────────────────────────────────────────────────────────
const getFiles = async (req, res) => {
  const { folderId, tag } = req.query;

  try {
    const query = { user: req.user._id, isTrashed: false };

    // Filter by Custom Folders
    if (folderId && folderId !== 'null' && folderId !== 'all') {
      query.folderId = folderId;
    } else if (folderId === 'null') {
      query.folderId = null;
    }

    // Filter by Tag
    if (tag && tag !== 'All') {
      query.tags = tag;
    }

    const files = await File.find(query).sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching files', error: err.message });
  }
};

// ─── Soft Delete (Recycle Bin) ────────────────────────────────────────────────
const deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    file.isTrashed = true;
    file.trashedAt = new Date();
    await file.save();

    await logActivity(req.user._id, 'Delete', file.originalName);
    res.json({ message: 'File moved to Recycle Bin' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error soft deleting file' });
  }
};

// ─── Get Trashed Files ────────────────────────────────────────────────────────
const getTrashedFiles = async (req, res) => {
  try {
    const files = await File.find({ user: req.user._id, isTrashed: true }).sort({ trashedAt: -1 });
    res.json(files);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching Recycle Bin' });
  }
};

// ─── Restore File ─────────────────────────────────────────────────────────────
const restoreFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    file.isTrashed = false;
    file.trashedAt = undefined;
    await file.save();

    await logActivity(req.user._id, 'Restore', file.originalName);
    res.json(file);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error restoring file' });
  }
};

// ─── Permanent Delete (Purge S3 & DB) ─────────────────────────────────────────
const permanentlyDeleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // 1. Purge S3 Active object
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: file.s3Key }));
    } catch (e) {
      console.warn('Failed to delete S3 active object, might not exist:', file.s3Key, e.message);
    }

    // 2. Purge S3 Versioned objects (Avoid orphaned S3 leaks!)
    for (const ver of file.versions) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: ver.s3Key }));
      } catch (e) {
        console.warn('Failed to delete versioned S3 object:', ver.s3Key, e.message);
      }
    }

    // 3. Remove document from DB
    await file.deleteOne();
    
    // Log using a descriptive action
    await logActivity(req.user._id, 'Delete', `Permanently deleted "${file.originalName}"`);
    res.json({ message: 'File permanently purged' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error permanently purging file' });
  }
};

// ─── Rename ───────────────────────────────────────────────────────────────────
const renameFile = async (req, res) => {
  try {
    const { newName } = req.body;
    if (!newName) return res.status(400).json({ message: 'New name is required' });

    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    file.originalName = newName;
    await file.save();
    await logActivity(req.user._id, 'Rename', newName);
    res.json(file);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error renaming file' });
  }
};

// ─── File Tag Operations ──────────────────────────────────────────────────────
const updateFileTags = async (req, res) => {
  const { tags } = req.body;

  if (!Array.isArray(tags)) {
    return res.status(400).json({ message: 'Tags must be an array' });
  }

  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    file.tags = tags;
    await file.save();
    await logActivity(req.user._id, 'Favorite', `Updated tags for "${file.originalName}"`);
    res.json(file);
  } catch (err) {
    res.status(500).json({ message: 'Error updating tags', error: err.message });
  }
};

// ─── AI PDF Summarization ─────────────────────────────────────────────────────
const summarizeFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!file.mimeType.includes('pdf')) {
      return res.status(400).json({ message: 'Summarization is only supported for PDF files' });
    }

    // Return cached summary if it already exists!
    if (file.aiSummary) {
      return res.json({ aiSummary: file.aiSummary });
    }

    // Fetch PDF from S3
    const s3Res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: file.s3Key }));
    const pdfBuffer = await streamToBuffer(s3Res.Body);

    // Extract text from PDF
    const parsedPdf = await pdfParse(pdfBuffer);
    const pdfText = parsedPdf.text.trim();

    if (!pdfText) {
      return res.status(400).json({ message: 'Could not extract readable text from PDF.' });
    }

    // Call Gemini API to summarize
    const summary = await generateSummary(pdfText);
    
    file.aiSummary = summary;
    await file.save();

    await logActivity(req.user._id, 'Favorite', `Summarized PDF "${file.originalName}"`);
    res.json({ aiSummary: summary });
  } catch (err) {
    console.error('PDF AI Summary Failed:', err);
    res.status(500).json({ message: 'AI Summarization failed', error: err.message });
  }
};

// ─── Image OCR (Visual Text Extraction) ──────────────────────────────────────
const ocrFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    if (!file.mimeType.startsWith('image/')) {
      return res.status(400).json({ message: 'OCR is only supported for image files' });
    }

    // Return cached text if it already exists!
    if (file.extractedText) {
      return res.json({ extractedText: file.extractedText });
    }

    // Fetch image from S3
    const s3Res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: file.s3Key }));
    const imageBuffer = await streamToBuffer(s3Res.Body);

    // Perform visual OCR using Gemini
    const text = await performOCR(imageBuffer, file.mimeType);

    file.extractedText = text;
    await file.save();

    await logActivity(req.user._id, 'Favorite', `Extracted text from image "${file.originalName}"`);
    res.json({ extractedText: text });
  } catch (err) {
    console.error('OCR Extraction Failed:', err);
    res.status(500).json({ message: 'OCR extraction failed', error: err.message });
  }
};

// ─── AI Semantic Search ─────────────────────────────────────────────────────
const aiSearchFiles = async (req, res) => {
  const { q } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json({ message: 'Search query is required' });
  }

  try {
    // 1. Fetch all active files for context
    const allFiles = await File.find({ user: req.user._id, isTrashed: false });

    if (!allFiles.length) {
      return res.json([]);
    }

    // 2. Call Gemini semantic search indexer
    const matchedIds = await semanticSearch(allFiles, q.trim());

    if (!matchedIds.length) {
      return res.json([]);
    }

    // 3. Retrieve matching Mongo records
    const files = await File.find({
      _id: { $in: matchedIds },
      user: req.user._id,
      isTrashed: false,
    });

    res.json(files);
  } catch (err) {
    console.error('AI Search Controller Failed:', err);
    res.status(500).json({ message: 'AI search failed', error: err.message });
  }
};

// ─── Toggle Favorite ──────────────────────────────────────────────────────────
const toggleFavorite = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    file.isFavorite = !file.isFavorite;
    await file.save();
    await logActivity(req.user._id, 'Favorite', file.originalName);
    res.json(file);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating favorite' });
  }
};

// ─── Share ────────────────────────────────────────────────────────────────────
const shareFile = async (req, res) => {
  try {
    const hours = Number(req.body.expiry) || 24;
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: file.s3Key }),
      { expiresIn: hours * 3600 }
    );

    file.isShared = true;
    file.shareExpiresAt = new Date(Date.now() + hours * 3600 * 1000);
    await file.save();
    await logActivity(req.user._id, 'Share', file.originalName);
    res.json({ url, expiryHours: hours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error generating share link' });
  }
};

// ─── Download ─────────────────────────────────────────────────────────────────
const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: file.s3Key }),
      { expiresIn: 3600 }
    );

    await logActivity(req.user._id, 'Download', file.originalName);
    res.json({ url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error generating download URL' });
  }
};

// ─── Version History Downloads ────────────────────────────────────────────────
const downloadVersionFile = async (req, res) => {
  const { id, versionKey } = req.params;

  try {
    const file = await File.findById(id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Verify versionKey belongs to this file's versions
    const versionMatch = file.versions.find(v => v.s3Key === versionKey);
    if (!versionMatch && file.s3Key !== versionKey) {
      return res.status(404).json({ message: 'Specified version not found in history' });
    }

    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET, Key: versionKey }),
      { expiresIn: 3600 }
    );

    await logActivity(req.user._id, 'Download', `${file.originalName} (Historical Version)`);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ message: 'Error generating version download url', error: err.message });
  }
};

// ─── Restore Older Version ────────────────────────────────────────────────────
const restoreVersion = async (req, res) => {
  const { id, versionKey } = req.params;

  try {
    const file = await File.findById(id);
    if (!file) return res.status(404).json({ message: 'File not found' });
    
    if (file.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const versionIdx = file.versions.findIndex(v => v.s3Key === versionKey);
    if (versionIdx === -1) {
      return res.status(404).json({ message: 'Specified version not found in history' });
    }

    const selectedVersion = file.versions[versionIdx];

    // Cache the active version variables
    const currentActive = {
      s3Key: file.s3Key,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      createdAt: file.createdAt,
    };

    // Make the selected version the active version
    file.s3Key = selectedVersion.s3Key;
    file.originalName = selectedVersion.originalName;
    file.size = selectedVersion.size;
    file.mimeType = selectedVersion.mimeType;
    file.createdAt = new Date();
    file.aiSummary = undefined; // Clear cached summaries
    file.extractedText = undefined;

    // Remove the selected version from array and append the old active version instead
    file.versions.splice(versionIdx, 1);
    file.versions.push(currentActive);

    await file.save();
    await logActivity(req.user._id, 'Restore', `Restored ${file.originalName} to version from ${new Date(currentActive.createdAt).toLocaleDateString()}`);
    
    res.json(file);
  } catch (err) {
    res.status(500).json({ message: 'Error restoring version', error: err.message });
  }
};

// ─── Storage Stats ────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Get active totals
    const totalFiles = await File.countDocuments({ user: userId, isTrashed: false });
    const favoriteCount = await File.countDocuments({ user: userId, isFavorite: true, isTrashed: false });
    const sharedCount = await File.countDocuments({ user: userId, isShared: true, isTrashed: false });

    // Sum sizes including historical versions
    const totalSize = await calculateStorageUsed(userId);

    // Dynamic stats split by category
    const typeStats = await File.aggregate([
      { $match: { user: userId, isTrashed: false } },
      { $group: { _id: '$mimeType', count: { $sum: 1 }, size: { $sum: '$size' } } },
    ]);

    res.json({
      totalFiles,
      totalSize,
      favoriteCount,
      sharedCount,
      typeStats,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching stats' });
  }
};

// ─── Activities ───────────────────────────────────────────────────────────────
const getActivities = async (req, res) => {
  try {
    const activities = await Activity.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(30);
    res.json(activities);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error fetching activities' });
  }
};

// ─── Regular Name Search Fallback ─────────────────────────────────────────────
const searchFiles = async (req, res) => {
  try {
    const { q = '', folder } = req.query;
    const query = {
      user: req.user._id,
      isTrashed: false,
      originalName: { $regex: q, $options: 'i' },
    };
    if (folder && folder !== 'All' && folder !== 'all') {
      // category folder
      query.folder = folder;
    }

    const files = await File.find(query).sort({ createdAt: -1 });
    res.json(files);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error searching files' });
  }
};

// ─── Daily Auto-Purge Loop (Trash older than 30 days) ──────────────────────────
const runAutoPurge = async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const expiredFiles = await File.find({ isTrashed: true, trashedAt: { $lt: thirtyDaysAgo } });
    
    for (const file of expiredFiles) {
      try {
        // Delete active S3
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: file.s3Key }));
        
        // Delete versioned S3s
        for (const ver of file.versions) {
          await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: ver.s3Key }));
        }
        
        await file.deleteOne();
        console.log(`[AutoPurge] Permanently deleted expired trashed file: ${file.originalName}`);
      } catch (purgeErr) {
        console.error(`[AutoPurge] Failed to purge file ${file.originalName}:`, purgeErr.message);
      }
    }
  } catch (err) {
    console.error('[AutoPurge] Error running daily auto-purge:', err.message);
  }
};

// Activate daily cron purger (runs once every 24 hours)
setInterval(runAutoPurge, 24 * 60 * 60 * 1000);

module.exports = {
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
};
