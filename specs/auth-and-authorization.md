# Authentication and authorization

## Problem overview

Bizworth has two cooperating backend modules: `internal/auth` (identity, JWTs, refresh tokens, OTP, SSO) and `internal/shared/authz` (RBAC over business memberships). Every protected request first authenticates the bearer JWT, then authorizes the action against the caller's role in the current business.

## Current architecture

```mermaid [Auth and authorization context flow]
flowchart LR
  Client[Client] -->|Bearer JWT| AuthMW[auth.Module.Middleware]
  AuthMW --> Router[chi router]
  Router --> AuthzMW[authz.Enforcer.Middleware]
  AuthzMW -->|RoleForUser| Users[users.Module]
  AuthzMW --> Handlers[resource handlers]
  Client -->|/auth/*| AuthH[auth.Handler]
  AuthH --> AuthSvc[auth.Service]
  AuthSvc --> Repo[auth.Repository]
  AuthSvc --> Tokens[TokenService]
  AuthSvc --> Google[Google ID token verify]
  AuthSvc --> Clerk[ClerkVerifier]
  %% ref node:AuthMW [[backend/internal/auth/module.go#Module.Middleware]]
  %% ref node:AuthzMW [[backend/internal/shared/authz/authz.go#Enforcer.Middleware]]
  %% ref node:Users [[backend/internal/users/module.go#Module.RoleForUser]]
  %% ref node:AuthH [[backend/internal/auth/handler.go#Handler.Login]]
  %% ref node:AuthSvc [[backend/internal/auth/service.go#Service.Login]]
  %% ref node:Repo [[backend/internal/auth/repository.go#Repository.FindByEmail]]
  %% ref node:Tokens [[backend/internal/auth/token.go#TokenService.IssueAccessToken]]
  %% ref node:Google [[backend/internal/auth/google.go#Service.LoginWithGoogle]]
  %% ref node:Clerk [[backend/internal/auth/clerk.go#ClerkVerifier.VerifyToken]]
```

## Authentication

Password login converges on `Service.issue`, the single choke point for all sign-in methods:

```callstack [Email and password login]
 response = Handler.Login(req) [[backend/internal/auth/handler.go#Login]]
├── user = Repository.FindByEmail(email) [[backend/internal/auth/repository.go#FindByEmail]]
├── bcrypt.CompareHashAndPassword(password, user.PasswordHash)
├── if req.BusinessID: role = MembershipResolver.RoleForUser(businessID, userID)
└── response = Service.issue(userID, businessID, businessID, roles) [[backend/internal/auth/service.go#Service.issue]]
    ├── if businessID == nil: resolved = defaultBusinessForUser(userID) [[backend/internal/auth/service.go#Service.defaultBusinessForUser]]
    ├── accessToken = TokenService.IssueAccessToken(userID, tenantID, businessID, roles) [[backend/internal/auth/token.go#TokenService.IssueAccessToken]]
    ├── rawRefresh, refreshHash, expiresAt = TokenService.NewRefreshToken() [[backend/internal/auth/token.go#TokenService.NewRefreshToken]]
    ├── Repository.CreateRefreshToken(refreshHash) [[backend/internal/auth/repository.go#Repository.CreateRefreshToken]]
    └── profile = Repository.FindByID(userID) [[backend/internal/auth/repository.go#Repository.FindByID]]
```

Access tokens are HS256 JWTs carrying `uid`, `tid`, `bid`, and `roles`, with a 2h default TTL. Refresh tokens are 32 random bytes, stored only as a SHA-256 hash with a 30d TTL and revoked on use (rotation). See `TokenService` in `backend/internal/auth/token.go`.

## Google SSO

Backend supports a direct Google idToken flow and a web OAuth code callback; mobile and web actually use Clerk's Google OAuth and exchange the Clerk JWT at `/auth/clerk`.

```mermaid [Google SSO paths]
flowchart TD
  Mobile[Mobile login.tsx] -->|startSSOFlow oauth_google| Clerk[Clerk browser OAuth]
  Clerk -->|Clerk JWT| Sync[syncClerkSession]
  Sync -->|POST /auth/clerk| ClerkLogin[Service.LoginWithClerk]
  Web[Web LoginPage] -->|Clerk SignIn| Sync
  Direct[Direct client] -->|POST /auth/google idToken| GoogleLogin[Service.LoginWithGoogle]
  GoogleCallback[GET /auth/google/callback] -->|code exchange| GoogleLogin
  GoogleLogin -->|tokeninfo verify| GoogleAPI[oauth2.googleapis.com/tokeninfo]
  ClerkLogin --> Issue[Service.issue]
  GoogleLogin --> Issue
  %% ref node:Mobile [[mobile/app/auth/login.tsx#handleGoogleSignIn]]
  %% ref node:Sync [[mobile/contexts/AuthContext.tsx#syncClerkSession]]
  %% ref node:ClerkLogin [[backend/internal/auth/clerk.go#Service.LoginWithClerk]]
  %% ref node:GoogleLogin [[backend/internal/auth/google.go#Service.LoginWithGoogle]]
  %% ref node:Issue [[backend/internal/auth/service.go#Service.issue]]
```

`LoginWithGoogle` verifies the id token via Google's tokeninfo endpoint, enforces an optional hosted-domain (`HD`) restriction, then links by provider account id, account table, or email (creating a user if none), upserts `auth_accounts`, ensures a default subscription, and calls `Service.issue`. See `backend/internal/auth/google.go`.

`LoginWithClerk` verifies the RS256 JWT against Clerk's JWKS, fetches all emails on the Clerk account for linking, then follows the same link-or-create path. See `backend/internal/auth/clerk.go`.

## Authorization

`authz.Enforcer` holds a hardcoded policy matrix seeded in `seedDefaults`. `Middleware` requires `userID` and `businessID` in context, resolves the role via `users.Module.RoleForUser`, and checks `Allowed(role, resource, action)`.

```mermaid [RBAC policy matrix]
flowchart TD
  Owner[OWNER] --> All[all resources: read write delete generate configure]
  Manager[MANAGER] --> Most[all resources: read write generate configure, no delete]
  Cashier[CASHIER] --> Subset[products read; customers orders sales expenses payments devices chat read+write; ...]
  Viewer[VIEWER] --> ReadOnly[products customers orders sales inventory reports visualizations insights analytics chatbot chat sync: read]
  %% ref node:Owner [[backend/internal/shared/authz/authz.go#RoleOwner]]
```

Resource and action come from `ResourceAction`, which derives the resource from the chi route pattern (segment after `v1`, with `businesses/.../members` → `members` and `waha` → `whatsapp`) and the action from the HTTP method. See `backend/internal/shared/authz/authz.go`.

## Business scoping

`Service.defaultBusinessForUser` selects the oldest active membership, owner first, so every sign-in method lands on the same business. `Service.issue` applies it when no business was requested. See `backend/internal/auth/service.go`.

## References

- `[[backend/internal/auth/module.go]]`
- `[[backend/internal/auth/service.go]]`
- `[[backend/internal/auth/token.go]]`
- `[[backend/internal/auth/google.go]]`
- `[[backend/internal/auth/clerk.go]]`
- `[[backend/internal/auth/handler.go]]`
- `[[backend/internal/auth/repository.go]]`
- `[[backend/internal/shared/authz/authz.go]]`
- `[[backend/internal/users/module.go]]`
- `[[backend/cmd/api/server.go]]`
- `[[mobile/app/auth/login.tsx]]`
- `[[mobile/contexts/AuthContext.tsx]]`
- `[[web/src/pages/LoginPage.tsx]]`
