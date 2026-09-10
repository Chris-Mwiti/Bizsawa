# Email OTP (/docs/plugins/email-otp)

Email OTP plugin for Better Auth.



The Email OTP plugin allows user to sign in, verify their email, or reset their password using a one-time password (OTP) sent to their email address.

## Installation [#installation]

<Steps>
  <Step>
    ### Add the plugin to your auth config [#add-the-plugin-to-your-auth-config]

    Add the `emailOTP` plugin to your auth config and implement the `sendVerificationOTP()` method.

    ```ts title="auth.ts"
    import { betterAuth } from "better-auth"
    import { emailOTP } from "better-auth/plugins" // [!code highlight]

    export const auth = betterAuth({
        // ... other config options
        plugins: [
            emailOTP({ // [!code highlight]
                async sendVerificationOTP({ email, otp, type }) { // [!code highlight]
                    if (type === "sign-in") { // [!code highlight]
                        // Send the OTP for sign in // [!code highlight]
                    } else if (type === "email-verification") { // [!code highlight]
                        // Send the OTP for email verification // [!code highlight]
                    } else { // [!code highlight]
                        // Send the OTP for password reset // [!code highlight]
                    } // [!code highlight]
                }, // [!code highlight]
            }) // [!code highlight]
        ]
    })
    ```
  </Step>

  <Step>
    ### Add the client plugin [#add-the-client-plugin]

    ```ts title="auth-client.ts"
    import { createAuthClient } from "better-auth/client"
    import { emailOTPClient } from "better-auth/client/plugins" // [!code highlight]

    export const authClient = createAuthClient({
        plugins: [
            emailOTPClient() // [!code highlight]
        ]
    })
    ```
  </Step>
</Steps>

## Usage [#usage]

### Send an OTP [#send-an-otp]

Use the `sendVerificationOtp()` method to send an OTP to the user's email address.

**Endpoint:** `POST /email-otp/send-verification-otp`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.sendVerificationOtp({
    email: "user@example.com", // required, Email address to send the OTP.
    type: "sign-in", // required, Type of the OTP. `sign-in`, `email-verification`, or `forget-password`.
});
```

### Server Side

```ts
const data = await auth.api.sendVerificationOTP({
    body: {
        email: "user@example.com", // required, Email address to send the OTP.
        type: "sign-in", // required, Type of the OTP. `sign-in`, `email-verification`, or `forget-password`.
    },
});
```

### Type Definition

```ts
type sendVerificationOTP = {
    /**
     * Email address to send the OTP. 
     */
    email: string = "user@example.com"
    /**
     * Type of the OTP. `sign-in`, `email-verification`, or `forget-password`. 
     */
    type: "email-verification" | "sign-in" | "forget-password" = "sign-in"
}
```

### Check an OTP (optional) [#check-an-otp-optional]

Use the `checkVerificationOtp()` method to check if an OTP is valid.

**Endpoint:** `POST /email-otp/check-verification-otp`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.checkVerificationOtp({
    email: "user@example.com", // required, Email address to send the OTP.
    type: "sign-in", // required, Type of the OTP. `sign-in`, `email-verification`, or `forget-password`.
    otp: "123456", // required, OTP sent to the email.
});
```

### Server Side

```ts
const data = await auth.api.checkVerificationOTP({
    body: {
        email: "user@example.com", // required, Email address to send the OTP.
        type: "sign-in", // required, Type of the OTP. `sign-in`, `email-verification`, or `forget-password`.
        otp: "123456", // required, OTP sent to the email.
    },
});
```

### Type Definition

```ts
type checkVerificationOTP = {
    /**
     * Email address to send the OTP. 
     */
    email: string = "user@example.com"
    /**
     * Type of the OTP. `sign-in`, `email-verification`, or `forget-password`. 
     */
    type: "email-verification" | "sign-in" | "forget-password" = "sign-in"
    /**
     * OTP sent to the email. 
     */
    otp: string = "123456"
}
```

### Sign In with OTP [#sign-in-with-otp]

To sign in with OTP, use the `sendVerificationOtp()` method to send a "sign-in" OTP to the user's email address.

