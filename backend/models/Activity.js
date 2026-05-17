const mongoose = require('mongoose');

const activitySchema = mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: 'User',
  },
  actionType: {
    type: String,
    required: true,
    enum: ['Upload', 'Delete', 'Rename', 'Favorite', 'Share', 'Download', 'Security'],
  },
  fileName: {
    type: String,
    required: true,
  },
}, {
  timestamps: true,
});

const Activity = mongoose.model('Activity', activitySchema);

module.exports = Activity;
