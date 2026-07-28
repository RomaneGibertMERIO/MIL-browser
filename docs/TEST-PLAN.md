# MIL-Browser — Plan de recette guidé (version de livraison)

Parcours **séquentiel** pour valider **toute** l'application, en partant de l'app
**remise à zéro**. Chaque étape : **action** + **✅ ce que tu dois observer**. Coche
`☐ → ☑` et note tout écart dans l'**Annexe anomalies**.

> Cette version intègre tous les correctifs de la recette précédente. Tout est
> censé passer : c'est une **passe de validation complète** avant livraison.

**Légende :** ✅ = attendu · `☐` = à cocher · ⚠️ = piège fréquent.

**États :** **Standalone** (aucun dépôt) · **Online/Shared** (dépôt configuré et
joignable) · **Offline** (dépôt configuré mais injoignable).

---

## Section 0 — Préparation

### 0.1 Build À JOUR (indispensable)
- ☐ **Dev** : `npm install` → `npm run dev` (terminal 1) + `npx electron .` (terminal 2)
- ☐ **Packagé** : `npm run electron:build` → lancer l'exe de `release/`
- ☐ Console debug : `F12`

### 0.2 Remise à zéro
- ☐ Fermer l'app, puis :
  ```powershell
  Remove-Item "$env:APPDATA\mil-browser" -Recurse -Force
  ```
