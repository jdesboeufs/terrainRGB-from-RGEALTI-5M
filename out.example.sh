# sudo apt-get install p7zip p7zip-full
# sudo apt install gdal-bin
# sudo apt install python3-pip
# sudo pip install git+https://github.com/DoFabien/rio-rgbify



# Création des répertoires qui stockeront les données
mkdir -p /mnt/SSD2/terrainRgb/3857/MNT
mkdir -p /mnt/SSD2/terrainRgb/3857/terrainRGB
mkdir -p /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/raw
mkdir -p /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/asc

# Téléchargement des .7z des MNT à 5m dans les répertoires RAW depuis http://files.opendatarchives.fr/professionnels.ign.fr/rgealti
wget -O /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/raw/RGEALTI_2-0_5M_ASC_RGSPM06U21-STPM50_D975_2017-03-27.7z http://files.opendatarchives.fr/professionnels.ign.fr/rgealti/RGEALTI_2-0_5M_ASC_RGSPM06U21-STPM50_D975_2017-03-27.7z

# Décompression des .7z dans les répertoires "asc"
7z e "/mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/raw/*.7z" -o"/mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/asc" t *.asc -r -aou
rm -r "/mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/raw"

# Génération des raster virtuels .vrt
gdalbuildvrt  -overwrite -a_srs IGNF:RGSPM06U21 "/mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/mnt.vrt" /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/asc/*.asc

# Création des tiff dans la projection locale
gdal_translate -of GTiff -co "TILED=YES" -co COMPRESS=LZW -co BIGTIFF=YES -ot Float32 -a_srs IGNF:RGSPM06U21 "/mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/mnt.vrt"  /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/mnt.tiff
rm -r /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/asc
rm /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/mnt.vrt

# Reprojection en 3857
gdalwarp -overwrite -of GTiff -co "TILED=YES" -co COMPRESS=LZW -co BIGTIFF=YES -ot Float32 /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50/mnt.tiff /mnt/SSD2/terrainRgb/3857/MNT/RGSPM06U21-STPM50.tiff -s_srs IGNF:RGSPM06U21 -t_srs EPSG:3857 -multi -wo NUM_THREADS=10
rm -r /mnt/SSD2/terrainRgb/RGSPM06U21-STPM50

# Suppression des altitudes négatives...
gdal_calc.py --type=Float32 --quiet --co "TILED=YES" --co COMPRESS=LZW --co BIGTIFF=YES  -A /mnt/SSD2/terrainRgb/3857/MNT/RGSPM06U21-STPM50.tiff --outfile=/mnt/SSD2/terrainRgb/3857/MNT/RGSPM06U21-STPM50_cleaned.tiff --calc="A*(A>0)" --overwrite --NoDataValue=0
rm /mnt/SSD2/terrainRgb/3857/MNT/RGSPM06U21-STPM50.tiff

# Génération des tuiles terrain-RGB
rio rgbify --format png -j 10  --min-z 5 --max-z 14  -b -10000  -i 0.1 /mnt/SSD2/terrainRgb/3857/MNT/RGSPM06U21-STPM50_cleaned.tiff /mnt/SSD2/terrainRgb/3857/terrainRGB/RGSPM06U21-STPM50.mbtiles
rm /mnt/SSD2/terrainRgb/3857/MNT/RGSPM06U21-STPM50_cleaned.tiff

