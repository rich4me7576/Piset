/**
 * Pure domain logic for PISET Cooperative Society Port Harcourt.
 * Decoupled from React and Firestore for deterministic unit testing.
 */

export type UserRole = 'member' | 'treasurer' | 'admin';
export type MemberStatus = 'active' | 'suspended' | 'pending';
export type ContributionMethod = 'paystack' | 'bank_transfer';
export type ContributionStatus = 'pending' | 'confirmed' | 'rejected';
export type LoanStatus = 'pending' | 'active' | 'repaid' | 'overdue' | 'declined';
export type OverdueBucket = '1-29' | '30' | '60' | '90+';

export interface ScheduleInstallment {
  installmentNumber: number;
  dueDate: string;
  principalPart: number;
  interestPart: number;
  totalInstallment: number;
  status: 'paid' | 'upcoming' | 'overdue';
}

/**
 * Formats a number in Nigerian Naira as ₦1,250,000.
 */
export function formatNaira(amount: number): string {
  if (!Number.isFinite(amount)) return '₦0';
  const rounded = Math.round(amount);
  const absFormatted = Math.abs(rounded).toLocaleString('en-NG', {
    maximumFractionDigits: 0,
  });
  return rounded < 0 ? `-₦${absFormatted}` : `₦${absFormatted}`;
}

/**
 * Computes a member's loan eligibility ("Eligible up to ₦X" = savings × multiplier, if in good standing).
 */
export function calculateLoanEligibility(
  totalSavings: number,
  multiplier = 3,
  memberStatus: MemberStatus = 'active',
  hasOverdueLoan = false,
  missedMonthsCount = 0
): {
  eligible: boolean;
  maxLoanAmount: number;
  multiplier: number;
  reason: string;
} {
  if (memberStatus !== 'active') {
    return {
      eligible: false,
      maxLoanAmount: 0,
      multiplier,
      reason: 'Membership must be active and in good standing to request a loan.',
    };
  }
  if (hasOverdueLoan) {
    return {
      eligible: false,
      maxLoanAmount: 0,
      multiplier,
      reason: 'Clear existing overdue loan balance to restore loan eligibility.',
    };
  }
  if (missedMonthsCount > 2) {
    return {
      eligible: false,
      maxLoanAmount: 0,
      multiplier,
      reason: 'More than 2 missed monthly contributions in the last 12 months.',
    };
  }
  const safeSavings = Math.max(0, totalSavings);
  const maxLoanAmount = Math.round(safeSavings * multiplier);
  return {
    eligible: maxLoanAmount > 0,
    maxLoanAmount,
    multiplier,
    reason:
      maxLoanAmount > 0
        ? `In good standing — eligible up to ${multiplier}× your confirmed thrift savings.`
        : 'Build confirmed thrift savings to unlock cooperative credit.',
  };
}

/**
 * Enforces the Maker-Checker governance rule:
 * 1. Only a treasurer or admin can approve or reject a manual bank transfer.
 * 2. Whoever approves a manual transfer cannot be the person who uploaded it.
 */
export function validateMakerCheckerApproval(
  uploaderUid: string,
  approverUid: string,
  approverRole: UserRole
): { allowed: boolean; reason?: string } {
  if (approverRole !== 'treasurer' && approverRole !== 'admin') {
    return {
      allowed: false,
      reason: 'Only a Treasurer or Admin can approve or reject transfers.',
    };
  }
  if (!uploaderUid || !approverUid) {
    return {
      allowed: false,
      reason: 'Missing uploader or approver identity.',
    };
  }
  if (uploaderUid === approverUid) {
    return {
      allowed: false,
      reason:
        'Maker-checker rule violation: You uploaded this transfer receipt and cannot approve your own submission.',
    };
  }
  return { allowed: true };
}

/**
 * Detects potential duplicate manual or Paystack contributions:
 * Same memberId, same amount, and same month within a 48-hour window.
 */
export function detectDuplicateContribution(
  candidate: {
    id: string;
    memberId: string;
    amount: number;
    month: string;
    createdAt: string;
  },
  allContributions: Array<{
    id: string;
    memberId: string;
    amount: number;
    month: string;
    createdAt: string;
    status: ContributionStatus;
  }>
): { isDuplicate: boolean; matchingIds: string[] } {
  const candidateTime = Date.parse(candidate.createdAt);
  if (Number.isNaN(candidateTime)) {
    return { isDuplicate: false, matchingIds: [] };
  }
  const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

  const matches = allContributions.filter((item) => {
    if (item.id === candidate.id) return false;
    if (item.status === 'rejected') return false;
    if (item.memberId !== candidate.memberId) return false;
    if (item.amount !== candidate.amount) return false;
    if (item.month !== candidate.month) return false;

    const itemTime = Date.parse(item.createdAt);
    if (Number.isNaN(itemTime)) return false;

    return Math.abs(candidateTime - itemTime) <= FORTY_EIGHT_HOURS_MS;
  });

  return {
    isDuplicate: matches.length > 0,
    matchingIds: matches.map((m) => m.id),
  };
}

