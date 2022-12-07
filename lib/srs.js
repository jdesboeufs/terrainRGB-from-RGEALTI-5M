const srsMapping = {
  'LAMB93-IGN69': '2154', // France continentale
  'LAMB93-IGN78C': '2154', // Corse
  'RGM04UTM38S-MAYO53': '4471', // Mayotte
  'RGR92UTM40S-REUN89': '2975', // La Réunion
  'RGSPM06U21-STPM50': '4467', // Saint-Pierre-et-Miquelon
  'RGFG95UTM22-GUYA77': '2972', // Guyane
  'RGAF09UTM20-GUAD88SB': '5490', // Saint-Barthélémy
  'RGAF09UTM20-GUAD88SM': '5490', // Saint-Martin
  'WGS84UTM20-GUAD88': '5490', // Guadeloupe
  'WGS84UTM20-MART87': '5490' // Martinique
}

function getEpsgCode(fileSrs) {
  if (fileSrs in srsMapping) {
    return srsMapping[fileSrs]
  }

  throw new Error(`Système de coordonnées inconnu : ${fileSrs}`)
}

module.exports = {getEpsgCode}
