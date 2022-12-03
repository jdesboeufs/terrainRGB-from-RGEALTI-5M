const got = require('got')
const {chain, max} = require('lodash')

async function computeFilesToDownload(baseUrl, resolution = '5M', projFilter) {
  const body = await got(baseUrl).text()
  const hrefEntries = body.match(/href=".*"/gm)

  if (!hrefEntries) {
    throw new Error('No href in page')
  }

  const files = chain(hrefEntries)
    .map(hrefEntry => {
      const fileName = hrefEntry.slice(6, -1)
      const result = fileName.match(/^RGEALTI_2-0_(([15])M)_ASC_([A-Z\d-]+)_D([\dAB]{3})_(\d{4}-\d{2}-\d{2})\.7z(\.\d{3})?/)
      if (result) {
        return {
          fileName,
          resolution: result[1],
          crs: result[3],
          departement: result[4].startsWith('0') ? result[4].slice(1) : result[4],
          date: result[5],
          seq: result[6]
        }
      }

      return null
    })
    .compact()
    .filter(file => file.resolution === resolution && (!projFilter || projFilter.includes(file.crs)))
    .groupBy('departement')
    .map(files => {
      const lastDate = max(files.map(f => f.date))
      return files.filter(f => f.date === lastDate)
    })
    .flatten()
    .value()

  return files
}

module.exports = {computeFilesToDownload}