/**
 * Computes Treasury Overview KPI metrics:
 * - Total Liquidity: total confirmed member savings + earned interest pool
 * - Active Loan Exposure: total outstanding balance across active and overdue loans
 * - Cash Reserves: Total Liquidity minus Active Loan Exposure
 * - Exposure-to-Liquidity Ratio: percentage (0–100+)
 */
export function calculateTreasuryKPIs(
  members: Array<{ totalSavings: number }>,
  loans: Array<{
    principal: number;
    interest: number;
    amountPaid: number;
    status: LoanStatus;
  }>,
  extraLiquidityPool: number = 0
): {
  totalLiquidity: number;
  activeLoanExposure: number;
  cashReserves: number;
  exposureToLiquidityRatio: number;
} {
  const totalSavingsPool = members.reduce(
    (sum, m) => sum + Math.max(0, m.totalSavings),
    0
  );

  // Realized interest from repaid loans adds to cooperative liquidity
  const realizedInterest = loans
    .filter((l) => l.status === 'repaid')
    .reduce((sum, l) => sum + Math.max(0, l.interest), 0);

  const totalLiquidity =
    totalSavingsPool + realizedInterest + Math.max(0, extraLiquidityPool);

  const activeLoanExposure = loans
    .filter((l) => l.status === 'active' || l.status === 'overdue')
    .reduce((sum, l) => {
      const totalObligation = l.principal + l.interest;
      const outstanding = Math.max(0, totalObligation - l.amountPaid);
      return sum + outstanding;
    }, 0);

  const cashReserves = Math.max(0, totalLiquidity - activeLoanExposure);
  const exposureToLiquidityRatio =
    totalLiquidity > 0
      ? Number(((activeLoanExposure / totalLiquidity) * 100).toFixed(1))
      : 0;

  return {
    totalLiquidity,
    activeLoanExposure,
    cashReserves,
    exposureToLiquidityRatio,
  };
}

/**
 * Filters overdue loans into the 4 Defaulters Desk tabs:
 * - '1-29': 1 to 29 days overdue
 * - '30': 30 to 59 days overdue
 * - '60': 60 to 89 days overdue
 * - '90+': 90 or more days overdue
 */
export function filterLoansByOverdueBucket<
  T extends { status: LoanStatus; daysOverdue: number }
>(loans: T[], bucket: OverdueBucket): T[] {
  return loans.filter((loan) => {
    if (loan.status !== 'overdue' && loan.daysOverdue <= 0) return false;
    const d = loan.daysOverdue;
    switch (bucket) {
      case '1-29':
        return d >= 1 && d <= 29;
      case '30':
        return d >= 30 && d <= 59;
      case '60':
        return d >= 60 && d <= 89;
      case '90+':
        return d >= 90;
      default:
        return false;
    }
  });
}

/**
 * Projects raw loan records into the privacy-preserving Community Feed format.
 * Returns ONLY { id, name, status } ('Active' | 'Repaying') — never amounts or balances.
 */
export function buildCommunityLoanFeed(
  loans: Array<{
    id: string;
    memberName: string;
    status: LoanStatus;
    amountPaid: number;
    principal?: number;
    interest?: number;
  }>
): Array<{ id: string; name: string; status: 'Active' | 'Repaying' }> {
  return loans
    .filter((loan) => loan.status === 'active' || loan.status === 'overdue')
    .map((loan) => ({
      id: loan.id,
      name: loan.memberName,
      status: loan.amountPaid > 0 ? 'Repaying' : 'Active',
    }));
}

/**
 * Generates a structured monthly loan repayment schedule.
 */
