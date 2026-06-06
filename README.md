# AuthForge

**A custom OAuth 2.0 and OpenID Connect Identity Provider built from scratch.**

TypeScript · Node.js · Express.js · PostgreSQL · Drizzle ORM · JWT (RS256)

---

## Overview

AuthForge is a fully functional Identity Provider (IdP) that implements the OAuth 2.0 Authorization Code Flow and the OpenID Connect (OIDC) Core specification. It was built from the ground up — no Passport.js, no Auth0 SDK, no identity scaffolding libraries.

The project exists to answer a specific question: what does it actually take to build an OAuth 2.0 server that other applications can delegate authentication to? The answer involves key pair generation, JWT signing, token lifecycle management, authorization code validation, application registration, and a discovery endpoint that makes the whole thing self-describing.

AuthForge can act as an IdP for any client application that implements the OAuth 2.0 Authorization Code Flow — the same pattern used by Google, GitHub, and every major identity provider.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AuthForge (IdP)                          │
│                                                                 │
│   ┌─────────────┐   ┌──────────────┐   ┌──────────────────┐   │
│   │  Auth Layer  │   │  Token Layer  │   │  Discovery Layer  │   │
│   │             │   │              │   │                  │   │
│   │ /o/authorize│   │ /o/tokeninfo │   │ /.well-known/    │   │
│   │ /o/authenticate  │ /o/token     │   │ openid-config    │   │
│   │             │   │ /o/userinfo  │   │ jwks.json        │   │
│   └─────────────┘   └──────────────┘   └──────────────────┘   │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐  │
│   │                      Admin Layer                         │  │
│   │  POST /admin/application   GET /admin/applications       │  │
│   │  DELETE /admin/application/:id   /regenerate-secret      │  │
│   └─────────────────────────────────────────────────────────┘  │
│                                                                 │
│   PostgreSQL  ←→  Drizzle ORM  ←→  RS256 Key Pair (PEM)       │
└─────────────────────────────────────────────────────────────────┘
          ▲                              ▲
          │                              │
   Client Applications           Developer Dashboard
```

**Identity Provider** — AuthForge is the single source of truth for user identity. It issues signed JWTs, validates credentials, and exposes a JWKS endpoint so relying parties can verify tokens without calling back to the server.

**Client Applications** — Any application registers with AuthForge to receive a `client_id` and `client_secret`. These credentials are used to initiate the authorization flow and exchange authorization codes for tokens.

**Authorization Flow** — A client redirects users to `/o/authorize` with a `client_id`, `redirect_uri`, and `response_type=code`. AuthForge validates the client, authenticates the user, and issues a single-use authorization code.

**Token Flow** — The client exchanges the authorization code for an access token and a refresh token via `/o/tokeninfo`. Access tokens are RS256-signed JWTs valid for one hour. Refresh tokens are opaque 64-byte hex strings valid for 30 days and stored in the database.

---

## OAuth 2.0 Authorization Code Flow

```
Client Application
      │
      │  GET /o/authorize?client_id=...&redirect_uri=...
      │  &response_type=code&state=...&nonce=...
      ▼
AuthForge — validates client_id and redirect_uri
      │
      │  Renders authentication page
      ▼
User authenticates (email + password)
      │
      │  AuthForge generates authorization code (32-byte hex, 5 min TTL)
      │  Marks code as associated with user + client
      ▼
Redirect → redirect_uri?code=AUTH_CODE&state=...
      │
      ▼
Client Application
      │
      │  POST /o/tokeninfo
      │  { code, client_secret }
      ▼
AuthForge — validates code ownership, expiry, and single-use constraint
      │
      │  Marks code as used
      │  Issues RS256-signed access token (1 hour)
      │  Issues opaque refresh token (30 days)
      ▼
Client Application receives { access_token, refresh_token }
      │
      │  GET /o/userinfo
      │  Authorization: Bearer <access_token>
      ▼
