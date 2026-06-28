const mongoose = require('mongoose')

const NoteSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    // userId stored as Mixed so old string-type or ObjectId-type both work
    userId: { type: mongoose.Schema.Types.Mixed, required: true },
    archived: { type: Boolean, default: false },
    trashed: { type: Boolean, default: false },
    tag: { type: String, default: '' },
  },
  {
    timestamps: true,
    // strict:false lets $set add new fields even if document predates the schema
    strict: false,
  }
)

const Note = mongoose.model('Note', NoteSchema)
module.exports = Note
