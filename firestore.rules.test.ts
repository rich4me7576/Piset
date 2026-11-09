import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const rulesContent = fs.readFileSync(rulesPath, 'utf8');

test('Firestore rules enforce default-deny catch-all at root', () => {
  assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/);
});

test('Firestore rules enforce Maker-Checker invariance on contribution approval', () => {
  assert.match(rulesContent, /existing\(\)\.uploadedBy != request\.auth\.uid/);
  assert.match(rulesContent, /incoming\(\)\.approvedBy == request\.auth\.uid/);
});

test('Firestore rules enforce append-only immutability on /ledger and /auditLog', () => {
  assert.match(rulesContent, /match \/ledger\/\{entryId\}[\s\S]*?allow update, delete: if false;/);
  assert.match(rulesContent, /match \/auditLog\/\{logId\}[\s\S]*?allow update, delete: if false;/);
});

test('Firestore rules restrict /communityLoans to ONLY name and status keys', () => {
  assert.match(rulesContent, /data\.keys\(\)\.hasOnly\(\['name', 'status'\]\)/);
});

test('Firestore rules verify email_verified == true and protect against Dirty Dozen payloads', () => {
  assert.match(rulesContent, /request\.auth\.token\.email_verified == true/);
  assert.match(rulesContent, /data\.schedule\.size\(\) <= 24/);
  assert.match(rulesContent, /data\.amount > 0/);
});

test('Firestore rules enforce owner-only access on /biometricCredentials and /fcmTokens', () => {
  assert.match(rulesContent, /match \/biometricCredentials\/\{uid\}[\s\S]*?request\.auth\.uid == uid/);
  assert.match(rulesContent, /isValidBiometricCredential\(incoming\(\)\)/);
  assert.match(rulesContent, /isValidFcmToken\(incoming\(\)\)/);
});

test('Firestore rules validate FCM /notifications categories and restrict deletion', () => {
  assert.match(rulesContent, /data\.category == 'upcoming_repayment'/);
  assert.match(rulesContent, /data\.category == 'overdue_payment'/);
  assert.match(rulesContent, /data\.category == 'cooperative_announcement'/);
  assert.match(rulesContent, /match \/notifications\/\{notificationId\}[\s\S]*?allow delete: if false;/);
});

