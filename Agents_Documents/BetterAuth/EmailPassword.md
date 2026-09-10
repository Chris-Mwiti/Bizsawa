# Email & Password (/docs/authentication/email-password)

Implementing email and password authentication with Better Auth.



Email and password authentication is a common method used by many applications. Better Auth provides a built-in email and password authenticator that you can easily integrate into your project.

<Callout type="info">
  If you prefer username-based authentication, check out the{" "}
  <Link href="/docs/plugins/username">username plugin</Link>. It extends the
  email and password authenticator with username support.
</Callout>

## Enable Email and Password [#enable-email-and-password]

To enable email and password authentication, you need to set the `emailAndPassword.enabled` option to `true` in the `auth` configuration.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  emailAndPassword: { // [!code highlight]
    enabled: true, // [!code highlight]
  }, // [!code highlight]
});
```

<Callout type="info">
  If it's not enabled, it'll not allow you to sign in or sign up with email and
  password.
</Callout>

Additionally, to use the following server methods like `signUpEmail`, cookies must also be passed back to the client. This may require additional configuration. Plugins are provided for [Next](/docs/integrations/next#server-action-cookies) and [SvelteKit](/docs/integrations/svelte-kit#server-action-cookies).

## Usage [#usage]

### Sign Up [#sign-up]

To sign a user up, you can use the `signUp.email` function provided by the client.

**Endpoint:** `POST /sign-up/email`

### Client Side

```ts
const { data, error } = await authClient.signUp.email({
    name: "John Doe", // required, The name of the user.
    email: "john.doe@example.com", // required, The email address of the user.
    password: "password1234", // required, The password of the user. It should be at least 8 characters long and max 128 by default.
    image: "https://example.com/image.png", // An optional profile image of the user.
    callbackURL: "https://example.com/callback", // An optional URL to redirect to after the user signs up.
});
```

### Server Side

```ts
const data = await auth.api.signUpEmail({
    body: {
        name: "John Doe", // required, The name of the user.
        email: "john.doe@example.com", // required, The email address of the user.
        password: "password1234", // required, The password of the user. It should be at least 8 characters long and max 128 by default.
        image: "https://example.com/image.png", // An optional profile image of the user.
        callbackURL: "https://example.com/callback", // An optional URL to redirect to after the user signs up.
    },
});
```

### Type Definition

```ts
type signUpEmail = {
    /**
     * The name of the user.
     */
    name: string = "John Doe"
    /**
     * The email address of the user.
     */
    email: string = "john.doe@example.com"
    /**
     * The password of the user. It should be at least 8 characters long and max 128 by default.
     */
    password: string = "password1234"
    /**
     * An optional profile image of the user.
     */
    image?: string = "https://example.com/image.png"
    /**
     * An optional URL to redirect to after the user signs up.
     */
    callbackURL?: string = "https://example.com/callback"
}
```

<Callout>
  These are the default properties for the sign up email endpoint, however it's possible that with [additional fields](/docs/concepts/typescript#additional-fields) or special plugins you can pass more properties to the endpoint.
</Callout>

### Sign In [#sign-in]

To sign a user in, you can use the `signIn.email` function provided by the client.

**Endpoint:** `POST /sign-in/email`

### Client Side

```ts
const { data, error } = await authClient.signIn.email({
    email: "john.doe@example.com", // required, The email address of the user.
    password: "password1234", // required, The password of the user. It should be at least 8 characters long and max 128 by default.
    rememberMe: true, // If false, the user will be signed out when the browser is closed. (optional) (default: true)
    callbackURL: "https://example.com/callback", // An optional URL to redirect to after the user signs in. (optional)
});
```

### Server Side

```ts
const data = await auth.api.signInEmail({
    body: {
        email: "john.doe@example.com", // required, The email address of the user.
        password: "password1234", // required, The password of the user. It should be at least 8 characters long and max 128 by default.
        rememberMe: true, // If false, the user will be signed out when the browser is closed. (optional) (default: true)
        callbackURL: "https://example.com/callback", // An optional URL to redirect to after the user signs in. (optional)
    },
    // This endpoint requires session cookies.
    headers: await headers(),
});
```

### Type Definition

```ts
type signInEmail = {
    /**
     * The email address of the user.
     */
    email: string = "john.doe@example.com"
    /**
     * The password of the user. It should be at least 8 characters long and max 128 by default.
     */
    password: string = "password1234"
    /**
     * If false, the user will be signed out when the browser is closed. (optional) (default: true)
     */
    rememberMe?: boolean = true
    /**
     * An optional URL to redirect to after the user signs in. (optional)
     */
    callbackURL?: string = "https://example.com/callback"
}
```

<Callout>
  These are the default properties for the sign in email endpoint, however it's possible that with [additional fields](/docs/concepts/typescript#additional-fields) or special plugins you can pass different properties to the endpoint.
</Callout>

### Sign Out [#sign-out]

To sign a user out, you can use the `signOut` function provided by the client.

**Endpoint:** `POST /sign-out`

### Client Side

```ts
await authClient.signOut();
```

### Server Side

```ts
await auth.api.signOut({
    // This endpoint requires session cookies.
    headers: await headers(),
});
```

### Type Definition

```ts
type signOut = {
}
```

you can pass `fetchOptions` to redirect onSuccess

```ts
import { authClient } from "@/lib/auth-client"

