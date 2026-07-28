# MIL-Browser — Plan de recette guidé (pas à pas)

Parcours **séquentiel** pour vérifier **toutes** les fonctionnalités avant livraison,
en partant de l'application **remise à zéro**. Chaque étape indique **l'action** à faire
et **✅ ce que tu dois observer**. Coche `☐ → ☑` et note tout écart dans l'**Annexe
anomalies** en bas.

> **Suis les sections dans l'ordre** : elles construisent l'état les unes sur les autres
> (Standalone → édition locale → mise en ligne → collaboration → hors-ligne).

**Légende :** ✅ = résultat attendu · `☐` = à cocher · 🐞 = bug **connu** à confirmer ·
⚠️ = piège fréquent.

**Vocabulaire d'état (important) :**
- **Standalone** = aucun dépôt configuré (ta machine, hors collaboration). *C'est l'état
  d'une app remise à zéro.*
- **Online (Shared)** = dépôt central configuré **et** joignable.
- **Offline** = dépôt configuré **mais** injoignable (on travaille sur le dernier état synchronisé).

---

## Section 0 — Préparation (à faire une seule fois)

### 0.1 Lancer le build À JOUR
Les correctifs récents (History en anglais, badge « Built-in ») ne sont visibles qu'avec le code à jour.
- ☐ **Dev** : terminal 1 `npm install` puis `npm run dev` ; terminal 2 `npx electron .`
- ☐ **Packagé** : `npm run electron:build`, puis installer/lancer l'exe généré dans `release/`.
- ☐ Ouvrir la console de debug : `F12` (utile pour repérer les erreurs).

### 0.2 Remettre l'app à zéro (état bare)
- ☐ **Fermer complètement l'app.**
- ☐ Supprimer les données d'exécution :
  ```powershell
  Remove-Item "$env:APPDATA\mil-browser" -Recurse -Force
  ```
  > Version packagée (productName « MIL Browser ») → vider aussi `%APPDATA%\MIL Browser` si présent.

### 0.3 Outils pour la recette
- ☐ **Dossier central de test** (pour la partie collaboration) : créer un dossier vide, ex. `C:\milrepo-central`.
- ☐ **Simuler des identités** (rôles) sur un seul poste, via la variable `MIL_BROWSER_USER` :
  ```powershell
  $env:MIL_BROWSER_USER="alice"; npx electron .      # (ou lancer l'exe portable)
  ```
- ☐ **Journal** en cas de souci : `%APPDATA%\mil-browser\logs\renderer.log`.

---

## Section 1 — Premier lancement (Standalone)

**Précondition :** app remise à zéro (0.2), build à jour lancé.

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 1.1 | Lancer l'app | Le **Browser** s'ouvre, les **standards built-in** sont présents en colonne 1 (ex. MIL-STD-810H). Aucune erreur, pas d'écran blanc | ☐ |
| 1.2 | Regarder l'en-tête / badge dépôt | Badge **Standalone** (gris). Le bouton **Manage** est visible | ☐ |
| 1.3 | Ouvrir Manage → regarder le rail | **Sync et Admin ABSENTS** du rail (normal en Standalone). Présents : Home, Edit, Settings | ☐ |
| 1.4 | Regarder le pied de page | **Version** + **crédits** affichés | ☐ |
| 1.5 | Revenir au Browser | Bouton retour fonctionne | ☐ |

---

## Section 2 — Browser : navigation Miller (lecture seule)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 2.1 | Cliquer une norme (col. 1) | Sélection en **bleu** ; la colonne des nœuds racine apparaît à droite | ☐ |
| 2.2 | Descendre dans l'arbre (nœuds) | Chaque clic révèle la colonne enfant ; défilement auto vers la nouvelle colonne | ☐ |
| 2.3 | Atteindre une feuille | Une colonne **Profils** apparaît (profils rattachés au nœud) | ☐ |
| 2.4 | Regarder le badge d'un profil built-in | 🐞 Doit afficher **« Built-in »** (gris) — **PAS** « Official » (vert). *(C'était le bug corrigé.)* | ☐ |
| 2.5 | Comparer l'aspect arbre vs contenu | La zone taxonomie (structure) est **plus grise / moins contrastée** que le panneau Informations | ☐ |
| 2.6 | Sélectionner un nœud (pas un profil) | Le panneau **Informations** affiche le nœud (guidage / image éventuelle) | ☐ |
| 2.7 | Sélectionner un profil | **Carte Profil** : nom + badge **Built-in** + « last modified by » + groupes de champs | ☐ |
| 2.8 | Vérifier la cohérence carte vs liste | La carte et la ligne de liste affichent **le même** libellé (« Built-in ») | ☐ |
| 2.9 | Basculer graphe / table / les deux | La vue change ; table zébrée, cellules numériques en police mono | ☐ |
| 2.10 | Cliquer « expand » sur le graphe | Overlay plein écran ; fermeture OK | ☐ |
| 2.11 | 🐞 Regarder la **pastille** de la ligne standard | *Point de vigilance connu :* un standard built-in peut afficher une pastille **jaune « Local »** (statut non défini). À signaler si gênant (correctif roll-up prévu) | ☐ |