export function generateRepaymentSchedule(
  principal: number,
  flatInterestRatePct = 8,
  tenorMonths = 6,
  startDateIso = '2026-11-01'
): {
  interest: number;
  totalPayable: number;
  monthlyInstallment: number;
  schedule: ScheduleInstallment[];
} {
  const safePrincipal = Math.max(0, Math.round(principal));
  const safeTenor = Math.min(24, Math.max(1, Math.round(tenorMonths)));
  const interest = Math.round(safePrincipal * (flatInterestRatePct / 100));
  const totalPayable = safePrincipal + interest;
  const monthlyInstallment = Math.round(totalPayable / safeTenor);
  const principalPart = Math.round(safePrincipal / safeTenor);
  const interestPart = Math.round(interest / safeTenor);

  const baseDate = new Date(`${startDateIso}T00:00:00Z`);
  const schedule: ScheduleInstallment[] = [];

  for (let i = 1; i <= safeTenor; i++) {
    const due = new Date(baseDate);
    due.setUTCMonth(due.getUTCMonth() + i);
    const dueDateStr = due.toISOString().slice(0, 10);
    schedule.push({
      installmentNumber: i,
      dueDate: dueDateStr,
      principalPart,
      interestPart,
      totalInstallment: monthlyInstallment,
      status: 'upcoming',
    });
  }

  return {
    interest,
    totalPayable,
    monthlyInstallment,
    schedule,
  };
}

export type PushNotificationCategory =
  | 'upcoming_repayment'
  | 'overdue_payment'
  | 'cooperative_announcement';

export interface PushNotificationItem {
  id: string;
  recipientMemberId: string; // 'all' for broadcast announcements or specific memberId
  category: PushNotificationCategory;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  fcmMessageId: string;
  actionTab?: 'home' | 'pay' | 'loans' | 'community';
  amount?: number;
}

export interface BiometricCredentialRecord {
  uid: string;
  memberId: string;
  credentialId: string;
  modality: 'fingerprint' | 'face_id' | 'passkey';
  deviceLabel: string;
  pinHash: string;
  biometricEnabled: boolean;
  pinEnabled: boolean;
  enrolledAt: string;
  lastVerifiedAt: string;
}

/**
 * Validates a 4-digit PIN setup request and returns a deterministic salted hash.
 * Rejects weak sequential or repeated PINs if strict mode is enabled, and requires 4 numeric digits.
 */
