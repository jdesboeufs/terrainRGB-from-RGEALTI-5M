const {writeFile} = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const {computeFilesToDownload} = require('./lib/files')
const config = require('./config.json')

const RGE_ALTI_BASE_URL = 'http://files.opendatarchives.fr/professionnels.ign.fr/rgealti/'

const outPath = config.outPath ? path.resolve(config.outPath) : path.join(__dirname, 'out')

const threads = Number.isInteger(config.threads) ? config.threads : os.cpus().length - 1

if (threads < 1 || threads > os.cpus().length) {
  throw new Error('threads must be between 1 and num of CPUs')
}

const deleteUnnecessaryFiles = Boolean(config.deleteUnnecessaryFiles)

const resolution = config.resolution || '5M'

if (!['1M', '5M'].includes(resolution)) {
  throw new Error('resolution must be 1M ou 5M')
}

const minZoom = config.minZoom || 5
const maxZoom = config.maxZoom || 14

if (minZoom < 4 || minZoom > 17 || maxZoom < 4 || maxZoom > 17 || minZoom >= maxZoom) {
  throw new Error('minZoom and maxZoom must be between 4 and 17')
}

// Pour filtre les data selon la projection
const projFilter = Array.isArray(config.projFilter) && config.projFilter.length > 0 ? config.projFilter : undefined

