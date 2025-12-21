# Guide de Sécurité et Confidentialité - ticket-safe

## 🛡️ Vue d'ensemble

Ce document décrit toutes les mesures de sécurité et de protection de la confidentialité mises en place dans **ticket-safe** pour protéger les données des utilisateurs contre les attaques et violations de données.

## 📋 Table des matières

1. [Architecture de Sécurité](#architecture-de-sécurité)
2. [Protection des Données Personnelles](#protection-des-données-personnelles)
3. [Chiffrement](#chiffrement)
4. [Authentification et Autorisation](#authentification-et-autorisation)
5. [Protection contre les Attaques](#protection-contre-les-attaques)
6. [Audit et Logging](#audit-et-logging)
7. [Conformité RGPD](#conformité-rgpd)
8. [Gestion des Incidents](#gestion-des-incidents)
9. [Bonnes Pratiques](#bonnes-pratiques)

---

## Architecture de Sécurité

### Défense en Profondeur (Defense in Depth)

L'application utilise plusieurs couches de sécurité :

```
┌─────────────────────────────────────────────┐
│  1. HTTP Headers Security (CSP, HSTS)      │
├─────────────────────────────────────────────┤
│  2. Client-side Validation & Sanitization  │
├─────────────────────────────────────────────┤
│  3. CSRF Protection                         │
├─────────────────────────────────────────────┤
│  4. Authentication (Supabase Auth)          │
├─────────────────────────────────────────────┤
│  5. Row Level Security (RLS)                │
├─────────────────────────────────────────────┤
│  6. Edge Functions (Server-side)            │
├─────────────────────────────────────────────┤
│  7. Database Encryption (PGP)               │
├─────────────────────────────────────────────┤
│  8. Audit Logging                           │
└─────────────────────────────────────────────┘
```

### Principe du Moindre Privilège

- Les utilisateurs n'ont accès qu'à leurs propres données
- Les politiques RLS appliquent les permissions au niveau base de données
- Les Edge Functions s'exécutent avec le minimum de permissions nécessaires

---

## Protection des Données Personnelles

### Données Sensibles Chiffrées

Toutes les données personnelles sensibles sont chiffrées au repos :

| Donnée              | Méthode de Chiffrement | Table                    |
| ------------------- | ---------------------- | ------------------------ |
| Numéro de téléphone | PGP Symmetric          | `encrypted_user_data`    |
| Adresse             | PGP Symmetric          | `encrypted_user_data`    |
| Documents d'identité| PGP Symmetric          | `encrypted_user_data`    |
| Infos de paiement   | PGP Symmetric          | `encrypted_user_data`    |
| Mots de passe       | bcrypt (Supabase Auth) | `auth.users`             |
| Tokens JWT          | HS256 Signature        | `secure_tickets`         |

### Chiffrement des Communications

- **HTTPS obligatoire** : Toutes les communications sont chiffrées avec TLS 1.3
- **HSTS** : Force l'utilisation de HTTPS pour toutes les requêtes futures
- **Certificate Pinning** : (Recommandé pour production)

---

## Chiffrement

### Chiffrement au Repos

**Base de données PostgreSQL** :
```sql
-- Chiffrer des données
SELECT encrypt_data('sensitive data', 'encryption_key');

-- Déchiffrer des données
SELECT decrypt_data(encrypted_column, 'encryption_key');
```

**Fonctions de chiffrement** :
- `pgp_sym_encrypt()` - Chiffrement symétrique PGP
- `pgp_sym_decrypt()` - Déchiffrement symétrique PGP
- SHA-256 pour les hashs non réversibles

### Gestion des Clés

```bash
# Générer une clé de chiffrement sécurisée
openssl rand -base64 32 > encryption.key

# Stocker dans Supabase Edge Functions Secrets
# Dashboard -> Edge Functions -> Secrets -> Add Secret
# Name: DATA_ENCRYPTION_KEY
# Value: [votre clé générée]
```

**Rotation des clés** :
- Les clés de chiffrement doivent être rotées tous les 90 jours
- Champ `encryption_key_version` dans `encrypted_user_data` pour gérer les versions

### Chiffrement en Transit

- **TLS 1.3** pour toutes les connexions HTTP
- **WebSocket Secure (WSS)** pour les connexions temps réel Supabase
- **Certificate Transparency** pour détecter les certificats frauduleux

---

## Authentification et Autorisation

### Authentification Multi-Facteurs (MFA)

```typescript
// Activer MFA pour un utilisateur
const { data, error } = await supabase.auth.mfa.enroll({
  factorType: 'totp',
  friendlyName: 'Mon Authenticator',
});

// Vérifier le code MFA
await supabase.auth.mfa.verify({
  factorId: data.id,
  challengeId: challenge.id,
  code: '123456',
});
```

### Politique de Mots de Passe

**Exigences minimales** :
- Au moins 8 caractères
- Au moins 1 majuscule
- Au moins 1 minuscule
- Au moins 1 chiffre
- Au moins 1 caractère spécial
- Pas de mots de passe communs (password, 123456, etc.)

**Validation côté client** :
```typescript
import { security } from '@/lib/security';

const result = security.checkPasswordStrength(password);
// result.isStrong: boolean
// result.score: 0-6
// result.feedback: string[]
```

### Row Level Security (RLS)

Toutes les tables sensibles ont des politiques RLS :

```sql
-- Exemple : utilisateurs peuvent lire leurs propres données
CREATE POLICY "Users can read own data"
  ON encrypted_user_data
  FOR SELECT
  USING (auth.uid() = user_id);

-- Empêcher la lecture des données d'autres utilisateurs
CREATE POLICY "Users cannot read others' data"
  ON encrypted_user_data
  FOR SELECT
  USING (false);
```

### Gestion des Sessions

- **Expiration automatique** : Sessions expirées après 7 jours d'inactivité
- **Device Fingerprinting** : Détection de changements de device
- **Tokens refresh** : Rotation automatique des tokens toutes les heures
- **Déconnexion sur tous les appareils** : Fonctionnalité disponible

```typescript
// Obtenir toutes les sessions actives
const { data: sessions } = await supabase
  .from('user_sessions')
  .select('*')
  .eq('user_id', user.id)
  .eq('is_active', true);

// Révoquer une session
await supabase
  .from('user_sessions')
  .update({ is_active: false })
  .eq('id', sessionId);
```

---

## Protection contre les Attaques

### 1. Cross-Site Scripting (XSS)

**Prévention** :
```typescript
import { security } from '@/lib/security';

// Nettoyer les entrées utilisateur
const cleanInput = security.sanitizeInput(userInput);

// Échapper le HTML
const escapedHtml = security.escapeHtml(dangerousString);

// Nettoyer le HTML (autorise certaines balises)
const cleanHtml = security.sanitizeHtml(htmlString);
```

**Content Security Policy (CSP)** :
```
Content-Security-Policy:
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net;
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  img-src 'self' data: https: blob:;
```

### 2. Cross-Site Request Forgery (CSRF)

**Implémentation** :
```typescript
// Générer et stocker un token CSRF
const csrfToken = security.generateCsrfToken();
security.storeCsrfToken(csrfToken);

// Inclure dans les requêtes
const response = await fetch('/api/sensitive-action', {
  method: 'POST',
  headers: {
    'X-CSRF-Token': security.getCsrfToken(),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(data),
});

// Vérifier côté serveur
const tokenValid = security.verifyCsrfToken(requestToken);
```

### 3. SQL Injection

**Protection automatique** :
- Supabase client utilise des requêtes paramétrées
- Aucune concaténation de strings SQL
- Validation des entrées

**Validation supplémentaire** :
```typescript
if (!security.isSqlSafe(userInput)) {
  throw new Error('Invalid input detected');
}
```

### 4. Clickjacking

**Headers HTTP** :
```
X-Frame-Options: DENY
Content-Security-Policy: frame-ancestors 'none'
```

**Détection côté client** :
```typescript
// Empêcher le chargement dans une iframe
security.preventClickjacking();
```

### 5. Brute Force

**Rate Limiting** :
```typescript
// Limiter les tentatives de connexion
const canAttempt = security.rateLimiter.check('login:' + email, {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000, // 15 minutes
});

if (!canAttempt) {
  throw new Error('Too many attempts. Try again in 15 minutes.');
}
```

**Blocage automatique d'IP** :
```sql
-- Bloquer une IP après 5 tentatives échouées
INSERT INTO ip_blocklist (ip_address, reason, block_type, blocked_until)
VALUES ('192.168.1.1', 'Brute force attack', 'AUTO', NOW() + INTERVAL '1 hour');
```

### 6. Open Redirect

**Validation des redirections** :
```typescript
// Valider que l'URL est du même domaine
if (!security.isSafeRedirectUrl(redirectUrl)) {
  throw new Error('Invalid redirect URL');
}
```

---

## Audit et Logging

### Journal d'Accès aux Données

Tous les accès aux données sensibles sont enregistrés :

```sql
SELECT * FROM data_access_log
WHERE user_id = '...'
ORDER BY accessed_at DESC
LIMIT 100;
```

**Colonnes enregistrées** :
- `user_id` - Qui a accédé
- `accessed_user_id` - Données de qui
- `access_type` - READ, WRITE, DELETE, EXPORT
- `resource_type` - Type de ressource
- `ip_address` - Adresse IP
- `is_suspicious` - Activité suspecte détectée
- `risk_score` - Score de risque (0-100)

### Détection d'Activités Suspectes

**Patterns détectés** :
- Tentatives de connexion multiples échouées
- Accès excessif aux données (>100 requêtes/5min)
- Changements de localisation impossibles
- Utilisation d'outils d'automatisation
- DevTools ouverts (modification client-side)

**Fonction de détection** :
```typescript
const { isSuspicious, reasons } = security.detectSuspiciousActivity();

if (isSuspicious) {
  console.warn('Suspicious activity detected:', reasons);
  // Log l'incident
  // Bloquer l'accès si nécessaire
}
```

### Incidents de Sécurité

```sql
-- Créer un incident
INSERT INTO security_incidents (
  incident_type,
  severity,
  user_id,
  ip_address,
  description
) VALUES (
  'BRUTE_FORCE',
  'HIGH',
  '...',
  '192.168.1.1',
  'Multiple failed login attempts detected'
);

-- Consulter les incidents
SELECT * FROM security_incidents
WHERE severity IN ('HIGH', 'CRITICAL')
AND status = 'OPEN'
ORDER BY detected_at DESC;
```

---

## Conformité RGPD

### Droits des Utilisateurs

#### 1. Droit d'Accès (Article 15)

Exporter toutes les données d'un utilisateur :

```typescript
// Appeler l'Edge Function
const response = await fetch(
  `${supabaseUrl}/functions/v1/privacy-request`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_type: 'EXPORT',
    }),
  }
);

const { export_data } = await response.json();
// export_data contient toutes les données de l'utilisateur
```

#### 2. Droit à l'Effacement (Article 17)

Demander la suppression de toutes les données :

```typescript
const response = await fetch(
  `${supabaseUrl}/functions/v1/privacy-request`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_type: 'DELETE',
      reason: 'Je souhaite supprimer mon compte',
    }),
  }
);

// Délai de grâce de 30 jours avant suppression définitive
```

#### 3. Droit à l'Anonymisation

Anonymiser les données (alternative à la suppression) :

```typescript
const response = await fetch(
  `${supabaseUrl}/functions/v1/privacy-request`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      request_type: 'ANONYMIZE',
    }),
  }
);

// Les données personnelles sont supprimées, l'historique anonymisé est conservé
```

### Consentements

Gestion des consentements utilisateurs :

```sql
-- Vérifier le consentement
SELECT * FROM user_consents
WHERE user_id = '...'
AND consent_type = 'MARKETING'
AND status = 'granted';

-- Révoquer un consentement
UPDATE user_consents
SET status = 'revoked', revoked_at = NOW()
WHERE user_id = '...' AND consent_type = 'MARKETING';
```

### Politiques de Rétention

```sql
SELECT * FROM data_retention_policies;
```

| Resource Type         | Retention (jours) | Auto-Delete |
| --------------------- | ----------------- | ----------- |
| SCAN_LOGS             | 365               | ✅           |
| DATA_ACCESS_LOG       | 730               | ✅           |
| SECURITY_INCIDENTS    | 1825              | ❌           |
| USER_SESSIONS         | 90                | ✅           |
| RATE_LIMIT_TRACKING   | 30                | ✅           |

**Nettoyage automatique** :
```sql
-- Exécuter manuellement
SELECT cleanup_old_data();

-- Ou via cron job (recommandé : quotidien)
```

---

## Gestion des Incidents

### Procédure en Cas de Violation de Données

1. **Détection** : Les systèmes automatiques détectent l'incident
2. **Containment** : Blocage automatique de l'IP/utilisateur
3. **Investigation** : Analyser les logs dans `security_incidents`
4. **Notification** : Informer les utilisateurs affectés (RGPD : sous 72h)
5. **Remédiation** : Corriger la vulnérabilité
6. **Post-mortem** : Documenter et améliorer les processus

### Vérification des Logs

```sql
-- Incidents récents
SELECT * FROM security_incidents
WHERE detected_at > NOW() - INTERVAL '24 hours'
ORDER BY severity DESC, detected_at DESC;

-- Activités suspectes
SELECT * FROM data_access_log
WHERE is_suspicious = TRUE
AND accessed_at > NOW() - INTERVAL '7 days'
ORDER BY risk_score DESC;

-- IPs bloquées
SELECT * FROM ip_blocklist
WHERE blocked_until > NOW()
ORDER BY blocked_at DESC;
```

### Contacts d'Urgence

En cas d'incident de sécurité :
- Email : security@ticket-safe.eu
- Téléphone : +33 X XX XX XX XX (24/7)
- PGP Key : [Clé publique pour communications chiffrées]

---

## Bonnes Pratiques

### Pour les Développeurs

1. **Ne jamais logger de données sensibles** :
   ```typescript
   // ❌ Mauvais
   console.log('User data:', userData);

   // ✅ Bon
   console.log('User data loaded for user:', userId);
   ```

2. **Toujours valider les entrées** :
   ```typescript
   if (!security.isValidEmail(email)) {
     throw new Error('Invalid email format');
   }
   ```

3. **Utiliser des requêtes paramétrées** :
   ```typescript
   // ✅ Bon (Supabase le fait automatiquement)
   await supabase.from('users').select('*').eq('id', userId);

   // ❌ Jamais faire ça
   await supabase.rpc('raw_query', { query: `SELECT * FROM users WHERE id = '${userId}'` });
   ```

4. **Chiffrer les données sensibles** :
   ```typescript
   // Avant de stocker
   const encrypted = await encrypt_data(sensitiveData, encryptionKey);
   await supabase.from('encrypted_user_data').insert({ data: encrypted });
   ```

5. **Limiter les permissions** :
   ```sql
   -- Utiliser RLS sur toutes les tables
   ALTER TABLE my_table ENABLE ROW LEVEL SECURITY;

   CREATE POLICY "Users own data only"
     ON my_table
     FOR ALL
     USING (auth.uid() = user_id);
   ```

### Pour les Utilisateurs

1. **Utiliser un mot de passe fort** : 12+ caractères, lettres, chiffres, symboles
2. **Activer MFA** : Protège même si le mot de passe est compromis
3. **Vérifier les sessions actives** : Déconnecter les appareils inconnus
4. **Ne jamais partager son compte** : Chaque personne doit avoir son compte
5. **Signaler les activités suspectes** : Email à security@ticket-safe.eu

### Checklist de Déploiement

Avant de déployer en production :

- [ ] HTTPS activé avec certificat valide
- [ ] Headers de sécurité configurés
- [ ] RLS activé sur toutes les tables
- [ ] Secrets stockés dans Supabase Vault (pas dans le code)
- [ ] Rate limiting configuré
- [ ] Logging d'audit activé
- [ ] Politique de sauvegarde en place
- [ ] Plan de réponse aux incidents documenté
- [ ] Tests de sécurité effectués (OWASP Top 10)
- [ ] Dépendances à jour (pas de vulnérabilités connues)

```bash
# Vérifier les vulnérabilités
npm audit

# Mettre à jour les dépendances
npm update
npm audit fix
```

---

## Ressources

### Documentation

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [RGPD - Texte officiel](https://eur-lex.europa.eu/eli/reg/2016/679/oj)

### Outils de Test

- [OWASP ZAP](https://www.zaproxy.org/) - Scanner de vulnérabilités
- [Burp Suite](https://portswigger.net/burp) - Test de sécurité web
- [npm audit](https://docs.npmjs.com/cli/v8/commands/npm-audit) - Vérification des dépendances

### Monitoring

- Supabase Dashboard → Logs
- Supabase Dashboard → Database → RLS Policies
- Supabase Dashboard → Authentication → Users

---

## Support

Pour toute question sur la sécurité :
- Documentation technique : [docs/SECURE_TICKET_SYSTEM.md](./SECURE_TICKET_SYSTEM.md)
- Rapporter une vulnérabilité : security@ticket-safe.eu (PGP encryption recommandée)
- Issues GitHub : https://github.com/ticket-safe/issues (pour bugs non-sécuritaires uniquement)

**Responsible Disclosure** : Si vous découvrez une vulnérabilité, merci de nous contacter en privé avant toute divulgation publique.
