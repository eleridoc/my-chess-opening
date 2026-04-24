import { readFile, writeFile } from 'node:fs/promises';

const tagName = process.argv[2];

if (!tagName) {
	console.error('[release-notes] Missing tag name argument.');
	process.exit(1);
}

const version = tagName.replace(/^v/, '');
const stableVersion = version.split('-')[0];
const changelogPath = 'CHANGELOG.md';
const outputPath = 'RELEASE_NOTES.md';

const changelog = await readFile(changelogPath, 'utf8');

const exactSection = extractChangelogSection(changelog, version);
const stableSection =
	version === stableVersion ? null : extractChangelogSection(changelog, stableVersion);

const content = exactSection ?? stableSection;

if (!content) {
	const fallback = [
		`# My Chess Opening ${version}`,
		'',
		'Release notes were not found in CHANGELOG.md.',
		'',
		'Please check the repository changelog for details.',
	].join('\n');

	await writeFile(outputPath, `${fallback}\n`, 'utf8');
	console.warn(
		`[release-notes] No CHANGELOG.md section found for ${version}. Wrote fallback notes.`,
	);
	process.exit(0);
}

const releaseNotes = [
	`# My Chess Opening ${version}`,
	'',
	version === stableVersion
		? null
		: `Pre-release candidate for My Chess Opening ${stableVersion}.`,
	version === stableVersion ? null : '',
	content,
]
	.filter((line) => line !== null)
	.join('\n');

await writeFile(outputPath, `${releaseNotes}\n`, 'utf8');

console.log(`[release-notes] Wrote ${outputPath} for ${version}.`);

function extractChangelogSection(changelogContent, searchedVersion) {
	const lines = changelogContent.split(/\r?\n/);
	const headingRegex = new RegExp(`^## \\[${escapeRegExp(searchedVersion)}\\](?:\\s|$)`);

	const startIndex = lines.findIndex((line) => headingRegex.test(line));

	if (startIndex === -1) {
		return null;
	}

	const contentStartIndex = startIndex + 1;
	let contentEndIndex = lines.length;

	for (let index = contentStartIndex; index < lines.length; index += 1) {
		if (/^## \[/.test(lines[index])) {
			contentEndIndex = index;
			break;
		}
	}

	return lines.slice(contentStartIndex, contentEndIndex).join('\n').trim() || null;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