await authClient.signOut({
  fetchOptions: {
    onSuccess: () => {
      router.push("/login"); // redirect to login page
    },
  },
});
```

### Email Verification [#email-verification]

To enable email verification, you need to pass a function that sends a verification email with a link. The `sendVerificationEmail` function takes a data object with the following properties:

* `user`: The user object.
* `url`: The URL to send to the user which contains the token.
* `token`: A verification token used to complete the email verification.

and a `request` object as the second parameter.

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { sendEmail } from "./email"; // your email sending function

export const auth = betterAuth({
  emailVerification: {
    sendVerificationEmail: async ( { user, url, token }, request) => {
      void sendEmail({
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email: ${url}`,
      });
    },
  },
});
```

<Callout type="warn">
  Avoid awaiting the email sending to prevent
  timing attacks. On serverless platforms, use `waitUntil` or similar to ensure the email is sent.
</Callout>

On the client side you can use `sendVerificationEmail` function to send verification link to user. This will trigger the `sendVerificationEmail` function you provided in the `auth` configuration.

Once the user clicks on the link in the email, if the token is valid, the user will be redirected to the URL provided in the `callbackURL` parameter. If the token is invalid, the user will be redirected to the URL provided in the `callbackURL` parameter with an error message in the query string `?error=invalid_token`.

#### Require Email Verification [#require-email-verification]

If you enable require email verification, users must verify their email before they can log in. And every time a user tries to sign in, sendVerificationEmail is called.

<Callout>
  For email and password sign-in, this only works if you have
  sendVerificationEmail implemented. Social sign-in is not gated by this setting;
  it has its own opt-in [per-provider
  `requireEmailVerification`](/docs/concepts/oauth#requireemailverification).

  When `requireEmailVerification` is enabled, signing up with an existing email returns a success response instead of an error to prevent user enumeration.
</Callout>

```ts title="auth.ts"
export const auth = betterAuth({
  emailAndPassword: {
    requireEmailVerification: true, // [!code highlight]
  },
});
```

You can use the `onExistingUserSignUp` callback to notify the existing user when someone tries to register with their email address:

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { sendEmail } from "./email"; // your email sending function

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    onExistingUserSignUp: async ({ user }, request) => {
      void sendEmail({
        to: user.email,
        subject: "Sign-up attempt with your email",
        text: "Someone tried to create an account using your email address. If this was you, try signing in instead. If not, you can safely ignore this email.",
      });
    },
  },
});
```

If a user tries to sign in without verifying their email, you can handle the error and show a message to the user.

```ts
import { authClient } from "@/lib/auth-client"

await authClient.signIn.email(
  {
    email: "email@example.com",
    password: "password",
  },
  {
    onError: (ctx) => {
      // Handle the error
      if (ctx.error.status === 403) {
        alert("Please verify your email address");
      }
      //you can also show the original error message
      alert(ctx.error.message);
    },
  }
);
```

#### Email Enumeration Protection [#email-enumeration-protection]

