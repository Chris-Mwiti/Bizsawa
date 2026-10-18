# Platform — auth · business · users · tenancy

Identity, tenancy, membership and plans. Auth issues JWTs; `Auth.Middleware` injects user/tenant/business IDs; `Users.RoleForUser` feeds the RBAC enforcer; `Tenancy.EnforceBusinessLimit` gates business creation by plan.

## auth — `internal/auth` · routes `/auth/register|login|refresh|google|check-email|otp/*`

Domain: `User` → `auth_users`, `Account` → `auth_accounts` (OAuth links), `RefreshToken` → `auth_refresh_tokens`, `OTP` → `auth_otps`.

Repository: `NewRepository`, `CreateUser` (normalized email), `FindByEmail`, `FindByProviderAccountID`, `FindAccount`, `UpsertAccount` (link + tokens), `FindByID`, `CreateRefreshToken`, `FindRefreshToken` (unrevoked/unexpired by hash), `RevokeRefreshToken` (rotation).

Tokens (`token.go`): `NewTokenService`, `IssueAccessToken` (short-lived JWT with user/tenant/business/role claims), `Verify`, `NewRefreshToken` (raw + hash + expiry), `HashRefreshToken` (SHA-256 hex).

Service: `NewService(repo, tokens, memberships, subscriptions)`, `WithEmailSender`, `Register` (user + subscription + tokens), `Login` (password check, optional business-role scoping), `Refresh` (rotation), `CheckEmailExists`.

OTP (`otp.go`): `SendVerificationOTP` (generate + store + email), `CheckVerificationOTP` (validate w/o consuming), `SignInEmailOTP` (verify, auto-register/link, issue session), `VerifyEmailOTP` (consume + mark verified), `RequestPasswordResetWithOTP`, `ResetPasswordWithOTP` (verify + revoke sessions + new hash).

Google (`google.go`): `LoginWithGoogle` (ID-token verify, link/create, session); `WithGoogleConfig`.

Module: `New(db, cfg, opts…)` with `WithMembershipResolver` / `WithSubscriptionProvisioner` / `WithGoogleConfig` / `WithEmailSender`; `RegisterRoutes`; `Middleware` (Bearer verify → ctx IDs); `UserByID`.

Handlers: `Register`, `Login`, `Refresh`, `GoogleLogin`, `GoogleRedirect`, `GoogleCallback`, `SendVerificationOTP`, `CheckVerificationOTP`, `SignInEmailOTP`, `VerifyEmailOTP`, `RequestPasswordResetOTP`, `ResetPasswordOTP`, `CheckEmailExists`.

## business — `internal/business` · routes `GET/POST /businesses`, `GET/PUT/DELETE /businesses/{id}`

Domain: `Business` → `businesses` (M-Pesa shortcode stored encrypted).

Repository: `NewRepository`, `Create`, `ListByUser` (active member/owner), `FindForUser` (membership-scoped), `Update`, `DeleteForOwner` (owner-constrained).

Module: `New(db, guard, members, crypto)`; `RegisterRoutes`.

Service: `NewService`, `CreateBusiness` (plan-limit enforce + shortcode encrypt + owner membership), `ListBusinesses`, `GetBusiness`, `UpdateBusiness`, `DeleteBusiness` (owner only).

Handlers: `CreateBusiness`, `ListBusinesses`, `GetBusiness`, `UpdateBusiness`, `DeleteBusiness`.

## users — `internal/users` · routes `/profile`, `/businesses/{id}/members`, invites (+ public accept)

Domain: `BusinessMember` → `business_members`, `BusinessInvite` → `business_invites`, `UserProfile` → `user_profiles`.

Repository: `NewRepository`, `CreateMember`, `FindActiveByBusinessAndUser` (role checks), `ListByBusiness`, `UpdateRole`, `Deactivate`, `FindProfileByUserID`, `CreateProfile`, `UpdateProfile`.

Invites (`invite.go`): `NewInviteService`, `WithBusinessNameFn`, `InviteByEmail` (create/refresh + sign-in OTP mirror + email), `ListInvites` (pending unexpired), `AcceptInvite` (OTP verify + user link + membership).

Module: `New(db)`; `InitInvites`; `InviteService()`; `RegisterProfileRoutes`; `RegisterRoutes`; `RegisterInvitePublicRoutes`; `AddOwner`; `RoleForUser` (RBAC resolver).

Service: `NewService`, `AddOwner`, `InviteMember` (direct by user ID), `ListMembers`, `UpdateRole`, `Deactivate`, `GetOrCreateProfile`, `CreateProfile`, `UpdateProfile`.

Handlers: `ListMembers`, `CreateProfile`, `InviteMember`, `UpdateRole`, `DeactivateMember`, `InviteByEmail` (role-gated), `ListInvites`, `AcceptInvite`, `AcceptInvitePublic`, `GetProfile`, `UpdateProfile`.

## tenancy — `internal/tenancy` · routes `/subscriptions`, public plans + M-Pesa callback

Domain: `Subscription` → `tenancy_subscriptions`, `SubscriptionPayment` → `subscription_payments`; `Plans()` / `PlanByCode()` / `PriceForPlan()` (free/premium/enterprise).

Repository: `NewRepository`, `ActiveByUser`, `Create`, `CountBusinessesByOwner` (plan limits), `CreateSubscriptionPayment`, `FindSubscriptionPaymentByID` / `ByCheckout` / `ByIdempotency`, `UpdateSubscriptionPayment`, `UpsertActiveSubscription`.

Service: `NewService`, `SetSTKProvider`, `TriggerSTKIfConfigured`, `EnsureDefaultSubscription` (free plan), `EnforceBusinessLimit` (creation quota), `IsPremium`, `InitiateUpgrade` (idempotent), `MarkSubscriptionPaymentProcessing`, `GetSubscriptionPayment` (owner-scoped), `HandleSubscriptionCallback` (M-Pesa result → upgrade).

STK adapter (`stk_adapter.go`): `NewMpesaAdapter` wraps a plain func as `SubscriptionSTKProvider`; `STKPush` adapts the call shape.

Module: `New(db)`; `RegisterPublicRoutes` (plans); `RegisterRoutes`; `RegisterCallbackRoute`; `Service()`; `EnsureDefaultSubscription` / `EnforceBusinessLimit` / `EnsureDefaultSubscriptionForUser` (cross-module guards).
