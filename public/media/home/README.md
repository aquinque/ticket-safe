# Médias de la page d'accueil

Dépose ici les fichiers ci-dessous, **avec exactement ces noms**. Tant qu'un fichier est absent, sa section
affiche un dégradé bleu nuit à la place : rien ne casse, aucune image cassée. Les textes, les liens et les
chemins des médias se changent dans `src/content/home.ts`, jamais dans les composants.

## Vraies photos et vraies vidéos uniquement

**Aucune image générée par IA** sur cette page : seulement de vraies photos et de vraies images filmées
(vos soirées, vos événements, vos équipes). Rien dans le code ne génère ni ne remplace un visuel : tant qu'un
fichier est absent, la section reste sur son dégradé.

## Fichiers attendus

| Section | Fichier(s) | Format | Cible |
|---|---|---|---|
| 1. Hero | `hero.mp4` + `hero.webm` | vidéo en boucle, 1920×1080, 8 à 12 s, **sans piste audio** | < 3 Mo chacune |
| 1. Hero | `hero.jpg` | **poster** (voir ci-dessous), 1920 px de large | < 400 Ko |
| 2. Organisateurs | `organisateurs.jpg` | photo, 1920 px de large | < 400 Ko |
| 3. Associatif | `associatif.jpg` | photo, 1920 px de large | < 400 Ko |
| 4. Soirées | `soiree.mp4` + `soiree.webm` | vidéo courte en boucle, 1920×1080, 8 à 12 s, sans audio | < 3 Mo chacune |
| 4. Soirées | `soiree.jpg` | poster, 1920 px de large | < 400 Ko |
| 5. Revente | `revente.jpg` | photo plus calme, 1920 px de large | < 400 Ko |
| 6. Réunions & pro | `reunion.jpg` | photo, 1920 px de large | < 400 Ko |
| 7. Plateforme | `plateforme.jpg` | photo très floutée ou fond sombre uni (la page applique en plus un flou) | < 200 Ko |

Les sections 8 (événements) et 9 (appel final) n'ont pas de média : elles sont lues depuis la base et sur fond dégradé.

## Le poster compte plus que la vidéo

Sur téléphone, avec l'économiseur de données, en 2G/3G et pour les personnes qui demandent moins d'animations,
**la vidéo n'est jamais chargée** : on voit le poster. Or la majorité du trafic arrive depuis un iPhone. Le
`hero.jpg` est donc la première chose vue par la plupart des visiteurs : soigne-le, et garde-le léger (c'est lui
qui détermine la vitesse d'affichage de la page).

La vidéo ne se charge que lorsque la section est proche de l'écran, et se met en pause quand elle n'est plus visible.

## Préparer les fichiers

Depuis un export vidéo quelconque (`source.mov`) :

```sh
# MP4 (lu partout)
ffmpeg -i source.mov -t 10 -vf "scale=1920:-2" -an -c:v libx264 -crf 28 -preset slow -movflags +faststart hero.mp4
# WebM (plus léger, pris en premier quand il existe)
ffmpeg -i source.mov -t 10 -vf "scale=1920:-2" -an -c:v libvpx-vp9 -crf 36 -b:v 0 hero.webm
# Poster : une image de la vidéo
ffmpeg -i source.mov -ss 1 -frames:v 1 -vf "scale=1920:-2" -q:v 4 hero.jpg
```

Une photo : exporte en JPEG, 1920 px de large, qualité 75 à 80.

## WebP / AVIF (facultatif)

Pour une photo, tu peux ajouter une version `.webp` et/ou `.avif` **à côté du `.jpg`, avec le même nom**
(par exemple `revente.webp`), puis l'activer dans `src/content/home.ts` :

```ts
revente: { image: { ...photo("revente"), formats: ["avif", "webp", "jpg"] }, tone: "calm" },
```

N'active un format que si le fichier existe : le navigateur ne retombe pas sur le JPEG si une version listée est absente.

## Aujourd'hui

`hero.jpg` et `hero.mp4` sont les anciens fichiers de l'accueil (vertical 1280×2276, vidéo de 33 s et 6,7 Mo),
déplacés ici pour que le hero ne soit pas vide. Remplace-les par les nouveaux. Les autres fichiers n'existent pas encore.