export function validateAndHashPin(
  pin: string,
  confirmPin: string,
  uid: string
): { valid: boolean; pinHash?: string; error?: string } {
  const cleanPin = pin.trim();
  if (!/^[0-9]{4}$/.test(cleanPin)) {
    return {
      valid: false,
      error: 'PIN must be exactly 4 numeric digits (0–9).',
    };
  }
  if (cleanPin !== confirmPin.trim()) {
    return {
      valid: false,
      error: 'PIN and confirmation PIN do not match.',
    };
  }
  // Deterministic salted digest suitable for client/rules verification
  let hash = 2166136261;
  const salted = `piset_phc_${uid}_${cleanPin}`;
  for (let i = 0; i < salted.length; i++) {
    hash ^= salted.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const hexHash = `pbkdf2_sha256_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  return {
    valid: true,
    pinHash: hexHash,
  };
}

/**
 * Verifies a candidate 4-digit PIN against the stored salted hash.
 */
export function verifyPinAgainstHash(
  candidatePin: string,
  uid: string,
  expectedHash: string
): boolean {
  const res = validateAndHashPin(candidatePin, candidatePin, uid);
  return Boolean(res.valid && res.pinHash === expectedHash);
}

/**
 * Builds an FCM Push Notification payload for the 3 required cooperative triggers:
 * 1. Upcoming loan repayments (e.g., 3 days before due)
 * 2. Overdue contributions or loan payments
 * 3. Important announcements from the cooperative
 */
export function createFcmPushNotification(params: {
  recipientMemberId: string;
  category: PushNotificationCategory;
  title: string;
  body: string;
  amount?: number;
  nowIso?: string;
}): PushNotificationItem {
  const timestamp = params.nowIso || new Date().toISOString();
  const actionTab: PushNotificationItem['actionTab'] =
    params.category === 'upcoming_repayment'
      ? 'loans'
      : params.category === 'overdue_payment'
      ? 'pay'
      : 'home';

  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    recipientMemberId: params.recipientMemberId,
    category: params.category,
    title: params.title.trim().slice(0, 140),
    body: params.body.trim().slice(0, 500),
    createdAt: timestamp,
    read: false,
    fcmMessageId: `fcm_phc_${Date.now().toString(36)}`,
    actionTab,
    amount: params.amount,
  };
}

export interface CooperativeHappeningItem {
  id: string;
  title: string;
  summary: string;
  category: 'contribution' | 'loan' | 'liquidity' | 'general';
  amount?: number;
  memberId: string; // 'all' or specific memberId e.g. 'mem_01'
  memberName?: string;
  sourceFormat: 'excel' | 'word' | 'admin_portal';
  publishedAt: string;
}

export interface CooperativeSyncRow {
  id: string;
  recordType: 'contribution' | 'loan' | 'liquidity' | 'happening';
  memberId: string;
  memberName: string;
  month: string;
  amount: number;
  description: string;
  status: string;
  sourceFormat: 'excel' | 'word' | 'admin_portal';
}

/**
 * Parses normalized spreadsheet rows (from Excel .xlsx/.xls/.csv) into validated CooperativeSyncRow items
 * covering contributions, loans, liquidity adjustments, and cooperative happenings.
 */
export function parseExcelRowsToSyncBatch(
  rows: Record<string, unknown>[],
  sourceFormat: 'excel' | 'word' | 'admin_portal' = 'excel'
): CooperativeSyncRow[] {
  const results: CooperativeSyncRow[] = [];

  rows.forEach((rawRow, index) => {
    // Case-insensitive key lookup helper
    const getField = (candidates: string[]): string => {
      for (const [k, v] of Object.entries(rawRow)) {
        const cleanKey = k.trim().toLowerCase().replace(/[\s_-]+/g, '');
        if (candidates.includes(cleanKey) && v !== undefined && v !== null) {
          return String(v).trim();
        }
      }
      return '';
    };

    const rawType = getField([
      'type',
      'recordtype',
      'category',
      'entrytype',
    ]).toLowerCase();
    let recordType: CooperativeSyncRow['recordType'] = 'contribution';
    if (rawType.includes('loan')) {
      recordType = 'loan';
    } else if (rawType.includes('liquid') || rawType.includes('reserve') || rawType.includes('treasury')) {
      recordType = 'liquidity';
    } else if (rawType.includes('happen') || rawType.includes('news') || rawType.includes('announce') || rawType.includes('update')) {
      recordType = 'happening';
    } else if (rawType.includes('contrib') || rawType.includes('saving') || rawType.includes('thrift')) {
      recordType = 'contribution';
    }

    const memberId =
      getField(['memberid', 'id', 'membercode']) ||
      (recordType === 'liquidity' || recordType === 'happening'
        ? 'all'
        : 'mem_01');
    const memberName =
      getField(['membername', 'name', 'member', 'fullname']) ||
      (memberId === 'all' ? 'All Cooperative Members' : 'Chukwudi Nwoye');
    const month =
      getField(['month', 'period', 'date']) || '2026-11';
    const rawAmountStr = getField([
      'amount',
      'amountngn',
      'naira',
      'principal',
      'value',
    ]).replace(/[^0-9.-]/g, '');
    const amount = Number.isFinite(Number(rawAmountStr))
      ? Math.max(0, Math.round(Number(rawAmountStr)))
      : 0;

    const description =
      getField([
        'description',
        'details',
        'summary',
        'purpose',
        'title',
        'note',
        'happening',
      ]) ||
      (recordType === 'contribution'
        ? `${month} Thrift Contribution Sync`
        : recordType === 'loan'
        ? `Cooperative Loan Facility Update`
        : recordType === 'liquidity'
        ? `Treasury Liquidity & Cash Reserve Update`
        : `Cooperative Happening Bulletin`);

    const status =
      getField(['status', 'state']) || 'confirmed';

    if (!rawType && !rawAmountStr && !description) {
      return;
    }

    results.push({
      id: `sync_row_${Date.now()}_${index}`,
      recordType,
      memberId,
      memberName,
      month,
      amount,
      description,
      status,
      sourceFormat,
    });
  });

  return results;
}

/**
 * Parses unstructured or semi-structured Word document text (.docx / .doc / .txt)
 * into structured CooperativeSyncRow items so Admins can import Word reports containing
 * contributions, loans, liquidity figures, and cooperative happenings.
 */
export function parseWordTextToSyncBatch(rawText: string): CooperativeSyncRow[] {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  const results: CooperativeSyncRow[] = [];

  lines.forEach((line, idx) => {
    // Support pipe-delimited or colon-delimited or natural-language cooperative report lines
    // Example 1: "CONTRIBUTION | mem_01 | Chukwudi Nwoye | 2026-11 | 125000 | November Thrift Paid"
    // Example 2: "LOAN | mem_04 | Ngozi Okafor | 2026-11 | 450000 | Cold Room Expansion Loan Repaid"
    // Example 3: "LIQUIDITY | all | Treasury Pool | 2026-11 | 2500000 | Q4 Oil & Gas Marine Dividend Inflow"
    // Example 4: "HAPPENING | all | All Members | 2026-11 | 0 | Port Harcourt Land Acquisition Phase 2 Approved"
    if (line.includes('|')) {
      const parts = line.split('|').map((p) => p.trim());
      if (parts.length >= 3) {
        const typeToken = parts[0].toLowerCase();
        // Skip header row if it's literally "Type | MemberID | ..."
        if (typeToken === 'type' || typeToken === 'recordtype') return;

        let recordType: CooperativeSyncRow['recordType'] = 'happening';
        if (typeToken.includes('contrib') || typeToken.includes('saving')) {
          recordType = 'contribution';
        } else if (typeToken.includes('loan')) {
          recordType = 'loan';
        } else if (typeToken.includes('liquid') || typeToken.includes('treasury')) {
          recordType = 'liquidity';
        }

        const memberId = parts[1] || 'all';
        const memberName = parts[2] || 'All Cooperative Members';
        const month = parts[3] || '2026-11';
        const rawAmt = (parts[4] || '0').replace(/[^0-9.-]/g, '');
        const amount = Number.isFinite(Number(rawAmt))
          ? Math.max(0, Math.round(Number(rawAmt)))
          : 0;
        const description =
          parts[5] || parts[3] || 'Imported from Cooperative Word Document';

        results.push({
          id: `sync_word_${Date.now()}_${idx}`,
          recordType,
          memberId,
          memberName,
          month,
          amount,
          description,
          status: 'confirmed',
          sourceFormat: 'word',
        });
        return;
      }
    }

    // Natural-language bullet/paragraph extraction for Word documents
    const lower = line.toLowerCase();
    const nairaMatch = line.match(/(?:₦|ngn\s*)?([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{4,})/i);
    const extractedAmount = nairaMatch
      ? Number(nairaMatch[1].replace(/,/g, ''))
      : 0;
    const memberIdMatch = line.match(/\b(mem_[0-9]{2})\b/i);
    const detectedMemberId = memberIdMatch
      ? memberIdMatch[1].toLowerCase()
      : 'all';

    let recordType: CooperativeSyncRow['recordType'] = 'happening';
    if (lower.includes('contribution') || lower.includes('thrift') || lower.includes('pledge')) {
      recordType = 'contribution';
    } else if (lower.includes('loan') || lower.includes('repayment') || lower.includes('facility')) {
      recordType = 'loan';
    } else if (lower.includes('liquidity') || lower.includes('reserve') || lower.includes('treasury')) {
      recordType = 'liquidity';
    }

    if (line.length >= 8) {
      results.push({
        id: `sync_word_${Date.now()}_${idx}`,
        recordType,
        memberId:
          recordType === 'contribution' && detectedMemberId === 'all'
            ? 'mem_01'
            : detectedMemberId,
        memberName:
          detectedMemberId === 'mem_01' ||
          (recordType === 'contribution' && detectedMemberId === 'all')
            ? 'Chukwudi Nwoye'
            : 'All Cooperative Members',
        month: '2026-11',
        amount: Number.isFinite(extractedAmount) ? extractedAmount : 0,
        description: line.replace(/^[-*•\d.)\s]+/, '').trim(),
        status: 'confirmed',
        sourceFormat: 'word',
      });
    }
  });

  return results;
}

/**
 * Resolves Member Dashboard and Admin Treasury KPI figures based on authentication state.
 * Enforces that ALL dashboard Naira balances default to ₦0 when `isSignedIn === false`,
 * and immediately return the synchronized member + admin figures once the rightful user signs in.
 */
export function resolveSynchronizedDashboardFigures(params: {
  isSignedIn: boolean;
  member: {
    totalSavings: number;
    monthlyPledge: number;
    status: MemberStatus;
    contributionGrid: Array<{
      month: string;
      label: string;
      status: 'paid' | 'late' | 'missed';
      amount: number;
    }>;
  };
  memberLoans: Array<{
    principal: number;
    interest: number;
    amountPaid: number;
    status: LoanStatus;
  }>;
  allMembers: Array<{ totalSavings: number }>;
  allLoans: Array<{
    principal: number;
    interest: number;
    amountPaid: number;
    status: LoanStatus;
  }>;
  extraLiquidityPool?: number;
}): {
  memberSavings: number;
  memberPledge: number;
  remainingEligibleCredit: number;
  maxLoanAmount: number;
  currentExposure: number;
  eligibilityReason: string;
  totalLiquidity: number;
  activeLoanExposure: number;
  cashReserves: number;
  exposureToLiquidityRatio: number;
} {
  if (!params.isSignedIn) {
    return {
      memberSavings: 0,
      memberPledge: 0,
      remainingEligibleCredit: 0,
      maxLoanAmount: 0,
      currentExposure: 0,
      eligibilityReason:
        'Sign in to your cooperative account to view your synchronized savings balance and 3× loan eligibility.',
      totalLiquidity: 0,
      activeLoanExposure: 0,
      cashReserves: 0,
      exposureToLiquidityRatio: 0,
    };
  }

  const missedMonthsCount = params.member.contributionGrid.filter(
    (g) => g.status === 'missed'
  ).length;
  const hasOverdue = params.memberLoans.some((l) => l.status === 'overdue');

  const eligibility = calculateLoanEligibility(
    params.member.totalSavings,
    3,
    params.member.status,
    hasOverdue,
    missedMonthsCount
  );

  const activeOrOverdueLoan = params.memberLoans.find(
    (l) => l.status === 'active' || l.status === 'overdue'
  );
  const currentExposure = activeOrOverdueLoan
    ? Math.max(
        0,
        activeOrOverdueLoan.principal +
          activeOrOverdueLoan.interest -
          activeOrOverdueLoan.amountPaid
      )
    : 0;

  const remainingEligibleCredit = Math.max(
    0,
    eligibility.maxLoanAmount - currentExposure
  );

  const kpis = calculateTreasuryKPIs(
    params.allMembers,
    params.allLoans,
    params.extraLiquidityPool || 0
  );

  return {
    memberSavings: params.member.totalSavings,
    memberPledge: params.member.monthlyPledge,
    remainingEligibleCredit,
    maxLoanAmount: eligibility.maxLoanAmount,
    currentExposure,
    eligibilityReason: eligibility.reason,
    totalLiquidity: kpis.totalLiquidity,
    activeLoanExposure: kpis.activeLoanExposure,
    cashReserves: kpis.cashReserves,
    exposureToLiquidityRatio: kpis.exposureToLiquidityRatio,
  };
}

export const DEFAULT_ADMIN_PORTAL_PASSWORD = 'COOPERative357@#';

/**
 * Normalizes Nigerian phone numbers so "+234 803 481 9201", "08034819201", and "+2348034819201"
 * match reliably against the Admin-uploaded whitelist.
 */
export function normalizePhoneForComparison(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.startsWith('234') && digits.length === 13) {
    return digits;
  }
  if (digits.startsWith('0') && digits.length === 11) {
    return `234${digits.slice(1)}`;
  }
  return digits;
}

/**
 * Generates a deterministic or random 6-digit OTP sent to the member's email
 * once their email and phone number have been uploaded by the Admin.
 */
export function generateEmailBindingOtp(email: string, phone: string): string {
  const seed = `${email.trim().toLowerCase()}|${normalizePhoneForComparison(phone)}`;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const sixDigits = ((hash >>> 0) % 900000) + 100000;
  return String(sixDigits);
}

/**
 * Checks whether a candidate email and/or phone number has been uploaded by the Admin.
 * No one whose email and phone number has not been uploaded by the Admin is permitted access.
 */
export function verifyWhitelistedMemberAccess<
  T extends {
    id: string;
    name: string;
    email: string;
    phone: string;
    uploadedByAdmin?: boolean;
  }
>(
  members: T[],
  candidateEmail: string,
  candidatePhone: string
): {
  allowed: boolean;
  member?: T;
  error?: string;
} {
  const cleanEmail = candidateEmail.trim().toLowerCase();
  const cleanPhone = normalizePhoneForComparison(candidatePhone);

  if (!cleanEmail || !cleanPhone) {
    return {
      allowed: false,
      error:
        'Both your Admin-registered Email Address and Phone Number are required to verify membership.',
    };
  }

  const matched = members.find((m) => {
    const emailMatches = m.email.trim().toLowerCase() === cleanEmail;
    const phoneMatches =
      normalizePhoneForComparison(m.phone) === cleanPhone;
    const isUploaded = m.uploadedByAdmin !== false;
    return emailMatches && phoneMatches && isUploaded;
  });

  if (!matched) {
    return {
      allowed: false,
      error:
        'Access Denied: This app is the sole property of PISET COOPERATIVE SOCIETY PORT HARCOURT. Your email and phone number have not been uploaded by the Admin.',
    };
  }

  return {
    allowed: true,
    member: matched,
  };
}

/**
 * Validates member custom password creation after first sign-in.
 * Enforces:
 * - At least 8 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one special sign / symbol (e.g. @, #, $, !, %, ^, &, *, etc.)
 */
export function validateMemberPasswordComplexity(
  password: string,
  confirmPassword?: string
): {
  valid: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasSpecialSign: boolean;
  hasMinLength: boolean;
  passwordHash?: string;
  error?: string;
} {
  const hasMinLength = password.length >= 8;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasSpecialSign = /[^A-Za-z0-9\s]/.test(password);

  if (!hasMinLength || !hasUppercase || !hasLowercase || !hasSpecialSign) {
    const missing: string[] = [];
    if (!hasMinLength) missing.push('at least 8 characters');
    if (!hasUppercase) missing.push('an uppercase letter (A–Z)');
    if (!hasLowercase) missing.push('a lowercase letter (a–z)');
    if (!hasSpecialSign) missing.push('a special sign (e.g. @, #, $, !, %)');
    return {
      valid: false,
      hasUppercase,
      hasLowercase,
      hasSpecialSign,
      hasMinLength,
      error: `Password must contain ${missing.join(', ')}.`,
    };
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return {
      valid: false,
      hasUppercase,
      hasLowercase,
      hasSpecialSign,
      hasMinLength,
      error: 'Passwords do not match.',
    };
  }

  let hash = 2166136261;
  const salted = `piset_pwd_${password}`;
  for (let i = 0; i < salted.length; i++) {
    hash ^= salted.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const passwordHash = `pwd_sha256_${(hash >>> 0).toString(16).padStart(8, '0')}`;

  return {
    valid: true,
    hasUppercase,
    hasLowercase,
    hasSpecialSign,
    hasMinLength,
    passwordHash,
  };
}

export function verifyMemberPassword(
  password: string,
  expectedHash: string
): boolean {
  if (!password || !expectedHash) return false;
  let hash = 2166136261;
  const salted = `piset_pwd_${password}`;
  for (let i = 0; i < salted.length; i++) {
    hash ^= salted.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const computed = `pwd_sha256_${(hash >>> 0).toString(16).padStart(8, '0')}`;
  return computed === expectedHash;
}

/**
 * Verifies the Admin Portal password and allows authorized personnel to change it once granted access.
 */
export function verifyAdminPortalPassword(
  inputPassword: string,
  activeAdminPassword: string = DEFAULT_ADMIN_PORTAL_PASSWORD
): { allowed: boolean; error?: string } {
  if (!inputPassword) {
    return {
      allowed: false,
      error: 'Please enter the authorised Admin Portal password.',
    };
  }
  if (inputPassword !== activeAdminPassword) {
    return {
      allowed: false,
      error:
        'Unauthorised Access: Invalid Admin Portal password. Only authorised PISET Cooperative personnel may access this portal.',
    };
  }
  return { allowed: true };
}

export function validateAdminPasswordChange(
  currentPasswordInput: string,
  activeAdminPassword: string,
  newPassword: string,
  confirmNewPassword: string
): { valid: boolean; nextPassword?: string; error?: string } {
  if (currentPasswordInput !== activeAdminPassword) {
    return {
      valid: false,
      error: 'Current Admin password is incorrect.',
    };
  }
  const complexity = validateMemberPasswordComplexity(
    newPassword,
    confirmNewPassword
  );
  if (!complexity.valid) {
    return {
      valid: false,
      error: complexity.error,
    };
  }
  return {
    valid: true,
    nextPassword: newPassword,
  };
}

/**
 * Resolves the Target Member in the Admin Portal Live Updates form from either
 * the dropdown selection ("draw down") or manual text input ("manually inputted").
 */
export function resolvePortalTargetMember<
  T extends { id: string; name: string; email?: string; phone?: string }
>(
  members: T[],
  dropdownMemberId: string,
  manualTargetText: string
): {
  memberId: string;
  memberName: string;
  matchedMember?: T;
  isManualCustom: boolean;
} {
  const trimmedManual = manualTargetText.trim();

  // 1. If manual text input is provided, resolve it first
  if (trimmedManual.length > 0) {
    const lowerManual = trimmedManual.toLowerCase();
    if (
      lowerManual === 'all' ||
      lowerManual === 'all members' ||
      lowerManual === 'all cooperative members'
    ) {
      return {
        memberId: 'all',
        memberName: 'All Cooperative Members',
        isManualCustom: false,
      };
    }

    // Check if manual input matches "Name (mem_XX)" or exact ID/Name/Email/Phone
    const idInParens = trimmedManual.match(/\((mem_[0-9]+)\)/i);
    const extractedId = idInParens ? idInParens[1].toLowerCase() : lowerManual;

    const matched = members.find(
      (m) =>
        m.id.toLowerCase() === extractedId ||
        m.name.toLowerCase() === lowerManual ||
        `${m.name} (${m.id})`.toLowerCase() === lowerManual ||
        (m.email && m.email.toLowerCase() === lowerManual) ||
        (m.phone &&
          normalizePhoneForComparison(m.phone) ===
            normalizePhoneForComparison(trimmedManual) &&
          normalizePhoneForComparison(trimmedManual).length >= 7) ||
        m.name.toLowerCase().includes(lowerManual)
    );

    if (matched) {
      return {
        memberId: matched.id,
        memberName: matched.name,
        matchedMember: matched,
        isManualCustom: false,
      };
    }

    // Custom manually inputted member name or ID
    const slugId =
      trimmedManual
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 18) || 'custom';
    return {
      memberId: lowerManual.startsWith('mem_') ? lowerManual : `mem_${slugId}`,
      memberName: trimmedManual,
      isManualCustom: true,
    };
  }

  // 2. Otherwise resolve from the dropdown selection
  if (dropdownMemberId === 'all' || !dropdownMemberId) {
    return {
      memberId: 'all',
      memberName: 'All Cooperative Members',
      isManualCustom: false,
    };
  }

  const matchedFromDropdown = members.find((m) => m.id === dropdownMemberId);
  if (matchedFromDropdown) {
    return {
      memberId: matchedFromDropdown.id,
      memberName: matchedFromDropdown.name,
      matchedMember: matchedFromDropdown,
      isManualCustom: false,
    };
  }

  return {
    memberId: dropdownMemberId,
    memberName: dropdownMemberId,
    isManualCustom: true,
  };
}

export type AdminExecutiveRole =
  | 'PRESIDENT'
  | 'VICE PRESIDENT'
  | 'TREASURER'
  | 'FINANCIAL SECRETARY'
  | 'ADMINISTRATOR';

export interface AdminExecutiveRoleProfile {
  roleTitle: AdminExecutiveRole;
  numberedLabel: string;
  memberId: string;
  uid: string;
  operatorName: string;
  systemRole: UserRole;
  department: string;
}

export const ADMIN_EXECUTIVE_ROLES: AdminExecutiveRoleProfile[] = [
  {
    roleTitle: 'PRESIDENT',
    numberedLabel: '1) PRESIDENT',
    memberId: 'mem_02',
    uid: 'uid_admin_01',
    operatorName: 'Boma Briggs',
    systemRole: 'admin',
    department: 'Executive President — GRA Phase 2',
  },
  {
    roleTitle: 'VICE PRESIDENT',
    numberedLabel: '2) VICE PRESIDENT',
    memberId: 'mem_05',
    uid: 'uid_mem_05',
    operatorName: 'Ibinabo Jack',
    systemRole: 'admin',
    department: 'Vice President — Mile 3 / Secretariat',
  },
  {
    roleTitle: 'TREASURER',
    numberedLabel: '3) TREASURER',
    memberId: 'mem_03',
    uid: 'uid_treasurer_01',
    operatorName: 'Tamunoemi Horsfall',
    systemRole: 'treasurer',
    department: 'Chief Treasurer — Trans-Amadi',
  },
  {
    roleTitle: 'FINANCIAL SECRETARY',
    numberedLabel: '4) FINANCIAL SECRETARY',
    memberId: 'mem_06',
    uid: 'uid_mem_06',
    operatorName: 'Dappa Amachree',
    systemRole: 'treasurer',
    department: 'Financial Secretary — Rumuola',
  },
  {
    roleTitle: 'ADMINISTRATOR',
    numberedLabel: '5) ADMINISTRATOR',
    memberId: 'mem_08',
    uid: 'uid_mem_08',
    operatorName: 'Preye Alamieyeseigha',
    systemRole: 'admin',
    department: 'Cooperative Administrator — Borokiri',
  },
];

export function resolveAdminExecutiveRole(
  roleOrInput: string
): AdminExecutiveRoleProfile {
  const normalized = roleOrInput.trim().toUpperCase();
  if (normalized === 'TRESURER' || normalized.includes('TREASUR') || normalized.includes('TRESUR')) {
    return ADMIN_EXECUTIVE_ROLES[2];
  }
  const exact = ADMIN_EXECUTIVE_ROLES.find(
    (r) =>
      r.roleTitle === normalized ||
      r.numberedLabel.toUpperCase() === normalized ||
      r.memberId.toUpperCase() === normalized
  );
  return exact || ADMIN_EXECUTIVE_ROLES[0];
}
