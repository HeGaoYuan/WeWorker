import sitesData from './sites.json'

export function slugify(text) {
  return text
    .replace(/`[^`]*`/g, '')
    .replace(/[*_[\]()#]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\u4e00-\u9fff-]/g, '')
    .replace(/^-+|-+$/g, '')
}

/** Headings for docs TOC — h2 per group, h3 per site */
export function getSupportedSitesHeadings(data = sitesData) {
  const headings = []
  for (const group of data.groups) {
    headings.push({ level: 2, text: group.name, id: slugify(group.name) })
    for (const site of group.sites) {
      headings.push({ level: 3, text: site.name, id: slugify(site.name) })
    }
  }
  return headings
}
