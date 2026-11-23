# Platform Security Architecture & Guidelines
## Missive Digital SEO Intelligence Platform

This document describes the defensive controls, cryptographic algorithms, tenant isolation boundaries, and security practices implemented across the Missive Digital SEO Intelligence Platform.

---

## 1. Authentication & Session Security

```
[ Client Request: POST /api/v1/auth/login ]
                    │
                    ▼
       [ Argon2id Hash Verification ]
      (memoryCost: 65536, timeCost: 3)
                    │
                    ├──> Generates 15-Min JWT Access Token (Returned in JSON payload)
                    │
                    └──> Generates 7-Day Cryptographic Refresh Token
                         │
                         ├──> Stored as SHA-256 Hash in `RefreshToken` Table
                         │
                         └──> Delivered as HttpOnly, Secure, SameSite Cookie
```

### Access & Refresh Token Lifecycle
- **Access Tokens:** Short-lived (15 minutes). Held strictly in client memory (Redux state). Signed with `JWT_SECRET`.
- **Refresh Tokens:** Long-lived (7 days). Stored in the database solely as a **SHA-256 hash** (`tokenHash`). Delivered to the browser inside an **HttpOnly**, **Secure**, **SameSite=Lax** cookie.
- **Refresh Token Rotation:** Every refresh invocation revokes the consumed token and issues a new token pair.
- **Compromise & Reuse Detection:** If an already-revoked refresh token is presented, the system triggers a **Security Alert** and immediately invalidates all active sessions for that user account (`revokedAt = NOW()`).

### Password Storage
- Passwords are encrypted using **Argon2id** (`argon2.hash(password, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 4 })`).
- Plaintext passwords never appear in logs, error payloads, or database dumps.

---

## 2. Role-Based Access Control (RBAC)

The platform implements granular role-based access control across 5 tiers:

| Role | Workspace Scope | Key Capabilities | Client Boundary |
| :--- | :--- | :--- | :--- |
| **Super Admin** | Global (All Workspaces) | Complete platform control, tenant override, user management | Global unrestricted |
| **Admin** | Active Workspace | Client/Website creation, team invitations, billing, branding | All workspace clients |
| **SEO Manager** | Active Workspace | Run sync, execute SEO analysis, generate reports, AI consultation | Assigned clients only (`ClientMember`) |
| **Executive** | Active Workspace | View dashboards, export reports, view high-level KPIs | Assigned clients only (`ClientMember`) |
| **Viewer** | Active Workspace | Read-only dashboard access | Assigned clients only (`ClientMember`) |

### Enforcement Points
- Route-level middleware (`requirePermission('permission.key')` or `requireAnyPermission([...])`).
- Checks user roles, system permissions, and active workspace memberships.

---

## 3. Multi-Tenant & Multi-Client Data Isolation

Data isolation is guaranteed through a defense-in-depth model:

1. **Workspace Boundary Enforcement:**
   - Every protected API endpoint inspects the active `workspaceId`.
   - `requireWorkspaceAccess` validates that the requesting user holds an active membership in the target workspace.
   - Attempts to access other workspaces are blocked with `403 Forbidden`.

2. **Client Assignment Scoping:**
   - Non-admin users (SEO Managers, Executives, Viewers) are restricted to clients explicitly assigned to them in the `ClientMember` table.
   - `requireClientAccess` and `requireWebsiteAccess` block access to unassigned client assets with `403 Forbidden`.

3. **Enumeration Prevention (404 Masking):**
   - Querying a website or client ID that belongs to another workspace returns `404 Not Found` rather than `403 Forbidden`, preventing malicious users from probing valid tenant resource IDs.

---

## 4. Cryptographic Credential Protection

All third-party integration credentials (Google OAuth refresh tokens, Microsoft Clarity API tokens) are encrypted before writing to MySQL:

- **Algorithm:** **AES-256-GCM** (Authenticated Galois/Counter Mode).
- **Initialization Vector:** 16-byte cryptographically random IV generated per encryption operation.
- **Authentication Tag:** 16-byte authentication tag verifying ciphertext authenticity and protecting against bit-flipping attacks.
- **Master Key:** 32-byte (64 hex characters) `ENCRYPTION_KEY` held exclusively in secure server environment memory.

```javascript
// Verification: AES-256-GCM authenticated cipher
const cipher = crypto.createCipheriv('aes-256-gcm', keyBuffer, iv);
const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
const tag = cipher.getAuthTag();
// Stored format: iv:tag:ciphertext
```

---

## 5. Input Validation & Injection Defenses

### Spreadsheet Formula Injection Defense (CWE-1236)
Spreadsheet applications (Microsoft Excel, Google Sheets, LibreOffice) can execute formulas when opening untrusted CSV or XLSX files.
- `sanitizeCellValue()` intercepts all string values written to report cells.
- Any value starting with `=`, `+`, `-`, `@`, `\t`, or `\r` is automatically prepended with a single quote (`'`), forcing the spreadsheet application to treat the cell strictly as literal text.

### AI Prompt Injection Defense
User inquiries submitted to the local AI assistant are sanitized through `AIGuardrailService`:
- Regex filters intercept DAN jailbreaks, instruction overrides (`/ignore previous instructions/i`), system overrides, and delimiter manipulation.
- Grounded prompts instruct the model to answer exclusively based on verified SQL data.

### Request Body Validation (Zod)
- All incoming HTTP payloads are validated against strict Zod schemas.
- Extra unexpected fields are stripped.
- In production, validation errors return structured 400 Bad Request messages with zero internal database errors or stack trace leaks.

---

## 6. Edge Security & Network Protections

- **TLS 1.3 / Modern Ciphers:** Nginx terminates HTTPS using TLS 1.3 with forward secrecy.
- **Strict Transport Security (HSTS):** `max-age=63072000; includeSubDomains; preload`.
- **Content Security Policy (CSP):** `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;`.
- **Rate Limiting:**
  - Authentication endpoints: 5 requests per 15 minutes per IP (`limit_req_zone` + `express-rate-limit`).
  - General API: 100 requests per 15 minutes per IP.
- **Loopback Enforcement:** Local Ollama daemon binds strictly to `127.0.0.1:11434`, inaccessible from external networks.
