#!/usr/bin/env node

/**
 * Copy build artifacts from monorepo packages to root dist directory
 * This maintains compatibility with the previous single-project structure
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Get paths
const serverDir = path.join(__dirname, '..')
const sharedDir = path.join(serverDir, '..', '..', 'shared')
const rootDir = path.join(serverDir, '..', '..')
const distDir = path.join(rootDir, 'dist')

console.log('📦 Copying build artifacts to root dist directory...')
console.log('Server dir:', serverDir)
console.log('Shared dir:', sharedDir)
console.log('Root dir:', rootDir)
console.log('Dist dir:', distDir)

// Clean and create root dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true })
}
fs.mkdirSync(distDir, { recursive: true })

// Copy server dist contents
const serverDist = path.join(serverDir, 'dist')
if (fs.existsSync(serverDist)) {
  copyDirectoryContents(serverDist, distDir)
  console.log('✅ Copied server dist files')
} else {
  console.warn('⚠️  Server dist directory not found')
}

// Copy shared dist to node_modules/@comfyui-mcp/shared structure
const sharedDistTarget = path.join(rootDir, 'node_modules', '@comfyui-mcp', 'shared')
if (fs.existsSync(sharedDir)) {
  const sharedDistSource = path.join(sharedDir, 'dist')
  if (fs.existsSync(sharedDistSource)) {
    fs.mkdirSync(sharedDistTarget, { recursive: true })
    copyDirectoryContents(sharedDistSource, sharedDistTarget)
    console.log('✅ Copied shared dist files to node_modules')
  }
}

console.log('✅ Build artifacts copied successfully')

function copyDirectoryContents(source, target) {
  const entries = fs.readdirSync(source, { withFileTypes: true })

  for (const entry of entries) {
    const srcPath = path.join(source, entry.name)
    const tgtPath = path.join(target, entry.name)

    if (entry.isDirectory()) {
      fs.mkdirSync(tgtPath, { recursive: true })
      copyDirectoryContents(srcPath, tgtPath)
    } else {
      fs.copyFileSync(srcPath, tgtPath)
    }
  }
}
