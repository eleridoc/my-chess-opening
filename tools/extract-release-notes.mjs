import { readFile, writeFile } from 'node:fs/promises';

const tagName = process.argv[2];

if (!tagName) {
	console.error('[release-notes] Missing tag name argument.');
	process.exit(1);
}

const version = tagName.replace(/^v/, '');
const changelogPath = 'CHANGELOG.md';
const outputPath = 'RELEASE_NOTES.md';

const changelog = await readFile(changelogPath, 'utf8');
const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const sectionRegex = new RegExp(
	`^## \\[${escapedVersion}\\].*$(?<content>[\\s\\S]*?)(?=^## \\[|\\z)`,
	'm',
);

const match = changelog.match(sectionRegex);
const content = match?.groups?.content?.trim();

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

const releaseNotes = [`# My Chess Opening ${version}`, '', content].join('\n');

await writeFile(outputPath, `${releaseNotes}\n`, 'utf8');

console.log(`[release-notes] Wrote ${outputPath} for ${version}.`);
