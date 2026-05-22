# Feature 11: Authentication (WebAuthn/Passkeys)

## Feature Overview

This feature implements **passwordless authentication** using the WebAuthn/Passkeys standard via the `@simplewebauthn/server` and `@simplewebauthn/browser` libraries. Users register and login using biometric authentication (fingerprint, face ID) or hardware security keys — no passwords are stored or transmitted.

The authentication system consists of:
- **Database tables** for users and their authenticator credentials
- **Auth utility** (`lib/auth.ts`) for JWT-based session management with HTTP-only cookies
- **Middleware** (`middleware.ts`) for route protection and redirects
- **API routes** for the WebAuthn registration/login ceremony flows
- **Login page** (`app/login/page.tsx`) with register and login forms
- **Logout button** in the main app's top-right corner

Sessions persist for 7 days via signed JWT tokens stored in HTTP-only cookies, ensuring security against XSS attacks.

---

## User Stories

1. **As a new user**, I want to register with my passkey (fingerprint/face ID/security key) so that I have secure passwordless access to my todos.
2. **As a returning user**, I want to login with my saved passkey so that I can quickly access my todos without remembering a password.
3. **As a user**, I want my session to persist for 7 days so that I don't have to re-authenticate on every visit.
4. **As a user**, I want to securely logout so that no one else can access my todos on a shared device.
5. **As an unauthenticated user**, I want protected routes to redirect me to the login page so that I understand I need to authenticate first.
6. **As an authenticated user**, I want to be redirected away from the login page to the main app so that I don't see unnecessary login forms.

---

## User Flow

### Registration Flow
1. User navigates to `/login` (or is redirected from a protected route)
2. User enters a **username** in the input field
3. User clicks the **"Register"** button
4. Browser triggers WebAuthn prompt (fingerprint scanner, face ID, or security key dialog)
5. User completes biometric/security key authentication
6. System verifies the registration, stores the authenticator credential, creates a JWT session
7. User is redirected to `/` (main app)

### Login Flow
1. User navigates to `/login`
2. User enters their **existing username**
3. User clicks the **"Login"** button
4. Browser triggers WebAuthn prompt for the saved passkey
5. User completes biometric/security key authentication
6. System verifies the authentication, updates the counter, creates a JWT session
7. User is redirected to `/` (main app)

### Logout Flow
1. User clicks the **"Logout"** button in the top-right corner of the main app
2. System clears the session cookie
3. User is redirected to `/login`

### Session Persistence Flow
1. User closes browser tab/window
2. User returns within 7 days
3. Middleware reads the JWT cookie, verifies it
4. User accesses protected routes without re-authentication

### Protected Route Flow
1. Unauthenticated user attempts to visit `/` or `/calendar`
2. Middleware intercepts, finds no valid session cookie
3. User is redirected to `/login`
4. After successful login, user is redirected to the originally requested page

---

## Technical Requirements

### Database Schema