**Endpoint:** `POST /email-otp/send-verification-otp`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.sendVerificationOtp({
    email: "user@example.com", // required, Email address to send the OTP.
    type: "sign-in", // required, Type of the OTP.
});
```

### Server Side

```ts
const data = await auth.api.sendVerificationOTP({
    body: {
        email: "user@example.com", // required, Email address to send the OTP.
        type: "sign-in", // required, Type of the OTP.
    },
});
```

### Type Definition

```ts
type sendVerificationOTP = {
    /**
     * Email address to send the OTP. 
     */
    email: string = "user@example.com"
    /**
     * Type of the OTP.
     */
    type: "sign-in" = "sign-in"
}
```

Once the user provides the OTP, you can sign in the user using the `signIn.emailOtp()` method.

**Endpoint:** `POST /sign-in/email-otp`

### Client Side

```ts
const { data, error } = await authClient.signIn.emailOtp({
    email: "user@example.com", // required, Email address to sign in.
    otp: "123456", // required, OTP sent to the email.
    name: "John Doe", // User display name. Only used when the user is registering for the first time.
    image: "https://example.com/image.png", // User profile image URL. Only used when the user is registering for the first time.
});
```

### Server Side

```ts
const data = await auth.api.signInEmailOTP({
    body: {
        email: "user@example.com", // required, Email address to sign in.
        otp: "123456", // required, OTP sent to the email.
        name: "John Doe", // User display name. Only used when the user is registering for the first time.
        image: "https://example.com/image.png", // User profile image URL. Only used when the user is registering for the first time.
    },
});
```

### Type Definition

```ts
type signInEmailOTP = {
    /**
     * Email address to sign in.
     */
    email: string = "user@example.com"
    /**
     * OTP sent to the email.
     */
    otp: string = "123456"
    /**
     * User display name. Only used when the user is registering for the first time.
     */
    name?: string = "John Doe"
    /**
     * User profile image URL. Only used when the user is registering for the first time.
     */
    image?: string = "https://example.com/image.png"
}
```

<Callout>
  If the user is not registered, they'll be automatically registered. Configured [additional fields](/docs/concepts/typescript#additional-fields) are also accepted for new users. To prevent automatic sign-up, pass `disableSignUp` as `true` in the [options](#options).
</Callout>

<Callout>
  When a sign-in OTP confirms a pre-existing account whose email was never verified, any existing password on that account is removed and its sessions are revoked. The user is signed in through the OTP and can set a new password through password reset. This keeps email ownership, proven by the OTP, as the source of truth for the account.
</Callout>

### Verify Email with OTP [#verify-email-with-otp]

To verify the user's email address with OTP, use the `sendVerificationOtp()` method to send an "email-verification" OTP to the user's email address.

**Endpoint:** `POST /email-otp/send-verification-otp`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.sendVerificationOtp({
    email: "user@example.com", // required, Email address to send the OTP.
    type: "email-verification", // required, Type of the OTP.
});
```

### Server Side

```ts
const data = await auth.api.sendVerificationOTP({
    body: {
        email: "user@example.com", // required, Email address to send the OTP.
        type: "email-verification", // required, Type of the OTP.
    },
});
```

### Type Definition

```ts
type sendVerificationOTP = {
    /**
     * Email address to send the OTP. 
     */
    email: string = "user@example.com"
    /**
     * Type of the OTP.
     */
    type: "email-verification" = "email-verification"
}
```

Once the user provides the OTP, use the `verifyEmail()` method to complete email verification.

**Endpoint:** `POST /email-otp/verify-email`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.verifyEmail({
    email: "user@example.com", // required, Email address to verify.
    otp: "123456", // required, OTP to verify.
});
```

### Server Side

```ts
const data = await auth.api.verifyEmailOTP({
    body: {
        email: "user@example.com", // required, Email address to verify.
        otp: "123456", // required, OTP to verify.
    },
});
```

### Type Definition

```ts
type verifyEmailOTP = {
    /**
     * Email address to verify. 
     */
    email: string = "user@example.com"
    /**
     * OTP to verify. 
     */
    otp: string = "123456"
}
```

### Reset Password with OTP [#reset-password-with-otp]

To reset the user's password with OTP, use the `emailOtp.requestPasswordReset()` method to send a "forget-password" OTP to the user's email address.

**Endpoint:** `POST /email-otp/request-password-reset`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.requestPasswordReset({
    email: "user@example.com", // required, Email address to send the OTP.
});
```

### Server Side

```ts
const data = await auth.api.requestPasswordResetEmailOTP({
    body: {
        email: "user@example.com", // required, Email address to send the OTP.
    },
});
```

### Type Definition

```ts
type requestPasswordResetEmailOTP = {
    /**
     * Email address to send the OTP.
     */
    email: string = "user@example.com"
}
```

<Callout type="warn">
  The `/forget-password/email-otp` endpoint is deprecated. Please use `/email-otp/request-password-reset` instead.
</Callout>

Once the user provides the OTP, use the `checkVerificationOtp()` method to check if it's valid (optional).