When `requireEmailVerification` is enabled or `autoSignIn` is set to `false`, the sign-up endpoint prevents email enumeration by returning the same `200` response whether the email is already registered or not. This follows [OWASP authentication best practices](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages).

<Callout type="info">
  This protection is only active when the sign-up response does not include a session token — i.e., when `requireEmailVerification` is `true` or `autoSignIn` is `false`. With the default configuration, the endpoint still returns a `422` error for existing emails.
</Callout>

Similarly, the `/change-email` endpoint no longer reveals whether the target email is already registered — it always returns a success response.

##### Plugins that add user fields [#plugins-that-add-user-fields]

If you use plugins that add fields to the user table (e.g. [admin](/docs/plugins/admin), [two-factor](/docs/plugins/2fa), [phone-number](/docs/plugins/phone-number)), the synthetic response needs to include those fields to be indistinguishable from a real sign-up. Use the `customSyntheticUser` option to build the complete user object:

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      // Admin plugin fields (in schema order)
      role: "user",
      banned: false,
      banReason: null,
      banExpires: null,
      // Your additional fields
      ...additionalFields,
      // ID must be last to match database output order
      id,
    }),
  },
  plugins: [admin()],
});
```

The callback receives three building blocks:

* **`coreFields`** — `name`, `email`, `emailVerified`, `image`, `createdAt`, `updatedAt`
* **`additionalFields`** — Your `user.additionalFields` with defaults applied
* **`id`** — A generated user ID matching your configured ID strategy

You assemble them in the same order as your database schema: core fields → plugin fields → additional fields → id. Each plugin documents the fields you need to add — see [admin plugin](/docs/plugins/admin#email-enumeration-protection) for an example.

#### Triggering manually Email Verification [#triggering-manually-email-verification]

You can trigger the email verification manually by calling the `sendVerificationEmail` function.

```ts
import { authClient } from "@/lib/auth-client"

await authClient.sendVerificationEmail({
  email: "user@email.com",
  callbackURL: "/", // The redirect URL after verification
});
```

### Request Password Reset [#request-password-reset]

To allow users to reset a password first you need to provide `sendResetPassword` function to the email and password authenticator. The `sendResetPassword` function takes a data object with the following properties:

* `user`: The user object.
* `url`: The URL to send to the user which contains the token.
* `token`: A verification token used to complete the password reset.

and a `request` object as the second parameter.

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { sendEmail } from "./email"; // your email sending function

export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({user, url, token}, request) => {
      void sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Click the link to reset your password: ${url}`,
      });
    },
    onPasswordReset: async ({ user }, request) => {
      // your logic here
      console.log(`Password for user ${user.email} has been reset.`);
    },
  },
});
```

<Callout type="warn">
  Avoid awaiting the email sending to prevent
  timing attacks. On serverless platforms, use `waitUntil` or similar to ensure the email is sent.
</Callout>

Additionally, you can provide an `onPasswordReset` callback to execute logic after a password has been successfully reset.

Once you configured your server you can call `requestPasswordReset` function to send reset password link to user. If the user exists, it will trigger the `sendResetPassword` function you provided in the auth config.

**Endpoint:** `POST /request-password-reset`

### Client Side

```ts
const { data, error } = await authClient.requestPasswordReset({
    email: "john.doe@example.com", // required, The email address of the user to send a password reset email to
    redirectTo: "https://example.com/reset-password", // The URL to redirect the user to reset their password. If the token isn't valid or expired, it'll be redirected with a query parameter `?error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?token=VALID_TOKEN
});
```

### Server Side

```ts
const data = await auth.api.requestPasswordReset({
    body: {
        email: "john.doe@example.com", // required, The email address of the user to send a password reset email to
        redirectTo: "https://example.com/reset-password", // The URL to redirect the user to reset their password. If the token isn't valid or expired, it'll be redirected with a query parameter `?error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?token=VALID_TOKEN
    },
});
```

### Type Definition

```ts
type requestPasswordReset = {
    /**
     * The email address of the user to send a password reset email to 
     */
    email: string = "john.doe@example.com"
    /**
     * The URL to redirect the user to reset their password. If the token isn't valid or expired, it'll be redirected with a query parameter `?error=INVALID_TOKEN`. If the token is valid, it'll be redirected with a query parameter `?token=VALID_TOKEN 
     */
    redirectTo?: string = "https://example.com/reset-password"
}
```

When a user clicks on the link in the email, they will be redirected to the reset password page. You can add the reset password page to your app. Then you can use `resetPassword` function to reset the password. It takes an object with the following properties:

* `newPassword`: The new password of the user.

```ts
import { authClient } from "@/lib/auth-client"

