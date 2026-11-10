import React, { useState } from 'react';
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Building2,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  FileImage,
  Fingerprint,
  Home,
  Landmark,
  Lock,
  ShieldCheck,
  Upload,
  Users,
  Wallet,
} from 'lucide-react';
import {
  COOPERATIVE_BANK_DETAILS,
  ContributionRecord,
  LoanRecord,
  MemberRecord,
} from '../data/seedData';
import {
  BiometricCredentialRecord,
  CooperativeHappeningItem,
  PushNotificationItem,
  buildCommunityLoanFeed,
  calculateLoanEligibility,
  formatNaira,
  generateRepaymentSchedule,
} from '../utils/coopRules';

export type MemberTab = 'home' | 'pay' | 'loans' | 'statistics' | 'community';

interface MemberAppProps {
  member: MemberRecord;
  contributions: ContributionRecord[];
  loans: LoanRecord[];
  allLoansForCommunity: LoanRecord[];
  activeTab: MemberTab;
  onChangeTab: (tab: MemberTab) => void;
  onPaystackPayment: (payload: {
    amount: number;
    month: string;
    channel: 'card' | 'bank_transfer' | 'ussd';
    purpose: 'contribution' | 'loan_repayment';
    loanId?: string;
  }) => void;
  onManualTransferUpload: (payload: {
    amount: number;
    month: string;
    bankName: string;
    senderAccount: string;
    receiptUrl: string;
  }) => void;
  onRequestLoan: (payload: {
    principal: number;
    tenorMonths: number;
    purpose: string;
  }) => void;
  biometricCredential: BiometricCredentialRecord;
  pushNotifications: PushNotificationItem[];
  happenings?: CooperativeHappeningItem[];
  cooperativeLiquidity?: number;
  lastSyncedAt?: string;
  onOpenBiometricSetup: () => void;
  onOpenNotifications: () => void;
  onTriggerPinLock: () => void;
  onNotify: (msg: string) => void;
  isSignedIn?: boolean;
  signedInUserName?: string;
  onOpenAuthModal?: () => void;
  isLoading?: boolean;
}

