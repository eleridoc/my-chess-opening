import fs from 'node:fs';
import path from 'node:path';

/**
 * Sync the version field across all workspace package.json files.
 *
 * Usage:
 *   node tools/sync-versions.mjs 1.6.14
 *
 * Notes:
 * - This script updates only the "version" field.
 * - It keeps formatting stable (2-space JSON) and ensures a trailing newline.
 */
function main() {
	const version = process.argv[2];

	if (!version) {
		console.error('Usage: node tools/sync-versions.mjs <version>');
		process.exit(1);
	}

	// Minimal SemVer validation (x.y.z). Keep it strict on purpose.
	if (!/^\d+\.\d+\.\d+$/.test(version)) {
		console.error(`Invalid version "${version}". Expected SemVer: x.y.z`);
		process.exit(1);
	}

	const files = [
		'package.json',
		path.join('core', 'package.json'),
		path.join('electron', 'package.json'),
		path.join('ui', 'angular', 'package.json'),
	];

	for (const file of files) {
		if (!fs.existsSync(file)) {
			console.error(`Missing file: ${file}`);
			process.exit(1);
		}

		const raw = fs.readFileSync(file, 'utf8');
		const json = JSON.parse(raw);

		const before = json.version;
		json.version = version;

		fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
		console.log(`Updated ${file}: ${before ?? '(none)'} -> ${version}`);
	}
}

main();