const { data, error } = await authClient.resetPassword({
  newPassword: "password1234",
  token,
});
```

**Endpoint:** `POST /reset-password`

### Client Side

```ts
const token = new URLSearchParams(window.location.search).get("token");

if (!token) {
  // Handle the error
}
const { data, error } = await authClient.resetPassword({
    newPassword: "password1234", // required, The new password to set
    token, // required, The token to reset the password
});
```

### Server Side

```ts
const token = new URLSearchParams(window.location.search).get("token");

if (!token) {
  // Handle the error
}
const data = await auth.api.resetPassword({
    body: {
        newPassword: "password1234", // required, The new password to set
        token, // required, The token to reset the password
    },
});
```

### Type Definition

```ts
type resetPassword = {
    /**
     * The new password to set 
     */
    newPassword: string = "password1234"
    /**
     * The token to reset the password 
     */
    token: string
}
```

#### Revoking Sessions on Password Reset [#revoking-sessions-on-password-reset]

By default, other active sessions are **not** revoked when a user resets their password. To revoke all user sessions on password reset, set `revokeSessionsOnPasswordReset` to `true`:

```ts title="auth.ts"
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true, // [!code highlight]
    sendResetPassword: async ({ user, url, token }, request) => {
      // your email sending logic
    },
  },
});
```

### Update password [#update-password]

A user's password isn't stored in the user table. Instead, it's stored in the account table. To change the password of a user, you can use one of the following approaches:

**Endpoint:** `POST /change-password`

### Client Side

```ts
const { data, error } = await authClient.changePassword({
    newPassword: "newpassword1234", // required, The new password to set
    currentPassword: "oldpassword1234", // required, The current user password
    revokeOtherSessions: true, // When set to true, all other active sessions for this user will be invalidated
});
```

### Server Side

```ts
const data = await auth.api.changePassword({
    body: {
        newPassword: "newpassword1234", // required, The new password to set
        currentPassword: "oldpassword1234", // required, The current user password
        revokeOtherSessions: true, // When set to true, all other active sessions for this user will be invalidated
    },
    // This endpoint requires session cookies.
    headers: await headers(),
});
```

### Type Definition

```ts
type changePassword = {
    /**
     * The new password to set 
     */
    newPassword: string = "newpassword1234"
    /**
     * The current user password 
     */
    currentPassword: string = "oldpassword1234"
    /**
     * When set to true, all other active sessions for this user will be invalidated
     */
    revokeOtherSessions?: boolean = true
}
```

### Configuration [#configuration]

**Password**

Better Auth stores passwords inside the `account` table with `providerId` set to `credential`.

**Password Hashing**: Better Auth uses `scrypt` to hash passwords. The `scrypt` algorithm is designed to be slow and memory-intensive to make it difficult for attackers to brute force passwords. OWASP recommends using `scrypt` if `argon2id` is not available. We decided to use `scrypt` because it's natively supported by Node.js.

You can pass custom password hashing algorithm by setting `password` option in the `emailAndPassword` configuration.

**Example**

Here's an example of customizing the password hashing to use Argon2:

```ts title="password.ts"
import { hash, type Options, verify } from "@node-rs/argon2";

const opts: Options = {
  memoryCost: 65536, // 64 MiB
  timeCost: 3, // 3 iterations
  parallelism: 4, // 4 lanes
  outputLen: 32, // 32 bytes
  algorithm: 2, // Argon2id
};

export async function hashPassword(password: string) {
  const result = await hash(password, opts);
  return result;
}

export async function verifyPassword(data: { password: string; hash: string }) {
  const { password, hash } = data;
  const result = await verify(hash, password, opts);
  return result;
}
```

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { hashPassword, verifyPassword } from "./password";

export const auth = betterAuth({
  emailAndPassword: {
    //...rest of the options
    enabled: true,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
});
```



<TypeTable type="emailPasswordOptionsType" />


