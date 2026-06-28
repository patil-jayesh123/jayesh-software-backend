const express = require('express')
const mongoose = require('mongoose')
const Note = require('../models/Note')
const authMiddleware = require('../Middleware/middleware')

const router = express.Router()

// GET all notes for logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const notes = await Note.find({ userId: req.user._id }).sort({ createdAt: -1 })
    res.json({ success: true, notes })
  } catch (err) {
    console.error('GET /note error:', err)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// POST add a note
router.post('/add', authMiddleware, async (req, res) => {
  try {
    const { title, description, tag } = req.body
    if (!title) return res.status(400).json({ success: false, message: 'Title is required' })
    const note = new Note({
      title,
      description: description || '',
      tag: tag || '',
      archived: false,
      trashed: false,
      userId: req.user._id
    })
    await note.save()
    res.json({ success: true, note })
  } catch (err) {
    console.error('POST /note/add error:', err)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// PUT update note — no userId filter so old notes (missing userId match) still update
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const noteId = req.params.id

    // First try with userId match (for new notes)
    let result = await Note.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(noteId), userId: req.user._id },
      { $set: req.body },
      { new: true }
    )

    // If not found (old notes may have different userId type), try by _id only
    // but verify it belongs to this user
    if (!result) {
      const existing = await Note.findById(noteId)
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Note not found' })
      }
      // Check ownership by string comparison (handles ObjectId vs string mismatch)
      if (existing.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' })
      }
      result = await Note.findByIdAndUpdate(
        noteId,
        { $set: req.body },
        { new: true }
      )
    }

    res.json({ success: true, note: result })
  } catch (err) {
    console.error('PUT /note/:id error:', err)
    res.status(500).json({ success: false, message: 'Server error: ' + err.message })
  }
})

// DELETE permanently delete a note
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const noteId = req.params.id

    let result = await Note.findOneAndDelete(
      { _id: new mongoose.Types.ObjectId(noteId), userId: req.user._id }
    )

    // Fallback: find by id and verify ownership by string comparison
    if (!result) {
      const existing = await Note.findById(noteId)
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Note not found' })
      }
      if (existing.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, message: 'Access denied' })
      }
      result = await Note.findByIdAndDelete(noteId)
    }

    res.json({ success: true, message: 'Note permanently deleted' })
  } catch (err) {
    console.error('DELETE /note/:id error:', err)
    res.status(500).json({ success: false, message: 'Server error: ' + err.message })
  }
})

module.exports = router