#### Users Table

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  challenge TEXT
);
```

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PRIMARY KEY | UUID v4, generated server-side |
| `username` | TEXT | UNIQUE NOT NULL | Unique username for the account |
| `challenge` | TEXT | nullable | Temporary WebAuthn challenge string, stored during registration/login ceremony |

#### Authenticators Table

```sql
CREATE TABLE IF NOT EXISTS authenticators (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  credential_public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `credential_id` | TEXT | PRIMARY KEY | Base64url-encoded credential ID from WebAuthn |
| `user_id` | TEXT | NOT NULL, FK → users.id | References the owning user |
| `credential_public_key` | TEXT | NOT NULL | Base64url-encoded public key |
| `counter` | INTEGER | NOT NULL DEFAULT 0 | Signature counter for replay attack prevention |
| `transports` | TEXT | nullable | JSON-serialized array of transport types (e.g., `["internal","hybrid"]`) |

> **CRITICAL**: The `counter` field may be `undefined` from the WebAuthn library response. Always use the `?? 0` pattern: `verification.registrationInfo.credential.counter ?? 0`

### Type Definitions

```typescript
// In lib/db.ts

export interface User {
  id: string;
  username: string;
  challenge: string | null;
}

export interface Authenticator {
  credential_id: string;
  user_id: string;
  credential_public_key: string;
  counter: number;
  transports: string | null;
}
```

### Database CRUD Operations

```typescript
// In lib/db.ts

// ===== User Operations =====

export function getUserByUsername(username: string): User | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?');
  return stmt.get(username) as User | undefined;
}

export function getUserById(id: string): User | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id) as User | undefined;
}

export function createUser(id: string, username: string): User {
  const stmt = db.prepare('INSERT INTO users (id, username) VALUES (?, ?)');
  stmt.run(id, username);
  return { id, username, challenge: null };
}

export function updateUserChallenge(userId: string, challenge: string): void {
  const stmt = db.prepare('UPDATE users SET challenge = ? WHERE id = ?');
  stmt.run(challenge, userId);
}

// ===== Authenticator Operations =====

export function getAuthenticatorsByUserId(userId: string): Authenticator[] {
  const stmt = db.prepare('SELECT * FROM authenticators WHERE user_id = ?');
  return stmt.all(userId) as Authenticator[];
}

export function getAuthenticatorByCredentialId(credentialId: string): Authenticator | undefined {
  const stmt = db.prepare('SELECT * FROM authenticators WHERE credential_id = ?');
  return stmt.get(credentialId) as Authenticator | undefined;
}

export function createAuthenticator(
  credentialId: string,
  userId: string,
  credentialPublicKey: string,
  counter: number,
  transports: string | null
): void {
  const stmt = db.prepare(
    'INSERT INTO authenticators (credential_id, user_id, credential_public_key, counter, transports) VALUES (?, ?, ?, ?, ?)'
  );
  stmt.run(credentialId, userId, credentialPublicKey, counter, transports);
}

export function updateAuthenticatorCounter(credentialId: string, counter: number): void {
  const stmt = db.prepare('UPDATE authenticators SET counter = ? WHERE credential_id = ?');
  stmt.run(counter, credentialId);
}
```

### WebAuthn Configuration

```typescript
// In API route files or a shared config

const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'Todo App';
const RP_ORIGIN = process.env.RP_ORIGIN || 'http://localhost:3000';
```

| Variable | Development | Production |
|----------|-------------|------------|
| `RP_ID` | `localhost` | Your domain (e.g., `myapp.up.railway.app`) |
| `RP_NAME` | `Todo App` | Your app name |
| `RP_ORIGIN` | `http://localhost:3000` | Full URL (e.g., `https://myapp.up.railway.app`) |

> **Note**: `RP_ID` must match the domain where the app is hosted. WebAuthn will fail if there is a mismatch. For localhost development, `localhost` is a special case allowed by the WebAuthn spec.

### Auth Utility: `lib/auth.ts`

```typescript
// lib/auth.ts

import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { getUserById } from './db';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-in-production'
);
const COOKIE_NAME = 'session';
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

interface SessionPayload {
  userId: string;
  username: string;
}

export async function createSession(userId: string): Promise<void> {
  const user = getUserById(userId);
  if (!user) throw new Error('User not found');

  const token = await new SignJWT({ userId: user.id, username: user.username })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(`${SESSION_DURATION}s`)
    .setIssuedAt()
    .sign(JWT_SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_DURATION,
    path: '/',
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
```

**Key implementation details:**
- Uses `jose` library for JWT operations (Edge-compatible, works in Next.js middleware)
- Cookie is `httpOnly` (prevents XSS access), `secure` in production (HTTPS only), `sameSite: 'lax'`
- Session lasts 7 days (`maxAge: 604800` seconds)
- `getSession()` returns `null` for expired/invalid tokens (no error thrown to caller)
- `createSession()` looks up the user to embed both `userId` and `username` in the JWT

### Middleware: `middleware.ts`

```typescript
// middleware.ts

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'default-secret-change-in-production'
);
const COOKIE_NAME = 'session';

// Routes that require authentication
const PROTECTED_ROUTES = ['/', '/calendar'];
// Routes only for unauthenticated users
const AUTH_ROUTES = ['/login'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(COOKIE_NAME)?.value;

  let isAuthenticated = false;
  if (token) {
    try {
      await jwtVerify(token, JWT_SECRET);
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
  }

  // Redirect unauthenticated users away from protected routes
  if (PROTECTED_ROUTES.includes(pathname) && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Redirect authenticated users away from login page
  if (AUTH_ROUTES.includes(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/calendar', '/login'],
};
```

**Key implementation details:**
- Middleware runs on every request matching the `matcher` paths
- Cannot import `lib/auth.ts` directly because middleware runs in Edge Runtime; duplicates JWT verification logic
- Uses the same `JWT_SECRET` and `COOKIE_NAME` as `lib/auth.ts`
- Two-directional protection: unauthenticated → login, authenticated → away from login

### API Endpoints

#### POST `/api/auth/register-options`

Generates WebAuthn registration options for a new or existing user.

**File**: `app/api/auth/register-options/route.ts`

**Request:**
```json
{
  "username": "johndoe"
}
```

**Response (200):**
```json
{
  "options": {
    "challenge": "base64url-encoded-challenge",
    "rp": {
      "name": "Todo App",
      "id": "localhost"
    },
    "user": {
      "id": "base64url-encoded-user-id",
      "name": "johndoe",
      "displayName": "johndoe"
    },
    "pubKeyCredParams": [...],
    "timeout": 60000,
    "attestation": "none",
    "excludeCredentials": [...],
    "authenticatorSelection": {
      "residentKey": "preferred",
      "userVerification": "preferred"
    }
  },
  "userId": "uuid-v4-string"
}
```

**Error Responses:**
```json
// 400 - Missing username
{ "error": "Username is required" }
```

**Implementation:**
```typescript
// app/api/auth/register-options/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { v4 as uuidv4 } from 'uuid';
import {
  getUserByUsername,
  createUser,
  updateUserChallenge,
  getAuthenticatorsByUserId,
} from '@/lib/db';

const RP_ID = process.env.RP_ID || 'localhost';
const RP_NAME = process.env.RP_NAME || 'Todo App';

export async function POST(request: NextRequest) {
  const { username } = await request.json();

  if (!username || typeof username !== 'string' || !username.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const trimmedUsername = username.trim().toLowerCase();

  // Find or create user
  let user = getUserByUsername(trimmedUsername);
  if (!user) {
    const userId = uuidv4();
    user = createUser(userId, trimmedUsername);
  }

  // Get existing authenticators to exclude (prevent duplicate registration)
  const existingAuthenticators = getAuthenticatorsByUserId(user.id);
  const excludeCredentials = existingAuthenticators.map((auth) => ({
    id: isoBase64URL.toBuffer(auth.credential_id),
    type: 'public-key' as const,
    transports: auth.transports
      ? (JSON.parse(auth.transports) as AuthenticatorTransport[])
      : undefined,
  }));

  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: trimmedUsername,
    userDisplayName: trimmedUsername,
    attestationType: 'none',
    excludeCredentials,
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  // Store challenge for verification
  updateUserChallenge(user.id, options.challenge);

  return NextResponse.json({ options, userId: user.id });
}
```

---

#### POST `/api/auth/register-verify`

Verifies the WebAuthn registration response and stores the new authenticator credential.

**File**: `app/api/auth/register-verify/route.ts`

**Request:**
```json
{
  "userId": "uuid-v4-string",
  "credential": {
    "id": "base64url-credential-id",
    "rawId": "base64url-raw-id",
    "response": {
      "attestationObject": "base64url-attestation",
      "clientDataJSON": "base64url-client-data"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```

**Response (200):**
```json
{
  "verified": true,
  "username": "johndoe"
}
```

**Error Responses:**
```json
// 400 - Missing data
{ "error": "Missing userId or credential" }

// 400 - User not found
{ "error": "User not found" }

// 400 - No challenge found
{ "error": "No challenge found for user" }

// 400 - Verification failed
{ "error": "Registration verification failed" }
```

**Implementation:**
```typescript
// app/api/auth/register-verify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  getUserById,
  createAuthenticator,
  updateUserChallenge,
} from '@/lib/db';
import { createSession } from '@/lib/auth';

const RP_ID = process.env.RP_ID || 'localhost';
const RP_ORIGIN = process.env.RP_ORIGIN || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const { userId, credential } = await request.json();

  if (!userId || !credential) {
    return NextResponse.json(
      { error: 'Missing userId or credential' },
      { status: 400 }
    );
  }

  const user = getUserById(userId);
  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 400 });
  }

  if (!user.challenge) {
    return NextResponse.json(
      { error: 'No challenge found for user' },
      { status: 400 }
    );
  }

  try {
    const verification = await verifyRegistrationResponse({
      response: credential,
      expectedChallenge: user.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json(
        { error: 'Registration verification failed' },
        { status: 400 }
      );
    }

    const { credential: cred } = verification.registrationInfo;

    // CRITICAL: Always use ?? 0 for counter — it may be undefined
    const credentialId = isoBase64URL.fromBuffer(cred.id);
    const credentialPublicKey = isoBase64URL.fromBuffer(cred.publicKey);
    const counter = cred.counter ?? 0;
    const transports = credential.response?.transports
      ? JSON.stringify(credential.response.transports)
      : null;

    createAuthenticator(
      credentialId,
      user.id,
      credentialPublicKey,
      counter,
      transports
    );

    // Clear the challenge after successful verification
    updateUserChallenge(user.id, '');

    // Create session (JWT cookie)
    await createSession(user.id);

    return NextResponse.json({ verified: true, username: user.username });
  } catch (error) {
    console.error('Registration verification error:', error);
    return NextResponse.json(
      { error: 'Registration verification failed' },
      { status: 400 }
    );
  }
}
```

> **CRITICAL**: The line `const counter = cred.counter ?? 0;` is essential. The `@simplewebauthn/server` library may return `undefined` for the counter on some authenticators. Without `?? 0`, this causes a database insertion error.

---

#### POST `/api/auth/login-options`

Generates WebAuthn authentication options for an existing user.

**File**: `app/api/auth/login-options/route.ts`

**Request:**
```json
{
  "username": "johndoe"
}
```

**Response (200):**
```json
{
  "options": {
    "challenge": "base64url-encoded-challenge",
    "timeout": 60000,
    "rpId": "localhost",
    "allowCredentials": [
      {
        "id": "base64url-credential-id",
        "type": "public-key",
        "transports": ["internal"]
      }
    ],
    "userVerification": "preferred"
  }
}
```

**Error Responses:**
```json
// 400 - Missing username
{ "error": "Username is required" }

// 404 - User not found
{ "error": "User not found" }

// 400 - No authenticators registered
{ "error": "No authenticators found for user" }
```

**Implementation:**
```typescript
// app/api/auth/login-options/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  getUserByUsername,
  getAuthenticatorsByUserId,
  updateUserChallenge,
} from '@/lib/db';

const RP_ID = process.env.RP_ID || 'localhost';

export async function POST(request: NextRequest) {
  const { username } = await request.json();

  if (!username || typeof username !== 'string' || !username.trim()) {
    return NextResponse.json({ error: 'Username is required' }, { status: 400 });
  }

  const trimmedUsername = username.trim().toLowerCase();
  const user = getUserByUsername(trimmedUsername);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  const authenticators = getAuthenticatorsByUserId(user.id);
  if (authenticators.length === 0) {
    return NextResponse.json(
      { error: 'No authenticators found for user' },
      { status: 400 }
    );
  }

  const allowCredentials = authenticators.map((auth) => ({
    id: isoBase64URL.toBuffer(auth.credential_id),
    type: 'public-key' as const,
    transports: auth.transports
      ? (JSON.parse(auth.transports) as AuthenticatorTransport[])
      : undefined,
  }));

  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials,
    userVerification: 'preferred',
  });

  // Store challenge for verification
  updateUserChallenge(user.id, options.challenge);

  return NextResponse.json({ options });
}
```

---

#### POST `/api/auth/login-verify`

Verifies the WebAuthn authentication response and creates a session.

**File**: `app/api/auth/login-verify/route.ts`

**Request:**
```json
{
  "username": "johndoe",
  "credential": {
    "id": "base64url-credential-id",
    "rawId": "base64url-raw-id",
    "response": {
      "authenticatorData": "base64url-auth-data",
      "clientDataJSON": "base64url-client-data",
      "signature": "base64url-signature",
      "userHandle": "base64url-user-handle"
    },
    "type": "public-key",
    "clientExtensionResults": {},
    "authenticatorAttachment": "platform"
  }
}
```

**Response (200):**
```json
{
  "verified": true,
  "username": "johndoe"
}
```

**Error Responses:**
```json
// 400 - Missing data
{ "error": "Missing username or credential" }

// 404 - User not found
{ "error": "User not found" }

// 400 - No challenge
{ "error": "No challenge found for user" }

// 400 - Authenticator not found
{ "error": "Authenticator not found" }

// 400 - Verification failed
{ "error": "Login verification failed" }
```

**Implementation:**
```typescript
// app/api/auth/login-verify/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import {
  getUserByUsername,
  getAuthenticatorByCredentialId,
  updateAuthenticatorCounter,
  updateUserChallenge,
} from '@/lib/db';
import { createSession } from '@/lib/auth';

const RP_ID = process.env.RP_ID || 'localhost';
const RP_ORIGIN = process.env.RP_ORIGIN || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const { username, credential } = await request.json();

  if (!username || !credential) {
    return NextResponse.json(
      { error: 'Missing username or credential' },
      { status: 400 }
    );
  }

  const trimmedUsername = username.trim().toLowerCase();
  const user = getUserByUsername(trimmedUsername);

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (!user.challenge) {
    return NextResponse.json(
      { error: 'No challenge found for user' },
      { status: 400 }
    );
  }

  // Find the authenticator used for this login
  const credentialId = credential.id;
  const authenticator = getAuthenticatorByCredentialId(credentialId);

  if (!authenticator) {
    return NextResponse.json(
      { error: 'Authenticator not found' },
      { status: 400 }
    );
  }

  try {
    const verification = await verifyAuthenticationResponse({
      response: credential,
      expectedChallenge: user.challenge,
      expectedOrigin: RP_ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: isoBase64URL.toBuffer(authenticator.credential_id),
        publicKey: isoBase64URL.toBuffer(authenticator.credential_public_key),
        counter: authenticator.counter ?? 0, // CRITICAL: ?? 0 for safety
        transports: authenticator.transports
          ? (JSON.parse(authenticator.transports) as AuthenticatorTransport[])
          : undefined,
      },
    });

    if (!verification.verified) {
      return NextResponse.json(
        { error: 'Login verification failed' },
        { status: 400 }
      );
    }

    // Update counter for replay attack prevention
    const newCounter = verification.authenticationInfo.newCounter ?? 0;
    updateAuthenticatorCounter(authenticator.credential_id, newCounter);

    // Clear the challenge
    updateUserChallenge(user.id, '');

    // Create session (JWT cookie)
    await createSession(user.id);

    return NextResponse.json({ verified: true, username: user.username });
  } catch (error) {
    console.error('Login verification error:', error);
    return NextResponse.json(
      { error: 'Login verification failed' },
      { status: 400 }
    );
  }
}
```

---

#### POST `/api/auth/logout`

Clears the session cookie.

**File**: `app/api/auth/logout/route.ts`

**Request:** No body required.

**Response (200):**
```json
{
  "success": true
}
```

**Implementation:**
```typescript
// app/api/auth/logout/route.ts

import { NextResponse } from 'next/server';
import { deleteSession } from '@/lib/auth';

export async function POST() {
  await deleteSession();
  return NextResponse.json({ success: true });
}
```

---

#### GET `/api/auth/me`

Returns the current authenticated user's info from the session.

**File**: `app/api/auth/me/route.ts`

**Request:** No body (reads from cookie).

**Response (200):**
```json
{
  "userId": "uuid-v4-string",
  "username": "johndoe"
}
```

**Error Response:**
```json
// 401 - Not authenticated
{ "error": "Not authenticated" }
```

**Implementation:**
```typescript
// app/api/auth/me/route.ts

import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  return NextResponse.json({
    userId: session.userId,
    username: session.username,
  });
}
```

---

### Business Logic

#### WebAuthn Registration Ceremony
1. Client calls `POST /api/auth/register-options` with username
2. Server generates registration options using `generateRegistrationOptions()`
3. Server stores the challenge in the `users.challenge` column
4. Client receives options and calls `startRegistration()` from `@simplewebauthn/browser`
5. Browser shows biometric/security key prompt to the user
6. Client sends the response to `POST /api/auth/register-verify`
7. Server verifies using `verifyRegistrationResponse()` with the stored challenge
8. Server stores the new authenticator credential (credential_id, public_key, counter, transports)
9. Server creates a JWT session and sets the HTTP-only cookie
10. Client redirects to `/`

#### WebAuthn Authentication Ceremony
1. Client calls `POST /api/auth/login-options` with username
2. Server generates authentication options using `generateAuthenticationOptions()`
3. Server stores the challenge in the `users.challenge` column
4. Client receives options and calls `startAuthentication()` from `@simplewebauthn/browser`
5. Browser shows passkey prompt to the user
6. Client sends the response to `POST /api/auth/login-verify`
7. Server finds the authenticator by `credential_id`
8. Server verifies using `verifyAuthenticationResponse()` with stored challenge and credential
9. Server updates the authenticator counter (replay attack prevention)
10. Server creates a JWT session and sets the HTTP-only cookie
11. Client redirects to `/`

#### Counter Verification
The `counter` field is a security mechanism in WebAuthn:
- Each time an authenticator is used, it increments its internal counter
- The server compares the received counter with the stored counter
- If the received counter is ≤ the stored counter, it indicates a potential cloned authenticator
- The `@simplewebauthn/server` library handles this check internally during verification

#### Username Rules
- Usernames are trimmed and lowercased before storage
- Usernames must be unique per the database UNIQUE constraint
- Registration with an existing username adds a new authenticator to that user (multi-device support)

#### Buffer Encoding
- All binary credential data (credential_id, public_key) is encoded using `isoBase64URL` from `@simplewebauthn/server/helpers`
- `isoBase64URL.fromBuffer(buffer)` converts Buffer/Uint8Array → base64url string for storage
- `isoBase64URL.toBuffer(string)` converts base64url string → Uint8Array for verification

---

## UI Components

### Login Page: `app/login/page.tsx`

```typescript
'use client';

import { useState } from 'react';
import { startRegistration, startAuthentication } from '@simplewebauthn/browser';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleRegister = async () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Step 1: Get registration options
      const optionsRes = await fetch('/api/auth/register-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get registration options');
      }

      const { options, userId } = await optionsRes.json();

      // Step 2: Start WebAuthn registration (browser prompt)
      const credential = await startRegistration({ optionsJSON: options });

      // Step 3: Verify registration
      const verifyRes = await fetch('/api/auth/register-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, credential }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Registration verification failed');
      }

      const result = await verifyRes.json();
      if (result.verified) {
        router.push('/');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        // Handle user cancellation of WebAuthn prompt
        if (err.name === 'NotAllowedError') {
          setError('Authentication was cancelled or timed out');
        } else {
          setError(err.message);
        }
      } else {
        setError('Registration failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim()) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Step 1: Get login options
      const optionsRes = await fetch('/api/auth/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      if (!optionsRes.ok) {
        const data = await optionsRes.json();
        throw new Error(data.error || 'Failed to get login options');
      }

      const { options } = await optionsRes.json();

      // Step 2: Start WebAuthn authentication (browser prompt)
      const credential = await startAuthentication({ optionsJSON: options });

      // Step 3: Verify login
      const verifyRes = await fetch('/api/auth/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), credential }),
      });

      if (!verifyRes.ok) {
        const data = await verifyRes.json();
        throw new Error(data.error || 'Login verification failed');
      }

      const result = await verifyRes.json();
      if (result.verified) {
        router.push('/');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Authentication was cancelled or timed out');
        } else {
          setError(err.message);
        }
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
      <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            ✅ Todo App
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Sign in with your passkey
          </p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleLogin();
              }}
              placeholder="Enter your username"
              disabled={loading}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRegister}
              disabled={loading || !username.trim()}
              className="flex-1 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : '🔐 Register'}
            </button>
            <button
              onClick={handleLogin}
              disabled={loading || !username.trim()}
              className="flex-1 py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : '🔑 Login'}
            </button>
          </div>
        </div>

        <div className="text-center text-xs text-gray-500 dark:text-gray-400">
          <p>
            New user? Click <strong>Register</strong> to create an account with your passkey.
          </p>
          <p className="mt-1">
            Returning user? Click <strong>Login</strong> to sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
```

### Logout Button (in `app/page.tsx`)

The logout button is embedded in the main app's top-right corner header area:

```typescript
// Inside the main app component (app/page.tsx)

const [currentUser, setCurrentUser] = useState<string>('');

// Fetch current user on mount
useEffect(() => {
  fetch('/api/auth/me')
    .then((res) => res.json())
    .then((data) => {
      if (data.username) setCurrentUser(data.username);
    })
    .catch(() => {});
}, []);

const handleLogout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/login';
};

// In the JSX header area:
<div className="flex items-center justify-between mb-6">
  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
    ✅ Todo App
  </h1>
  <div className="flex items-center gap-3">
    <span className="text-sm text-gray-600 dark:text-gray-400">
      👤 {currentUser}
    </span>
    <button
      onClick={handleLogout}
      className="px-3 py-1.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
    >
      Logout
    </button>
  </div>
</div>
```

---

## Edge Cases

1. **Username already exists during registration**: The system finds the existing user and adds a new authenticator credential to their account (enabling multi-device passkeys). This is intentional — WebAuthn supports multiple authenticators per user.

2. **Invalid/corrupted authenticator credential**: If `verifyRegistrationResponse` or `verifyAuthenticationResponse` throws, the error is caught and a `400` response is returned with a descriptive message. The client displays the error to the user.

3. **Expired session (JWT expired after 7 days)**: `getSession()` returns `null` because `jwtVerify()` throws for expired tokens. Middleware redirects the user to `/login`. The user must re-authenticate.

4. **Counter mismatch (potential cloned authenticator)**: The `@simplewebauthn/server` library's `verifyAuthenticationResponse` function internally checks that the new counter is greater than the stored counter. If it detects a potential clone, verification fails and a `400` error is returned.

5. **Browser doesn't support WebAuthn**: The `@simplewebauthn/browser` library's `startRegistration()` and `startAuthentication()` functions will throw if WebAuthn is not available. The client catches this and displays an error message. The login page should ideally check `browserSupportsWebAuthn()` from `@simplewebauthn/browser` and show a warning.

6. **User cancels WebAuthn prompt**: When the user dismisses the biometric/security key prompt, a `NotAllowedError` is thrown. The client catches this specifically and shows "Authentication was cancelled or timed out."

7. **Empty or whitespace-only username**: Validated on both client (button disabled) and server (returns `400`). Username is trimmed and lowercased before processing.

8. **Race condition with challenge**: If a user initiates registration/login on two tabs simultaneously, only the last challenge stored will be valid. The first tab's verification will fail because its challenge no longer matches. This is acceptable behavior.

9. **Database locked (SQLite concurrent access)**: Since better-sqlite3 is synchronous and single-connection, there's no real concurrency issue within a single Node.js process. However, if multiple processes access the same database file, WAL mode should be enabled.

10. **JWT_SECRET not configured in production**: Falls back to `'default-secret-change-in-production'`. This is insecure for production. Should log a warning during startup if `JWT_SECRET` environment variable is not set.

11. **Login attempt for non-existent user**: Returns `404 User not found`. Client shows the error message, suggesting the user register first.

12. **User with no authenticators tries to login**: Returns `400 No authenticators found for user`. This can happen if the user record was created but registration was never completed (e.g., user cancelled the WebAuthn prompt mid-ceremony).

13. **Multiple authenticators per user**: Supported by design. A user can register from multiple devices. `login-options` returns `allowCredentials` with all registered authenticators. The browser selects the appropriate one.

14. **Cookie not sent in cross-origin requests**: The `sameSite: 'lax'` cookie setting ensures the cookie is sent for same-site navigation but not for cross-origin POST requests. This prevents CSRF attacks while allowing normal navigation.

---

## Acceptance Criteria

### Registration
- [ ] User can enter a username and click "Register" to create an account
- [ ] WebAuthn prompt appears for biometric/security key authentication
- [ ] After successful registration, user is redirected to `/` (main app)
- [ ] Authenticator credential is stored in the `authenticators` table
- [ ] User record is created in the `users` table with a UUID
- [ ] JWT session cookie is set with 7-day expiry and `httpOnly` flag
- [ ] Registering with an existing username adds a new authenticator (not an error)
- [ ] Empty username shows validation error

### Login
- [ ] User can enter their username and click "Login" to authenticate
- [ ] WebAuthn prompt appears for passkey authentication
- [ ] After successful login, user is redirected to `/` (main app)
- [ ] Authenticator counter is updated after successful login
- [ ] JWT session cookie is set with 7-day expiry
- [ ] Login with non-existent username shows "User not found" error
- [ ] Login with user having no authenticators shows appropriate error

### Session Management
- [ ] Session persists across page reloads within 7-day window
- [ ] Session persists across browser close/reopen within 7-day window
- [ ] Expired sessions (>7 days) redirect to `/login`
- [ ] `GET /api/auth/me` returns userId and username for valid sessions
- [ ] `GET /api/auth/me` returns 401 for invalid/missing sessions

### Logout
- [ ] Clicking "Logout" button clears the session cookie
- [ ] After logout, user is redirected to `/login`
- [ ] After logout, accessing `/` redirects to `/login`
- [ ] Logout button displays current username next to it

### Route Protection (Middleware)
- [ ] Unauthenticated users accessing `/` are redirected to `/login`
- [ ] Unauthenticated users accessing `/calendar` are redirected to `/login`
- [ ] Authenticated users accessing `/login` are redirected to `/`
- [ ] API routes (`/api/*`) are NOT intercepted by middleware (they handle auth internally)
- [ ] Static assets and Next.js internal routes are not affected

### Security
- [ ] Session cookie has `httpOnly: true` (not accessible via JavaScript)
- [ ] Session cookie has `secure: true` in production (HTTPS only)
- [ ] Session cookie has `sameSite: 'lax'`
- [ ] JWT is signed with `HS256` algorithm
- [ ] Credential public keys are stored as base64url strings (not raw binary)
- [ ] Challenges are cleared after successful verification
- [ ] Counter is validated to prevent authenticator cloning

---

## Testing Requirements

### E2E Tests (Playwright)

**File**: `tests/01-authentication.spec.ts`

Playwright supports virtual WebAuthn authenticators via CDP (Chrome DevTools Protocol), enabling automated testing without real biometric hardware.

#### Test Setup: Virtual Authenticator

```typescript
// tests/helpers.ts

import { Page, CDPSession } from '@playwright/test';

export async function setupVirtualAuthenticator(page: Page): Promise<CDPSession> {
  const client = await page.context().newCDPSession(page);
  await client.send('WebAuthn.enable');
  await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  return client;
}

export async function registerUser(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.click('button:has-text("Register")');
  // Wait for redirect to main page
  await page.waitForURL('/');
}

export async function loginUser(page: Page, username: string): Promise<void> {
  await page.goto('/login');
  await page.fill('#username', username);
  await page.click('button:has-text("Login")');
  await page.waitForURL('/');
}

export async function logoutUser(page: Page): Promise<void> {
  await page.click('button:has-text("Logout")');
  await page.waitForURL('/login');
}
```

#### Test Scenarios

```typescript
// tests/01-authentication.spec.ts

import { test, expect } from '@playwright/test';
import { setupVirtualAuthenticator, registerUser, loginUser, logoutUser } from './helpers';

test.describe('Authentication - WebAuthn/Passkeys', () => {
  test.beforeEach(async ({ page }) => {
    await setupVirtualAuthenticator(page);
  });

  test('should register a new user with passkey', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'testuser');
    await page.click('button:has-text("Register")');
    
    // Should redirect to main app
    await page.waitForURL('/');
    
    // Should show username in header
    await expect(page.locator('text=testuser')).toBeVisible();
  });

  test('should login an existing user with passkey', async ({ page }) => {
    // First register
    await registerUser(page, 'logintest');
    
    // Logout
    await logoutUser(page);
    
    // Login again
    await loginUser(page, 'logintest');
    
    // Should be on main page
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=logintest')).toBeVisible();
  });

  test('should logout and redirect to login page', async ({ page }) => {
    await registerUser(page, 'logouttest');
    
    // Click logout
    await page.click('button:has-text("Logout")');
    
    // Should redirect to login
    await page.waitForURL('/login');
    await expect(page.locator('#username')).toBeVisible();
  });

  test('should redirect unauthenticated users to login', async ({ page }) => {
    // Try to access protected route without auth
    await page.goto('/');
    
    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect unauthenticated users from calendar to login', async ({ page }) => {
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect authenticated users from login to home', async ({ page }) => {
    await registerUser(page, 'redirecttest');
    
    // Try to go to login page while authenticated
    await page.goto('/login');
    
    // Should be redirected back to home
    await expect(page).toHaveURL('/');
  });

  test('should show error for empty username', async ({ page }) => {
    await page.goto('/login');
    
    // Buttons should be disabled when username is empty
    const registerBtn = page.locator('button:has-text("Register")');
    const loginBtn = page.locator('button:has-text("Login")');
    
    await expect(registerBtn).toBeDisabled();
    await expect(loginBtn).toBeDisabled();
  });

  test('should show error for non-existent user login', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'nonexistentuser');
    await page.click('button:has-text("Login")');
    
    // Should show error message
    await expect(page.locator('text=User not found')).toBeVisible();
  });

  test('should persist session across page reload', async ({ page }) => {
    await registerUser(page, 'persisttest');
    
    // Reload the page
    await page.reload();
    
    // Should still be on main page (not redirected to login)
    await expect(page).toHaveURL('/');
    await expect(page.locator('text=persisttest')).toBeVisible();
  });

  test('should return current user from /api/auth/me', async ({ page }) => {
    await registerUser(page, 'metest');
    
    // Call the me endpoint
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/auth/me');
      return res.json();
    });
    
    expect(response.username).toBe('metest');
    expect(response.userId).toBeTruthy();
  });

  test('should return 401 from /api/auth/me when not authenticated', async ({ page }) => {
    await page.goto('/login');
    
    const response = await page.evaluate(async () => {
      const res = await fetch('/api/auth/me');
      return { status: res.status, body: await res.json() };
    });
    
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Not authenticated');
  });

  test('should display username in logout area', async ({ page }) => {
    await registerUser(page, 'displaytest');
    
    // Username should be visible near the logout button
    await expect(page.locator('text=displaytest')).toBeVisible();
    await expect(page.locator('button:has-text("Logout")')).toBeVisible();
  });
});
```

#### Playwright Configuration for WebAuthn

```typescript
// playwright.config.ts (relevant sections)

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3000',
    // IMPORTANT: Use Chromium for WebAuthn virtual authenticator support
    ...devices['Desktop Chrome'],
    timezoneId: 'Asia/Singapore',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Note: Virtual authenticator (CDP) only works with Chromium
    // Firefox and WebKit tests for auth must use alternative approaches
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

> **Important**: Virtual WebAuthn authenticators are only available via the Chrome DevTools Protocol (CDP). Playwright's CDP support requires Chromium-based browsers. Firefox and WebKit do not support this feature for automated testing.

### Unit Tests

#### JWT Session Tests

```typescript
// Test: createSession generates valid JWT with userId and username
// Test: getSession returns null for expired token
// Test: getSession returns null for invalid/tampered token
// Test: getSession returns SessionPayload for valid token
// Test: deleteSession removes the cookie
```

#### Database Operation Tests

```typescript
// Test: createUser generates user with UUID and username
// Test: getUserByUsername returns undefined for non-existent user
// Test: getUserByUsername is case-sensitive (usernames stored lowercase)
// Test: createAuthenticator stores all fields correctly
// Test: getAuthenticatorsByUserId returns empty array for user with no authenticators
// Test: getAuthenticatorByCredentialId returns undefined for non-existent credential
// Test: updateAuthenticatorCounter updates only the counter field
// Test: updateUserChallenge stores and retrieves challenge correctly
```

#### Middleware Tests

```typescript
// Test: Unauthenticated request to '/' → redirect to '/login'
// Test: Unauthenticated request to '/calendar' → redirect to '/login'
// Test: Authenticated request to '/login' → redirect to '/'
// Test: Authenticated request to '/' → passes through
// Test: Request to '/api/*' → not intercepted by middleware
// Test: Invalid/expired JWT → treated as unauthenticated
```

---

## Dependencies

### npm Packages

| Package | Purpose | Version |
|---------|---------|---------|
| `@simplewebauthn/server` | Server-side WebAuthn operations | `^11.x` |
| `@simplewebauthn/browser` | Client-side WebAuthn operations | `^11.x` |
| `jose` | JWT creation and verification (Edge-compatible) | `^5.x` |
| `uuid` | Generate UUID v4 for user IDs | `^9.x` |
| `better-sqlite3` | SQLite database (already in project) | existing |

### Installation

```bash
npm install @simplewebauthn/server @simplewebauthn/browser jose uuid
npm install -D @types/uuid
```

### Environment Variables

```env
# .env.local (development)
JWT_SECRET=your-secret-key-at-least-32-characters-long
RP_ID=localhost
RP_NAME=Todo App
RP_ORIGIN=http://localhost:3000

# Production
JWT_SECRET=<random-32+-character-string>
RP_ID=your-domain.com
RP_NAME=Todo App
RP_ORIGIN=https://your-domain.com
```

---

## File Structure

```
app/
├── login/
│   └── page.tsx                          # Login/Register page (client component)
├── api/
│   └── auth/
│       ├── register-options/
│       │   └── route.ts                  # POST: generate registration options
│       ├── register-verify/
│       │   └── route.ts                  # POST: verify registration response
│       ├── login-options/
│       │   └── route.ts                  # POST: generate login options
│       ├── login-verify/
│       │   └── route.ts                  # POST: verify login response
│       ├── logout/
│       │   └── route.ts                  # POST: clear session
│       └── me/
│           └── route.ts                  # GET: current user info
├── page.tsx                              # Main app (protected, has logout button)
lib/
├── auth.ts                               # JWT session management
├── db.ts                                 # Database operations (users, authenticators)
middleware.ts                             # Route protection
tests/
├── helpers.ts                            # Virtual authenticator setup, register/login helpers
├── 01-authentication.spec.ts             # Authentication E2E tests
```

---

## Out of Scope

- **OAuth / Social login** (Google, GitHub, etc.) — only WebAuthn/Passkeys
- **Password-based authentication** — fully passwordless
- **Email verification** — no email system
- **Two-factor authentication (2FA)** — WebAuthn is the single factor (possession + biometric)
- **Account recovery / password reset** — no passwords to reset; re-registration is the recovery flow
- **User profile management** (avatar, display name changes) — only username
- **Rate limiting** on auth endpoints — recommended but not in scope
- **Account deletion** — not covered in this feature
- **Multi-tenant / organization support** — single-user-per-account model
- **Remember device / trusted device management** — handled by WebAuthn's resident key support
- **Session refresh / token rotation** — sessions are fixed 7-day duration

---

## Success Metrics

1. **Registration success rate**: ≥95% of registration attempts complete successfully (excluding user cancellations)
2. **Login success rate**: ≥99% of login attempts with valid credentials succeed
3. **Authentication latency**: Registration/login ceremony completes in <3 seconds (excluding user biometric time)
4. **Session persistence**: Sessions remain valid for the full 7-day window without requiring re-authentication
5. **Security**: Zero incidents of unauthorized access to protected routes
6. **Cross-device support**: Users can register authenticators from multiple devices and login from any of them
7. **Test coverage**: All 11+ E2E test scenarios pass consistently across 3 consecutive runs
