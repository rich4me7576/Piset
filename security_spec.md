# PISET Cooperative Society Port Harcourt — Security Specification (Phase 0 & Phase 5 Audit)

## 1. Data Invariants & Access Control Matrix
1. **Role Verification Invariant**: Roles (`member`, `treasurer`, `admin`) are stored in `/roles/{uid}` and never trusted from client claims. The runtime owner (`rich4me7576@gmail.com` with `email_verified == true`) is also recognized as a bootstrapped admin.
2. **PII Isolation Invariant**: `/members/{memberId}` contains PII (`phone`, `monthlyPledge`, `totalSavings`). Read access (`get` and `list`) is strictly restricted to the document owner (`resource.data.uid == request.auth.uid`) or `isTreasurerOrAdmin()`.
3. **Maker-Checker Invariant**: On `/contributions/{contributionId}`, transitioning `status` from `'pending'` to `'confirmed'` or `'rejected'` requires `isTreasurerOrAdmin()` AND `existing().uploadedBy != request.auth.uid` AND `incoming().approvedBy == request.auth.uid`. Whoever uploaded a manual transfer receipt cannot approve it.
4. **Append-Only Ledger & Audit Log Invariant**: `/ledger/{entryId}` and `/auditLog/{logId}` strictly forbid `update` and `delete` (`allow update, delete: if false;`). Only treasurers/admins can append new entries.
5. **Community Privacy Projection Invariant**: `/communityLoans/{loanId}` strictly enforces `data.keys().hasOnly(['name', 'status'])` so no principal, balance, or schedule fields can ever be stored or leaked to members.

## 2. The "Dirty Dozen" Payloads (Adversarial Test Cases)
1. **Shadow Field Injection on Contribution Create**: `{ memberId: "m1", ..., isVerified: true }` -> Rejected by `hasOnly()`.
2. **Self-Approval Maker-Checker Violation**: Uploader `uid_A` attempts to update their own contribution `status: 'confirmed'` -> Rejected by `existing().uploadedBy != request.auth.uid`.
3. **Ledger Mutation Attack**: Admin attempts to `update` or `delete` an existing `/ledger/{entryId}` document -> Rejected by `allow update, delete: if false;`.
4. **PII Scraping on Members**: Authenticated member `uid_B` attempts `get` or `list` on `/members/m_other` -> Rejected by `resource.data.uid == request.auth.uid || isTreasurerOrAdmin()`.
5. **Unverified Email Admin Spoof**: Token has `email == 'rich4me7576@gmail.com'` but `email_verified == false` -> Rejected by `request.auth.token.email_verified == true`.
6. **Privilege Escalation via `/roles/{uid}`**: Member attempts to create or update `/roles/uid_B` with `role: 'admin'` -> Rejected because only `isAdmin()` can write to `/roles/{uid}`.
7. **Terminal Contribution Mutation**: Treasurer attempts to update a contribution whose `existing().status == 'confirmed'` -> Rejected by terminal state lock (`existing().status == 'pending'`).
8. **Community Loan Financial Leak**: Admin attempts to write `principal: 500000` into `/communityLoans/loan_1` -> Rejected by `hasOnly(['name', 'status'])`.
9. **ID Poisoning Attack**: Client attempts to create `/contributions/{200_char_invalid_id}` -> Rejected by `isValidId()`.
10. **Negative Amount Poisoning**: Member creates a contribution with `amount: -50000` -> Rejected by `data.amount > 0`.
11. **Identity Spoofing on Contribution Upload**: Member `uid_A` creates a contribution with `uploadedBy: 'uid_B'` -> Rejected by `incoming().uploadedBy == request.auth.uid`.
12. **Unbounded Loan Schedule Array**: Client creates a loan with 500 schedule items -> Rejected by `data.schedule.size() <= 24`.

## 3. Phase 5 Red Team Conflict Report
- **Identity Spoofing**: Blocked across all collections (`uploadedBy == request.auth.uid`, `actor == request.auth.uid`).
- **State Shortcutting**: Blocked via terminal state lock (`existing().status == 'pending'`) on contributions and loans.
- **Resource Poisoning**: Blocked via `isValidId()` and `.size()` limits on every string and list.
- **Value Poisoning**: Blocked because `isValid[Entity](incoming())` wraps every `create` and `update` block.
