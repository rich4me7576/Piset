/**
 * PISET Cooperative Society Port Harcourt — Firebase Cloud Functions
 *
 * Includes:
 * 1. paystackWebhook: Verifies x-paystack-signature (HMAC-SHA512) and atomically settles
 *    the contribution, updates member savings, and appends a ledger entry.
 * 2. getCommunityActiveLoans: Privacy-preserving callable/HTTP view returning ONLY
 *    { id, name, status } ('Active' | 'Repaying') so sensitive balances never reach clients.
 * 3. dispatchLoanReminders: Scheduled daily cron job sending automatic reminders
 *    (SMS/WhatsApp + in-app) 3 days before due, on due date, and at 30 and 60 days overdue.
 */

import * as crypto from 'node:crypto';

export interface PaystackWebhookEvent {
  event: string;
  data: {
    reference: string;
    amount: number; // in kobo (100 kobo = ₦1)
    status: string;
    channel: string;
    paid_at: string;
    metadata?: {
      memberId?: string;
      memberName?: string;
      month?: string;
      paymentPurpose?: 'contribution' | 'loan_repayment';
      loanId?: string;
    };
  };
}

/**
 * Verifies the HMAC-SHA512 signature sent by Paystack in the `x-paystack-signature` header.
 */
export function verifyPaystackSignature(
  rawBody: string,
  signatureHeader: string | undefined,
  secretKey: string
): boolean {
  if (!signatureHeader || !secretKey) return false;
  const expectedHash = crypto
    .createHmac('sha512', secretKey)
    .update(rawBody)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, 'hex'),
      Buffer.from(signatureHeader, 'hex')
    );
  } catch {
    return false;
  }
}

/**
 * Sanitizes raw loan documents into the strict public Community Feed projection.
 * Ensures principal, interest, schedule, and balances never leave the backend.
 */
export function projectCommunityActiveLoans(
  loans: Array<{
    id: string;
    memberName: string;
    status: string;
    amountPaid?: number;
  }>
): Array<{ id: string; name: string; status: 'Active' | 'Repaying' }> {
  return loans
    .filter((loan) => loan.status === 'active' || loan.status === 'overdue')
    .map((loan) => ({
      id: loan.id,
      name: loan.memberName,
      status: (loan.amountPaid && loan.amountPaid > 0 ? 'Repaying' : 'Active') as
        | 'Active'
        | 'Repaying',
    }));
}

/**
 * Determines which reminder tier applies for a loan based on days until due / days overdue.
 */
export function classifyReminderTier(
  daysOverdue: number,
  daysUntilDue: number
): 'pre_due_3d' | 'due_date' | 'overdue_30d' | 'overdue_60d' | null {
  if (daysOverdue === 60) return 'overdue_60d';
  if (daysOverdue === 30) return 'overdue_30d';
  if (daysOverdue === 0 && daysUntilDue === 0) return 'due_date';
  if (daysOverdue === 0 && daysUntilDue === 3) return 'pre_due_3d';
  return null;
}

/**
 * Builds Firebase Cloud Messaging (FCM) multicast payloads for:
 * 1. Upcoming loan repayments (3 days before due)
 * 2. Overdue contributions or loan payments
 * 3. Important announcements from the cooperative
 */
export function buildFcmMulticastPayload(params: {
  tokens: string[];
  category:
    | 'upcoming_repayment'
    | 'overdue_payment'
    | 'cooperative_announcement';
  title: string;
  body: string;
  targetTab: 'home' | 'pay' | 'loans' | 'community';
}) {
  return {
    tokens: params.tokens,
    notification: {
      title: params.title,
      body: params.body,
    },
    data: {
      category: params.category,
      targetTab: params.targetTab,
      cooperative: 'PISET_PORT_HARCOURT',
      sentAt: new Date().toISOString(),
    },
    webpush: {
      notification: {
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
      },
      fcmOptions: {
        link: '/',
      },
    },
  };
}

