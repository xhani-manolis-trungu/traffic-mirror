const fs = require('fs');
const path = require('path');

// Path to the root package.json (one level up from ui/ directory)
const rootPackagePath = path.join(__dirname, '..', 'package.json');
// Path to the output version file
const versionFilePath = path.join(__dirname, 'src', 'version.ts');

try {
  // Read root package.json
  const packageJson = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));
  const version = packageJson.version;

  // Create content for version.ts
  const fileContent = `// This file is auto-generated. Do not edit manually.
export const APP_VERSION = '${version}';
`;

  // Write version.ts
  fs.writeFileSync(versionFilePath, fileContent);
  console.log(`Updated src/version.ts with version ${version}`);
} catch (error) {
  console.error('Error updating version file:', error);
  process.exit(1);
}