AuthForge verifies JWT signature, returns user claims
```

---

## Features

### OAuth 2.0
- **Authorization Code Flow** — the only grant type supported; implicit and client credentials are intentionally excluded
- **Single-use authorization codes** — codes are marked used on first exchange; replay attempts return a 400
- **Code expiry** — authorization codes expire after 5 minutes
- **Redirect URI validation** — the redirect URI submitted at authorization must match the registered URI exactly

### OpenID Connect
- **UserInfo endpoint** — returns OIDC-standard claims (`sub`, `email`, `email_verified`, `given_name`, `family_name`, `name`, `picture`)
- **ID token claims** — access tokens include OIDC standard claims and are usable as ID tokens
- **Nonce support** — nonce is accepted at authorization and stored with the authorization code
- **Discovery endpoint** — `/.well-known/openid-configuration` returns a standards-compliant discovery document
- **JWKS endpoint** — `/.well-known/jwks.json` exposes the public key in JWK format for token verification

### Token Management
- **RS256-signed JWTs** — access tokens are signed with a 2048-bit RSA private key; verification uses the public key available at the JWKS endpoint
- **Refresh tokens** — opaque 64-byte random tokens, stored in the database, valid for 30 days
- **Token refresh endpoint** — `POST /o/token` accepts `grant_type=refresh_token` and issues a new access token

### Application Management
- **Application registration** — authenticated users can register client applications and receive a `client_id` (UUID) and `client_secret` (32-byte hex)
- **Secret regeneration** — `client_secret` can be rotated without changing the `client_id`
- **Ownership enforcement** — all admin operations check that the requesting user owns the target application
- **Developer dashboard** — a web interface for registering and managing OAuth applications

### Authentication
- **Session cookies** — the developer dashboard uses `httpOnly`, `SameSite=lax` session cookies backed by RS256 JWTs
- **Password hashing** — passwords are hashed with SHA-256 and a per-user random salt

---

## API Reference

### Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/.well-known/openid-configuration` | OpenID Connect discovery document |
| `GET` | `/.well-known/jwks.json` | Public key in JWK Set format |

**Discovery document response:**
```json
{
  "issuer": "http://localhost:3000",
  "authorization_endpoint": "http://localhost:3000/o/authorize",
  "userinfo_endpoint": "http://localhost:3000/o/userinfo",
  "jwks_uri": "http://localhost:3000/.well-known/jwks.json",
  "response_types_supported": ["code"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"]
}
```

### Authorization

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/o/authorize` | Initiates Authorization Code Flow |

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `client_id` | Yes | Registered application client ID |
| `redirect_uri` | Yes | Must match the registered redirect URI exactly |
| `response_type` | Yes | Must be `code` |
| `state` | Recommended | Opaque value returned to client after redirect |
| `nonce` | No | Stored with the authorization code |

### Token

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/o/tokeninfo` | Exchange authorization code for tokens |
| `POST` | `/o/token` | Refresh access token using refresh token |

**`POST /o/tokeninfo` request body:**
```json
{
  "code": "authorization_code_value",
  "client_secret": "your_client_secret"
}
```

**Response:**
```json
{
  "access_token": "<RS256 JWT>",
  "refresh_token": "<opaque 64-byte hex>",
  "tokenType": "Bearer",
  "expires_in": 3600
}
```

**`POST /o/token` request body:**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "your_refresh_token"
}
```

### UserInfo

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/o/userinfo` | Returns user claims for a valid access token |

**Authorization:** `Bearer <access_token>`

**Response:**
```json
{
  "sub": "uuid",
  "email": "user@example.com",
  "email_verified": false,
  "given_name": "Jane",
  "family_name": "Doe",
  "name": "Jane Doe",
  "picture": null
}
```

### Application Management (Authenticated)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/admin/application` | Register a new OAuth application |
| `GET` | `/admin/applications` | List applications owned by the authenticated user |
| `DELETE` | `/admin/application/:id` | Delete an owned application |
| `POST` | `/admin/application/:id/regenerate-secret` | Rotate an application's client secret |

**`POST /admin/application` request body:**
```json
{
  "displayName": "My Application",
  "applicationUrl": "https://myapp.example.com",
  "redirectUri": "https://myapp.example.com/oauth/callback"
}
```

**Response:**
```json
{
  "client_id": "uuid",
  "client_secret": "64-char-hex-string"
}
```

---

## Database Design

AuthForge uses PostgreSQL with Drizzle ORM for schema management and type-safe queries.

### `user`
Stores identity and credential data for AuthForge accounts. Passwords are stored as a SHA-256 hex digest salted with a per-row random value. The `emailVerified` flag is reserved for a future email verification flow. `profileImageURL` is included for OIDC `picture` claim support.

### `application`
One row per registered OAuth client. Each application belongs to a `userId`, enforcing that only the registering user can manage it. `client_id` is a UUID and is globally unique. `client_secret` is 32 random bytes encoded as hex. `redirectUri` is stored as a single string; wildcard matching is intentionally not supported.

### `authorization_codes`
Short-lived, single-use tokens generated when a user authenticates via the OAuth flow. Each code is bound to a `userId`, `client_id`, and `redirect_uri` at issuance. A `used` boolean prevents replay. `expires_at` is set to 5 minutes from issuance.

### `refresh_tokens`
Long-lived opaque tokens issued alongside each access token. Stored with the `user_id` and `client_id` so they can be scoped to a specific client. Expiry is 30 days. There is currently no rotation on use — each refresh call issues a new access token while the refresh token remains valid until expiry.

