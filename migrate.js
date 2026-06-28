/**
 * ONE-TIME migration — run this on your server:
 *   node migrate.js
 *
 * Adds archived=false, trashed=false, tag='' to ALL existing notes that lack them.
 * Safe to run multiple times.
 */
require('./config/db.js')()

setTimeout(async () => {
  const Note = require('./models/Note')

  const result = await Note.updateMany(
    {},   // all notes — we want every note to have these fields
    [
      {
        $set: {
          archived: { $ifNull: ['$archived', false] },
          trashed:  { $ifNull: ['$trashed',  false] },
          tag:      { $ifNull: ['$tag',      '']    }
        }
      }
    ]
  )

  console.log(`✅ Migration complete. ${result.modifiedCount} notes updated.`)
  process.exit(0)
}, 2000)
