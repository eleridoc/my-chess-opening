import fs from 'node:fs';
import path from 'node:path';

/**
 * Sync the version across:
 * - workspace package.json files
 * - package-lock.json (root + workspace entries)
 * - the UI version constant (used by About / Help)
 *
 * Usage:
 *   node tools/sync-versions.mjs 1.6.17
 *
 * Notes:
 * - This script updates only the "version" fields.
 * - It keeps JSON formatting stable and ensures trailing newlines.
 */
function main() {
	const version = process.argv[2];

	if (!version) {
		console.error('Usage: node tools/sync-versions.mjs <version>');
		process.exit(1);
	}

	// SemVer validation with optional prerelease/build metadata.
	// Examples:
	// - 1.11.9
	// - 1.11.9-rc.1
	// - 1.11.9-beta.1
	// - 1.11.9+build.1
	// - 1.11.9-rc.1+build.1
	const semverRegex =
		/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

	if (!semverRegex.test(version)) {
		console.error(
			`Invalid version "${version}". Expected SemVer: x.y.z, x.y.z-rc.1 or x.y.z+build.1`,
		);
		process.exit(1);
	}

	const packageJsonFiles = [
		'package.json',
		path.join('core', 'package.json'),
		path.join('electron', 'package.json'),
		path.join('ui', 'angular', 'package.json'),
	];

	for (const file of packageJsonFiles) {
		updatePackageJsonVersion(file, version);
	}

	updatePackageLockVersion('package-lock.json', version);

	updateUiVersionFile(
		path.join('ui', 'angular', 'src', 'app', 'shared', 'system', 'app-version.ts'),
		version,
	);
}

function updatePackageJsonVersion(file, version) {
	ensureFileExists(file);

	const raw = fs.readFileSync(file, 'utf8');
	const json = JSON.parse(raw);

	const before = json.version ?? '(none)';
	json.version = version;

	// Keep package.json formatting stable: 2-space JSON (matches current repo style).
	fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n', 'utf8');
	console.log(`Updated ${file}: ${before} -> ${version}`);
}

function updatePackageLockVersion(file, version) {
	ensureFileExists(file);

	const raw = fs.readFileSync(file, 'utf8');
	const json = JSON.parse(raw);

	const before = json.version ?? '(none)';
	json.version = version;

	// npm lockfile v3 structure: update root package entry.
	if (json.packages && json.packages['']) {
		json.packages[''].version = version;
	}

	// Update workspace package entries if present.
	// These keys match workspace folder paths in the lockfile.
	const workspaceKeys = ['core', 'electron', 'ui/angular'];

	if (json.packages) {
		for (const key of workspaceKeys) {
			if (json.packages[key]) {
				json.packages[key].version = version;
			}
		}
	}

	// Keep lockfile formatting stable: use tabs (matches current package-lock.json formatting).
	fs.writeFileSync(file, JSON.stringify(json, null, '\t') + '\n', 'utf8');
	console.log(`Updated ${file}: ${before} -> ${version}`);
}

function updateUiVersionFile(file, version) {
	const dir = path.dirname(file);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	if (!fs.existsSync(file)) {
		// Create the file if missing to make the script idempotent.
		fs.writeFileSync(file, buildUiVersionFile(version), 'utf8');
		console.log(`Created ${file}: -> ${version}`);
		return;
	}

	const raw = fs.readFileSync(file, 'utf8');

	const next = raw.replace(
		/export const APP_VERSION = '.*?';/,
		`export const APP_VERSION = '${version}';`,
	);

	if (next === raw) {
		// Fallback if the line was edited manually.
		console.error(
			`Could not update ${file}. Expected a line like: export const APP_VERSION = 'x.y.z';`,
		);
		process.exit(1);
	}

	fs.writeFileSync(file, next.endsWith('\n') ? next : next + '\n', 'utf8');
	console.log(`Updated ${file}: -> ${version}`);
}

function buildUiVersionFile(version) {
	return (
		`/**\n` +
		` * Application version displayed in the UI.\n` +
		` *\n` +
		` * IMPORTANT:\n` +
		` * - This file is updated by \`npm run sync:version -- x.y.z\`.\n` +
		` * - Do not edit manually.\n` +
		` */\n` +
		`export const APP_VERSION = '${version}';\n`
	);
}

function ensureFileExists(file) {
	if (!fs.existsSync(file)) {
		console.error(`Missing file: ${file}`);
		process.exit(1);
	}
}

main();
