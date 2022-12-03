const got = require('got')
const fs = require('fs')
const os = require('os')
const path = require('path')

let config;
try {
    config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json')))
} catch (error) {
    console.error(error)
    throw error
}

if (!config.outPath){
    throw new Error(`outPath n'est pas configuré dans config.json`)
}
// if (!config.outPath || !fs.existsSync(config.outPath)){
//     throw new Error(`Le répértoire ${config.outPath} n'existe pas. Il faut le créer avant`)
// }


const threads = parseInt(config.threads) ? parseInt(config.threads) :  os.cpus().length -2

const deleteUnnecessaryFiles = config.deleteUnnecessaryFiles || false; // pour ajouter des commandes qui suppriment les fichiers/dossier qui ne sont plus necessaire

const minZoom = parseInt(config.minZoom) || 5;
const maxZoom = parseInt(config.maxZoom) || 14;


// pour filtre les data selon la projection
// ['LAMB93-IGN69', 'LAMB93-IGN78C', 'RGM04UTM38S-MAYO53', 'RGR92UTM40S-REUN89', 'RGSPM06U21-STPM50', 'UTM22RGFG95-GUYA77', 'WGS84UTM20-GUAD88SB', 'WGS84UTM20-GUAD88SM', 'WGS84UTM20-GUAD88', 'WGS84UTM20-MART87']
const projFilter = config.projFilter && config.projFilter.length > 0 ? config.projFilter : undefined;

const relSrs = {
    'LAMB93-IGN69': 'EPSG:5698',
    'LAMB93-IGN78C': 'EPSG:5699',
    'RGM04UTM38S-MAYO53' :'EPSG:4471',
    'RGR92UTM40S-REUN89' : 'EPSG:2975',
    'RGSPM06U21-STPM50' : 'IGNF:RGSPM06U21', // st pierre et miquelon
    'UTM22RGFG95-GUYA77' : 'EPSG:2972',
    'WGS84UTM20-GUAD88SB' : 'EPSG:32620',
    'WGS84UTM20-GUAD88SM' : 'EPSG:32620',
    'WGS84UTM20-GUAD88' : 'EPSG:32620',
    'WGS84UTM20-MART87' : 'EPSG:32620'
}


