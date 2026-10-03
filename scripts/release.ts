/** One release's section of CHANGELOG.md on a single line: the `notes` a release check shows. */
export function releaseNotes(changelog: string, v: string) {
  const section = changelog.replace(/\r\n/g, '\n').split(/^## /m).find((s) => s.split('\n', 1)[0].trim() === v);
  return section ? section.slice(section.indexOf('\n')).replace(/\s+/g, ' ').trim() : '';
}
