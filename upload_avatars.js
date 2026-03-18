// upload_avatars.js
// ================================================================
// One-Time Batch Avatar Upload Script
//
// Reads all images from resources/images/, compresses each to
// 256x256 WebP using sharp, uploads to Vercel Blob, and prints
// the Blob URLs plus SQL UPDATE statements.
//
// Usage:
//   1. Set your BLOB_READ_WRITE_TOKEN in the terminal:
//      Windows PowerShell:  $env:BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
//      macOS/Linux:         export BLOB_READ_WRITE_TOKEN="vercel_blob_rw_..."
//
//   2. Run:  npm run upload-avatars
// ================================================================

import { put }     from '@vercel/blob'
import sharp       from 'sharp'
import fs          from 'node:fs'
import path        from 'node:path'

const IMAGES_DIR = './resources/images'
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN

if (!BLOB_TOKEN) {
  console.error('ERROR: BLOB_READ_WRITE_TOKEN is not set.')
  console.error('Set it in your terminal before running this script.')
  process.exit(1)
}

// Supported image extensions
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.tiff'])

async function main() {
  // Read all image files from the resources/images folder
  const files = fs.readdirSync(IMAGES_DIR).filter(f => {
    const ext = path.extname(f).toLowerCase()
    return IMAGE_EXTS.has(ext)
  })

  if (files.length === 0) {
    console.log('No image files found in', IMAGES_DIR)
    return
  }

  console.log(`Found ${files.length} images. Starting upload...\n`)
  console.log('Original (KB) | Compressed (KB) | Blob URL')
  console.log('-'.repeat(80))

  const results = []

  for (const file of files) {
    const filePath     = path.join(IMAGES_DIR, file)
    const originalBuf  = fs.readFileSync(filePath)
    const originalKB   = (originalBuf.length / 1024).toFixed(1)

    // Compress to 256x256 WebP
    const compressedBuf = await sharp(originalBuf)
      .rotate()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 6, alphaQuality: 80 })
      .toBuffer()

    const compressedKB = (compressedBuf.length / 1024).toFixed(1)

    // Build Blob path: avatars/<basename>.webp
    const baseName = path.basename(file, path.extname(file)).toLowerCase()
    const blobPath = `avatars/${baseName}.webp`

    // Upload to Vercel Blob
    const blob = await put(blobPath, compressedBuf, {
      access:      'public',
      contentType: 'image/webp',
      token:       BLOB_TOKEN,
    })

    console.log(`${originalKB.padStart(13)} | ${compressedKB.padStart(15)} | ${blob.url}`)

    results.push({ baseName, url: blob.url })
  }

  // Print SQL UPDATE statements
  console.log('\n\n-- SQL UPDATE statements for Supabase:\n')
  for (const { baseName, url } of results) {
    // Convert baseName back to approximate profile name
    const approxName = baseName
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())

    console.log(`UPDATE profiles SET picture = '${url}' WHERE LOWER(REPLACE(name, ' ', '_')) = '${baseName}';`)
  }

  console.log(`\n-- Done. ${results.length} images uploaded.`)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