**Endpoint:** `POST /email-otp/check-verification-otp`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.checkVerificationOtp({
    email: "user@example.com", // required, Email address to send the OTP.
    type: "forget-password", // required, Type of the OTP.
    otp: "123456", // required, OTP sent to the email.
});
```

### Server Side

```ts
const data = await auth.api.checkVerificationOTP({
    body: {
        email: "user@example.com", // required, Email address to send the OTP.
        type: "forget-password", // required, Type of the OTP.
        otp: "123456", // required, OTP sent to the email.
    },
});
```

### Type Definition

```ts
type checkVerificationOTP = {
    /**
     * Email address to send the OTP. 
     */
    email: string = "user@example.com"
    /**
     * Type of the OTP.
     */
    type: "forget-password" = "forget-password"
    /**
     * OTP sent to the email. 
     */
    otp: string = "123456"
}
```

Then, use the `resetPassword()` method to reset the user's password.

**Endpoint:** `POST /email-otp/reset-password`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.resetPassword({
    email: "user@example.com", // required, Email address to reset the password.
    otp: "123456", // required, OTP sent to the email.
    password: "new-secure-password", // required, New password.
});
```

### Server Side

```ts
const data = await auth.api.resetPasswordEmailOTP({
    body: {
        email: "user@example.com", // required, Email address to reset the password.
        otp: "123456", // required, OTP sent to the email.
        password: "new-secure-password", // required, New password.
    },
});
```

### Type Definition

```ts
type resetPasswordEmailOTP = {
    /**
     * Email address to reset the password. 
     */
    email: string = "user@example.com"
    /**
     * OTP sent to the email. 
     */
    otp: string = "123456"
    /**
     * New password. 
     */
    password: string = "new-secure-password"
}
```

### Change Email with OTP [#change-email-with-otp]

To allow users to change their email with OTP, first enable the `changeEmail` feature, which is disabled by default. Set `changeEmail.enabled` to `true`:

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    plugins: [
        emailOTP({
            changeEmail: {
                enabled: true, // [!code highlight]
            }
        })
    ]
})
```

By default, when a user requests to change their email, an OTP is sent to the **new** email address.
The email is only updated after the user verifies the new email.

#### Usage [#usage-1]

To change the user's email address with OTP, use the `emailOtp.requestEmailChange()` method to send a "change-email" OTP to the user's new email address.

**Endpoint:** `POST /email-otp/request-email-change`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.requestEmailChange({
    newEmail: "user@example.com", // required, New email address to send the OTP.
    otp: "123456", // OTP sent to the current email. This is required when the `changeEmail.verifyCurrentEmail` option is set to `true`.
});
```

### Server Side

```ts
const data = await auth.api.requestEmailChangeEmailOTP({
    body: {
        newEmail: "user@example.com", // required, New email address to send the OTP.
        otp: "123456", // OTP sent to the current email. This is required when the `changeEmail.verifyCurrentEmail` option is set to `true`.
    },
    // This endpoint requires session cookies.
    headers: await headers(),
});
```

### Type Definition

```ts
type requestEmailChangeEmailOTP = {
    /**
     * New email address to send the OTP.
     */
    newEmail: string = "user@example.com"
    /**
     * OTP sent to the current email. This is required when the `changeEmail.verifyCurrentEmail` option is set to `true`.
     */
    otp?: string = "123456"
}
```

Once the user provides the OTP, use the `changeEmail()` method to change the user's email address.

**Endpoint:** `POST /email-otp/change-email`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.changeEmail({
    newEmail: "user@example.com", // required, New email address to change to.
    otp: "123456", // required, OTP sent to the new email.
});
```

### Server Side

```ts
const data = await auth.api.changeEmailEmailOTP({
    body: {
        newEmail: "user@example.com", // required, New email address to change to.
        otp: "123456", // required, OTP sent to the new email.
    },
    // This endpoint requires session cookies.
    headers: await headers(),
});
```

### Type Definition

```ts
type changeEmailEmailOTP = {
    /**
     * New email address to change to. 
     */
    newEmail: string = "user@example.com"
    /**
     * OTP sent to the new email. 
     */
    otp: string = "123456"
}
```

#### Confirming with Current Email [#confirming-with-current-email]

For added security, you can require users to confirm the change with an OTP sent to their **current** email before
sending an OTP to the new email address. To enable this, set `changeEmail.verifyCurrentEmail` to `true` in the plugin options.

```ts title="auth.ts"
import { betterAuth } from "better-auth";