const baseUrl = 'http://files.opendatarchives.fr/professionnels.ign.fr/rgealti/'
const generateCmd = async () => {
    const {body} = await got.get(baseUrl)
    // console.log(body)
    let names = body.match(/href="RGEALTI_2-0_5M.*\.7z"/gm)
    names = names.map( n=> n.replace(/href="/g, '').replace(/"/, '') )

    const lastUniqByDep = [];
    const projs = []; // liste des projections

    for (const n of names){
        const _splited = n.split('_')
        const proj = _splited[4];
        const dep = _splited[5]
        const date = _splited[6].replace('.7z','')
        const ob = {proj, dep, date, name: n }

        if (projFilter && !projFilter.includes(proj)){
            continue;
        }

        if (!projs.includes(proj) ){
            projs.push(proj);
        }

        const currentDepIndex = lastUniqByDep.findIndex( o => o.dep === dep)
        if (currentDepIndex !== -1){
            if ( date > lastUniqByDep[currentDepIndex].date){
                lastUniqByDep[currentDepIndex] = ob
            }
        }
        else {
            lastUniqByDep.push(ob)
        }
    }



    // génération des mkdir
    let mkdirCmd = [
        `mkdir -p ${path.join(config.outPath, '3857/MNT')}`,
        `mkdir -p ${path.join(config.outPath, '3857/terrainRGB')}`

      ];
    for (const proj of projs){
        mkdirCmd.push( `mkdir -p ${path.join(config.outPath,proj, 'raw')}`)
        mkdirCmd.push( `mkdir -p ${path.join(config.outPath,proj, 'asc')}`)

    }


    // Génération des Wget
    let wgetsCmd = [];
    for (const proj of projs){
        const dataWithThisProj = lastUniqByDep.filter( d => d.proj == proj);
        const w = dataWithThisProj.map( d =>`wget -O ${path.join(config.outPath,proj, 'raw', d.name)} ${baseUrl}${d.name}`)
        wgetsCmd = [...wgetsCmd, ...w]
    }

    // DEZIPAGE des 7zip
    let unzipCmd = [];
    for (const proj of projs){
        // unzipCmd.push( `7z e "./${proj}/raw/*.7z" -o"./${proj}/asc" t *.asc -r -aou` )
        unzipCmd.push( `7z e "${path.join(config.outPath,proj, 'raw', '*.7z')}" -o"${path.join(config.outPath,proj, 'asc')}" t *.asc -r -aou` )
        if (deleteUnnecessaryFiles){
            unzipCmd.push(`rm -r "${path.join(config.outPath,proj, 'raw')}"`) // pour gagner de la place...
        }
    }



    // BUILD VRT à partir des asc
    let buildVrtCmd = [];
    for (const proj of projs){
        const srs = relSrs[proj]
        buildVrtCmd.push(`find ${path.join(config.outPath,proj, 'asc')} -name '*.asc' > ${path.join(config.outPath,proj, 'input-files.list')}`)
        buildVrtCmd.push(  `gdalbuildvrt  -overwrite -a_srs ${srs} "${path.join(config.outPath,proj, 'mnt.vrt')}" -input_file_list ${path.join(config.outPath,proj, 'input-files.list')}` )
    }


    // GDAL_TRANSLATE => creation du MNT
    let gdalTranslateCmd = [];
    for (const proj of projs){
        const srs = relSrs[proj]
        gdalTranslateCmd.push(  `gdal_translate -of GTiff -co "TILED=YES" -co COMPRESS=LZW -co BIGTIFF=YES -ot Float32 -a_srs ${srs} "${path.join(config.outPath,proj, 'mnt.vrt')}"  ${path.join(config.outPath,proj, 'mnt.tiff')}` )
        if (deleteUnnecessaryFiles){
            gdalTranslateCmd.push(`rm -r ${path.join(config.outPath,proj, 'asc')}`)
            gdalTranslateCmd.push(`rm ${path.join(config.outPath,proj, 'mnt.vrt')}`)
        }
    }

    // GDAL_WRAP => reprojection en 3857
    let gdalWarpCmd = [];
    for (const proj of projs){
        const srs = relSrs[proj]

        gdalWarpCmd.push(  `gdalwarp -overwrite -of GTiff -co "TILED=YES" -co COMPRESS=LZW -co BIGTIFF=YES -ot Float32 ${path.join(config.outPath,proj, 'mnt.tiff')} ${path.join(config.outPath,'3857','MNT', `${proj}.tiff`)} -s_srs ${srs} -t_srs EPSG:3857 -multi -wo NUM_THREADS=${threads}` )
        if (deleteUnnecessaryFiles){
            gdalWarpCmd.push(`rm -r ${path.join(config.outPath,proj)}`)
        }
    }

    // GDAL_CALC => Supprime les données dont l'altitude est < 0. Terrain RGB ne fonctionne que pour les valeurs positives, sinon on a des artefacts
    let gdalCalcCmd = [];
    for (const proj of projs){
        const srs = relSrs[proj]
        gdalCalcCmd.push(  `gdal_calc.py --type=Float32 --quiet --co "TILED=YES" --co COMPRESS=LZW --co BIGTIFF=YES  -A ${path.join(config.outPath,'3857','MNT', `${proj}.tiff`)} --outfile=${path.join(config.outPath,'3857','MNT', `${proj}_cleaned.tiff`)} --calc="A*(A>0)" --overwrite --NoDataValue=0` )
        if (deleteUnnecessaryFiles){
            gdalCalcCmd.push(`rm ${path.join(config.outPath,'3857','MNT', `${proj}.tiff`)}`) // pour gagner de la place...
        }
    }

    // Génération des terrain RGB
    let rgbifyCmd = [];
    for (const proj of projs){

        rgbifyCmd.push(  `rio rgbify --format png -j ${threads}  --min-z ${minZoom} --max-z ${maxZoom}  -b -10000  -i 0.1 ${path.join(config.outPath,'3857','MNT', `${proj}_cleaned.tiff`)} ${path.join(config.outPath,'3857','terrainRGB', `${proj}.mbtiles`)}` )
        if (deleteUnnecessaryFiles){
            rgbifyCmd.push(`rm ${path.join(config.outPath,'3857','MNT', `${proj}_cleaned.tiff`)}`)
        }
    }


    let strCmd = ''; // le resultat
    strCmd += '# sudo apt-get install p7zip p7zip-full\n'
    strCmd += '# sudo apt install gdal-bin\n'
    strCmd += '# sudo apt install python3-pip\n'
    strCmd += '# sudo pip install git+https://github.com/DoFabien/rio-rgbify\n'
    strCmd += '\n\n\n'

    strCmd += '# Création des répertoires qui stockeront les données\n'
    strCmd += mkdirCmd.join('\n')
    strCmd += '\n\n'

    strCmd += '# Téléchargement des .7z des MNT à 5m dans les répertoires "raw"" depuis http://files.opendatarchives.fr/professionnels.ign.fr/rgealti\n'
    strCmd += wgetsCmd.join('\n')
    strCmd += '\n\n'

    strCmd += '# Décompression des .7z dans les répertoires "asc"\n'
    strCmd += unzipCmd.join('\n')
    strCmd += '\n\n'

    strCmd += '# Génération des raster virtuels .vrt\n'
    strCmd += buildVrtCmd.join('\n')
    strCmd += '\n\n'

    strCmd += '# Création des tiff dans la projection locale\n'
    strCmd += gdalTranslateCmd.join('\n')
    strCmd += '\n\n'

    strCmd += '# Reprojection en 3857\n'
    strCmd += gdalWarpCmd.join('\n')
    strCmd += '\n\n'

    strCmd += '# Suppression des altitudes négatives...\n'
    strCmd += gdalCalcCmd.join('\n')
    strCmd += '\n\n'

    strCmd += '# Génération des tuiles terrain-RGB\n'
    strCmd += rgbifyCmd.join('\n')
    strCmd += '\n\n'

    return strCmd;


}

const writeSh = async() => {
    const cmd = await generateCmd();
    fs.writeFileSync('out.sh', cmd, 'utf-8', { mode: 0755 })
}

writeSh()