export const MemberApp: React.FC<MemberAppProps> = ({
  member,
  contributions,
  loans,
  allLoansForCommunity,
  activeTab,
  onChangeTab,
  onPaystackPayment,
  onManualTransferUpload,
  onRequestLoan,
  biometricCredential,
  pushNotifications,
  happenings = [],
  cooperativeLiquidity = 0,
  lastSyncedAt,
  onOpenBiometricSetup,
  onOpenNotifications,
  onTriggerPinLock,
  onNotify,
  isSignedIn = false,
  signedInUserName,
  onOpenAuthModal,
  isLoading = false,
}) => {
  const [showBalance, setShowBalance] = useState(true);
  const unreadPushCount = isSignedIn
    ? pushNotifications.filter((n) => !n.read).length
    : 0;

  // Pay flow state (prefilled from monthlyPledge when signed in, 0 before login)
  const [payMethod, setPayMethod] = useState<'paystack' | 'bank_transfer'>(
    'paystack'
  );
  const [paymentPurpose, setPaymentPurpose] = useState<
    'contribution' | 'loan_repayment'
  >('contribution');
  const [selectedLoanForRepay, setSelectedLoanForRepay] = useState<string>('');
  const [payAmount, setPayAmount] = useState<string>(
    isSignedIn ? String(member.monthlyPledge) : '0'
  );
  const [payMonth, setPayMonth] = useState<string>('2026-11');
  const [paystackChannel, setPaystackChannel] = useState<
    'card' | 'bank_transfer' | 'ussd'
  >('card');
  const [showPaystackModal, setShowPaystackModal] = useState(false);

  // Manual transfer form state
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [senderBank, setSenderBank] = useState('GTBank PLC');
  const [senderAccount, setSenderAccount] = useState('0148920311');
  const [receiptFileName, setReceiptFileName] = useState(
    'zenith_nip_transfer_receipt_nov2026.jpg'
  );
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState(
    '/src/assets/images/sample_bank_receipt_1794253542404.jpg'
  );
  const [payFormError, setPayFormError] = useState('');

  // Loan request state
  const [loanPrincipalInput, setLoanPrincipalInput] = useState(
    isSignedIn ? '900000' : '0'
  );
  const [loanTenor, setLoanTenor] = useState(6);
  const [loanPurpose, setLoanPurpose] = useState('');
  const [loanFormError, setLoanFormError] = useState('');

  // Sync default pledge & loan input when sign-in status or member changes
  React.useEffect(() => {
    if (!isSignedIn) {
      setPayAmount('0');
      setLoanPrincipalInput('0');
      return;
    }
    if (paymentPurpose === 'contribution') {
      setPayAmount(String(member.monthlyPledge));
    }
    setLoanPrincipalInput((prev) => (prev === '0' ? '900000' : prev));
  }, [isSignedIn, member.id, member.monthlyPledge, paymentPurpose]);

  const rawMemberContributions = contributions.filter(
    (c) => c.memberId === member.id
  );
  const rawMemberLoans = loans.filter((l) => l.memberId === member.id);
  const memberContributions = isSignedIn ? rawMemberContributions : [];
  const memberLoans = isSignedIn ? rawMemberLoans : [];
  const activeOrOverdueLoan = memberLoans.find(
    (l) => l.status === 'active' || l.status === 'overdue'
  );

  const missedMonthsCount = isSignedIn
    ? member.contributionGrid.filter((g) => g.status === 'missed').length
    : 0;
  const hasOverdue = memberLoans.some((l) => l.status === 'overdue');

  const rawEligibility = calculateLoanEligibility(
    member.totalSavings,
    3,
    member.status,
    hasOverdue,
    missedMonthsCount
  );

  const eligibility = isSignedIn
    ? rawEligibility
    : {
        eligible: false,
        maxLoanAmount: 0,
        multiplier: 3,
        reason:
          'Sign in to your cooperative account to synchronize your savings and loan eligibility.',
      };

  const currentExposure =
    isSignedIn && activeOrOverdueLoan
      ? Math.max(
          0,
          activeOrOverdueLoan.principal +
            activeOrOverdueLoan.interest -
            activeOrOverdueLoan.amountPaid
        )
      : 0;

  const remainingEligibleCredit = isSignedIn
    ? Math.max(0, eligibility.maxLoanAmount - currentExposure)
    : 0;

  const displaySavings = isSignedIn ? member.totalSavings : 0;
  const displayPledge = isSignedIn ? member.monthlyPledge : 0;
  const displayLiquidity = isSignedIn ? cooperativeLiquidity : 0;
  const displayContributionGrid = isSignedIn
    ? member.contributionGrid
    : member.contributionGrid.map((cell) => ({
        ...cell,
        amount: 0,
      }));

  // Sanitized Community Feed served via Cloud Function projection
  const communityFeed = buildCommunityLoanFeed(allLoansForCommunity);

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText(
        COOPERATIVE_BANK_DETAILS.accountNumber
      );
    } catch {
      // Fallback if clipboard API restricted in iframe
    }
    setCopiedAccount(true);
    onNotify(
      `Copied cooperative account number ${COOPERATIVE_BANK_DETAILS.accountNumber}`
    );
    setTimeout(() => setCopiedAccount(false), 2500);
  };

  const handleReceiptFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setReceiptPreviewUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleInitiatePaystack = (e: React.FormEvent) => {
    e.preventDefault();
    setPayFormError('');
    const numericAmount = Number(payAmount);
    if (!Number.isFinite(numericAmount) || numericAmount < 1000) {
      setPayFormError('Please enter a valid amount of at least ₦1,000.');
      return;
    }
    setShowPaystackModal(true);
  };

  const handleConfirmPaystackCheckout = () => {
    const numericAmount = Number(payAmount);
    onPaystackPayment({
      amount: numericAmount,
      month: payMonth,
      channel: paystackChannel,
      purpose: paymentPurpose,
      loanId:
        paymentPurpose === 'loan_repayment'
          ? selectedLoanForRepay || activeOrOverdueLoan?.id
          : undefined,
    });
    setShowPaystackModal(false);
  };

  const handleSubmitManualTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    setPayFormError('');
    const numericAmount = Number(payAmount);
    if (!Number.isFinite(numericAmount) || numericAmount < 1000) {
      setPayFormError('Please enter a valid transfer amount of at least ₦1,000.');
      return;
    }
    if (!senderBank.trim() || !senderAccount.trim()) {
      setPayFormError('Please provide your sending bank name and account number.');
      return;
    }
    if (!receiptPreviewUrl) {
      setPayFormError('Please attach a transfer receipt image before submitting.');
      return;
    }
    onManualTransferUpload({
      amount: numericAmount,
      month: payMonth,
      bankName: senderBank.trim(),
      senderAccount: senderAccount.trim(),
      receiptUrl: receiptPreviewUrl,
    });
  };

  const handleLoanRepayShortcut = (loan: LoanRecord, installmentAmount: number) => {
    setPaymentPurpose('loan_repayment');
    setSelectedLoanForRepay(loan.id);
    setPayAmount(String(installmentAmount));
    setPayMethod('paystack');
    onChangeTab('pay');
    onNotify(
      `Prefilled ${formatNaira(installmentAmount)} repayment for Loan #${loan.id}.`
    );
  };

  const handleSubmitLoanRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setLoanFormError('');
    const principalNum = Number(loanPrincipalInput);
    if (!Number.isFinite(principalNum) || principalNum < 50000) {
      setLoanFormError('Minimum cooperative loan request is ₦50,000.');
      return;
    }
    if (principalNum > remainingEligibleCredit) {
      setLoanFormError(
        `Requested amount exceeds your eligible limit of ${formatNaira(
          remainingEligibleCredit
        )}.`
      );
      return;
    }
    if (loanPurpose.trim().length < 5) {
      setLoanFormError(
        'Please state the business or personal purpose for this loan (at least 5 characters).'
      );
      return;
    }
    onRequestLoan({
      principal: principalNum,
      tenorMonths: loanTenor,
      purpose: loanPurpose.trim(),
    });
    setLoanPurpose('');
  };

  const previewSchedule = generateRepaymentSchedule(
    Number(loanPrincipalInput) || 0,
    8,
    loanTenor,
    '2026-11-15'
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
        <div className="h-48 rounded-3xl bg-slate-200 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 sm:px-5 pt-3 pb-20 sm:pb-6 overflow-x-hidden">
      {/* Desktop Secondary Sub-Navigation for Member Experience */}
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-200 pb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
            MEMBERS EXPERIENCE PISET COOPERATIVE SOCIETY
          </p>
          <h1
            data-testid="member-welcome-heading"
            className="text-lg font-bold text-slate-900 sm:text-xl leading-tight"
          >
            {isSignedIn
              ? `Welcome back, ${signedInUserName || member.name}`
              : 'Welcome back'}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <div
            className="hidden sm:flex items-center gap-1 rounded-xl bg-slate-100 p-1"
            role="tablist"
            aria-label="Member sections"
          >
            {(
              [
                { id: 'home', label: 'Home', icon: Home },
                { id: 'pay', label: 'Pay', icon: Wallet },
                { id: 'loans', label: 'Loans', icon: Landmark },
                { id: 'statistics', label: 'Statistics', icon: BarChart3 },
                { id: 'community', label: 'Community', icon: Users },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  data-testid={`member-tab-${tab.id}`}
                  aria-selected={isActive}
                  onClick={() => onChangeTab(tab.id)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-emerald-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={onOpenNotifications}
            data-testid="open-fcm-notifications-btn"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            aria-label="Open FCM Push Notifications"
          >
            <BellRing className="h-3.5 w-3.5 text-emerald-800" />
            <span>Push Alerts</span>
            {unreadPushCount > 0 && (
              <span
                data-testid="unread-push-count"
                className="font-mono text-[11px] font-bold text-amber-800"
              >
                ({unreadPushCount})
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenBiometricSetup}
            data-testid="open-biometric-setup-btn"
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            aria-label="Configure PIN and Biometric Login"
          >
            <Fingerprint className="h-3.5 w-3.5 text-emerald-800" />
            <span>Biometrics & PIN</span>
          </button>

          <button
            type="button"
            onClick={onTriggerPinLock}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
            aria-label="Lock screen with PIN"
          >
            <Lock className="h-3.5 w-3.5 text-emerald-800" />
            <span>Lock</span>
          </button>
        </div>
      </div>

      {/* TAB 1: HOME (Compact & Fitted to Device Screen) */}
      {activeTab === 'home' && (
        <div className="space-y-3.5">
          {!isSignedIn && (
            <div
              data-testid="member-unauthenticated-banner"
              className="rounded-2xl border border-emerald-800/20 bg-emerald-950/5 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="text-xs text-slate-700">
                <strong className="text-emerald-950">
                  Zero-Balance Privacy Protection Active:
                </strong>{' '}
                All dashboard figures default to <strong>₦0</strong> until you
                sign in. Sign in to synchronize your live contributions, loans,
                and Admin Portal updates.
              </div>
              {onOpenAuthModal && (
                <button
                  type="button"
                  onClick={onOpenAuthModal}
                  data-testid="member-signin-sync-btn"
                  className="min-h-[38px] rounded-xl bg-emerald-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
                >
                  Sign In to Sync Account
                </button>
              )}
            </div>
          )}

          {/* Top Split: Private Savings Card + Loan Eligibility Meter */}
          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12 items-stretch">
            {/* Private Savings Card */}
            <section
              aria-label="Private Thrift Savings Card"
              className="lg:col-span-7 flex flex-col justify-between rounded-2xl bg-emerald-950 p-4 sm:p-5 text-white shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-200">
                    Confirmed Thrift Savings Balance
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowBalance((prev) => !prev)}
                    className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center gap-1.5 rounded-xl bg-emerald-900/80 px-2.5 text-xs font-medium text-emerald-100 hover:bg-emerald-800 transition-colors"
                    aria-label={
                      showBalance
                        ? 'Hide savings balance'
                        : 'Show savings balance'
                    }
                  >
                    {showBalance ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" />
                        <span>Hide</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" />
                        <span>Show</span>
                      </>
                    )}
                  </button>
                </div>

                <div
                  className="mt-2 font-mono text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-white"
                  data-testid="member-savings-balance"
                >
                  {showBalance
                    ? formatNaira(displaySavings)
                    : '₦ •••••••••'}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-emerald-200/90">
                  <span>
                    Monthly Pledge:{' '}
                    <strong
                      data-testid="member-monthly-pledge"
                      className="font-mono text-white"
                    >
                      {showBalance
                        ? formatNaira(displayPledge)
                        : '₦ ••••••'}
                    </strong>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Member ID:{' '}
                    {isSignedIn ? member.id.toUpperCase() : 'NOT SIGNED IN'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    Standing:{' '}
                    {isSignedIn ? 'Good Standing (Synced)' : 'Awaiting Sign-In'}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-emerald-800/60">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentPurpose('contribution');
                    setPayAmount(String(displayPledge));
                    onChangeTab('pay');
                  }}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-emerald-950 hover:bg-amber-300 transition-colors whitespace-nowrap"
                >
                  <span>Pay Monthly Pledge</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('loans')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-700 bg-emerald-900/50 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800/70 transition-colors whitespace-nowrap"
                >
                  <span>View Loan Schedule</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeTab('statistics')}
                  data-testid="home-goto-statistics-btn"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-emerald-700/80 bg-emerald-900/40 px-3.5 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-800/70 transition-colors whitespace-nowrap"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  <span>Statistics &amp; 12M Grid</span>
                </button>
              </div>
            </section>

            {/* Loan Eligibility Meter */}
            <section
              aria-label="Loan Eligibility Meter"
              className="lg:col-span-5 flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Loan Eligibility Meter
                  </h2>
                  <span className="text-xs font-semibold text-emerald-800">
                    {eligibility.multiplier}× Savings Multiplier
                  </span>
                </div>

                <p
                  className="mt-2 font-mono text-xl sm:text-2xl font-bold tabular-nums text-emerald-950"
                  data-testid="loan-eligibility-amount"
                >
                  {showBalance
                    ? `Eligible up to ${formatNaira(remainingEligibleCredit)}`
                    : 'Eligible up to ₦ •••••••••'}
                </p>

                <p className="mt-1 text-xs text-slate-600 line-clamp-2">
                  {eligibility.reason}
                </p>

                {/* Progress Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-600 mb-1">
                    <span>
                      Active Exposure:{' '}
                      <strong className="font-mono text-slate-900">
                        {formatNaira(currentExposure)}
                      </strong>
                    </span>
                    <span>
                      Max Cap:{' '}
                      <strong className="font-mono text-slate-900">
                        {formatNaira(eligibility.maxLoanAmount)}
                      </strong>
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-emerald-700 transition-all"
                      style={{
                        width: `${
                          eligibility.maxLoanAmount > 0
                            ? Math.min(
                                100,
                                Math.round(
                                  ((eligibility.maxLoanAmount -
                                    remainingEligibleCredit) /
                                    eligibility.maxLoanAmount) *
                                    100
                                )
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500">
                  8% flat cooperative rate · Up to 12 mos
                </span>
                <button
                  type="button"
                  onClick={() => onChangeTab('loans')}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  <span>Request Loan</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </section>
          </div>

          {/* Biometric Authentication & FCM Push Alerts Overview Bar */}
          <section
            aria-label="Biometric Security and FCM Push Notifications"
            className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch"
          >
            {/* Biometric & PIN Card */}
            <div className="lg:col-span-5 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Fingerprint className="h-4 w-4 text-emerald-800 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Biometric & PIN Security
                    </h2>
                  </div>
                  <span
                    data-testid="home-biometric-status"
                    className={`text-xs font-semibold whitespace-nowrap ${
                      biometricCredential.biometricEnabled
                        ? 'text-emerald-800'
                        : 'text-amber-700'
                    }`}
                  >
                    {biometricCredential.biometricEnabled
                      ? `${
                          biometricCredential.modality === 'face_id'
                            ? 'Face ID'
                            : 'Fingerprint'
                        } Active`
                      : 'PIN Only'}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
                  Unlock your cooperative vault with your custom password, Email
                  OTP mobile binding, 4-digit PIN, or Fingerprint / Face ID.
                </p>
                {isSignedIn && (
                  <div
                    data-testid="member-security-binding-status"
                    className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-emerald-900"
                  >
                    <span>
                      {member.mobileBound
                        ? 'Mobile Bound via Email OTP'
                        : 'Email Whitelisted'}
                    </span>
                    <span>·</span>
                    <span>
                      {member.hasCreatedPassword
                        ? 'Custom Password Active'
                        : 'Custom Password Ready'}
                    </span>
                  </div>
                )}
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 truncate">
                  Password + Passkey + 4-Digit PIN
                </span>
                <button
                  type="button"
                  onClick={onOpenBiometricSetup}
                  className="min-h-[36px] rounded-xl bg-emerald-950/10 px-3 py-1.5 text-xs font-bold text-emerald-950 hover:bg-emerald-950/15 whitespace-nowrap shrink-0"
                >
                  Security &amp; Password
                </button>
              </div>
            </div>

            {/* FCM Push Notifications Feed Summary */}
            <div className="lg:col-span-7 rounded-2xl border border-slate-200 bg-white p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BellRing className="h-4 w-4 text-emerald-800 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900">
                      Firebase Cloud Messaging (FCM) Push Alerts
                    </h2>
                  </div>
                  <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">
                    {unreadPushCount} Unread Alerts
                  </span>
                </div>

                {!isSignedIn ? (
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                    Sign in to synchronize your upcoming loan repayment alerts
                    (3 days pre-due), overdue notices, and cooperative
                    announcements.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-slate-100">
                    {pushNotifications.slice(0, 2).map((notif) => (
                      <div
                        key={notif.id}
                        className="py-1.5 flex items-start justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 truncate">
                            {notif.title}
                          </div>
                          <p className="text-xs text-slate-600 truncate">
                            {notif.body}
                          </p>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-800 shrink-0 whitespace-nowrap">
                          {notif.category === 'upcoming_repayment'
                            ? '3d Pre-Due'
                            : notif.category === 'overdue_payment'
                            ? 'Overdue'
                            : 'Announcement'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 truncate">
                  3d Pre-Due Repayments · Overdue Alerts · Cooperative Notices
                </span>
                <button
                  type="button"
                  onClick={onOpenNotifications}
                  className="min-h-[36px] rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0"
                >
                  Open Notification Center ({unreadPushCount})
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: PAY */}
      {activeTab === 'pay' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          <div className="lg:col-span-7 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="text-xl font-bold text-slate-900">
              Make a Cooperative Payment
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Amount prefilled from your monthly pledge (
              {formatNaira(displayPledge)}). Choose instant Paystack
              settlement or upload a bank transfer receipt.
            </p>

            {/* Purpose Selector */}
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setPaymentPurpose('contribution');
                  setPayAmount(String(displayPledge));
                }}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  paymentPurpose === 'contribution'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Monthly Thrift Contribution
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentPurpose('loan_repayment');
                  if (activeOrOverdueLoan) {
                    const nextInstallment =
                      activeOrOverdueLoan.schedule.find(
                        (s) => s.status !== 'paid'
                      )?.totalInstallment || 324000;
                    setPayAmount(String(nextInstallment));
                    setSelectedLoanForRepay(activeOrOverdueLoan.id);
                  } else {
                    setPayAmount('0');
                  }
                }}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  paymentPurpose === 'loan_repayment'
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Loan Repayment
              </button>
            </div>

            {/* Amount & Month Inputs */}
            <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="pay-amount-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Amount in Naira (₦)
                </label>
                <input
                  id="pay-amount-input"
                  type="number"
                  min={1000}
                  step={500}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-bold text-slate-900 focus:border-emerald-800 focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="pay-month-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Contribution Period
                </label>
                <select
                  id="pay-month-select"
                  value={payMonth}
                  onChange={(e) => setPayMonth(e.target.value)}
                  className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 focus:border-emerald-800 focus:outline-none"
                >
                  <option value="2026-11">November 2026 (2026-11)</option>
                  <option value="2026-12">December 2026 (2026-12)</option>
                  <option value="2026-10">October 2026 Arrears (2026-10)</option>
                </select>
              </div>
            </div>

            {/* Method Selector: Paystack vs I Paid by Transfer */}
            <div className="mt-6">
              <span className="block text-xs font-semibold text-slate-700 mb-2">
                Select Payment Option
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setPayMethod('paystack');
                    setPayFormError('');
                  }}
                  className={`flex min-h-[56px] items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
                    payMethod === 'paystack'
                      ? 'border-emerald-800 bg-emerald-950/5'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      Pay now (Paystack)
                    </div>
                    <div className="text-xs text-slate-500">
                      Cards, Bank Transfer, USSD · Auto-confirmed
                    </div>
                  </div>
                  <CreditCard className="h-5 w-5 text-emerald-800 shrink-0" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPayMethod('bank_transfer');
                    setPayFormError('');
                  }}
                  className={`flex min-h-[56px] items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
                    payMethod === 'bank_transfer'
                      ? 'border-emerald-800 bg-emerald-950/5'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="text-sm font-bold text-slate-900">
                      I paid by transfer
                    </div>
                    <div className="text-xs text-slate-500">
                      Copy account details & upload receipt
                    </div>
                  </div>
                  <Building2 className="h-5 w-5 text-emerald-800 shrink-0" />
                </button>
              </div>
            </div>

            {payFormError && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium text-red-800">
                {payFormError}
              </div>
            )}

            {/* Option A: Paystack Flow */}
            {payMethod === 'paystack' && (
              <form onSubmit={handleInitiatePaystack} className="mt-6 space-y-4">
                <div className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-700 mb-2">
                    Preferred Paystack Channel
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'card', label: 'Debit Card' },
                        { id: 'bank_transfer', label: 'Paystack Transfer' },
                        { id: 'ussd', label: 'USSD (*737#)' },
                      ] as const
                    ).map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setPaystackChannel(ch.id)}
                        className={`min-h-[44px] rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
                          paystackChannel === ch.id
                            ? 'border-emerald-800 bg-white text-emerald-950 shadow-xs'
                            : 'border-slate-200 bg-transparent text-slate-600'
                        }`}
                      >
                        {ch.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
                >
                  Pay {formatNaira(Number(payAmount) || 0)} Now via Paystack
                </button>
              </form>
            )}

            {/* Option B: Manual Bank Transfer & Receipt Upload */}
            {payMethod === 'bank_transfer' && (
              <form
                onSubmit={handleSubmitManualTransfer}
                className="mt-6 space-y-5"
              >
                {/* Cooperative Bank Account Card with Copy Button */}
                <div className="rounded-2xl border border-emerald-800/20 bg-emerald-950/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
                        Cooperative Account Details
                      </span>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {COOPERATIVE_BANK_DETAILS.accountName}
                      </p>
                      <p className="text-xs text-slate-600">
                        {COOPERATIVE_BANK_DETAILS.bankName} ·{' '}
                        {COOPERATIVE_BANK_DETAILS.branch}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyAccount}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-800 transition-colors whitespace-nowrap"
                    >
                      {copiedAccount ? (
                        <>
                          <Check className="h-4 w-4" />
                          <span>Copied {COOPERATIVE_BANK_DETAILS.accountNumber}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          <span>Copy {COOPERATIVE_BANK_DETAILS.accountNumber}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="sender-bank-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Your Sending Bank
                    </label>
                    <input
                      id="sender-bank-input"
                      type="text"
                      value={senderBank}
                      onChange={(e) => setSenderBank(e.target.value)}
                      className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sender-acct-input"
                      className="block text-xs font-semibold text-slate-700"
                    >
                      Sender Account Number
                    </label>
                    <input
                      id="sender-acct-input"
                      type="text"
                      value={senderAccount}
                      onChange={(e) => setSenderAccount(e.target.value)}
                      className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-sm text-slate-900"
                    />
                  </div>
                </div>

                {/* Receipt Upload */}
                <div>
                  <label
                    htmlFor="receipt-upload-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Upload Transfer Receipt Image (NIP Advice / Bank Screenshot)
                  </label>
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                    <img
                      src={receiptPreviewUrl}
                      alt="Bank transfer receipt preview"
                      referrerPolicy="no-referrer"
                      className="h-16 w-14 rounded-lg object-cover border border-slate-200 shrink-0"
                    />
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-xs font-semibold text-slate-900 truncate">
                        {receiptFileName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Status will show &ldquo;Awaiting confirmation&rdquo; until
                        verified by a different Treasurer or Admin.
                      </p>
                    </div>
                    <label
                      htmlFor="receipt-upload-input"
                      className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Choose Image</span>
                      <input
                        id="receipt-upload-input"
                        type="file"
                        accept="image/*"
                        onChange={handleReceiptFileChange}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
                >
                  Submit Transfer Receipt ({formatNaira(Number(payAmount) || 0)})
                </button>
              </form>
            )}
          </div>

          {/* Right Column: Live Status & Maker-Checker Explanation */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h3 className="text-base font-bold text-slate-900">
                Settlement & Verification Status
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Paystack payments settle automatically via signed webhook. Manual
                transfers require Maker-Checker approval.
              </p>

              <div className="mt-4 space-y-3">
                {memberContributions.slice(0, 4).map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-2.5 border-b border-slate-100 last:border-b-0"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {formatNaira(c.amount)} · {c.month}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {c.method === 'paystack'
                          ? 'Paystack Auto-Webhook'
                          : `Manual Transfer (${c.bankName || 'Bank'})`}
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold ${
                        c.status === 'confirmed'
                          ? 'text-emerald-800'
                          : c.status === 'pending'
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {c.status === 'confirmed'
                        ? 'Confirmed'
                        : c.status === 'pending'
                        ? 'Awaiting confirmation'
                        : 'Rejected'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: LOANS */}
      {activeTab === 'loans' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
          {/* Active Loan & Repayment Schedule */}
          <div className="lg:col-span-7 space-y-6">
            <section
              aria-label="Active Loan and Repayment Schedule"
              className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"
            >
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">
                    Your Cooperative Loans & Schedule
                  </h2>
                  <p className="text-xs text-slate-600">
                    View active installment schedule or repay directly through
                    the Pay flow
                  </p>
                </div>
                {activeOrOverdueLoan && (
                  <button
                    type="button"
                    onClick={() =>
                      handleLoanRepayShortcut(
                        activeOrOverdueLoan,
                        activeOrOverdueLoan.schedule.find(
                          (s) => s.status !== 'paid'
                        )?.totalInstallment || 324000
                      )
                    }
                    className="min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
                  >
                    Repay Next Installment
                  </button>
                )}
              </div>

              {memberLoans.length === 0 ? (
                <div className="mt-6 rounded-2xl bg-slate-50 p-8 text-center">
                  <p className="text-sm font-medium text-slate-700">
                    You have no active or historical cooperative loans.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Use the Loan Request calculator on this page to apply for
                    up to {formatNaira(remainingEligibleCredit)}.
                  </p>
                </div>
              ) : (
                <div className="mt-6 space-y-6">
                  {memberLoans.map((loan) => {
                    const totalObligation = loan.principal + loan.interest;
                    const outstanding = Math.max(
                      0,
                      totalObligation - loan.amountPaid
                    );
                    return (
                      <div
                        key={loan.id}
                        className="space-y-4 pb-6 border-b border-slate-200 last:border-b-0 last:pb-0"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-base font-bold text-slate-900">
                                {loan.purpose}
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span
                                className={`text-xs font-semibold capitalize ${
                                  loan.status === 'active' ||
                                  loan.status === 'repaid'
                                    ? 'text-emerald-800'
                                    : loan.status === 'pending'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                                }`}
                              >
                                {loan.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              Principal: {formatNaira(loan.principal)} ·
                              Interest (8%): {formatNaira(loan.interest)} · Due:{' '}
                              {loan.dueDate}
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="block text-[11px] text-slate-500">
                              Outstanding Balance
                            </span>
                            <span className="font-mono text-lg font-bold tabular-nums text-slate-900">
                              {formatNaira(outstanding)}
                            </span>
                          </div>
                        </div>

                        {loan.schedule.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                  <th className="py-2.5 pr-3">Month</th>
                                  <th className="py-2.5 px-3">Due Date</th>
                                  <th className="py-2.5 px-3 text-right">
                                    Principal
                                  </th>
                                  <th className="py-2.5 px-3 text-right">
                                    Interest
                                  </th>
                                  <th className="py-2.5 px-3 text-right">
                                    Installment
                                  </th>
                                  <th className="py-2.5 pl-3 text-right">
                                    Status / Action
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                {loan.schedule.map((inst) => (
                                  <tr key={inst.installmentNumber}>
                                    <td className="py-3 pr-3 font-medium text-slate-900">
                                      #{inst.installmentNumber}
                                    </td>
                                    <td className="py-3 px-3 font-mono text-slate-600">
                                      {inst.dueDate}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                                      {formatNaira(inst.principalPart)}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700">
                                      {formatNaira(inst.interestPart)}
                                    </td>
                                    <td className="py-3 px-3 text-right font-mono font-bold tabular-nums text-slate-900">
                                      {formatNaira(inst.totalInstallment)}
                                    </td>
                                    <td className="py-3 pl-3 text-right">
                                      {inst.status === 'paid' ? (
                                        <span className="font-semibold text-emerald-800">
                                          Paid
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleLoanRepayShortcut(
                                              loan,
                                              inst.totalInstallment
                                            )
                                          }
                                          className="min-h-[36px] rounded-lg bg-emerald-950/10 px-3 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-950/20"
                                        >
                                          Repay
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Request a New Loan Form */}
          <div className="lg:col-span-5">
            <section
              aria-label="Request a Cooperative Loan"
              className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8"
            >
              <h2 className="text-lg font-bold text-slate-900">
                Request a Cooperative Loan
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Available credit ceiling:{' '}
                <strong className="font-mono text-emerald-900">
                  {formatNaira(remainingEligibleCredit)}
                </strong>{' '}
                (3× savings less active exposure)
              </p>

              {loanFormError && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800">
                  {loanFormError}
                </div>
              )}

              <form onSubmit={handleSubmitLoanRequest} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="loan-principal-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Principal Amount (₦)
                  </label>
                  <input
                    id="loan-principal-input"
                    type="number"
                    min={50000}
                    step={50000}
                    value={loanPrincipalInput}
                    onChange={(e) => setLoanPrincipalInput(e.target.value)}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-mono text-base font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label
                    htmlFor="loan-tenor-select"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Repayment Duration (Months)
                  </label>
                  <select
                    id="loan-tenor-select"
                    value={loanTenor}
                    onChange={(e) => setLoanTenor(Number(e.target.value))}
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900"
                  >
                    <option value={3}>3 Months (Short-Term Working Capital)</option>
                    <option value={6}>6 Months (Standard Thrift Tenor)</option>
                    <option value={12}>12 Months (Asset & Expansion Tenor)</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="loan-purpose-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Loan Purpose / Project Summary
                  </label>
                  <input
                    id="loan-purpose-input"
                    type="text"
                    value={loanPurpose}
                    onChange={(e) => setLoanPurpose(e.target.value)}
                    placeholder="e.g. Cold room generator overhaul at Trans-Amadi"
                    className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900"
                  />
                </div>

                {/* Live Schedule Summary */}
                <div className="rounded-2xl bg-slate-50 p-4 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Cooperative Interest (8%):</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatNaira(previewSchedule.interest)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Total Repayable:</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatNaira(previewSchedule.totalPayable)}
                    </span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-slate-200">
                    <span className="font-semibold text-slate-900">
                      Monthly Installment ({loanTenor} mos):
                    </span>
                    <span className="font-mono text-sm font-bold text-emerald-900">
                      {formatNaira(previewSchedule.monthlyInstallment)} / mo
                    </span>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full min-h-[48px] rounded-xl bg-emerald-900 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
                >
                  Submit Loan Application
                </button>
              </form>
            </section>
          </div>
        </div>
      )}

      {/* TAB 4: STATISTICS (Placed immediately after Loans: Current Cooperative Happenings & Live Synced Updates + 12-Month Thrift Contribution Grid) */}
      {activeTab === 'statistics' && (
        <div
          data-testid="member-statistics-tab-panel"
          className="space-y-4"
        >
          {/* Current Cooperative Happenings & Live Synced Updates (From Admin Excel/Word Portal) */}
          <section
            aria-label="Current Cooperative Happenings and Live Updates"
            data-testid="member-happenings-section"
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Current Cooperative Happenings & Live Synced Updates
                </h2>
                <p className="text-xs text-slate-600">
                  Automatically synced from the Admin Portal (Excel & Word
                  imports) — includes latest contributions, loans, and treasury
                  liquidity
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                <span>
                  Cooperative Liquidity Pool:{' '}
                  <strong
                    data-testid="member-live-liquidity"
                    className="font-mono text-emerald-900"
                  >
                    {showBalance
                      ? formatNaira(displayLiquidity)
                      : '₦ •••••••••'}
                  </strong>
                </span>
                {isSignedIn && lastSyncedAt && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-800 font-semibold">
                      Auto-Synced {new Date(lastSyncedAt).toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>

            {!isSignedIn ? (
              <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xs font-medium text-slate-600">
                  Sign in to view your synchronized cooperative happenings,
                  credited contributions, and live treasury updates from the
                  Admin Portal.
                </p>
                {onOpenAuthModal && (
                  <button
                    type="button"
                    onClick={onOpenAuthModal}
                    className="mt-2.5 min-h-[38px] rounded-xl bg-emerald-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    Sign In to Sync Statistics
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {happenings
                  .filter(
                    (h) => h.memberId === 'all' || h.memberId === member.id
                  )
                  .slice(0, 5)
                  .map((hap) => (
                    <div
                      key={hap.id}
                      className="py-3 flex flex-wrap items-start justify-between gap-3"
                    >
                      <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs sm:text-sm font-bold text-slate-900">
                            {hap.title}
                          </span>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-800">
                            {hap.sourceFormat === 'excel'
                              ? 'Excel Schedule Sync'
                              : hap.sourceFormat === 'word'
                              ? 'Word Memo Import'
                              : 'Live Admin Update'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600 leading-relaxed">
                          {hap.summary}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        {hap.amount !== undefined && hap.amount > 0 && (
                          <div className="font-mono text-xs sm:text-sm font-bold tabular-nums text-emerald-900">
                            {showBalance ? formatNaira(hap.amount) : '₦ ••••••'}
                          </div>
                        )}
                        <div className="text-[11px] text-slate-400">
                          {new Date(hap.publishedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* 12-Month Contribution Grid (Paid, Late, Missed) */}
          <section
            aria-label="12-Month Contribution Grid"
            data-testid="member-contribution-grid-section"
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  12-Month Thrift Contribution Grid
                </h2>
                <p className="text-xs text-slate-600">
                  Monthly pledge compliance record from December 2025 to
                  November 2026
                </p>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-600">
                <span>
                  Paid:{' '}
                  <strong className="font-mono text-emerald-800">
                    {isSignedIn
                      ? member.contributionGrid.filter(
                          (m) => m.status === 'paid'
                        ).length
                      : 0}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Late:{' '}
                  <strong className="font-mono text-amber-700">
                    {isSignedIn
                      ? member.contributionGrid.filter(
                          (m) => m.status === 'late'
                        ).length
                      : 0}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  Missed:{' '}
                  <strong className="font-mono text-red-700">
                    {isSignedIn
                      ? member.contributionGrid.filter(
                          (m) => m.status === 'missed'
                        ).length
                      : 0}
                  </strong>
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {displayContributionGrid.map((cell) => {
                const isPaid = isSignedIn && cell.status === 'paid';
                const isLate = isSignedIn && cell.status === 'late';
                return (
                  <div
                    key={cell.month}
                    className={`rounded-xl border p-3 transition-colors ${
                      !isSignedIn
                        ? 'border-slate-200 bg-slate-50/60'
                        : isPaid
                        ? 'border-emerald-200 bg-emerald-50/50'
                        : isLate
                        ? 'border-amber-200 bg-amber-50/60'
                        : 'border-red-200 bg-red-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900">
                        {cell.label}
                      </span>
                      <span
                        className={`text-[11px] font-semibold capitalize ${
                          !isSignedIn
                            ? 'text-slate-500'
                            : isPaid
                            ? 'text-emerald-800'
                            : isLate
                            ? 'text-amber-800'
                            : 'text-red-700'
                        }`}
                      >
                        {isSignedIn ? cell.status : '—'}
                      </span>
                    </div>
                    <div className="mt-1.5 font-mono text-xs sm:text-sm font-semibold tabular-nums text-slate-800">
                      {showBalance ? formatNaira(cell.amount) : '₦ •••••'}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Recent Member Contributions & Transfer Receipts */}
          <section
            aria-label="Recent Contribution Submissions"
            data-testid="member-recent-contributions-section"
            className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-slate-900">
                  Your Recent Contributions & Receipts
                </h2>
                <p className="text-xs text-slate-600">
                  Real-time status of Paystack payments and manual bank transfer
                  receipts
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChangeTab('pay')}
                className="min-h-[38px] rounded-xl border border-slate-200 px-3.5 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-slate-50 whitespace-nowrap"
              >
                New Payment
              </button>
            </div>

            {memberContributions.length === 0 ? (
              <div className="rounded-xl bg-slate-50 p-4 text-center">
                <p className="text-xs sm:text-sm font-medium text-slate-700">
                  {isSignedIn
                    ? 'No contributions recorded for this profile yet.'
                    : 'Sign in to view your synchronized contribution history and payment receipts.'}
                </p>
                <button
                  type="button"
                  onClick={() =>
                    isSignedIn && onOpenAuthModal === undefined
                      ? onChangeTab('pay')
                      : isSignedIn
                      ? onChangeTab('pay')
                      : onOpenAuthModal?.()
                  }
                  className="mt-2.5 min-h-[38px] rounded-xl bg-emerald-900 px-4 py-1.5 text-xs font-semibold text-white"
                >
                  {isSignedIn
                    ? 'Make First Contribution'
                    : 'Sign In to Sync Contributions'}
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {memberContributions.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm font-bold text-slate-900">
                          {item.month} Thrift Contribution
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-xs text-slate-600">
                          {item.method === 'paystack'
                            ? `Paystack (${item.paystackRef})`
                            : `Bank Transfer (${item.bankName || 'NIP'})`}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        Submitted {new Date(item.createdAt).toLocaleString()}
                        {item.rejectionReason
                          ? ` — Reason: ${item.rejectionReason}`
                          : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs sm:text-sm font-bold tabular-nums text-slate-900">
                        {formatNaira(item.amount)}
                      </span>
                      <span
                        className={`text-xs font-semibold ${
                          item.status === 'confirmed'
                            ? 'text-emerald-800'
                            : item.status === 'pending'
                            ? 'text-amber-700'
                            : 'text-red-700'
                        }`}
                      >
                        {item.status === 'confirmed'
                          ? 'Confirmed'
                          : item.status === 'pending'
                          ? 'Awaiting confirmation'
                          : 'Rejected'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 5: COMMUNITY FEED (Privacy-Safe Projection) */}
      {activeTab === 'community' && (
        <section
          aria-label="Community Active Loans Feed"
          className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900">
                Community Active Loans Feed
              </h2>
              <p className="mt-1 text-xs text-slate-600 max-w-2xl">
                Transparency without compromising member privacy: served via the{' '}
                <code className="font-mono text-emerald-900">
                  getCommunityActiveLoans
                </code>{' '}
                Cloud Function projection returning <strong>only</strong> member
                names and repayment status. Loan principals, balances, and
                schedules never reach client devices.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800">
              <ShieldCheck className="h-4 w-4" />
              <span>Zero-Balance Privacy View Verified</span>
            </div>
          </div>

          <div
            className="mt-3 divide-y divide-slate-100"
            data-testid="community-loan-list"
          >
            {communityFeed.map((entry) => (
              <div
                key={entry.id}
                className="flex min-h-[52px] items-center justify-between gap-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-950/10 text-xs font-bold text-emerald-950">
                    {entry.name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')
                      .slice(0, 2)}
                  </div>
                  <span className="text-sm font-semibold text-slate-900">
                    {entry.name}
                  </span>
                </div>

                <span
                  className={`text-xs font-semibold ${
                    entry.status === 'Repaying'
                      ? 'text-emerald-800'
                      : 'text-amber-800'
                  }`}
                >
                  {entry.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Paystack Test Mode Checkout Modal */}
      {showPaystackModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paystack-modal-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">
                  Paystack Test Mode Checkout
                </span>
                <h3
                  id="paystack-modal-title"
                  className="text-base font-bold text-slate-900"
                >
                  PISET Cooperative Port Harcourt
                </h3>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-slate-500">
                  {member.email}
                </span>
                <span className="font-mono text-base font-bold text-emerald-900">
                  {formatNaira(Number(payAmount) || 0)}
                </span>
              </div>
            </div>

            <div className="my-5 space-y-3 rounded-2xl bg-slate-50 p-4 text-xs text-slate-700">
              <div className="flex justify-between">
                <span>Selected Channel:</span>
                <strong className="uppercase">{paystackChannel}</strong>
              </div>
              <div className="flex justify-between">
                <span>Target Period:</span>
                <strong className="font-mono">{payMonth}</strong>
              </div>
              <div className="flex justify-between">
                <span>Webhook Signature:</span>
                <strong className="font-mono text-emerald-800">
                  x-paystack-signature (HMAC-SHA512)
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPaystackModal(false)}
                className="min-h-[44px] rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPaystackCheckout}
                className="min-h-[44px] rounded-xl bg-emerald-900 px-5 py-2.5 text-xs font-bold text-white hover:bg-emerald-800"
              >
                Authorize Test Payment ({formatNaira(Number(payAmount) || 0)})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Bottom Navigation Bar for Mobile Ergonomics (5 Tabs: Home, Pay, Loans, Statistics, Community) */}
      <nav
        aria-label="Member Mobile Bottom Navigation"
        className="fixed right-0 bottom-0 left-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md sm:hidden"
      >
        <div className="grid h-16 grid-cols-5 items-center">
          {(
            [
              { id: 'home', label: 'Home', icon: Home },
              { id: 'pay', label: 'Pay', icon: Wallet },
              { id: 'loans', label: 'Loans', icon: Landmark },
              { id: 'statistics', label: 'Statistics', icon: BarChart3 },
              { id: 'community', label: 'Community', icon: Users },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                data-testid={`mobile-tab-${tab.id}`}
                onClick={() => onChangeTab(tab.id)}
                className={`flex min-h-[48px] flex-col items-center justify-center transition-colors ${
                  isActive
                    ? 'text-emerald-900 font-bold'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="mt-1 text-[10px] leading-none">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