---

## Security

### RS256 Token Signing
Access tokens and session tokens are signed with a 2048-bit RSA private key stored at `cert/private-key.pem`. Verification uses the corresponding public key at `cert/public-key.pub`, which is also exposed via the JWKS endpoint. This allows any relying party to verify tokens offline without contacting AuthForge.

### Authorization Code Validation
Before issuing tokens, AuthForge verifies:
- The code exists in the database
- The code belongs to the requesting `client_id` (cross-client replay is rejected)
- The code has not been used before
- The code has not expired

### Token Expiry
- Authorization codes: 5 minutes
- Access tokens (JWT `exp`): 1 hour
- Refresh tokens: 30 days

### Client Validation
At the authorization endpoint, `client_id` is validated against registered applications and the submitted `redirect_uri` must match the stored value exactly. There is no prefix matching or wildcard support.

### Session Security
Dashboard session cookies are set with `httpOnly: true` and `SameSite: lax`. The `Secure` flag is enabled when `NODE_ENV=production`.

---

## Screenshots

### Landing Page
![Landing Page](screenshots/landing.png)

### Sign In
![Sign In](screenshots/sign-in.png)

### Developer Dashboard
![Developer Dashboard](screenshots/dashboard.png)

### Application Registration
![Application Registration](screenshots/register-app.png)

### OAuth Consent Flow
![OAuth Consent](screenshots/consent.png)

> Add screenshots to a `screenshots/` directory to populate this section.

---

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL
- pnpm

### Setup

**1. Clone the repository**
```bash
git clone https://github.com/Piyushkumar-20/authforge.git
cd authforge
```

**2. Install dependencies**
```bash
pnpm install
```

**3. Configure environment variables**

Create a `.env` file in the project root:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/authforge
PORT=3000
NODE_ENV=development
```

**4. Generate RSA key pair**
```bash
mkdir cert
openssl genrsa -out cert/private-key.pem 2048
openssl rsa -in cert/private-key.pem -pubout -out cert/public-key.pub
```

**5. Run database migrations**
```bash
pnpm db:generate
pnpm db:migrate
```

**6. Start the development server**
```bash
pnpm dev
```

The server compiles TypeScript on each change and restarts automatically. It will be available at `http://localhost:3000`.

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm dev` | Start development server with TypeScript watch and auto-restart |
| `pnpm db:generate` | Generate Drizzle migration files from schema changes |
| `pnpm db:migrate` | Apply pending migrations to the database |
| `pnpm db:studio` | Open Drizzle Studio for database inspection |

---

## Project Structure

```
authforge/
├── cert/
│   ├── private-key.pem      # RSA private key (not committed)
│   └── public-key.pub       # RSA public key
├── public/
│   ├── index.html           # Landing page
│   ├── authenticate.html    # OAuth sign-in page
│   ├── signup.html          # Account creation
│   ├── dashboard.html       # Developer dashboard
│   ├── register-app.html    # Application registration form
│   ├── consent.html         # OAuth consent screen
│   ├── css/
│   └── js/
├── src/
│   ├── db/
│   │   ├── index.ts         # Drizzle client initialization
│   │   └── schema.ts        # Table definitions
│   ├── utils/
│   │   ├── cert.ts          # Key file loaders
│   │   └── user-token.ts    # JWTClaims interface
│   └── index.ts             # Express application and all route handlers
├── drizzle.config.js
└── package.json
```

---

## Roadmap

These are the next logical additions to make AuthForge production-grade:

**PKCE (Proof Key for Code Exchange)** — Required for public clients (SPAs, mobile apps) that cannot store a `client_secret` securely. Adds a `code_verifier` / `code_challenge` pair to the authorization flow.

**Consent Screen** — Before issuing an authorization code, display the requested scopes to the user and require explicit approval. The consent UI exists in the frontend; the backend enforcement is pending.

**Refresh Token Rotation** — Invalidate the presented refresh token on each use and issue a new one. Reduces the window of exposure for a stolen refresh token.

**Token Revocation Endpoint** — A `POST /o/revoke` endpoint so client applications can invalidate refresh tokens on user logout.

**Multi-Factor Authentication** — TOTP-based second factor for AuthForge accounts.

**Scope Support** — Enforce granular scopes (`openid`, `profile`, `email`) at the authorization endpoint and include them in issued tokens.

**Session Management** — Track active sessions per user, support global logout, and expose session introspection.

---

## Author

**Piyush Kumar**

[piyushdev.online](https://piyushdev.online)

---

*AuthForge is a portfolio project demonstrating full-stack implementation of OAuth 2.0 and OpenID Connect from first principles.*