- ☐ **Créer** un dossier central de test **vide** : `C:\milrepo-central` (il doit exister — l'app ne le crée plus toute seule).

> Identités multiples (rôles) : via `MIL_BROWSER_USER` si tu peux lancer des scripts ; sinon, teste avec ton compte courant.

---

## Section 1 — Premier lancement (Standalone)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 1.1 | Lancer l'app | Browser + standards built-in en colonne 1 ; aucune erreur | ☐ |
| 1.2 | En-tête du Browser | Badge **« Read-Only »** **+ badge « Standalone »** (gris) | ☐ |
| 1.3 | Manage → rail | **Sync et Admin absents** (Standalone) ; Home/Edit/Settings présents | ☐ |
| 1.4 | Pied de page | Version + crédits | ☐ |

---

## Section 2 — Browser : navigation & cartes

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 2.1 | Sélectionner une norme | **Panneau info = infos du standard** (organisation, label, description, nb de nœuds, badge **Built-in**) | ☐ |
| 2.2 | Descendre dans l'arbre | Colonnes enfants ; défilement auto | ☐ |
| 2.3 | Sélectionner un nœud | Info nœud (code, type, **badge Built-in**, image/description) | ☐ |
| 2.4 | Sélectionner un profil | **Carte** : nom + badge **Built-in** + **« Last modified by »** + groupes de champs | ☐ |
| 2.5 | Badge profil built-in (liste + carte) | **« Built-in »** (gris) partout — jamais « Official » | ☐ |
| 2.6 | Toggle graphe / table / les deux | OK ; table zébrée, mono | ☐ |
| 2.7 | Arbre grisé vs contenu | Structure plus grise que le panneau info | ☐ |

---

## Section 3 — Browser : recherche

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 3.1 | Requête 3+ caractères courants | **Aucun écran blanc** ; résultats Nodes + Profiles | ☐ |
| 3.2 | Valeur de champ / cellule dataset | Le profil remonte (balaye tout) | ☐ |
| 3.3 | Cliquer un résultat | Navigue / ouvre | ☐ |
| 3.4 | Croix de recherche | Retour browser | ☐ |

---

## Section 4 — Browser : épingles & redimensionnement

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 4.1 | Épingler 2-3 profils | Cartes comparatives, largeur égale | ☐ |
| 4.2 | Replier / retirer une épingle | Redistribution sans débordement | ☐ |
| 4.3 | Glisser le séparateur | Poignée bleue au survol ; largeurs mini respectées | ☐ |
| 4.4 | Relâcher hors fenêtre | Pas de drag « collé » | ☐ |

---

## Section 5 — Multi-fenêtre

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 5.1 | Bouton **« New window »** dans la barre d'outils | Présent (app de bureau) | ☐ |
| 5.2 | Sélectionner une norme → New window | 2e fenêtre Browser **pré-sélectionnée sur cette norme** (norme en bleu + infos affichées) | ☐ |
| 5.3 | Déplacer la 2e fenêtre sur un autre écran | 2 normes en parallèle | ☐ |

> ⚠️ 5.2 : à confirmer sur le build à jour (correctif de passage de paramètre + infos standard). Si la norme n'est pas pré-sélectionnée, note-le.

---

## Section 6 — Management : coquille

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 6.1 | Manage / rail / ← Browser | Navigation OK ; item actif bleu ; titre correct | ☐ |
| 6.2 | Badges en-tête (Standalone) | Standalone ; pas de badge rôle | ☐ |
| 6.3 | Home | Identité (rôle, dépôt, session) ; cartes gatées | ☐ |
| 6.4 | Home en Standalone | **Sync et Admin ABSENTS** des cartes (pas de liens morts) | ☐ |

---

## Section 7 — Edit : Taxonomie (à faire AVANT les profils)

**Précondition :** Manage → Edit → onglet **Taxonomy**. *(On crée d'abord un standard + son schéma pour pouvoir créer des profils ensuite.)*

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 7.1 | Basculer sur Taxonomy | Miller éditable des nœuds ; profils masqués | ☐ |
| 7.2 | Créer un standard + des nœuds (`+`) | Créés en **Local** | ☐ |
| 7.3 | Fin de branche → « Customize expected fields » | Édition du schéma par nœud (champs + colonnes dataset) | ☐ |
| 7.4 | Ajouter une **image** à un nœud | Upload OK, image affichée ; ⚠️ pas de gel | ☐ |
| 7.5 | Supprimer un nœud **avec** profils attachés | **Bloqué** avec message (« déplacer/supprimer les profils d'abord ») | ☐ |
| 7.6 | Supprimer un nœud **sans** profil | **Confirmation** puis suppression | ☐ |
| 7.7 | Save / Cancel | Zone d'action cohérente | ☐ |

---

## Section 8 — Edit : Profils

**Précondition :** Manage → Edit → onglet **Profiles**.

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 8.1 | Colonnes avec ligne `+` | + New standard / node / profile | ☐ |
| 8.2 | Créer un profil, remplir | Aperçu vivant (chart/table/champs) | ☐ |
| 8.3 | Schéma **sans** colonnes dataset | La zone Dataset est **masquée** | ☐ |
| 8.4 | Coller un tableau dans DatasetEditor | Parseur détecte le séparateur | ☐ |
| 8.5 | Save | Statut **Local (jaune)** ; **« Last modified by » = ton nom de session** (pas « User ») | ☐ |
| 8.6 | Rouvrir, modifier, Cancel | Modifs annulées ; zone Save/Cancel fixe | ☐ |
| 8.7 | Éditer un profil **built-in** → Save | Copie **Local** ; l'original built-in est **masqué** ; bandeau **« copie d'un built-in »** avec **View original** + **Restore built-in** (couleur neutre) | ☐ |
| 8.8 | View original / Restore built-in | View = carte du built-in ; Restore = confirmation → l'original réapparaît | ☐ |
| 8.9 | Supprimer un profil | Dialogue in-app ; suppression effective | ☐ |

---

## Section 9 — Settings

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 9.1 | Cartes Data / Git / Session / About | Présentes | ☐ |
| 9.2 | **Export** | Bouton passe à **« Exporting… »** puis fichier JSON | ☐ |
| 9.3 | **Import** d'un JSON | **Confirmation d'écrasement** avant import ; puis import | ☐ |
| 9.4 | Session name | Lecture seule | ☐ |

---

## Section 10 — Passage en Online + publication du socle

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 10.1 | Settings → chemin `C:\milrepo-central` → Save | Badge **Shared (vert)** ; **Sync et Admin apparaissent** ; carte « Your access » cohérente (« Admin → Users », rôle en clair) | ☐ |
| 10.2 | Aller sur **Synchronization** | **Bannière « dépôt vide → Publish »** présente | ☐ |
| 10.3 | Cliquer **Publish** → confirmer | Bannière disparaît | ☐ |
| 10.4 | Vérifier `C:\milrepo-central` | Dossiers **`standards/` ET `profiles/` remplis** (tout le socle publié, pas seulement les standards) | ☐ |

---

## Section 11 — Cycle collaboratif : soumission (Write)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 11.1 | Créer/modifier un profil | Statut Local (jaune) | ☐ |
| 11.2 | Synchronization : 3 colonnes, cases décochées | Liste des changements | ☐ |
| 11.3 | Cliquer un profil **modifié** | **Carte colorée** : vert = ajouté, rouge barré = supprimé, **jaune = modifié avec `(was: …)`** | ☐ |
| 11.4 | Cliquer un standard modifié | Diff manifeste (grille, pas de JSON brut) | ☐ |
| 11.5 | Filtre / tri | La liste se filtre/trie | ☐ |
| 11.6 | Cocher → « Send modifications to admin » | Objets → **Pending (orange)** ; fichiers dans `C:\milrepo-central\profiles` | ☐ |

---

## Section 12 — Admin : Review

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 12.1 | Admin → Review | File cohérente ; libellés **Created / Modified** corrects | ☐ |
| 12.2 | Sélectionner une soumission | **Carte** (profil = carte + graphe ; standard = grille manifeste) — plus de JSON brut | ☐ |
| 12.3 | Une modification | **Diff coloré** dans la carte (comme 11.3) | ☐ |
| 12.4 | **Approve** | Objet **Official (vert)** ; toast ; retiré de la file | ☐ |
| 12.5 | **Reject** + motif | Modale in-app ; motif obligatoire ; pas de gel ; Echap ferme | ☐ |

---

## Section 13 — Admin : History

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 13.1 | Onglet History | Timeline des commits réels | ☐ |
| 13.2 | Filtre **All / Submitted / Approved** | Filtre la liste | ☐ |
| 13.3 | Entrées | Badge **Submitted** (orange) / **Approved** (vert) + auteur + date + hash | ☐ |
| 13.4 | Langue | **Anglais uniquement** | ☐ |

---

## Section 14 — Admin : Users

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 14.1 | Users | Sessions listées | ☐ |
| 14.2 | Libellés rôle | **Read Only / Write / Admin** | ☐ |
| 14.3 | Changer un rôle | Icône check sur l'actif | ☐ |
| 14.4 | Ta session | Marquée « (you) » | ☐ |
| 14.5 | Retirer le dernier admin | **Refusé** avec message | ☐ |

---

## Section 15 — Refus : retour à l'auteur

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 15.1 | Admin rejette une proposition avec un motif | — | ☐ |
| 15.2 | L'auteur (même poste ou autre identité) resynchronise | **Toast** « Your proposal … was rejected: motif » | ☐ |
| 15.3 | Ouvrir le profil refusé (carte) | **Bannière « Rejected by … : motif »** | ☐ |

---

## Section 16 — États Offline & transitions

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 16.1 | **Renommer** `C:\milrepo-central` (injoignable) puis agir/synchro | Badge **Offline** ; **Sync/Admin masqués** ; **push refusé avec message** (plus de push « dans le vide ») | ☐ |
| 16.2 | Créer une modif Offline | S'accumule en Local | ☐ |
| 16.3 | Restaurer le dossier + resynchro | Repasse Shared ; push possible | ☐ |
| 16.4 | Saisir un chemin **inexistant** dans Settings | Passe **Offline** (dossier requis, non créé) | ☐ |
| 16.5 | Effacer le chemin | Repasse **Standalone** ; brouillons locaux conservés | ☐ |

---

## Section 17 — Rôles & permissions (si identités multiples possibles)

| # | Rôle | ✅ Attendu | ☐ |
|---|------|-----------|----|
| 17.1 | Read Only | Browse ; pas d'Edit/Sync/Admin ; accès Settings/chemin | ☐ |
| 17.2 | Write | + Edit + Sync ; pas d'Admin | ☐ |
| 17.3 | Admin | + Admin | ☐ |
| 17.4 | Rôle abaissé en cours de session | Vue inaccessible → redirection Home | ☐ |

---

## Section 18 — Suppressions & propagation (idéalement 2 identités)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 18.1 | Supprimer un objet officiel (Online) | Suppression + tombstone dans le dépôt | ☐ |
| 18.2 | Synchroniser une autre identité | L'objet disparaît aussi | ☐ |

---

## Section 19 — Robustesse / non-régression

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 19.1 | Suppressions / refus / imports | Toujours des dialogues in-app (jamais alert/confirm/prompt natifs) | ☐ |
| 19.2 | Dépôt sur lecteur lent/injoignable | UI reste réactive (pas de gel 30-60 s) | ☐ |
| 19.3 | Éditer un profil d'un standard illustré | Pas de gel | ☐ |
| 19.4 | Provoquer une erreur de rendu | **Error Boundary** : message + « Try again » (pas d'écran blanc) | ☐ |

---

## Section 20 — Accessibilité (vérifs rapides)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 20.1 | Statuts | Couleur **+ texte/pastille** | ☐ |
| 20.2 | Clavier (Tab) | Contrôles atteignables ; focus visible | ☐ |
| 20.3 | Boutons icône | `aria-label` présent | ☐ |
| 20.4 | Dialogue | Focus piégé ; Echap ferme | ☐ |

---

## Annexe — Journal des anomalies

| # | Section/# | Sévérité | Description | Repro | Statut |
|---|-----------|----------|-------------|-------|--------|
|  |  |  |  |  |  |
|  |  |  |  |  |  |

---

### Points à confirmer sur ce build (résolus en code, à valider en vrai)
- ☐ **5.2** multi-fenêtre : la 2e fenêtre s'ouvre bien pré-sélectionnée sur la norme.
- ☐ **11.3 / 12.3** diff coloré (le jaune « modifié » n'apparaît que sur des objets **modifiés après ce build**, le temps que la version de référence se capture).

### Checklist finale de livraison
- ☐ Sections 1→20 cochées.
- ☐ Aucune anomalie bloquante/majeure ouverte.
- ☐ Testé au moins une fois sur la **version packagée**.
