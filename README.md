# PISET COOPERATIVE SOCIETY PORT HARCOURT

A mobile-first Progressive Web App (PWA) and desktop-first Admin Treasury Portal built for **PISET Cooperative Society Port Harcourt** (Rivers State, Nigeria) to manage monthly Naira thrift savings, Paystack and manual bank transfer reconciliations, maker-checker governance, and cooperative loan lifecycles.

---

## Environment Variables Required

Create a `.env` file (or configure in AI Studio Secrets / Firebase Functions config) with the following variables:

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `VITE_PAYSTACK_PUBLIC_KEY` | Client (`Vite`) | Paystack Test/Live Public Key (`pk_test_...`) used by the Member App checkout flow (Cards, Bank Transfer, USSD). |
| `PAYSTACK_SECRET_KEY` | Cloud Functions / Webhook | Paystack Secret Key (`sk_test_...`) used by the `paystackWebhook` Cloud Function to verify the `x-paystack-signature` HMAC SHA-512 header before auto-settling contributions. |
| `SMS_PROVIDER_API_KEY` | Cloud Functions | API key for SMS delivery (Termii / Africa's Talking) used by the scheduled loan reminder dispatcher (`dispatchLoanReminders`). |
| `SMS_SENDER_ID` | Cloud Functions | Registered sender alphanumeric ID (default: `PISETCOOP`). |
| `WHATSAPP_BUSINESS_TOKEN` | Cloud Functions | WhatsApp Cloud API bearer token for multi-channel overdue reminders. |
| `GEMINI_API_KEY` | Server | Optional AI Studio runtime key. |
| `APP_URL` | Server / Client | Hosted Cloud Run URL injected at runtime. |

---

## Architecture Overview

1. **Roles & Security (`firestore.rules`)**:
   - Enforces `member`, `treasurer`, and `admin` roles at the database rule level using `/roles/{uid}`.
   - **Maker-Checker Rule**: A manual transfer receipt (`method == 'bank_transfer'`) cannot be approved by the user who uploaded it (`existing().uploadedBy != request.auth.uid`).
   - **Append-Only Ledger & Audit Log**: `/ledger/{entryId}` and `/auditLog/{logId}` strictly disallow `update` and `delete`.
   - **Privacy-Preserving Community Feed**: `/communityLoans/{loanId}` and the `getCommunityActiveLoans` Cloud Function expose **only** `name` and `status` (`Active` / `Repaying`) — never loan amounts, principals, or balances.

2. **Cloud Functions (`functions/src/index.ts`)**:
   - `paystackWebhook`: Verifies `x-paystack-signature` using HMAC-SHA512 (`PAYSTACK_SECRET_KEY`) and atomically confirms the contribution, updates member savings, and appends a settled entry to `/ledger`.
   - `getCommunityActiveLoans`: Callable / HTTPS function returning strictly `{ id, name, status }` for members with active or repaying loans.
   - `dispatchLoanReminders`: Scheduled cron function (`0 8 * * *` Africa/Lagos) that sends SMS, WhatsApp, and in-app reminders 3 days before due date, on the due date, and at 30 and 60+ days overdue.
