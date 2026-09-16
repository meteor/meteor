/**
 * Generates a public JSON file from the JSDoc API data.
 * This file is accessible to LLMs at /api-reference.json
 */

const fs = require('fs');
const path = require('path');

function parseApiData(dataSource) {
  const json = dataSource
    .replace(/^(?:\/\/.*\n\s*)*export default\s*/, '')
    .replace(/;\s*$/, '');
  return JSON.parse(json);
}

exports.generateApiJson = async function generateApiJson() {
  console.log("📦 Generating API reference JSON for LLMs...");

  const dataPath = path.join(__dirname, '../../data/data.js');
  const publicDir = path.join(__dirname, '../../public');
  const outputPath = path.join(publicDir, 'api-reference.json');

  // Check if data.js exists
  if (!fs.existsSync(dataPath)) {
    console.log("⚠️  data/data.js not found. Run 'npm run generate-jsdoc' first.");
    return;
  }

  try {
    const apiData = parseApiData(fs.readFileSync(dataPath, 'utf8'));

    // Create public directory if it doesn't exist
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    // Add metadata
    const output = {
      _meta: {
        generator: "Meteor Docs API Export",
        generated: new Date().toISOString(),
        description: "API reference for Meteor.js - for LLM consumption",
        url: "https://docs.meteor.com/api-reference.json"
      },
      apis: apiData
    };

    // Write the JSON file
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    const apiCount = Object.keys(apiData).length;
    console.log(`✅ Generated api-reference.json with ${apiCount} APIs`);

  } catch (err) {
    console.error("❌ Error generating API JSON:", err.message);
  }
};
