# Checklist de Déploiement Sécurisé - ticket-safe

## 🚀 Avant le déploiement en production

### 1. Configuration de Base de Données

- [ ] Exécuter la migration de sécurité
  ```bash
  # Via Supabase Dashboard ou CLI
  supabase db push
  ```

- [ ] Vérifier que RLS est activé sur toutes les tables
  ```sql
  SELECT tablename, rowsecurity
  FROM pg_tables
  WHERE schemaname = 'public';
  ```

- [ ] Générer une clé de chiffrement sécurisée
  ```bash
  openssl rand -base64 32
  ```

### 2. Configuration des Secrets Supabase

Aller dans **Supabase Dashboard → Project Settings → Edge Functions → Secrets**

Ajouter les secrets suivants :

- [ ] `TICKET_SIGNING_SECRET` - Clé pour signer les tickets JWT
  ```bash
  openssl rand -base64 32
  ```

- [ ] `DATA_ENCRYPTION_KEY` - Clé pour chiffrer les données sensibles
  ```bash
  openssl rand -base64 32
  ```

- [ ] `SUPABASE_SERVICE_ROLE_KEY` - Déjà présent (ne pas partager!)

### 3. Variables d'Environnement

Créer un fichier `.env` (NE PAS committer!) :

```bash
# Supabase
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_anon_key

# Revolut (optionnel)
VITE_REVOLUT_API_KEY=votre_key
VITE_REVOLUT_API_BASE=https://merchant.revolut.com/api/1.0

# Sécurité (NE PAS exposer côté client)
TICKET_SIGNING_SECRET=votre_secret_32_bytes
DATA_ENCRYPTION_KEY=votre_key_32_bytes
```

### 4. Déploiement des Edge Functions

```bash
# Déployer generate-secure-ticket
supabase functions deploy generate-secure-ticket

# Déployer validate-scan
supabase functions deploy validate-scan

# Déployer privacy-request
supabase functions deploy privacy-request
```

### 5. Configuration du Domaine

