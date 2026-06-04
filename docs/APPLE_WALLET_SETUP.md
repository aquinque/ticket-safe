# Apple Wallet — setup

The buyer email and `/my-tickets` page already render an **Add to Apple
Wallet** button. The button points to
`/functions/v1/wallet-pass?ticket=<id>&type=apple`, which generates a
real `.pkpass` file the moment four secrets are set in Supabase.

Until then, the button shows a friendly "Apple Wallet — setup pending"
page that links the buyer back to the online QR. Everything else
(email, scan at the door, refunds) works without Apple Wallet.

---

## What you need from Apple (one-time, ~30 min)

1. **Apple Developer Program** — $99/year. Sign up at
   <https://developer.apple.com/programs/>.

2. **Create a Pass Type ID** in *Certificates, Identifiers & Profiles*:
   - Identifiers → "+" → **Pass Type IDs** → register
     `pass.eu.ticket-safe.event` (or any reverse-DNS string you like).

3. **Generate a signing certificate** for that Pass Type ID:
   - On a Mac, open **Keychain Access** → *Certificate Assistant* →
     **Request a Certificate From a Certificate Authority…**
     Save the `.certSigningRequest` (CSR) file.
   - Back in the Apple Developer site, on your Pass Type ID, click
     *Create Certificate*, upload the CSR, then download the
     `.cer` file Apple gives you.
   - Double-click the `.cer` to import it into Keychain.

4. **Export cert + private key as a `.p12`**:
   - In Keychain Access, expand the imported certificate to reveal the
     private key. Select **both** the cert and the key → right-click →
     *Export 2 items…* → save as `pass.p12` (set a password).

5. **Convert `.p12` to PEM** (the format we paste into Supabase). In a
   Terminal:

   ```bash
   # Extract cert (only the leaf is required by node-forge)
   openssl pkcs12 -in pass.p12 -clcerts -nokeys -out pass-cert.pem
   # Extract the private key (decrypted)
   openssl pkcs12 -in pass.p12 -nocerts -nodes -out pass-key.pem
   ```

   Open both files in a text editor.

6. **Find your Team ID**: <https://developer.apple.com/account> → top
   right corner, 10-char string like `ABCDE12345`.

---

## Paste secrets into Supabase

[Supabase Dashboard → Edge Functions → Secrets](https://supabase.com/dashboard/project/lgmnatfvdzzjzyxlenry/settings/functions),
add **four** secrets (no prefix, no extra whitespace, include the
`-----BEGIN/END-----` lines):

| Name | Value |
|---|---|
| `APPLE_PASS_TYPE_ID` | `pass.eu.ticket-safe.event` (or whatever you registered) |
| `APPLE_TEAM_ID` | your 10-char team id |
| `APPLE_PASS_CERT_PEM` | full contents of `pass-cert.pem` |
| `APPLE_PASS_KEY_PEM` | full contents of `pass-key.pem` |

Optional — branded PNG icons / logos as base64. If you skip these, the
function generates solid-colour placeholders matching the event's primary
colour.

| Name | Expected dimensions |
|---|---|
| `APPLE_WALLET_ICON_29_BASE64` | 29 × 29 PNG |
| `APPLE_WALLET_ICON_58_BASE64` | 58 × 58 PNG |
| `APPLE_WALLET_ICON_87_BASE64` | 87 × 87 PNG |
| `APPLE_WALLET_LOGO_160_BASE64` | 160 × 50 PNG (top-left of the pass) |
| `APPLE_WALLET_LOGO_320_BASE64` | 320 × 100 PNG (retina) |

To base64-encode a PNG:

```bash
base64 -w 0 ts-icon-29.png > ts-icon-29.b64
```

then paste the contents of `ts-icon-29.b64` as the secret value.

---

## Test

1. Pick a paid ticket id from `event_tickets` (the `id` column).
2. Open in Safari on iPhone:
   `https://lgmnatfvdzzjzyxlenry.supabase.co/functions/v1/wallet-pass?ticket=<id>&type=apple`
3. iOS should download the file as `ticket-XXXXXXXX.pkpass` and prompt
   *Add* to Wallet.

If iOS refuses the pass:
- Open Console.app on a connected Mac, filter by `PassKit`.
- Common errors: wrong `passTypeIdentifier`, wrong `teamIdentifier`,
  expired cert, missing image dimension.
- The function returns 200 + an HTML fallback only on env-misconfig.
  If you get the binary back but iOS rejects it, the credentials are
  set but something else is off.

---

## Google Wallet

Google Wallet support uses a different mechanism (JWT signed save link
through Google Wallet API). To add it later:

1. Create a Google Cloud project, enable **Google Wallet API**.
2. Create a service account, download the JSON key.
3. Register an Event Ticket Class via the Wallet API.
4. Add a `GOOGLE_WALLET_ISSUER_ID` + service account secret in Supabase.
5. Extend `wallet-pass/index.ts` `type === "google"` branch to mint a
   `https://pay.google.com/gp/v/save/<jwt>` link and 302 to it.

Not blocking for launch — Apple covers ~half of mobile in EU/FR
audiences and the in-email QR + `/my-tickets` covers the rest.
