/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  initializeFcmMessaging,
  OperationType,
} from './firebase';
import {
  AuditLogRecord,
  ContributionRecord,
  INITIAL_AUDIT_LOGS,
  INITIAL_BIOMETRIC_CREDENTIALS,
  INITIAL_CONTRIBUTIONS,
  INITIAL_HAPPENINGS,
  INITIAL_LEDGER,
  INITIAL_LOANS,
  INITIAL_MEMBERS,
  INITIAL_PUSH_NOTIFICATIONS,
  INITIAL_REMINDERS,
  LedgerRecord,
  LoanRecord,
  MemberRecord,
  ReminderRecord,
} from './data/seedData';
import {
  ADMIN_EXECUTIVE_ROLES,
  AdminExecutiveRole,
  BiometricCredentialRecord,
  CooperativeHappeningItem,
  CooperativeSyncRow,
  DEFAULT_ADMIN_PORTAL_PASSWORD,
  PushNotificationCategory,
  PushNotificationItem,
  calculateTreasuryKPIs,
  createFcmPushNotification,
  formatNaira,
  generateEmailBindingOtp,
  generateRepaymentSchedule,
  resolveAdminExecutiveRole,
  validateAdminPasswordChange,
  validateMakerCheckerApproval,
  verifyAdminPortalPassword,
} from './utils/coopRules';
import { MemberApp, MemberTab } from './components/MemberApp';
import { AdminPortal, AdminSection } from './components/AdminPortal';
import {
  AuthModal,
  BiometricSetupModal,
  PinLockOverlay,
} from './components/AuthAndLockModal';
import { PushNotificationsModal } from './components/PushNotificationsModal';
import { OfflineBanner, PWAInstallButton } from './components/PWAInstallButton';