- [ ] Configurer le domaine personnalisé (ticket-safe.eu)
- [ ] Activer HTTPS/SSL
- [ ] Configurer le certificat SSL (Let's Encrypt ou autre)
- [ ] Activer HSTS
  ```
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
  ```

### 6. Headers de Sécurité HTTP

Vérifier que `public/_headers` est déployé et appliqué :

```bash
# Tester les headers
curl -I https://ticket-safe.eu
```

Headers attendus :
- ✅ `Content-Security-Policy`
- ✅ `X-Frame-Options: DENY`
- ✅ `X-Content-Type-Options: nosniff`
- ✅ `X-XSS-Protection`
- ✅ `Strict-Transport-Security`

### 7. Configuration Supabase Auth

**Dashboard → Authentication → Settings**

- [ ] **Email Templates** : Personnaliser les emails
- [ ] **Redirect URLs** : Ajouter `https://ticket-safe.eu/*`
- [ ] **Password Requirements** :
  - Minimum 8 caractères
  - Complexité activée
- [ ] **Rate Limiting** :
  - Max 5 tentatives de connexion par heure
- [ ] **Enable MFA** : Activer l'authentification multi-facteurs

### 8. Configuration RLS (Row Level Security)

Vérifier les politiques RLS :

```sql
-- Lister toutes les politiques
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public';
```

Tables critiques devant avoir RLS :
- ✅ `encrypted_user_data`
- ✅ `data_access_log`
- ✅ `security_incidents`
- ✅ `user_sessions`
- ✅ `secure_tickets`
- ✅ `purchases`

### 9. Tests de Sécurité

#### Test 1 : Protection XSS
```javascript
// Tenter d'injecter du JavaScript
const malicious = "<script>alert('XSS')</script>";
// Doit être échappé/nettoyé
```

#### Test 2 : Protection CSRF
```bash
# Tenter une requête sans token CSRF
curl -X POST https://ticket-safe.eu/api/sensitive \
  -H "Content-Type: application/json" \
  -d '{"action":"delete"}'
# Doit être rejeté
```

#### Test 3 : SQL Injection
```javascript
// Tenter une injection SQL
const malicious = "'; DROP TABLE users; --";
// Doit être bloqué
```

#### Test 4 : Brute Force
```bash
# Tenter 10 connexions rapides
for i in {1..10}; do
  curl -X POST https://ticket-safe.eu/auth/login \
    -d '{"email":"test@test.com","password":"wrong"}'
done
# Doit être rate-limité après 5 tentatives
```

### 10. Monitoring et Alertes

- [ ] Configurer des alertes pour :
  - Tentatives de connexion multiples échouées
  - Accès suspect aux données
  - Erreurs 500 répétées
  - Utilisation excessive de ressources

- [ ] Vérifier les logs quotidiennement
  ```sql
  SELECT * FROM security_incidents
  WHERE detected_at > NOW() - INTERVAL '24 hours'
  ORDER BY severity DESC;
  ```

### 11. Sauvegardes

- [ ] Activer les sauvegardes automatiques dans Supabase
- [ ] Tester la restauration d'une sauvegarde
- [ ] Documenter la procédure de restauration

### 12. Documentation

- [ ] Partager la documentation de sécurité avec l'équipe
- [ ] Former les admins sur la gestion des incidents
- [ ] Créer un plan de réponse aux incidents

### 13. Conformité RGPD

- [ ] Page de politique de confidentialité mise à jour
- [ ] Page de mentions légales
- [ ] Banner de consentement cookies
- [ ] Procédure de traitement des demandes RGPD documentée
- [ ] Désignation d'un DPO (Data Protection Officer)

### 14. Tests Finaux

```bash
# Scanner de vulnérabilités
npm audit

# Mettre à jour les dépendances
npm update
npm audit fix

# Vérifier les CVEs
npx snyk test

# Build de production
npm run build

# Test local de prod
npm run preview
```

### 15. Go Live Checklist

- [ ] DNS configuré et propagé
- [ ] SSL/TLS actif
- [ ] Tous les secrets en place
- [ ] RLS activé
- [ ] Edge Functions déployées
- [ ] Headers de sécurité configurés
- [ ] Tests de sécurité passés
- [ ] Monitoring actif
- [ ] Plan de sauvegarde en place
- [ ] Documentation à jour
- [ ] Équipe formée

## 🔒 Post-Déploiement

### Première Semaine

- [ ] Jour 1 : Surveiller les logs d'erreurs
- [ ] Jour 2 : Vérifier les incidents de sécurité
- [ ] Jour 3 : Analyser les patterns d'utilisation
- [ ] Jour 7 : Premier audit de sécurité

### Mensuel

- [ ] Revoir les incidents de sécurité du mois
- [ ] Mettre à jour les dépendances
- [ ] Vérifier les certificats SSL
- [ ] Analyser les logs d'accès suspects
- [ ] Nettoyer les anciennes données (conformément aux politiques de rétention)

### Trimestriel

- [ ] Rotation des clés de chiffrement
- [ ] Audit de sécurité complet
- [ ] Revoir les politiques RLS
- [ ] Former l'équipe sur les nouvelles menaces
- [ ] Tester le plan de réponse aux incidents

## 🆘 En Cas d'Incident

1. **Détection** : Identifier l'incident dans les logs
2. **Isolation** : Bloquer l'IP/utilisateur concerné
3. **Investigation** : Analyser l'étendue
4. **Notification** : Informer les utilisateurs affectés (72h RGPD)
5. **Remédiation** : Corriger la faille
6. **Documentation** : Post-mortem et amélioration

## 📞 Contacts d'Urgence

- Équipe de sécurité : security@ticket-safe.eu
- Supabase Support : https://supabase.com/support
- CNIL (France) : https://www.cnil.fr/

## 📚 Ressources

- [Documentation Sécurité](./SECURITY.md)
- [Système de Tickets Sécurisés](./SECURE_TICKET_SYSTEM.md)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [RGPD](https://www.cnil.fr/fr/reglement-europeen-protection-donnees)

---

**Date de dernière mise à jour** : 2025-12-21
**Version** : 1.0.0
**Responsable** : Équipe ticket-safe
