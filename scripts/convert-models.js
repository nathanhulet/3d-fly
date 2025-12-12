// scripts/convert-models.js
// Converts OBJ models to GLB format for Cesium

import obj2gltf from 'obj2gltf'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const INPUT_DIR = path.join(__dirname, '..')
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'models')

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

async function convertModel(inputName) {
  const inputPath = path.join(INPUT_DIR, `${inputName}.obj`)
  const outputPath = path.join(OUTPUT_DIR, `${inputName}.glb`)

  // Check if input exists
  if (!fs.existsSync(inputPath)) {
    console.log(`Skipping ${inputName}: ${inputPath} not found`)
    return false
  }

  console.log(`Converting ${inputPath} -> ${outputPath}`)

  try {
    const glb = await obj2gltf(inputPath, {
      binary: true,
      packOcclusion: true,
      metallicRoughness: true
    })

    fs.writeFileSync(outputPath, glb)
    console.log(`Successfully converted ${inputName}`)
    return true
  } catch (error) {
    console.error(`Failed to convert ${inputName}:`, error.message)
    return false
  }
}

async function main() {
  console.log('Converting 3D models...')

  const models = ['f16', 'AIM120D'] // Add more models here as needed
  let successCount = 0

  for (const model of models) {
    if (await convertModel(model)) {
      successCount++
    }
  }

  console.log(`\nConversion complete: ${successCount}/${models.length} models converted`)

  if (successCount === 0) {
    console.error('No models were converted!')
    process.exit(1)
  }
}

main().catch(error => {
  console.error('Conversion failed:', error)
  process.exit(1)
})
