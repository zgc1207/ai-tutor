# Deployment

This directory contains environment templates for internal testing and production.

## Internal Test

1. Copy `deploy/internal.env.example` into the target platform secret manager.
2. Replace every `replace-*` value with a real secret or target URL.
3. Keep `ALLOW_LEGACY_USER_ID_AUTH=false` and `ALLOW_PUBLIC_UPLOAD_ACCESS=false`.
4. Run `cd server && npm run deploy:check -- --profile internal` in the target environment.
5. Run database migrations with `cd server && npm run prisma:deploy`.
6. Run `cd server && npm run verify:db` against the target database.

Internal testing may keep `AUTH_OTP_DEV_MODE=true`, `OCR_PROVIDER=mock`, `PAYMENT_PROVIDER=dev`, and `PUSH_PROVIDER=dev` only while the invite list is controlled.

## Production

1. Copy `deploy/production.env.example` into the production secret manager.
2. Replace every placeholder with real provider credentials and production origins.
3. Set readiness flags only after real checks pass:
   - `LLM_READY=true` after `ai:check`, real `eval:ai`, and manual review pass.
   - `PRODUCTION_AUTH_READY=true` after real OTP delivery and mock login shutdown are verified.
   - `OBJECT_STORAGE_READY=true` after image uploads use object storage or signed upload gateway.
   - `PAYMENT_READY=true` after payment, refund, webhook, and reconciliation checks pass.
   - `PUSH_READY=true` after real device delivery and opt-out behavior are verified.
   - `HTTPS_READY=true` after HTTPS is enforced end to end.
4. Run `cd server && npm run deploy:check -- --profile production`.
5. Run `cd server && npm run verify:db`.

Do not commit filled `.env` files or provider secrets.