export default function App() {
  const [experience, setExperience] = useState<'member' | 'admin'>('member');
  const [memberTab, setMemberTab] = useState<MemberTab>('home');
  const [adminSection, setAdminSection] = useState<AdminSection>('treasury');

  // Core Cooperative State (seeded with 12 members, active/overdue loans, and pending receipts)
  const [members, setMembers] = useState<MemberRecord[]>(INITIAL_MEMBERS);
  const [contributions, setContributions] = useState<ContributionRecord[]>(
    INITIAL_CONTRIBUTIONS
  );
  const [loans, setLoans] = useState<LoanRecord[]>(INITIAL_LOANS);
  const [ledger, setLedger] = useState<LedgerRecord[]>(INITIAL_LEDGER);
  const [reminders, setReminders] =
    useState<ReminderRecord[]>(INITIAL_REMINDERS);
  const [auditLogs, setAuditLogs] =
    useState<AuditLogRecord[]>(INITIAL_AUDIT_LOGS);
  const [happenings, setHappenings] =
    useState<CooperativeHappeningItem[]>(INITIAL_HAPPENINGS);
  const [extraLiquidityPool, setExtraLiquidityPool] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>(() =>
    new Date().toISOString()
  );

  // Active member for Member App (default: Chukwudi Nwoye)
  const [activeMemberId, setActiveMemberId] = useState<string>('mem_01');
  // Active operator for Admin Portal (default: Boma Briggs — PRESIDENT, can switch across all 5 Executive Roles)
  const [adminOperatorId, setAdminOperatorId] = useState<string>('mem_02');
  const [activeExecutiveRole, setActiveExecutiveRole] =
    useState<AdminExecutiveRole>('PRESIDENT');

  // Biometric Credentials & FCM Push Notifications State
  const [biometricCredentials, setBiometricCredentials] = useState<
    Record<string, BiometricCredentialRecord>
  >(INITIAL_BIOMETRIC_CREDENTIALS);
  const [pushNotifications, setPushNotifications] = useState<
    PushNotificationItem[]
  >(INITIAL_PUSH_NOTIFICATIONS);
  const [fcmToken, setFcmToken] = useState<string>(
    'fcm_phc_web_token_mem01_a94f82e10b'
  );
  const [fcmEnabled, setFcmEnabled] = useState<boolean>(true);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showBiometricSetupModal, setShowBiometricSetupModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [signedInUserName, setSignedInUserName] = useState<string>('');
  const [adminPortalPassword, setAdminPortalPassword] = useState<string>(
    DEFAULT_ADMIN_PORTAL_PASSWORD
  );
  const [isAdminAuthenticated, setIsAdminAuthenticated] =
    useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const activeMember =
    members.find((m) => m.id === activeMemberId) || members[0];
  const activeRoleProfile = resolveAdminExecutiveRole(activeExecutiveRole);
  const baseOperator =
    members.find((m) => m.id === adminOperatorId) || members[1];
  const currentOperator: MemberRecord = {
    ...baseOperator,
    role: activeRoleProfile.systemRole,
  };
  const liveTreasuryKPIs = calculateTreasuryKPIs(
    members,
    loans,
    extraLiquidityPool
  );

  const activeBiometricCredential: BiometricCredentialRecord =
    biometricCredentials[activeMember.uid] || {
      uid: activeMember.uid,
      memberId: activeMember.id,
      credentialId: 'webauthn_cred_default_01',
      modality: 'fingerprint',
      deviceLabel: 'Web Passkey Authenticator',
      pinHash: 'pbkdf2_sha256_4f020e3c',
      biometricEnabled: true,
      pinEnabled: true,
      enrolledAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString(),
    };

  const memberPushNotifications = pushNotifications.filter(
    (n) =>
      n.recipientMemberId === activeMember.id || n.recipientMemberId === 'all'
  );

  const notify = (msg: string) => {
    setToastMessage(msg);
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4500);
    return () => clearTimeout(t);
  }, [toastMessage]);

  // Listen to Firebase Auth state & sync verified user profile if signed in
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const displayName =
          user.displayName ||
          (user.email ? user.email.split('@')[0] : '') ||
          'Cooperative Member';
        setIsSignedIn(true);
        setSignedInUserName(displayName);
      }
      if (user && user.emailVerified) {
        const path = `members/${user.uid}`;
        try {
          await setDoc(
            doc(db, 'members', user.uid),
            {
              uid: user.uid,
              name: user.displayName || 'Cooperative Member',
              phone: user.phoneNumber || '+234 803 000 0000',
              joinDate: new Date().toISOString().slice(0, 10),
              status: 'active',
              monthlyPledge: 100000,
              totalSavings: 500000,
              role: 'member',
            },
            { merge: true }
          );
        } catch (err) {
          // Only invoke handleFirestoreError if unexpected permission failure
          if (
            err instanceof Error &&
            err.message.includes('Missing or insufficient permissions')
          ) {
            handleFirestoreError(err, OperationType.WRITE, path);
          }
        }
      }
    });
    return () => unsub();
  }, []);

  // 1. Paystack Payment (Auto-confirmed via signed webhook simulation)
  const handlePaystackPayment = (payload: {
    amount: number;
    month: string;
    channel: 'card' | 'bank_transfer' | 'ussd';
    purpose: 'contribution' | 'loan_repayment';
    loanId?: string;
  }) => {
    const nowIso = new Date().toISOString();
    const ref = `PSTK_PHC_${Date.now().toString().slice(-6)}`;

    if (payload.purpose === 'loan_repayment' && payload.loanId) {
      setLoans((prev) =>
        prev.map((loan) => {
          if (loan.id !== payload.loanId) return loan;
          const nextPaid = loan.amountPaid + payload.amount;
          const totalObligation = loan.principal + loan.interest;
          const isNowRepaid = nextPaid >= totalObligation;
          let markedOneInstallment = false;
          const nextSchedule = loan.schedule.map((inst) => {
            if (!markedOneInstallment && inst.status !== 'paid') {
              markedOneInstallment = true;
              return { ...inst, status: 'paid' as const };
            }
            return inst;
          });
          return {
            ...loan,
            amountPaid: nextPaid,
            status: isNowRepaid ? 'repaid' : 'active',
            daysOverdue: isNowRepaid ? 0 : loan.daysOverdue,
            schedule: nextSchedule,
          };
        })
      );

      const newLedger: LedgerRecord = {
        id: `led_${Date.now()}`,
        type: 'loan_repayment',
        amount: payload.amount,
        source: `Paystack ${payload.channel.toUpperCase()} (${ref})`,
        status: 'settled',
        approvedBy: 'paystack_webhook',
        approvedByName: 'Paystack Webhook (HMAC Verified)',
        memberName: activeMember.name,
        timestamp: nowIso,
      };
      setLedger((prev) => [newLedger, ...prev]);
      notify(
        `Paystack webhook verified (${ref}): Loan repayment of ${formatNaira(
          payload.amount
        )} auto-settled and written to ledger.`
      );
      return;
    }

    // Monthly Thrift Contribution via Paystack
    const newContrib: ContributionRecord = {
      id: `contrib_${Date.now()}`,
      memberId: activeMember.id,
      memberName: activeMember.name,
      month: payload.month,
      amount: payload.amount,
      method: 'paystack',
      status: 'confirmed',
      receiptUrl: '',
      paystackRef: ref,
      uploadedBy: activeMember.uid,
      uploadedByName: activeMember.name,
      approvedBy: 'paystack_webhook',
      approvedByName: 'Paystack Webhook (HMAC Verified)',
      rejectionReason: '',
      createdAt: nowIso,
    };

    const newLedger: LedgerRecord = {
      id: `led_${Date.now()}`,
      type: 'contribution',
      amount: payload.amount,
      source: `Paystack ${payload.channel.toUpperCase()} (${ref})`,
      status: 'settled',
      approvedBy: 'paystack_webhook',
      approvedByName: 'Paystack Webhook',
      memberName: activeMember.name,
      timestamp: nowIso,
    };

    setContributions((prev) => [newContrib, ...prev]);
    setLedger((prev) => [newLedger, ...prev]);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === activeMember.id
          ? { ...m, totalSavings: m.totalSavings + payload.amount }
          : m
      )
    );

    notify(
      `Paystack payment (${formatNaira(
        payload.amount
      )}) auto-confirmed via webhook and added to your savings!`
    );
  };

  // 2. Manual Bank Transfer Upload ("I paid by transfer" -> status: pending "Awaiting confirmation")
  const handleManualTransferUpload = (payload: {
    amount: number;
    month: string;
    bankName: string;
    senderAccount: string;
    receiptUrl: string;
  }) => {
    const nowIso = new Date().toISOString();
    const newContrib: ContributionRecord = {
      id: `contrib_${Date.now()}`,
      memberId: activeMember.id,
      memberName: activeMember.name,
      month: payload.month,
      amount: payload.amount,
      method: 'bank_transfer',
      status: 'pending',
      receiptUrl: payload.receiptUrl,
      bankName: payload.bankName,
      senderAccount: payload.senderAccount,
      paystackRef: '',
      uploadedBy: activeMember.uid,
      uploadedByName: activeMember.name,
      approvedBy: '',
      rejectionReason: '',
      createdAt: nowIso,
    };

    setContributions((prev) => [newContrib, ...prev]);
    notify(
      `Transfer receipt for ${formatNaira(
        payload.amount
      )} uploaded. Status: Awaiting confirmation by Treasurer/Admin.`
    );
  };

  // 3. Maker-Checker Approval of Manual Transfer (updates contribution + writes ledger entry in one transaction)
  const handleApproveContribution = (contributionId: string) => {
    const target = contributions.find((c) => c.id === contributionId);
    if (!target || target.status !== 'pending') return;

    const validation = validateMakerCheckerApproval(
      target.uploadedBy,
      currentOperator.uid,
      currentOperator.role
    );
    if (!validation.allowed) {
      notify(validation.reason || 'Maker-checker rule prevents approval.');
      return;
    }

    const nowIso = new Date().toISOString();
    setContributions((prev) =>
      prev.map((c) =>
        c.id === contributionId
          ? {
              ...c,
              status: 'confirmed',
              approvedBy: currentOperator.uid,
              approvedByName: `${currentOperator.name} (${currentOperator.role})`,
            }
          : c
      )
    );

    setMembers((prev) =>
      prev.map((m) => {
        if (m.id !== target.memberId) return m;
        const updatedGrid = m.contributionGrid.map((cell, idx) =>
          idx === m.contributionGrid.length - 1
            ? {
                ...cell,
                status: 'paid' as const,
                amount: cell.amount + target.amount,
              }
            : cell
        );
        return {
          ...m,
          totalSavings: m.totalSavings + target.amount,
          contributionGrid: updatedGrid,
        };
      })
    );

    const newLedger: LedgerRecord = {
      id: `led_${Date.now()}`,
      type: 'contribution',
      amount: target.amount,
      source: `Manual Transfer (${target.bankName || 'NIP'}) — #${target.id}`,
      status: 'settled',
      approvedBy: currentOperator.uid,
      approvedByName: `${currentOperator.name} (${currentOperator.role})`,
      memberName: target.memberName,
      timestamp: nowIso,
    };

    const newAudit: AuditLogRecord = {
      id: `aud_${Date.now()}`,
      actor: currentOperator.uid,
      actorName: currentOperator.name,
      actorRole: currentOperator.role,
      action: 'APPROVE_MANUAL_TRANSFER',
      target: `Contribution ${target.id} (${target.memberName} — ${formatNaira(
        target.amount
      )})`,
      timestamp: nowIso,
    };

    const newHap: CooperativeHappeningItem = {
      id: `hap_approve_${Date.now()}`,
      title: `Manual Transfer Approved (${target.month})`,
      summary: `Approved ${formatNaira(
        target.amount
      )} bank transfer for ${target.memberName} by ${currentOperator.name}. Synchronized with Member Dashboard.`,
      category: 'contribution',
      amount: target.amount,
      memberId: target.memberId,
      memberName: target.memberName,
      sourceFormat: 'admin_portal',
      publishedAt: nowIso,
    };

    setLedger((prev) => [newLedger, ...prev]);
    setAuditLogs((prev) => [newAudit, ...prev]);
    setHappenings((prev) => [newHap, ...prev]);
    setLastSyncedAt(nowIso);
    notify(
      `Approved ${target.memberName}'s ${formatNaira(
        target.amount
      )} transfer, appended entry #${newLedger.id} to ledger, and synchronized with Member Dashboard.`
    );
  };

  // 4. Reject Manual Transfer (Reason required)
  const handleRejectContribution = (contributionId: string, reason: string) => {
    const target = contributions.find((c) => c.id === contributionId);
    if (!target || target.status !== 'pending') return;

    const nowIso = new Date().toISOString();
    setContributions((prev) =>
      prev.map((c) =>
        c.id === contributionId
          ? {
              ...c,
              status: 'rejected',
              approvedBy: currentOperator.uid,
              approvedByName: `${currentOperator.name} (${currentOperator.role})`,
              rejectionReason: reason,
            }
          : c
      )
    );

    const newAudit: AuditLogRecord = {
      id: `aud_${Date.now()}`,
      actor: currentOperator.uid,
      actorName: currentOperator.name,
      actorRole: currentOperator.role,
      action: 'REJECT_MANUAL_TRANSFER',
      target: `Contribution ${target.id} (${target.memberName}) — Reason: ${reason}`,
      timestamp: nowIso,
    };
    setAuditLogs((prev) => [newAudit, ...prev]);
    setLastSyncedAt(nowIso);
    notify(`Rejected transfer ${target.id}. Reason recorded in audit log.`);
  };

  // 5. Request a Loan from Member App
  const handleRequestLoan = (payload: {
    principal: number;
    tenorMonths: number;
    purpose: string;
  }) => {
    const startIso = new Date().toISOString().slice(0, 10);
    const plan = generateRepaymentSchedule(
      payload.principal,
      8,
      payload.tenorMonths,
      startIso
    );
    const dueDate =
      plan.schedule[plan.schedule.length - 1]?.dueDate || '2027-05-15';

    const newLoan: LoanRecord = {
      id: `loan_${Date.now().toString().slice(-4)}`,
      memberId: activeMember.id,
      memberName: activeMember.name,
      memberPhone: activeMember.phone,
      principal: payload.principal,
      interest: plan.interest,
      amountPaid: 0,
      startDate: startIso,
      dueDate,
      tenorMonths: payload.tenorMonths,
      purpose: payload.purpose,
      schedule: plan.schedule,
      status: 'pending',
      daysOverdue: 0,
      lastReminderSentAt: new Date().toISOString(),
      lastReminderChannel: 'Awaiting Committee Approval',
    };

    setLoans((prev) => [newLoan, ...prev]);
    setLastSyncedAt(new Date().toISOString());
    notify(
      `Loan request for ${formatNaira(
        payload.principal
      )} submitted! Admin/Treasurer can now review it in "Members and loans".`
    );
  };

  // 6. Admin Approve or Decline Loan Request
  const handleDecideLoanRequest = (
    loanId: string,
    decision: 'approve' | 'decline'
  ) => {
    const target = loans.find((l) => l.id === loanId);
    if (!target) return;
    const nowIso = new Date().toISOString();

    if (decision === 'approve') {
      const generatedPlan =
        target.schedule.length > 0
          ? target.schedule
          : generateRepaymentSchedule(
              target.principal,
              8,
              target.tenorMonths,
              target.startDate
            ).schedule;

      setLoans((prev) =>
        prev.map((l) =>
          l.id === loanId
            ? { ...l, status: 'active', schedule: generatedPlan }
            : l
        )
      );

      const newLedger: LedgerRecord = {
        id: `led_${Date.now()}`,
        type: 'loan_disbursement',
        amount: target.principal,
        source: `Cooperative Loan Disbursement — #${target.id}`,
        status: 'settled',
        approvedBy: currentOperator.uid,
        approvedByName: `${currentOperator.name} (${currentOperator.role})`,
        memberName: target.memberName,
        timestamp: nowIso,
      };
      const newHap: CooperativeHappeningItem = {
        id: `hap_loan_${Date.now()}`,
        title: `Loan Facility Approved & Disbursed`,
        summary: `${formatNaira(
          target.principal
        )} loan (${target.purpose}) approved for ${target.memberName} and synced to Member Dashboard.`,
        category: 'loan',
        amount: target.principal,
        memberId: target.memberId,
        memberName: target.memberName,
        sourceFormat: 'admin_portal',
        publishedAt: nowIso,
      };
      setLedger((prev) => [newLedger, ...prev]);
      setHappenings((prev) => [newHap, ...prev]);
      setLastSyncedAt(nowIso);
      notify(
        `Approved and disbursed ${formatNaira(target.principal)} loan to ${
          target.memberName
        }. Synchronized with Member Dashboard.`
      );
    } else {
      setLoans((prev) =>
        prev.map((l) => (l.id === loanId ? { ...l, status: 'declined' } : l))
      );
      setLastSyncedAt(nowIso);
      notify(`Declined loan application #${target.id} for ${target.memberName}.`);
    }
  };

  // 7. Send Loan Reminder / Run Scheduled Cloud Function Cron
  const handleSendLoanReminder = (
    loanId: string,
    channel: 'sms' | 'whatsapp' | 'in_app' | 'multi'
  ) => {
    const target = loans.find((l) => l.id === loanId);
    if (!target) return;
    const nowIso = new Date().toISOString();
    const tier =
      target.daysOverdue >= 90
        ? 'overdue_90d'
        : target.daysOverdue >= 60
        ? 'overdue_60d'
        : target.daysOverdue >= 30
        ? 'overdue_30d'
        : 'overdue_1_29d';

    const newRem: ReminderRecord = {
      id: `rem_${Date.now()}`,
      loanId: target.id,
      memberId: target.memberId,
      memberName: target.memberName,
      tier,
      sentAt: nowIso,
      channel,
      message: `Dispatched SMS + WhatsApp + In-App repayment notice (${target.daysOverdue}d overdue).`,
    };

    const amountDue = Math.max(
      0,
      target.principal + target.interest - target.amountPaid
    );
    const fcmAlert = createFcmPushNotification({
      recipientMemberId: target.memberId,
      category: 'overdue_payment',
      title: `Overdue Loan Notice (${target.daysOverdue}d Overdue)`,
      body: `Please settle your overdue cooperative loan balance of ${formatNaira(
        amountDue
      )} for Loan #${target.id}.`,
      amount: amountDue,
    });

    setPushNotifications((prev) => [fcmAlert, ...prev]);
    setReminders((prev) => [newRem, ...prev]);
    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId
          ? {
              ...l,
              lastReminderSentAt: nowIso,
              lastReminderChannel: 'FCM Push + SMS + WhatsApp (Manual)',
            }
          : l
      )
    );
    notify(
      `Dispatched FCM Push Notification, SMS, and WhatsApp reminder to ${target.memberName}.`
    );
  };

  const handleRunScheduledReminders = () => {
    const nowIso = new Date().toISOString();
    const activeAndOverdue = loans.filter(
      (l) => l.status === 'active' || l.status === 'overdue'
    );
    const batchReminders: ReminderRecord[] = activeAndOverdue.map((l, idx) => ({
      id: `rem_cron_${Date.now()}_${idx}`,
      loanId: l.id,
      memberId: l.memberId,
      memberName: l.memberName,
      tier:
        l.daysOverdue >= 60
          ? 'overdue_60d'
          : l.daysOverdue >= 30
          ? 'overdue_30d'
          : l.daysOverdue > 0
          ? 'overdue_1_29d'
          : 'pre_due_3d',
      sentAt: nowIso,
      channel: 'multi',
      message: `Scheduled Cloud Function: Automated FCM Push + SMS/WhatsApp reminder dispatched.`,
    }));

    const batchFcmPushes: PushNotificationItem[] = activeAndOverdue.map((l) => {
      const installmentAmt =
        l.schedule.find((s) => s.status !== 'paid')?.totalInstallment ||
        Math.max(0, l.principal + l.interest - l.amountPaid);
      const isOverdue = l.daysOverdue > 0;
      return createFcmPushNotification({
        recipientMemberId: l.memberId,
        category: isOverdue ? 'overdue_payment' : 'upcoming_repayment',
        title: isOverdue
          ? `Overdue Loan Alert (${l.daysOverdue}d Overdue)`
          : 'Upcoming Loan Repayment (Due in 3 Days)',
        body: isOverdue
          ? `Automated FCM reminder: ${formatNaira(
              installmentAmt
            )} is overdue on Loan #${l.id}.`
          : `Automated 3-day pre-due FCM reminder: ${formatNaira(
              installmentAmt
            )} installment due on ${l.dueDate}.`,
        amount: installmentAmt,
      });
    });

    setPushNotifications((prev) => [...batchFcmPushes, ...prev]);
    setReminders((prev) => [...batchReminders, ...prev]);
    setLoans((prev) =>
      prev.map((l) =>
        l.status === 'overdue' || l.status === 'active'
          ? {
              ...l,
              lastReminderSentAt: nowIso,
              lastReminderChannel: 'Auto Cron (FCM Push + SMS + WhatsApp)',
            }
          : l
      )
    );
    notify(
      `Executed scheduled Cloud Function: ${batchReminders.length} FCM Push & SMS/WhatsApp reminders sent (3d pre-due & overdue).`
    );
  };

  const handleEscalateLoan = (loanId: string) => {
    const target = loans.find((l) => l.id === loanId);
    if (!target) return;
    const nowIso = new Date().toISOString();
    setLoans((prev) =>
      prev.map((l) =>
        l.id === loanId
          ? {
              ...l,
              escalated: true,
              lastReminderSentAt: nowIso,
              lastReminderChannel: 'Escalated to Surety & Executive Committee',
            }
          : l
      )
    );
    notify(
      `Escalated ${target.memberName}'s overdue loan to Surety & Executive Recovery Committee.`
    );
  };

  const handleUpdateMemberPledge = (memberId: string, newPledge: number) => {
    const nowIso = new Date().toISOString();
    const targetMem = members.find((m) => m.id === memberId);
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId ? { ...m, monthlyPledge: newPledge } : m
      )
    );
    if (targetMem) {
      const pledgeHap: CooperativeHappeningItem = {
        id: `hap_pledge_${Date.now()}`,
        title: `Monthly Thrift Pledge Updated`,
        summary: `${targetMem.name}'s monthly thrift pledge updated to ${formatNaira(
          newPledge
        )} by Admin and synchronized with Member Dashboard.`,
        category: 'contribution',
        amount: newPledge,
        memberId: targetMem.id,
        memberName: targetMem.name,
        sourceFormat: 'admin_portal',
        publishedAt: nowIso,
      };
      setHappenings((prev) => [pledgeHap, ...prev]);
    }
    setLastSyncedAt(nowIso);
    notify(
      `Updated monthly thrift pledge to ${formatNaira(
        newPledge
      )} and synchronized with Member Dashboard.`
    );
  };

  const handleSwitchExecutiveRole = (roleTitle: AdminExecutiveRole) => {
    const profile = resolveAdminExecutiveRole(roleTitle);
    const targetOp =
      members.find((m) => m.id === profile.memberId) || members[1];
    setActiveExecutiveRole(profile.roleTitle);
    setAdminOperatorId(targetOp.id);
    setActiveMemberId(targetOp.id);
    setIsSignedIn(true);
    setSignedInUserName(targetOp.name);
    notify(
      `Switched Admin Executive Role to ${profile.numberedLabel} — ${targetOp.name}.`
    );
  };

  const handleSwitchOperatorRole = () => {
    const currentIndex = ADMIN_EXECUTIVE_ROLES.findIndex(
      (r) => r.roleTitle === activeExecutiveRole
    );
    const nextIndex = (currentIndex + 1) % ADMIN_EXECUTIVE_ROLES.length;
    const nextRole = ADMIN_EXECUTIVE_ROLES[nextIndex];
    handleSwitchExecutiveRole(nextRole.roleTitle);
  };

  const handleUpdateBiometricCredential = (
    updated: BiometricCredentialRecord
  ) => {
    setBiometricCredentials((prev) => ({
      ...prev,
      [updated.uid]: updated,
    }));
  };

  const handleEnableFcm = async () => {
    const res = await initializeFcmMessaging(
      activeMember.uid,
      activeMember.id,
      (payload) => {
        const incoming = createFcmPushNotification({
          recipientMemberId: activeMember.id,
          category: 'cooperative_announcement',
          title: payload.title,
          body: payload.body,
        });
        setPushNotifications((prev) => [incoming, ...prev]);
        notify(`FCM Push Received: ${payload.title}`);
      }
    );
    setFcmToken(res.fcmToken);
    setFcmEnabled(res.enabled);
    notify(
      `Firebase Cloud Messaging token registered (${res.fcmToken.slice(
        0,
        18
      )}...).`
    );
  };

  const handleSimulateFcmPush = (category: PushNotificationCategory) => {
    const simulated = createFcmPushNotification({
      recipientMemberId: activeMember.id,
      category,
      title:
        category === 'upcoming_repayment'
          ? 'Upcoming Loan Repayment (Due in 3 Days)'
          : category === 'overdue_payment'
          ? 'Overdue Monthly Thrift Contribution Alert'
          : 'PISET Cooperative Dividend & AGM Notice',
      body:
        category === 'upcoming_repayment'
          ? 'Your ₦324,000.00 loan installment is due in 3 days (15 Nov 2026). Tap to pay via Paystack or bank transfer.'
          : category === 'overdue_payment'
          ? 'Your monthly thrift contribution of ₦150,000.00 is overdue. Please settle to maintain 3× loan eligibility.'
          : 'The Port Harcourt Secretariat has published the Q4 Treasury Audit and 11.5% surplus distribution schedule.',
      amount:
        category === 'upcoming_repayment'
          ? 324000
          : category === 'overdue_payment'
          ? 150000
          : undefined,
    });
    setPushNotifications((prev) => [simulated, ...prev]);
    notify(`FCM Push Dispatched: ${simulated.title}`);
  };

  const handleBroadcastAnnouncement = (title: string, body: string) => {
    const broadcastItem = createFcmPushNotification({
      recipientMemberId: 'all',
      category: 'cooperative_announcement',
      title,
      body,
    });
    const newHap: CooperativeHappeningItem = {
      id: `hap_${Date.now()}`,
      title,
      summary: body,
      category: 'general',
      memberId: 'all',
      memberName: 'All Cooperative Members',
      sourceFormat: 'admin_portal',
      publishedAt: new Date().toISOString(),
    };
    setHappenings((prev) => [newHap, ...prev]);
    setPushNotifications((prev) => [broadcastItem, ...prev]);
    setLastSyncedAt(new Date().toISOString());
    notify(
      `Broadcasted FCM Push Announcement "${title}" to all 12 cooperative members.`
    );
  };

  const handleApplySyncBatch = (
    rows: CooperativeSyncRow[],
    sourceLabel: string
  ) => {
    if (rows.length === 0) return;
    const nowIso = new Date().toISOString();

    const newContribs: ContributionRecord[] = [];
    const newLedgerEntries: LedgerRecord[] = [];
    const newHappenings: CooperativeHappeningItem[] = [];
    const newPushAlerts: PushNotificationItem[] = [];
    const savingsDeltaByMember: Record<string, number> = {};
    const loanRepayDeltaByMember: Record<string, number> = {};
    let addedLiquidity = 0;

    rows.forEach((row, idx) => {
      const matchedMem = members.find(
        (m) =>
          m.id.toLowerCase() === (row.memberId || '').toLowerCase() ||
          m.name.toLowerCase() === (row.memberName || '').toLowerCase()
      );
      const effectiveMemberId = matchedMem
        ? matchedMem.id
        : row.memberId && row.memberId !== 'all'
        ? row.memberId
        : members[0].id;
      const effectiveMemberName = matchedMem
        ? matchedMem.name
        : row.memberName && row.memberName !== 'All Cooperative Members'
        ? row.memberName
        : members[0].name;

      if (row.recordType === 'contribution' && row.amount > 0) {
        savingsDeltaByMember[effectiveMemberId] =
          (savingsDeltaByMember[effectiveMemberId] || 0) + row.amount;

        newContribs.push({
          id: `contrib_sync_${Date.now()}_${idx}`,
          memberId: effectiveMemberId,
          memberName: effectiveMemberName,
          month: row.month || '2026-11',
          amount: row.amount,
          method: 'bank_transfer',
          status: 'confirmed',
          receiptUrl: '',
          bankName: `${row.sourceFormat.toUpperCase()} Batch Sync`,
          senderAccount: 'Batch Schedule',
          paystackRef: '',
          uploadedBy: currentOperator.uid,
          uploadedByName: currentOperator.name,
          approvedBy: currentOperator.uid,
          approvedByName: `${currentOperator.name} (${currentOperator.role})`,
          rejectionReason: '',
          createdAt: nowIso,
        });

        newLedgerEntries.push({
          id: `led_sync_${Date.now()}_${idx}`,
          type: 'contribution',
          amount: row.amount,
          source: `${row.sourceFormat.toUpperCase()} Import — ${row.description}`,
          status: 'settled',
          approvedBy: currentOperator.uid,
          approvedByName: `${currentOperator.name} (${currentOperator.role})`,
          memberName: effectiveMemberName,
          timestamp: nowIso,
        });

        newHappenings.push({
          id: `hap_sync_${Date.now()}_${idx}`,
          title: `Confirmed Contribution Credited (${row.month})`,
          summary: `${row.description} — ${formatNaira(
            row.amount
          )} added to ${effectiveMemberName}'s thrift balance.`,
          category: 'contribution',
          amount: row.amount,
          memberId: effectiveMemberId,
          memberName: effectiveMemberName,
          sourceFormat: row.sourceFormat,
          publishedAt: nowIso,
        });
      } else if (row.recordType === 'loan' && row.amount > 0) {
        loanRepayDeltaByMember[effectiveMemberId] =
          (loanRepayDeltaByMember[effectiveMemberId] || 0) + row.amount;

        newLedgerEntries.push({
          id: `led_sync_${Date.now()}_${idx}`,
          type: 'loan_repayment',
          amount: row.amount,
          source: `${row.sourceFormat.toUpperCase()} Import — ${row.description}`,
          status: 'settled',
          approvedBy: currentOperator.uid,
          approvedByName: `${currentOperator.name} (${currentOperator.role})`,
          memberName: effectiveMemberName,
          timestamp: nowIso,
        });

        newHappenings.push({
          id: `hap_sync_${Date.now()}_${idx}`,
          title: `Loan Repayment & Schedule Updated`,
          summary: `${row.description} — ${formatNaira(
            row.amount
          )} credited toward ${effectiveMemberName}'s loan facility.`,
          category: 'loan',
          amount: row.amount,
          memberId: effectiveMemberId,
          memberName: effectiveMemberName,
          sourceFormat: row.sourceFormat,
          publishedAt: nowIso,
        });
      } else if (row.recordType === 'liquidity') {
        addedLiquidity += row.amount;
        if (row.amount > 0) {
          newLedgerEntries.push({
            id: `led_sync_${Date.now()}_${idx}`,
            type: 'contribution',
            amount: row.amount,
            source: `Treasury Liquidity Inflow (${row.sourceFormat.toUpperCase()})`,
            status: 'settled',
            approvedBy: currentOperator.uid,
            approvedByName: `${currentOperator.name} (${currentOperator.role})`,
            memberName: 'Cooperative Treasury Reserve',
            timestamp: nowIso,
          });
        }
        newHappenings.push({
          id: `hap_sync_${Date.now()}_${idx}`,
          title: `Treasury Liquidity Pool Updated (+${formatNaira(
            row.amount
          )})`,
          summary: row.description,
          category: 'liquidity',
          amount: row.amount,
          memberId: 'all',
          memberName: 'All Cooperative Members',
          sourceFormat: row.sourceFormat,
          publishedAt: nowIso,
        });
      } else {
        newHappenings.push({
          id: `hap_sync_${Date.now()}_${idx}`,
          title: 'Current Cooperative Happening Bulletin',
          summary: row.description,
          category: 'general',
          amount: row.amount > 0 ? row.amount : undefined,
          memberId: row.memberId || 'all',
          memberName: row.memberName || 'All Cooperative Members',
          sourceFormat: row.sourceFormat,
          publishedAt: nowIso,
        });
      }

      newPushAlerts.push(
        createFcmPushNotification({
          recipientMemberId: row.memberId || 'all',
          category: 'cooperative_announcement',
          title: `Portal Synced (${row.recordType.toUpperCase()})`,
          body: row.description,
          amount: row.amount > 0 ? row.amount : undefined,
          nowIso,
        })
      );
    });

    if (Object.keys(savingsDeltaByMember).length > 0) {
      setMembers((prev) =>
        prev.map((m) => {
          const delta = savingsDeltaByMember[m.id];
          if (!delta) return m;
          const updatedGrid = m.contributionGrid.map((cell, idx) =>
            idx === m.contributionGrid.length - 1
              ? { ...cell, status: 'paid' as const, amount: cell.amount + delta }
              : cell
          );
          return {
            ...m,
            totalSavings: m.totalSavings + delta,
            contributionGrid: updatedGrid,
          };
        })
      );
    }

    if (Object.keys(loanRepayDeltaByMember).length > 0) {
      setLoans((prev) =>
        prev.map((loan) => {
          const delta = loanRepayDeltaByMember[loan.memberId];
          if (
            !delta ||
            (loan.status !== 'active' && loan.status !== 'overdue')
          ) {
            return loan;
          }
          const nextPaid = loan.amountPaid + delta;
          const totalObligation = loan.principal + loan.interest;
          const isNowRepaid = nextPaid >= totalObligation;
          return {
            ...loan,
            amountPaid: nextPaid,
            status: isNowRepaid ? 'repaid' : 'active',
            daysOverdue: isNowRepaid ? 0 : loan.daysOverdue,
          };
        })
      );
    }

    if (addedLiquidity > 0) {
      setExtraLiquidityPool((prev) => prev + addedLiquidity);
    }
    if (newContribs.length > 0) {
      setContributions((prev) => [...newContribs, ...prev]);
    }
    if (newLedgerEntries.length > 0) {
      setLedger((prev) => [...newLedgerEntries, ...prev]);
    }
    if (newHappenings.length > 0) {
      setHappenings((prev) => [...newHappenings, ...prev]);
    }
    if (newPushAlerts.length > 0) {
      setPushNotifications((prev) => [...newPushAlerts, ...prev]);
    }

    const syncAudit: AuditLogRecord = {
      id: `aud_sync_${Date.now()}`,
      actor: currentOperator.uid,
      actorName: currentOperator.name,
      actorRole: currentOperator.role,
      action: 'PUBLISH_PORTAL_SYNC_BATCH',
      target: `${sourceLabel} (${rows.length} updates synced to Member Portals)`,
      timestamp: nowIso,
    };
    setAuditLogs((prev) => [syncAudit, ...prev]);
    setLastSyncedAt(nowIso);

    notify(
      `Published & synced ${rows.length} updates (${sourceLabel})! Member portals will automatically reflect updated contributions, loans, liquidity, and happenings upon sign-in.`
    );
  };

  // 10. Authenticate Admin Portal with password ('COOPERative357@#')
  const handleAuthenticateAdmin = (inputPassword: string): boolean => {
    const res = verifyAdminPortalPassword(inputPassword, adminPortalPassword);
    if (!res.allowed) {
      return false;
    }
    setIsAdminAuthenticated(true);
    setIsSignedIn(true);
    setSignedInUserName(currentOperator.name);
    setLastSyncedAt(new Date().toISOString());
    notify(
      `Admin Portal unlocked for authorized operator ${currentOperator.name}.`
    );
    return true;
  };

  // 11. Change Admin Portal password once granted access
  const handleChangeAdminPassword = (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): { valid: boolean; error?: string } => {
    const check = validateAdminPasswordChange(
      currentPassword,
      adminPortalPassword,
      newPassword,
      confirmPassword
    );
    if (!check.valid) {
      return check;
    }
    setAdminPortalPassword(newPassword);
    const nowIso = new Date().toISOString();
    setAuditLogs((prev) => [
      {
        id: `aud_admin_pwd_${Date.now()}`,
        actor: currentOperator.uid,
        actorName: currentOperator.name,
        actorRole: currentOperator.role,
        action: 'CHANGE_ADMIN_PORTAL_PASSWORD',
        target: 'Admin Portal Security Gate Password Updated',
        timestamp: nowIso,
      },
      ...prev,
    ]);
    notify(
      'Admin Portal access password has been updated for authorized personnel.'
    );
    return { valid: true };
  };

  // 12. Upload & Whitelist Member Email + Phone in Admin Portal (auto-generates Email OTP for mobile binding)
  const handleUploadWhitelistedMember = (payload: {
    name: string;
    email: string;
    phone: string;
    department: string;
    monthlyPledge: number;
    role: 'member' | 'treasurer' | 'admin';
  }): MemberRecord => {
    const nowIso = new Date().toISOString();
    const emailOtpCode = generateEmailBindingOtp(payload.email, payload.phone);
    const newId = `mem_${String(members.length + 1).padStart(2, '0')}`;
    const newMember: MemberRecord = {
      id: newId,
      uid: `uid_${newId}_phc`,
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      role: payload.role,
      joinDate: nowIso.slice(0, 10),
      status: 'active',
      monthlyPledge: payload.monthlyPledge,
      totalSavings: 0,
      department: payload.department,
      contributionGrid: INITIAL_MEMBERS[0].contributionGrid.map((cell) => ({
        ...cell,
        amount: 0,
      })),
      uploadedByAdmin: true,
      emailOtpCode,
      mobileBound: false,
      hasCreatedPassword: false,
      passwordHash: '',
    };

    setMembers((prev) => [newMember, ...prev]);
    setAuditLogs((prev) => [
      {
        id: `aud_whitelist_${Date.now()}`,
        actor: currentOperator.uid,
        actorName: currentOperator.name,
        actorRole: currentOperator.role,
        action: 'UPLOAD_WHITELIST_MEMBER_OTP',
        target: `${newMember.name} (${newMember.email} · ${newMember.phone}) — Email OTP: ${emailOtpCode}`,
        timestamp: nowIso,
      },
      ...prev,
    ]);
    notify(
      `Uploaded & whitelisted ${newMember.name} (${newMember.email}). Generated Email OTP ${emailOtpCode} for mobile binding and first sign-in.`
    );
    return newMember;
  };

  // 13. Bind Mobile Device via Email OTP & Save Custom Member Password After First Sign-In
  const handleBindAndCreateMemberPassword = (
    memberId: string,
    passwordHash?: string
  ) => {
    setMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? {
              ...m,
              mobileBound: true,
              hasCreatedPassword: passwordHash ? true : m.hasCreatedPassword,
              passwordHash: passwordHash || m.passwordHash,
            }
          : m
      )
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <OfflineBanner />

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 sm:gap-8 border-b border-slate-200 bg-white/95 px-3 sm:px-6 py-3 backdrop-blur-md">
        {/* Zone 1: Single text element wordmark */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setExperience('member');
            setMemberTab('home');
          }}
          className="text-xs sm:text-base font-extrabold tracking-tight text-emerald-950 truncate"
        >
          PISET COOPERATIVE SOCIETY PORT HARCOURT
        </a>

        {/* Zone 2: 4–5 single-line text navigation links */}
        <nav
          aria-label="Primary Experience Navigation"
          className="hidden md:flex items-center gap-6 text-xs font-semibold text-slate-600"
        >
          <button
            type="button"
            onClick={() => setExperience('member')}
            className={`hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0 py-1 ${
              experience === 'member'
                ? 'text-emerald-950 underline underline-offset-8 decoration-2 decoration-emerald-800'
                : ''
            }`}
          >
            Member App
          </button>
          <button
            type="button"
            onClick={() => {
              setExperience('admin');
              setAdminSection('treasury');
            }}
            className={`hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0 py-1 ${
              experience === 'admin' && adminSection === 'treasury'
                ? 'text-emerald-950 underline underline-offset-8 decoration-2 decoration-emerald-800'
                : ''
            }`}
          >
            Admin Portal
          </button>
          <button
            type="button"
            onClick={() => {
              setExperience('admin');
              setAdminSection('reconciliation');
            }}
            className={`hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0 py-1 ${
              experience === 'admin' && adminSection === 'reconciliation'
                ? 'text-emerald-950 underline underline-offset-8 decoration-2 decoration-emerald-800'
                : ''
            }`}
          >
            Reconciliation
          </button>
          <button
            type="button"
            onClick={() => {
              setExperience('admin');
              setAdminSection('operations_sync');
            }}
            className={`hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0 py-1 ${
              experience === 'admin' && adminSection === 'operations_sync'
                ? 'text-emerald-950 underline underline-offset-8 decoration-2 decoration-emerald-800'
                : ''
            }`}
          >
            Live Updates & Import
          </button>
          <button
            type="button"
            onClick={() => setShowAuthModal(true)}
            className="hover:text-emerald-950 transition-colors whitespace-nowrap shrink-0 py-1"
          >
            Sign In / Role
          </button>
          {isSignedIn && (
            <button
              type="button"
              data-testid="header-signout-btn"
              onClick={() => {
                setIsSignedIn(false);
                setSignedInUserName('');
                notify(
                  'Signed out. All dashboards reset to ₦0 until a user signs in.'
                );
              }}
              className="text-red-700 hover:text-red-900 transition-colors whitespace-nowrap shrink-0 py-1"
            >
              Sign Out
            </button>
          )}
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <PWAInstallButton />
          <button
            type="button"
            onClick={() =>
              setExperience((prev) => (prev === 'member' ? 'admin' : 'member'))
            }
            className="min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap shrink-0"
          >
            {experience === 'member' ? 'Open Admin Portal' : 'Open Member App'}
          </button>
        </div>
      </header>

      {/* Live Notification Toast */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed right-4 bottom-20 sm:bottom-6 z-50 max-w-md rounded-2xl border border-emerald-800/30 bg-emerald-950 px-4 py-3 text-xs font-medium text-white shadow-xl flex items-center justify-between gap-3"
        >
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="rounded-lg px-2 py-1 text-[11px] font-bold text-amber-300 hover:bg-emerald-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Content Area */}
      <main id="top" className="flex-1">
        {experience === 'member' ? (
          <MemberApp
            member={activeMember}
            contributions={contributions}
            loans={loans}
            allLoansForCommunity={loans}
            activeTab={memberTab}
            onChangeTab={setMemberTab}
            onPaystackPayment={handlePaystackPayment}
            onManualTransferUpload={handleManualTransferUpload}
            onRequestLoan={handleRequestLoan}
            biometricCredential={activeBiometricCredential}
            pushNotifications={memberPushNotifications}
            happenings={happenings}
            cooperativeLiquidity={liveTreasuryKPIs.totalLiquidity}
            lastSyncedAt={lastSyncedAt}
            onOpenBiometricSetup={() => setShowBiometricSetupModal(true)}
            onOpenNotifications={() => setShowNotificationsModal(true)}
            onTriggerPinLock={() => setIsPinLocked(true)}
            onNotify={notify}
            isSignedIn={isSignedIn}
            signedInUserName={signedInUserName}
            onOpenAuthModal={() => setShowAuthModal(true)}
          />
        ) : (
          <AdminPortal
            currentOperator={currentOperator}
            members={members}
            contributions={contributions}
            loans={loans}
            ledger={ledger}
            reminders={reminders}
            auditLogs={auditLogs}
            happenings={happenings}
            extraLiquidityPool={extraLiquidityPool}
            activeSection={adminSection}
            onChangeSection={setAdminSection}
            onApproveContribution={handleApproveContribution}
            onRejectContribution={handleRejectContribution}
            onSendLoanReminder={handleSendLoanReminder}
            onEscalateLoan={handleEscalateLoan}
            onRunScheduledReminders={handleRunScheduledReminders}
            onDecideLoanRequest={handleDecideLoanRequest}
            onUpdateMemberPledge={handleUpdateMemberPledge}
            onBroadcastAnnouncement={handleBroadcastAnnouncement}
            onApplySyncBatch={handleApplySyncBatch}
            onSwitchOperatorRole={handleSwitchOperatorRole}
            activeExecutiveRole={activeExecutiveRole}
            onSwitchExecutiveRole={handleSwitchExecutiveRole}
            onNotify={notify}
            isSignedIn={isSignedIn}
            onOpenAuthModal={() => setShowAuthModal(true)}
            isAdminAuthenticated={isAdminAuthenticated}
            onAuthenticateAdmin={handleAuthenticateAdmin}
            onChangeAdminPassword={handleChangeAdminPassword}
            onLockAdminPortal={() => {
              setIsAdminAuthenticated(false);
              notify('Admin Portal locked. Password required to re-enter.');
            }}
            onUploadWhitelistedMember={handleUploadWhitelistedMember}
          />
        )}
      </main>

      {/* Auth & Role Switch Modal (with Whitelisted Email OTP Mobile Binding & Custom Password Creation) */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        members={members}
        activeMember={experience === 'member' ? activeMember : currentOperator}
        biometricCredentials={biometricCredentials}
        onUpdateBiometricCredential={handleUpdateBiometricCredential}
        onBindAndCreateMemberPassword={handleBindAndCreateMemberPassword}
        activeExecutiveRole={activeExecutiveRole}
        onSwitchExecutiveRole={handleSwitchExecutiveRole}
        onSelectMember={(selected) => {
          const matchingExec = ADMIN_EXECUTIVE_ROLES.find(
            (r) => r.memberId === selected.id
          );
          if (matchingExec) {
            setActiveExecutiveRole(matchingExec.roleTitle);
            setAdminOperatorId(selected.id);
          } else if (
            selected.role === 'admin' ||
            selected.role === 'treasurer'
          ) {
            setAdminOperatorId(selected.id);
          }
          setActiveMemberId(selected.id);
          setIsSignedIn(true);
          setSignedInUserName(selected.name);
          setLastSyncedAt(new Date().toISOString());
        }}
        onNotify={notify}
      />

      {/* Biometric Passkey (Fingerprint / Face ID), 4-Digit PIN & Custom Password Setup Modal */}
      <BiometricSetupModal
        isOpen={showBiometricSetupModal}
        onClose={() => setShowBiometricSetupModal(false)}
        member={activeMember}
        credential={activeBiometricCredential}
        onSaveCredential={handleUpdateBiometricCredential}
        onBindAndCreateMemberPassword={handleBindAndCreateMemberPassword}
        onNotify={notify}
      />

      {/* Firebase Cloud Messaging (FCM) Push Notification Center Modal */}
      <PushNotificationsModal
        isOpen={showNotificationsModal}
        onClose={() => setShowNotificationsModal(false)}
        memberId={activeMember.id}
        memberName={activeMember.name}
        notifications={memberPushNotifications}
        fcmToken={fcmToken}
        fcmEnabled={fcmEnabled}
        onMarkAsRead={(id) =>
          setPushNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, read: true } : n))
          )
        }
        onMarkAllRead={() =>
          setPushNotifications((prev) =>
            prev.map((n) => ({ ...n, read: true }))
          )
        }
        onEnableFcm={handleEnableFcm}
        onTriggerTestPush={handleSimulateFcmPush}
        onNavigateTab={(tab) => {
          setExperience('member');
          setMemberTab(tab);
        }}
      />

      {/* Optional Member PIN / Biometric Lock */}
      <PinLockOverlay
        isLocked={isPinLocked}
        memberName={activeMember.name}
        memberUid={activeMember.uid}
        credential={activeBiometricCredential}
        onUnlock={(methodUsed) => {
          setIsPinLocked(false);
          setIsSignedIn(true);
          setSignedInUserName(activeMember.name);
          notify(`Member savings vault unlocked via ${methodUsed}.`);
        }}
      />
    </div>
  );
}