const relSrs = {
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

const generateCmd = async () => {
  const files = await computeFilesToDownload(RGE_ALTI_BASE_URL, resolution, projFilter)
  const projs = [...new Set(files.map(f => f.crs))]

  // Génération des mkdir
  const mkdirCmd = [
    `mkdir -p ${path.join(outPath, '3857/MNT')}`,
    `mkdir -p ${path.join(outPath, '3857/terrainRGB')}`

  ]
  for (const proj of projs) {
    mkdirCmd.push(`mkdir -p ${path.join(outPath, proj, 'raw')}`)
    mkdirCmd.push(`mkdir -p ${path.join(outPath, proj, 'asc')}`)
  }

  // Génération des Wget
  const wgetsCmd = files.map(f => `wget -N -P ${path.join(outPath, f.crs, 'raw')} ${RGE_ALTI_BASE_URL}${f.fileName}`)

  // DEZIPAGE des 7zip
  const unzipCmd = []
  for (const proj of projs) {
    unzipCmd.push(`7z e "${path.join(outPath, proj, 'raw', '*.7z')}" -o"${path.join(outPath, proj, 'asc')}" t *.asc -r -aou`)

    if (deleteUnnecessaryFiles) {
      unzipCmd.push(`rm -r "${path.join(outPath, proj, 'raw')}"`) // Pour gagner de la place...
    }
  }

  // BUILD VRT à partir des asc
  const buildVrtCmd = []
  for (const proj of projs) {
    const srs = relSrs[proj]
    buildVrtCmd.push(`find ${path.join(outPath, proj, 'asc')} -name '*.asc' > ${path.join(outPath, proj, 'input-files.list')}`)
    buildVrtCmd.push(`gdalbuildvrt  -overwrite -a_srs EPSG:${srs} "${path.join(outPath, proj, 'mnt.vrt')}" -input_file_list ${path.join(outPath, proj, 'input-files.list')}`)
  }

  // GDAL_TRANSLATE => creation du MNT
  const gdalTranslateCmd = []
  for (const proj of projs) {
    const srs = relSrs[proj]
    gdalTranslateCmd.push(`gdal_translate -of GTiff -co "TILED=YES" -co "COMPRESS=DEFLATE" -co "PREDICTOR=2" -co "NUM_THREADS=ALL_CPUS" -co "BIGTIFF=YES" -ot Float32 -a_srs EPSG:${srs} "${path.join(outPath, proj, 'mnt.vrt')}"  ${path.join(outPath, proj, 'mnt.tiff')}`)

    if (deleteUnnecessaryFiles) {
      gdalTranslateCmd.push(`rm -r ${path.join(outPath, proj, 'asc')}`)
      gdalTranslateCmd.push(`rm ${path.join(outPath, proj, 'mnt.vrt')}`)
    }
  }

  // GDAL_WRAP => reprojection en 3857
  const gdalWarpCmd = []
  for (const proj of projs) {
    const srs = relSrs[proj]
    gdalWarpCmd.push(`gdalwarp -overwrite -of GTiff -co "TILED=YES" -co "COMPRESS=DEFLATE" -co "PREDICTOR=2" -co "NUM_THREADS=ALL_CPUS" -co "BIGTIFF=YES" -ot UInt16 ${path.join(outPath, proj, 'mnt.tiff')} ${path.join(outPath, '3857', 'MNT', `${proj}.tiff`)} -s_srs EPSG:${srs} -t_srs EPSG:3857 -multi -wo NUM_THREADS=${threads}`)

    if (deleteUnnecessaryFiles) {
      gdalWarpCmd.push(`rm -r ${path.join(outPath, proj)}`)
    }
  }

  // GDAL_CALC => Supprime les données dont l'altitude est < 0. Terrain RGB ne fonctionne que pour les valeurs positives, sinon on a des artefacts
  const gdalCalcCmd = []
  for (const proj of projs) {
    gdalCalcCmd.push(`gdal_calc.py --type=Float32 --quiet --co "TILED=YES" --co "COMPRESS=DEFLATE" --co "PREDICTOR=2" --co "NUM_THREADS=ALL_CPUS" --co "BIGTIFF=YES"  -A ${path.join(outPath, '3857', 'MNT', `${proj}.tiff`)} --outfile=${path.join(outPath, '3857', 'MNT', `${proj}_cleaned.tiff`)} --calc="A*(A>0)" --overwrite --NoDataValue=0`)
    if (deleteUnnecessaryFiles) {
      gdalCalcCmd.push(`rm ${path.join(outPath, '3857', 'MNT', `${proj}.tiff`)}`) // Pour gagner de la place...
    }
  }

  // Génération des terrain RGB
  const rgbifyCmd = []
  for (const proj of projs) {
    rgbifyCmd.push(`rio rgbify --format png -j ${threads}  --min-z ${minZoom} --max-z ${maxZoom}  -b -10000  -i 0.1 ${path.join(outPath, '3857', 'MNT', `${proj}_cleaned.tiff`)} ${path.join(outPath, '3857', 'terrainRGB', `${proj}.mbtiles`)}`)
    if (deleteUnnecessaryFiles) {
      rgbifyCmd.push(`rm ${path.join(outPath, '3857', 'MNT', `${proj}_cleaned.tiff`)}`)
    }
  }

  let stringCmd = '' // Le resultat
  stringCmd += '# sudo apt-get install p7zip p7zip-full\n'
  stringCmd += '# sudo apt install gdal-bin\n'
  stringCmd += '# sudo apt install python3-pip\n'
  stringCmd += '# sudo pip install git+https://github.com/DoFabien/rio-rgbify\n'
  stringCmd += '\n\n\n'

  stringCmd += '# Création des répertoires qui stockeront les données\n'
  stringCmd += mkdirCmd.join('\n')
  stringCmd += '\n\n'

  stringCmd += '# Téléchargement des .7z des MNT dans les répertoires "raw"" depuis http://files.opendatarchives.fr/professionnels.ign.fr/rgealti\n'
  stringCmd += wgetsCmd.join('\n')
  stringCmd += '\n\n'

  stringCmd += '# Décompression des .7z dans les répertoires "asc"\n'
  stringCmd += unzipCmd.join('\n')
  stringCmd += '\n\n'

  stringCmd += '# Génération des raster virtuels .vrt\n'
  stringCmd += buildVrtCmd.join('\n')
  stringCmd += '\n\n'

  stringCmd += '# Création des tiff dans la projection locale\n'
  stringCmd += gdalTranslateCmd.join('\n')
  stringCmd += '\n\n'

  stringCmd += '# Reprojection en 3857\n'
  stringCmd += gdalWarpCmd.join('\n')
  stringCmd += '\n\n'

  stringCmd += '# Suppression des altitudes négatives...\n'
  stringCmd += gdalCalcCmd.join('\n')
  stringCmd += '\n\n'

  stringCmd += '# Génération des tuiles terrain-RGB\n'
  stringCmd += rgbifyCmd.join('\n')
  stringCmd += '\n\n'

  return stringCmd
}

const writeSh = async () => {
  const cmd = await generateCmd()
  await writeFile('out.sh', cmd, {encoding: 'utf8', mode: 0o755})
}

writeSh()
