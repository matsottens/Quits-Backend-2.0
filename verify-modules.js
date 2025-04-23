// Verify modules script
// Run before deployment to ensure all module imports/exports are consistent

import fs from 'fs';
import path from 'path';

// Directory to scan
const API_DIR = './api';

console.log('Checking module syntax in API files...');
const files = fs.readdirSync(API_DIR).filter(file => file.endsWith('.js'));

console.log(`Found ${files.length} JavaScript files`);

let commonJsExportsFound = false;

for (const file of files) {
  const filePath = path.join(API_DIR, file);
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for CommonJS module.exports
  if (content.includes('module.exports') || content.includes('exports.')) {
    commonJsExportsFound = true;
    console.error(`⚠️ ${file} uses CommonJS exports but should use ES modules`);
    console.log('  Change:');
    console.log('    module.exports = { ... }');
    console.log('  To:');
    console.log('    export { ... }');
  }
  
  // Check for require() statements
  const requireMatches = content.match(/require\(['"](.*)['"]\)/g);
  if (requireMatches && requireMatches.length > 0) {
    commonJsExportsFound = true;
    console.error(`⚠️ ${file} uses CommonJS require() but should use ES modules import`);
    console.log('  Change:');
    console.log('    const something = require(\'module\')');
    console.log('  To:');
    console.log('    import something from \'module\'');
    console.log('  Or:');
    console.log('    import { something } from \'module\'');
  }
}

if (!commonJsExportsFound) {
  console.log('✅ All files use ES module syntax correctly');
} else {
  console.error('⚠️ Found CommonJS syntax issues that need to be fixed');
  process.exit(1);
} 