const Folder = require('../models/Folder');
const File = require('../models/File');
const Activity = require('../models/Activity');

const logActivity = async (userId, actionType, fileName) => {
  try {
    await Activity.create({ user: userId, actionType, fileName });
  } catch (e) {
    console.error('Activity log failed:', e.message);
  }
};

// Recursive helper to get all nested subfolder IDs
const getSubFolderIds = async (folderId, userId) => {
  let ids = [folderId];
  const subFolders = await Folder.find({ parent: folderId, user: userId });
  for (const sf of subFolders) {
    const subIds = await getSubFolderIds(sf._id, userId);
    ids = ids.concat(subIds);
  }
  return ids;
};

// ─── Create Folder ────────────────────────────────────────────────────────────
const createFolder = async (req, res) => {
  const { name, parent } = req.body;
  const parentId = parent || null;

  if (!name) {
    return res.status(400).json({ message: 'Folder name is required' });
  }

  try {
    // Check if folder name already exists in the same parent directory
    const folderExists = await Folder.findOne({
      name,
      user: req.user._id,
      parent: parentId,
    });

    if (folderExists) {
      return res.status(400).json({ message: 'Folder already exists in this directory' });
    }

    const folder = await Folder.create({
      name,
      user: req.user._id,
      parent: parentId,
    });

    await logActivity(req.user._id, 'Upload', `Created folder "${name}"`);
    res.status(201).json(folder);
  } catch (err) {
    res.status(500).json({ message: 'Error creating folder', error: err.message });
  }
};

// ─── Get Folders ──────────────────────────────────────────────────────────────
const getFolders = async (req, res) => {
  const parent = req.query.parent || null;

  try {
    const folders = await Folder.find({
      user: req.user._id,
      parent: parent === 'null' || parent === '' ? null : parent,
    }).sort({ name: 1 });

    res.json(folders);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching folders', error: err.message });
  }
};

// ─── Delete Folder (Recursive Soft-Delete Files) ──────────────────────────────
const deleteFolder = async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) return res.status(404).json({ message: 'Folder not found' });
    
    if (folder.user.toString() !== req.user._id.toString()) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Recursively collect all nested subfolder IDs (including this folder)
    const folderIds = await getSubFolderIds(folder._id, req.user._id);

    // Soft-delete (Trash) all files within these folders
    await File.updateMany(
      { user: req.user._id, folderId: { $in: folderIds } },
      { $set: { isTrashed: true, trashedAt: new Date() } }
    );

    // Delete the Folder documents themselves
    await Folder.deleteMany({ _id: { $in: folderIds } });

    await logActivity(req.user._id, 'Delete', `Deleted folder "${folder.name}" and trashed its files`);
    res.json({ message: `Folder "${folder.name}" deleted. All nested files moved to Recycle Bin.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error deleting folder', error: err.message });
  }
};

module.exports = {
  createFolder,
  getFolders,
  deleteFolder,
};
