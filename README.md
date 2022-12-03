# terrainRGB-from-RGEALTI-5M
(Inception) Script qui génère un script qui génère des tuiles "Terrain RGB" à partir du RGE ALTI de 5m de l'IGN

0. Récupération de la liste des derniers fichiers du RGE ALTI à 5M par département depuis http://files.opendatarchives.fr/professionnels.ign.fr/rgealti/

Puis génération du .sh

1. Création des répertoires qui recevront les données. A la racine, il y aura un répertoire par système de projection, plus un dossier 3857 (srid des données finales)
2. Téléchargement des .7z contenant les .asc qui seront stockées dans les dossiers {proj}/raw . A partir de http://files.opendatarchives.fr/professionnels.ign.fr/rgealti/. Un grand merci a @cquest qui nous évite de subir les lenteurs du FTP de l'IGN (wget)
3. Décompression des .asc contenu dans les .7z dans les dossiers {proj}/asc (7z)
4. Génération des raster virtuels .vrt pour le .asc (gdalbuildvrt)
5. Création des tiff dans la projection locale (gdal_translate)
6. Reprojection en 3857 (gdalwarp)
7. Suppression des altitudes négatives  (gdal_calc.py)
8. Génération des tuiles terrain-RGB (rio rgbify)

On obtient donc autant de tuiles RGB (en .mbtiles) qu'il y à de système de projection, donc 10 avec toutes les données.

# Installation & configuration & execution
## Ici
```sh
npm install
```
Céer un fichier config.json, il y a un exemple (config.example.json):
```json
{
    "outPath":"/mnt/SSD2/terrainRgb", // Le chemin du dossier qui va accueillir toutes les données. Requis
    "threads": null, // nombre de threads utilisé par certains programmes ( defaut: max - 2)
    "deleteUnnecessaryFiles": true, // Ajoute des rm pour supprimer les données qui ne sont plus nécessaires par la suite.
    "resolution": "5M", // Résolution RGE ALTI à utiliser (1M ou 5M)
    "minZoom": 5, // pour les tuiles finales (default 5)
    "maxZoom": 14, // pour les tuiles finales (default 14)
    "projFilter" : ["RGSPM06U21-STPM50"] // pour ne générer que certains territoire en se basant sur le srid. Par défaut, on prend tout, on a pas de filtre. Les valeurs possibles sont dans la 2e colonne du tableau des correspondances plus bas
}
```

Pour lancer le script :
```sh
node index.js
```
Cela va générer un fichier 'out.sh'
On exemple de sortit est disponible dans _out.example.sh_ (Saint-Pierre-et-Miquelon )

## Sur la machine qui va exécuter le .sh
Sur Ubuntu / Debian, a adapter pour les autres OS
```sh
sudo apt-get install p7zip p7zip-full
sudo apt install gdal-bin
sudo apt install python3-pip
sudo pip install git+https://github.com/DoFabien/rio-rgbify
```

```sh
./out.sh
```
Ou copier/coller les lignes dans le terminal...

Les résultats finaux, les tuiles RGB en .mbtiles seront dans le dossier 3857/terrainRGB/*.mbtiles
Un territoire (un code projection) correspond donc à un Mbtiles.

Pour avoir un seul Mbtiles regroupant tout le territoire français, il faudrait fusionner toutes les tuiles en un seul jeu...
J'ai perdu mon script qui faisait le job, mais avec Python, il me semble Sqlite, Pillow, Numpy on s'en sortait.


# Correspondances territoires / proj ign / srid
| Territoire  | Proj IGN  | srid  |
|---|---|---|
|  France Métropole | LAMB93-IGN69  | EPSG:5698  |
| Corse  | LAMB93-IGN78C  | EPSG:5699  |
| Mayotte  | RGM04UTM38S-MAYO53  | EPSG:4471  |
| La Réunion  | RGR92UTM40S-REUN89  | EPSG:2975  |
| Saint-Pierre-et-Miquelon  | GSPM06U21-STPM50  | IGNF:RGSPM06U21  |
| Guyanne  | UTM22RGFG95-GUYA77  | EPSG:2972  |
| Saint-Barthélemy  | WGS84UTM20-GUAD88SB  | EPSG:32620  |
| Saint-Martin  | WGS84UTM20-GUAD88SM  | EPSG:32620  |
| Guadeloupe  | WGS84UTM20-GUAD88  | EPSG:32620  |
| Martinique  | WGS84UTM20-MART87  | EPSG:32620  |




