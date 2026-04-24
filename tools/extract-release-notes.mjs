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

const title =
	version === stableVersion ? `# My Chess Opening ${version}` : `# My Chess Opening ${version}`;

const releaseNotes = [
	title,
	'',
	version === stableVersion ? '' : `Pre-release candidate for My Chess Opening ${stableVersion}.`,
	version === stableVersion ? '' : '',
	content,
]
	.filter((line, index, lines) => {
		// Keep one intentional blank line, but avoid noisy double blanks from empty optional lines.
		return line !== '' || lines[index - 1] !== '';
	})
	.join('\n');

await writeFile(outputPath, `${releaseNotes}\n`, 'utf8');

console.log(`[release-notes] Wrote ${outputPath} for ${version}.`);

function extractChangelogSection(changelogContent, searchedVersion) {
	const escapedVersion = searchedVersion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	const sectionRegex = new RegExp(
		`^## \\[${escapedVersion}\\].*$(?<content>[\\s\\S]*?)(?=^## \\[|\\z)`,
		'm',
	);

	const match = changelogContent.match(sectionRegex);
	return match?.groups?.content?.trim() || null;
}
