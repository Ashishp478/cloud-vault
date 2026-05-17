const mongoose = require('mongoose');

const folderSchema = mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null,
  },
}, {
  timestamps: true,
});

const Folder = mongoose.model('Folder', folderSchema);

module.exports = Folder;
