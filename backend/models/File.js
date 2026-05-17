const mongoose = require('mongoose');

const fileSchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  originalName: {
    type: String,
    required: true,
  },
  s3Key: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  size: {
    type: Number,
    required: true,
  },
  isFavorite: {
    type: Boolean,
    default: false,
  },
  folder: {
    type: String,
    enum: ['Documents', 'Images', 'Videos', 'Others'],
    default: 'Others',
  },
  folderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null,
  },
  isTrashed: {
    type: Boolean,
    default: false,
  },
  trashedAt: {
    type: Date,
  },
  tags: [{
    type: String,
  }],
  isEncrypted: {
    type: Boolean,
    default: false,
  },
  aiSummary: {
    type: String,
  },
  extractedText: {
    type: String,
  },
  versions: [{
    s3Key: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }],
  isShared: {
    type: Boolean,
    default: false,
  },
  shareExpiresAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

const File = mongoose.model('File', fileSchema);

module.exports = File;