---

## Section 3 — Browser : recherche globale

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 3.0 | 🐞 Taper une requête courante de **3+ caractères** (déclenche l'affichage des résultats) | **Aucun écran blanc** ; les résultats s'affichent. *(Régression corrigée : crash `dataset` non protégé au rendu.)* | ☐ |
| 3.1 | Taper un mot présent dans un profil (nom/description) | Résultats en 2 sections : **Nodes** et **Profiles** | ☐ |
| 3.2 | Chercher une valeur de champ ou une cellule de dataset | Le profil correspondant remonte (la recherche balaye **tous** les champs et cellules) | ☐ |
| 3.3 | Cliquer un résultat | Navigue vers le nœud / ouvre le profil | ☐ |
| 3.4 | Badge des profils dans les résultats | 🐞 Built-in = **« Built-in »** (même correctif qu'en 2.4) | ☐ |
| 3.5 | Cliquer la croix de recherche | Retour au browser normal | ☐ |

---

## Section 4 — Browser : épingles & comparaison

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 4.1 | Épingler un profil (icône pin) | Une carte de comparaison apparaît à droite | ☐ |
| 4.2 | Épingler un 2e / 3e profil | Cartes côte à côte, largeur égale | ☐ |
| 4.3 | Replier une épingle | Réduite à une barre fine ; ré-ouverture OK | ☐ |
| 4.4 | Retirer une épingle | Panneau retiré ; les autres se **redistribuent** sans débordement | ☐ |
| 4.5 | Épingler depuis les résultats de recherche | Fonctionne aussi depuis la recherche | ☐ |

---

## Section 5 — Browser : redimensionnement (docking)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 5.1 | Glisser le séparateur Miller / zone droite | Redimensionne ; la poignée **reste atteignable** ; largeurs mini respectées (aucun panneau ne disparaît) | ☐ |
| 5.2 | Survoler une poignée | Elle passe en **bleu** au survol | ☐ |
| 5.3 | Démarrer un glissement et relâcher **hors** de la fenêtre | Le geste se termine proprement (pas de drag « collé ») | ☐ |
| 5.4 | Réduire fortement la fenêtre | Les panneaux gardent leur largeur mini ; contenu toujours accessible | ☐ |

---

## Section 6 — Multi-fenêtre (Phase 7)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 6.1 | Dans le Browser, repérer le bouton **« New window »** | Présent dans la barre d'outils (app de bureau) | ☐ |
| 6.2 | Sélectionner une norme puis cliquer « New window » | Une **2e fenêtre** s'ouvre sur le Browser, **pré-sélectionnée sur cette norme** | ☐ |
| 6.3 | Cliquer « New window » sans norme active | 2e fenêtre s'ouvre sur l'accueil Browser | ☐ |
| 6.4 | Déplacer la 2e fenêtre sur un autre écran | Deux normes consultables en parallèle | ☐ |
| 6.5 | Faire une modif de données via Manage dans une fenêtre | Après rafraîchissement, l'autre fenêtre reflète la même base (base partagée) | ☐ |

---

## Section 7 — Management : coquille & navigation

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 7.1 | Ouvrir Manage | Rail à gauche ; en-tête avec titre de la page + badges | ☐ |
| 7.2 | Cliquer chaque destination du rail | Item actif en **bleu** ; titre de page correct | ☐ |
| 7.3 | Bouton « ← Browser » | Revient au Browser | ☐ |
| 7.4 | Badges d'en-tête (Standalone) | Badge **Standalone** ; pas de badge rôle (normal hors Shared) | ☐ |

---

## Section 8 — Home

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 8.1 | Ouvrir Home | Carte d'identité : « You are … », lien du dépôt, **nom de session** (lecture seule) | ☐ |
| 8.2 | Regarder les cartes « what you can do » | Liens vers Edit/Settings (et Sync/Admin **seulement** si accessibles) | ☐ |

---

## Section 9 — Edit database : mode Profils (création locale)

**Précondition :** toujours en Standalone. Manage → **Edit** → onglet **Profiles**.

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 9.1 | Regarder les colonnes | Miller éditable avec une **ligne `+`** en bas de chaque colonne | ☐ |
| 9.2 | « + New standard » | Crée une nouvelle norme **locale** | ☐ |
| 9.3 | « + New node here » sur une colonne | Ajoute un nœud enfant à ce niveau | ☐ |
| 9.4 | Aller en fin de branche → « + New profile » | Ouvre l'éditeur de profil | ☐ |
| 9.5 | Remplir des champs | L'**aperçu vivant** (chart/table/champs) se met à jour | ☐ |
| 9.6 | Dans DatasetEditor, **coller** un tableau (depuis Excel/CSV) | Le parseur détecte le séparateur (tab/virgule/espace) et remplit les lignes | ☐ |
| 9.7 | Taper rapidement / gros dataset | ⚠️ **Pas de gel** ni de lag de frappe | ☐ |
| 9.8 | Cliquer **Save** | Le profil est enregistré ; statut **Local (jaune)** ; « last modified by » = toi | ☐ |
| 9.9 | Rouvrir un profil, modifier, **Cancel** | Les modifs sont annulées ; zone Save/Cancel **fixe** (haut-droite) | ☐ |
| 9.10 | Éditer un profil **built-in** puis Save | Il devient une **copie locale** : badge **Built-in → Local (jaune)** | ☐ |
| 9.11 | Supprimer un profil | **Dialogue de confirmation in-app** (pas de popup natif) ; suppression effective | ☐ |

---

## Section 10 — Edit database : mode Taxonomie (engrenage)

**Précondition :** Manage → Edit → onglet **Taxonomy**.

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 10.1 | Basculer sur Taxonomy | Miller éditable des **nœuds** ; **profils masqués** | ☐ |
| 10.2 | Ajouter / renommer / supprimer un nœud | Modifications appliquées ; suppression confirmée par dialogue | ☐ |
| 10.3 | Fin de branche → « Customize expected fields » | Édition du **schéma par nœud** (champs profil + colonnes dataset) | ☐ |
| 10.4 | Ajouter une **image** à un nœud | Upload OK ; l'image s'affiche ; ⚠️ **pas de gel** | ☐ |
| 10.5 | Éditer un profil d'un standard **avec images** | ⚠️ **Pas de gel** à l'ouverture/édition (fix images) | ☐ |
| 10.6 | Save / Cancel | Même **zone d'action** qu'en mode Profils (cohérence) | ☐ |

---

## Section 11 — Settings (données)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 11.1 | Manage → Settings | Cartes : Data, Git repository, Session, About/version | ☐ |
| 11.2 | **Export merged** | Fichier JSON téléchargé (local + online combinés) | ☐ |
| 11.3 | **Export online-only** | Fichier JSON des seuls enregistrements officiels (vide/limité en Standalone) | ☐ |
| 11.4 | **Import** d'un JSON | Import OK ; dialogue d'écrasement si conflit | ☐ |
| 11.5 | Champ **Session name** | Affiché en **lecture seule** | ☐ |

---

## Section 12 — Passage en Online : créer le dépôt central

**Objectif :** transformer le Standalone en collaboration.

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 12.1 | Créer un dossier vide `C:\milrepo-central` (fait en 0.3) | — | ☐ |
| 12.2 | Settings → « Git Network Repository Location » → saisir `C:\milrepo-central` → **Save** | Chemin enregistré ; l'app crée `profiles/` et `standards/` dans le dossier | ☐ |
| 12.3 | Regarder le badge dépôt | Passe à **Shared (vert)** ; **Sync et Admin APPARAISSENT** dans le rail | ☐ |
| 12.4 | Aller sur **Synchronization** | Une **bannière** signale que le dépôt central est **vide** et propose **« Publish »** | ☐ |
| 12.5 | Cliquer « Publish » → confirmer | Le socle built-in est **publié** comme base officielle partagée ; la bannière disparaît | ☐ |
| 12.6 | Vérifier le dossier `C:\milrepo-central\standards` | Contient des fichiers `standard-*.json` | ☐ |

---

## Section 13 — Cycle collaboratif : soumission (rôle Write)

**Précondition :** Online. *(Absence d'`admins.json` ⇒ tu es admin ; c'est OK pour la recette.)*

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 13.1 | Créer/éditer un profil (Section 9) | Statut **Local (jaune)** | ☐ |
| 13.2 | Aller sur **Synchronization** | Colonnes Standards / Taxonomy / Profiles listant tes changements ; cases **décochées par défaut** | ☐ |
| 13.3 | Cliquer un objet modifié | **Comparaison DiffView** : ancien **barré (rouge)** / nouveau **coloré** | ☐ |
| 13.4 | Tester **filtre / tri** (standard/date/type/statut) | La liste se filtre/trie | ☐ |
| 13.5 | Cocher des objets → **« Send modifications to admin »** | Les objets passent en **Pending (orange)** | ☐ |
| 13.6 | Vérifier `C:\milrepo-central\profiles` | Le fichier proposé y est copié | ☐ |

---

## Section 14 — Admin : Review (validation)

**Précondition :** Manage → **Admin** → onglet **Review**.

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 14.1 | Regarder l'écran | Liste des soumissions ; style **design system** (pas d'emoji, coins `rounded-lg`, couleurs sémantiques) | ☐ |
| 14.2 | Sélectionner une soumission « Created » | Propriétés proposées + dataset éventuel | ☐ |
| 14.3 | Sélectionner une « Modified » | **Diff champ par champ** (original barré rouge / proposé vert) | ☐ |
| 14.4 | Cliquer **Approve** | L'objet devient **Official (vert)** ; toast succès ; retiré de la file | ☐ |
| 14.5 | Sur une autre, cliquer **Reject** | **Modale de motif** in-app (pas de `prompt` natif) ; motif obligatoire | ☐ |
| 14.6 | Taper dans la modale de refus | ⚠️ **Pas de gel** de la zone de texte ; **Echap** ferme | ☐ |
| 14.7 | Confirmer le refus | Toast ; l'objet quitte la file | ☐ |
| 14.8 | (Optionnel) Rendre le dossier central injoignable puis approuver | Bannière d'erreur ; **la proposition RESTE** dans la file (aucun faux succès) | ☐ |

---

## Section 15 — Admin : History (git:log)

**Précondition :** avoir fait ≥ 1 soumission et ≥ 1 validation (Sections 13-14).

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 15.1 | Ouvrir l'onglet **History** | Timeline des commits réels (spinner bref puis liste) | ☐ |
| 15.2 | Regarder une entrée de soumission | Badge **« Submitted »** (orange), auteur, date, hash court | ☐ |
| 15.3 | Regarder une entrée de validation | Badge **« Approved »** (vert) | ☐ |
| 15.4 | 🐞 Vérifier la **langue** | **Tout en anglais** (`Proposal: profile "…"`, `Approval: standard "…"`) — **aucun français** | ☐ |
| 15.5 | Ordre | Du plus récent au plus ancien | ☐ |

> ⚠️ Si tu vois encore du français ici : tu testes probablement d'anciens commits générés avant reset, **ou** un build non reconstruit. Refais 0.2 (reset) + relance le build à jour.

---

## Section 16 — Admin : Users (comptes & rôles)

**Précondition :** pour voir plusieurs sessions, relance l'app sous une 2e identité (0.3, `MIL_BROWSER_USER`) et laisse-la se synchroniser une fois.

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 16.1 | Ouvrir **Users** | Liste des sessions ayant contacté le dépôt | ☐ |
| 16.2 | Regarder les libellés de rôle | **Read Only / Write / Admin** (le rôle interne `testing` s'affiche **« Write »**) | ☐ |
| 16.3 | Changer le rôle d'une session | Mise à jour ; **icône check** sur l'actif (pas de glyphe ☑/☐) | ☐ |
| 16.4 | Repérer ta propre session | Marquée **« (you) »** | ☐ |
| 16.5 | Tenter de te retirer le **dernier** rôle admin | **Refusé** avec message explicite | ☐ |

---

## Section 17 — Rôles & permissions (matrice guidée)

**Méthode :** relancer l'app sous différentes identités (`MIL_BROWSER_USER`) en **Online**, après leur avoir attribué un rôle (Section 16).

| # | Rôle simulé | ✅ Attendu | ☐ |
|---|-------------|-----------|----|
| 17.1 | **Read Only** | Browse OK ; **pas** d'Edit/Sync/Admin dans le rail ; peut quand même ouvrir Settings et régler le chemin du dépôt | ☐ |
| 17.2 | **Write** | + Edit + Sync (push de propositions) ; **pas** d'Admin | ☐ |
| 17.3 | **Admin** | + Admin (Review/History/Users) | ☐ |
| 17.4 | Forcer l'UI d'une action interdite (ex. rôle abaissé pendant la session) | La vue devient inaccessible → **redirection vers Home** | ☐ |

---

## Section 18 — État Offline (vrai) & transitions

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 18.1 | App Online, puis **renommer** `C:\milrepo-central` (le rendre injoignable) et relancer | Badge **Offline (orange)** ; **Sync et Admin masqués** ; données du dernier état synchronisé visibles | ☐ |
| 18.2 | Créer une modif en Offline | S'accumule en **Local** (poussable plus tard) | ☐ |
| 18.3 | Restaurer le dossier central et relancer | Repasse **Shared** ; Sync/Admin reviennent ; tu peux pousser les modifs accumulées | ☐ |
| 18.4 | Effacer le chemin du dépôt (Settings) | Repasse **Standalone** ; contenu officiel disparaît ; brouillons locaux conservés ; socle réinstallé si besoin | ☐ |

---

## Section 19 — Suppressions & propagation (idéalement 2 identités)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 19.1 | En Online, supprimer un objet **officiel** | Suppression locale **+ tombstone** déposée dans le dépôt central | ☐ |
| 19.2 | Synchroniser une **autre** identité | L'objet disparaît aussi chez elle (propagation de la suppression) | ☐ |
| 19.3 | Refuser une proposition (14.5) puis synchroniser l'auteur | L'auteur voit le **refus + motif** | ☐ |

---

## Section 20 — Robustesse / non-régression (transverse)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 20.1 | Parcourir suppressions / refus / imports | Toujours des **dialogues in-app** (jamais `alert`/`confirm`/`prompt` natifs) | ☐ |
| 20.2 | Pointer le dépôt sur un lecteur **lent/injoignable** et agir | L'UI **reste réactive** (clavier + souris), pas de blocage de 30-60 s | ☐ |
| 20.3 | Éditer un profil d'un standard **illustré** | Pas de gel (images hors payloads) | ☐ |
| 20.4 | Provoquer une erreur (si possible) | **Error Boundary** contient l'erreur (pas de page blanche globale) | ☐ |

---

## Section 21 — Accessibilité (vérifs rapides)

| # | Action | ✅ Attendu | ☐ |
|---|--------|-----------|----|
| 21.1 | Regarder les statuts | Toujours **couleur + texte/pastille** (jamais couleur seule) | ☐ |
| 21.2 | Naviguer au **clavier** (Tab) | Tous les contrôles atteignables ; **anneau de focus** visible | ☐ |
| 21.3 | Boutons icône (pin, close, collapse) | `aria-label` présent (lecteur d'écran) | ☐ |
| 21.4 | Ouvrir un dialogue | Focus piégé dans le dialogue ; **Echap** ferme | ☐ |

---

## Section 22 — Bugs connus à confirmer / clore

Points déjà identifiés — vérifier qu'ils sont OK (corrigés) ou les documenter :

| # | Point | Attendu après correctifs | ☐ |
|---|-------|--------------------------|----|
| 22.1 | Badge des **profils built-in** (liste + recherche) | **« Built-in »** (corrigé) | ☐ |
| 22.2 | Langue de l'onglet **History** | Anglais uniquement (corrigé) | ☐ |
| 22.3 | **Pastille des standards built-in** | **Corrigé :** plus de pastille « Local » jaune sur un built-in (dot seulement si local/pending) | ☐ |
| 22.4 | Onglet History **hors Electron** (si testé en navigateur) | Message « History is unavailable outside the desktop application » | ☐ |
| 22.5 | **Error Boundary** (spec §25) | Provoquer une erreur de rendu → message d'erreur **+ bouton « Try again »** (pas d'écran blanc) | ☐ |
| 22.6 | **Crash recherche** | Corrigé (voir 3.0) : requête longue = pas d'écran blanc | ☐ |

---

## Annexe — Journal des anomalies

| # | Section/# | Sévérité (bloquant/majeur/mineur) | Description | Étapes de repro | Statut |
|---|-----------|-----------------------------------|-------------|------------------|--------|
|  |  |  |  |  |  |
|  |  |  |  |  |  |
|  |  |  |  |  |  |

---

### Rappel final avant livraison
- ☐ Toutes les sections 1→21 cochées.
- ☐ Aucun bug **bloquant/majeur** ouvert dans l'annexe.
- ☐ Décision prise sur le point 22.3 (pastille standards built-in).
- ☐ Test refait au moins une fois sur la **version packagée** (pas seulement en dev).