export const auth = betterAuth({
    plugins: [
        emailOTP({
            changeEmail: {
                enabled: true,
                verifyCurrentEmail: true, // [!code highlight]
            }
        })
    ]
})
```

Before requesting the email change, use the `sendVerificationOtp()` method with type `email-verification` to send an OTP to the user's email address.

**Endpoint:** `POST /email-otp/send-verification-otp`

### Client Side

```ts
const { data, error } = await authClient.emailOtp.sendVerificationOtp({
    email: "user@example.com", // required, Email address to send the OTP.
    type: "email-verification", // required, Type of the OTP. Must be `email-verification` for confirming email change.
});
```

### Server Side

```ts
const data = await auth.api.sendVerificationOTP({
    body: {
        email: "user@example.com", // required, Email address to send the OTP.
        type: "email-verification", // required, Type of the OTP. Must be `email-verification` for confirming email change.
    },
});
```

### Type Definition

```ts
type sendVerificationOTP = {
    /**
     * Email address to send the OTP. 
     */
    email: string = "user@example.com"
    /**
     * Type of the OTP. Must be `email-verification` for confirming email change.
     */
    type: string = "email-verification"
}
```

Then, the user can provide the OTP when calling `requestEmailChange()`. The system will first verify the OTP sent to the current email before sending an OTP to the new email.

### Override Default Email Verification [#override-default-email-verification]

To override the default email verification, pass `overrideDefaultEmailVerification: true` in the options. This will make the system use an email OTP instead of the default verification link whenever email verification is triggered. In other words, the user will verify their email using an OTP rather than clicking a link.

```ts title="auth.ts"
import { betterAuth } from "better-auth";
import { emailOTP } from "better-auth/plugins"

export const auth = betterAuth({
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true, // [!code highlight]
      async sendVerificationOTP({ email, otp, type }) {
        // Implement the sendVerificationOTP method to send the OTP to the user's email address
      },
    }),
  ],
});
```

## Options [#options]

* `sendVerificationOTP`: A function that sends the OTP to the user's email address. The function receives an object with the following properties:

  * `email`: The user's email address.
  * `otp`: The OTP to send.
  * `type`: The type of OTP to send. Can be "sign-in", "email-verification", or "forget-password".

  <Callout type="warn">
    It is recommended to not await the email sending to avoid timing attacks. On serverless platforms, use `waitUntil` or similar to ensure the email is sent.
  </Callout>

* `otpLength`: The length of the OTP. Defaults to `6`.

* `expiresIn`: The expiry time of the OTP in seconds. Defaults to `300` seconds.

```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { emailOTP } from "better-auth/plugins"

export const auth = betterAuth({
    plugins: [
        emailOTP({
            otpLength: 8,
            expiresIn: 600
        })
    ]
})
```

* `sendVerificationOnSignUp`: A boolean value that determines whether to send the OTP when a user signs up. Defaults to `false`.

* `disableSignUp`: A boolean value that determines whether to prevent automatic sign-up when the user is not registered. Defaults to `false`.

* `generateOTP`: A function that generates the OTP. Defaults to a random 6-digit number.

* `allowedAttempts`: The maximum number of attempts allowed for verifying an OTP. Defaults to `3`. After exceeding this limit, the OTP becomes invalid and the user needs to request a new one.

```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { emailOTP } from "better-auth/plugins"

export const auth = betterAuth({
    plugins: [
        emailOTP({
            allowedAttempts: 5, // Allow 5 attempts before invalidating the OTP
            expiresIn: 300
        })
    ]
})
```

When the maximum attempts are exceeded, the `verifyOTP`, `signIn.emailOtp`, `verifyEmail`, and `resetPassword` methods will return an error with code `TOO_MANY_ATTEMPTS`.

* `resendStrategy`: Controls what happens when a user requests a new OTP while an existing one is still valid. Defaults to `"rotate"`.
  * `"rotate"`: Always generates a new OTP (default behavior).
  * `"reuse"`: Resends the same OTP and extends its expiry. This prevents multiple valid codes from existing simultaneously when emails are delayed. Only works when the OTP is recoverable (`plain`, `encrypted`, or custom encrypt/decrypt). Falls back to `"rotate"` when the OTP is hashed. If the allowed attempts have been exhausted, a fresh OTP is generated instead of reusing the exhausted one.

```ts title="auth.ts"
import { betterAuth } from "better-auth"
import { emailOTP } from "better-auth/plugins"

export const auth = betterAuth({
    plugins: [
        emailOTP({
            resendStrategy: "reuse", // [!code highlight]
            async sendVerificationOTP({ email, otp, type }) {
                // send the OTP
            },
        })
    ]
})
```

* `storeOTP`: The method used to transform the OTP before it is stored by Better Auth's verification layer, whether `encrypted`, `hashed` or `plain` text. Default is `plain` text.

<Callout>
  Note: This will not affect the OTP sent to the user. It only affects the stored OTP value. The storage backend itself is controlled by the global [`verification`](/docs/reference/options#verification) config, so if you configure `secondaryStorage`, these verification records can live there instead of the database.
</Callout>

Alternatively, you can pass a custom encryptor or hasher to control how the stored OTP value is persisted.

**Custom encryptor**

```ts title="auth.ts"
emailOTP({
    storeOTP: { 
        encrypt: async (otp) => {
            return myCustomEncryptor(otp);
        },
        decrypt: async (otp) => {
            return myCustomDecryptor(otp);
        },
    }
})
```

**Custom hasher**

```ts title="auth.ts"
emailOTP({
    storeOTP: {
        hash: async (otp) => {
            return myCustomHasher(otp);
        },
    }
})
```


