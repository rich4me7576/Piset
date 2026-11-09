import {
  BiometricCredentialRecord,
  ContributionMethod,
  ContributionStatus,
  CooperativeHappeningItem,
  LoanStatus,
  MemberStatus,
  PushNotificationItem,
  ScheduleInstallment,
  UserRole,
  generateEmailBindingOtp,
  validateAndHashPin,
} from '../utils/coopRules';

export interface MemberRecord {
  id: string;
  uid: string;
  name: string;
  phone: string;
  email: string;
  joinDate: string;
  status: MemberStatus;
  monthlyPledge: number;
  totalSavings: number;
  role: UserRole;
  department: string;
  uploadedByAdmin?: boolean;
  emailOtpCode?: string;
  mobileBound?: boolean;
  hasCreatedPassword?: boolean;
  passwordHash?: string;
  contributionGrid: Array<{
    month: string;
    label: string;
    status: 'paid' | 'late' | 'missed';
    amount: number;
  }>;
}

export interface ContributionRecord {
  id: string;
  memberId: string;
  memberName: string;
  month: string;
  amount: number;
  method: ContributionMethod;
  status: ContributionStatus;
  receiptUrl: string;
  bankName?: string;
  senderAccount?: string;
  paystackRef: string;
  uploadedBy: string;
  uploadedByName: string;
  approvedBy: string;
  approvedByName?: string;
  rejectionReason: string;
  createdAt: string;
}

export interface LoanRecord {
  id: string;
  memberId: string;
  memberName: string;
  memberPhone: string;
  principal: number;
  interest: number;
  amountPaid: number;
  startDate: string;
  dueDate: string;
  tenorMonths: number;
  purpose: string;
  schedule: ScheduleInstallment[];
  status: LoanStatus;
  daysOverdue: number;
  lastReminderSentAt: string;
  lastReminderChannel: string;
  escalated?: boolean;
}

export interface RepaymentRecord {
  id: string;
  loanId: string;
  memberId: string;
  memberName: string;
  amount: number;
  date: string;
  ledgerEntryId: string;
  method: ContributionMethod;
}

export interface LedgerRecord {
  id: string;
  type: 'contribution' | 'loan_disbursement' | 'loan_repayment';
  amount: number;
  source: string;
  status: 'settled' | 'reversed';
  approvedBy: string;
  approvedByName: string;
  memberName: string;
  timestamp: string;
}

export interface ReminderRecord {
  id: string;
  loanId: string;
  memberId: string;
  memberName: string;
  tier: 'pre_due_3d' | 'due_date' | 'overdue_1_29d' | 'overdue_30d' | 'overdue_60d' | 'overdue_90d';
  sentAt: string;
  channel: 'sms' | 'whatsapp' | 'in_app' | 'multi';
  message: string;
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  actorName: string;
  actorRole: UserRole;
  action: string;
  target: string;
  timestamp: string;
}

export const COOPERATIVE_BANK_DETAILS = {
  accountName: 'PISET COOPERATIVE SOCIETY PORT HARCOURT',
  bankName: 'Zenith Bank PLC',
  accountNumber: '1018492035',
  branch: 'Trans-Amadi Industrial Layout, Port Harcourt',
  sortCode: '057210014',
};

const STANDARD_12_MONTH_GRID: MemberRecord['contributionGrid'] = [
  { month: '2025-12', label: 'Dec 25', status: 'paid', amount: 125000 },
  { month: '2026-01', label: 'Jan 26', status: 'paid', amount: 125000 },
  { month: '2026-02', label: 'Feb 26', status: 'paid', amount: 125000 },
  { month: '2026-03', label: 'Mar 26', status: 'late', amount: 125000 },
  { month: '2026-04', label: 'Apr 26', status: 'paid', amount: 125000 },
  { month: '2026-05', label: 'May 26', status: 'paid', amount: 125000 },
  { month: '2026-06', label: 'Jun 26', status: 'paid', amount: 125000 },
  { month: '2026-07', label: 'Jul 26', status: 'missed', amount: 0 },
  { month: '2026-08', label: 'Aug 26', status: 'paid', amount: 125000 },
  { month: '2026-09', label: 'Sep 26', status: 'paid', amount: 125000 },
  { month: '2026-10', label: 'Oct 26', status: 'paid', amount: 125000 },
  { month: '2026-11', label: 'Nov 26', status: 'paid', amount: 125000 },
];

const RAW_INITIAL_MEMBERS: Omit<
  MemberRecord,
  | 'uploadedByAdmin'
  | 'emailOtpCode'
  | 'mobileBound'
  | 'hasCreatedPassword'
  | 'passwordHash'
>[] = [
  {
    id: 'mem_01',
    uid: 'uid_mem_01',
    name: 'Chukwudi Nwoye',
    phone: '+234 803 481 9201',
    email: 'chukwudi.nwoye@pisetcoop.org.ng',
    joinDate: '2023-03-14',
    status: 'active',
    monthlyPledge: 125000,
    totalSavings: 1250000,
    role: 'member',
    department: 'Marine Logistics — Onne Port',
    contributionGrid: STANDARD_12_MONTH_GRID,
  },
  {
    id: 'mem_02',
    uid: 'uid_admin_01',
    name: 'Boma Briggs',
    phone: '+234 809 210 4412',
    email: 'boma.briggs@pisetcoop.org.ng',
    joinDate: '2022-01-10',
    status: 'active',
    monthlyPledge: 200000,
    totalSavings: 3400000,
    role: 'admin',
    department: 'Executive President — GRA Phase 2',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m) => ({ ...m, status: 'paid', amount: 200000 })),
  },
  {
    id: 'mem_03',
    uid: 'uid_treasurer_01',
    name: 'Tamunoemi Horsfall',
    phone: '+234 806 553 7890',
    email: 'tamunoemi.horsfall@pisetcoop.org.ng',
    joinDate: '2022-04-22',
    status: 'active',
    monthlyPledge: 150000,
    totalSavings: 2550000,
    role: 'treasurer',
    department: 'Chief Treasurer — Trans-Amadi',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m) => ({ ...m, status: 'paid', amount: 150000 })),
  },
  {
    id: 'mem_04',
    uid: 'uid_mem_04',
    name: 'Ngozi Okafor',
    phone: '+234 812 609 3341',
    email: 'ngozi.okafor@pisetcoop.org.ng',
    joinDate: '2023-06-01',
    status: 'active',
    monthlyPledge: 100000,
    totalSavings: 1400000,
    role: 'member',
    department: 'Agro-Processing — Eleme',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m) => ({ ...m, amount: 100000 })),
  },
  {
    id: 'mem_05',
    uid: 'uid_mem_05',
    name: 'Ibinabo Jack',
    phone: '+234 703 918 2204',
    email: 'ibinabo.jack@pisetcoop.org.ng',
    joinDate: '2023-08-19',
    status: 'active',
    monthlyPledge: 80000,
    totalSavings: 960000,
    role: 'member',
    department: 'Retail Trade — Mile 3 Market',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m, idx) => ({
      ...m,
      status: idx === 9 ? 'late' : 'paid',
      amount: 80000,
    })),
  },
  {
    id: 'mem_06',
    uid: 'uid_mem_06',
    name: 'Dappa Amachree',
    phone: '+234 805 114 8723',
    email: 'dappa.amachree@pisetcoop.org.ng',
    joinDate: '2023-02-11',
    status: 'active',
    monthlyPledge: 100000,
    totalSavings: 1100000,
    role: 'member',
    department: 'Civil Engineering — Rumuola',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m, idx) => ({
      ...m,
      status: idx > 8 ? 'missed' : 'paid',
      amount: idx > 8 ? 0 : 100000,
    })),
  },
  {
    id: 'mem_07',
    uid: 'uid_mem_07',
    name: 'Eberechi Nwosu',
    phone: '+234 818 332 1098',
    email: 'eberechi.nwosu@pisetcoop.org.ng',
    joinDate: '2024-01-15',
    status: 'active',
    monthlyPledge: 150000,
    totalSavings: 1650000,
    role: 'member',
    department: 'Healthcare Supply — D-Line',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m) => ({ ...m, status: 'paid', amount: 150000 })),
  },
  {
    id: 'mem_08',
    uid: 'uid_mem_08',
    name: 'Preye Alamieyeseigha',
    phone: '+234 802 745 6610',
    email: 'preye.a@pisetcoop.org.ng',
    joinDate: '2023-05-09',
    status: 'active',
    monthlyPledge: 90000,
    totalSavings: 990000,
    role: 'member',
    department: 'Cold Chain Fisheries — Borokiri',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m, idx) => ({
      ...m,
      status: idx > 7 ? 'missed' : 'paid',
      amount: idx > 7 ? 0 : 90000,
    })),
  },
  {
    id: 'mem_09',
    uid: 'uid_mem_09',
    name: 'Obinna Eze',
    phone: '+234 814 502 9981',
    email: 'obinna.eze@pisetcoop.org.ng',
    joinDate: '2022-11-03',
    status: 'active',
    monthlyPledge: 120000,
    totalSavings: 1800000,
    role: 'member',
    department: 'Auto Parts Import — Ikoku',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m, idx) => ({
      ...m,
      status: idx > 6 ? 'missed' : 'paid',
      amount: idx > 6 ? 0 : 120000,
    })),
  },
  {
    id: 'mem_10',
    uid: 'uid_mem_10',
    name: 'Sokeipirim Pepple',
    phone: '+234 807 889 4512',
    email: 'sokeipirim.pepple@pisetcoop.org.ng',
    joinDate: '2024-02-20',
    status: 'active',
    monthlyPledge: 110000,
    totalSavings: 1100000,
    role: 'member',
    department: 'Architecture Studio — Old GRA',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m) => ({ ...m, status: 'paid', amount: 110000 })),
  },
  {
    id: 'mem_11',
    uid: 'uid_mem_11',
    name: 'Adaeze Ubani',
    phone: '+234 903 412 7754',
    email: 'adaeze.ubani@pisetcoop.org.ng',
    joinDate: '2024-03-10',
    status: 'active',
    monthlyPledge: 75000,
    totalSavings: 675000,
    role: 'member',
    department: 'Education & EdTech — Choba',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m) => ({ ...m, status: 'paid', amount: 75000 })),
  },
  {
    id: 'mem_12',
    uid: 'uid_mem_12',
    name: 'Tariere Diete-Spiff',
    phone: '+234 816 204 8839',
    email: 'tariere.ds@pisetcoop.org.ng',
    joinDate: '2023-09-01',
    status: 'active',
    monthlyPledge: 130000,
    totalSavings: 1560000,
    role: 'member',
    department: 'Oilfield Catering — Peter Odili Rd',
    contributionGrid: STANDARD_12_MONTH_GRID.map((m) => ({ ...m, status: 'paid', amount: 130000 })),
  },
];

export const INITIAL_MEMBERS: MemberRecord[] = RAW_INITIAL_MEMBERS.map((m) => ({
  ...m,
  uploadedByAdmin: true,
  emailOtpCode: generateEmailBindingOtp(m.email, m.phone),
  mobileBound: false,
  hasCreatedPassword: false,
  passwordHash: '',
}));

export const INITIAL_CONTRIBUTIONS: ContributionRecord[] = [
  {
    id: 'contrib_01',
    memberId: 'mem_04',
    memberName: 'Ngozi Okafor',
    month: '2026-11',
    amount: 100000,
    method: 'bank_transfer',
    status: 'pending',
    receiptUrl: '/src/assets/images/sample_bank_receipt_1794253542404.jpg',
    bankName: 'GTBank PLC',
    senderAccount: '0148920311',
    paystackRef: '',
    uploadedBy: 'uid_mem_04',
    uploadedByName: 'Ngozi Okafor',
    approvedBy: '',
    rejectionReason: '',
    createdAt: '2026-11-09T08:15:00Z',
  },
  {
    id: 'contrib_02',
    memberId: 'mem_04',
    memberName: 'Ngozi Okafor',
    month: '2026-11',
    amount: 100000,
    method: 'bank_transfer',
    status: 'pending',
    receiptUrl: '/src/assets/images/sample_bank_receipt_1794253542404.jpg',
    bankName: 'GTBank PLC',
    senderAccount: '0148920311',
    paystackRef: '',
    uploadedBy: 'uid_mem_04',
    uploadedByName: 'Ngozi Okafor',
    approvedBy: '',
    rejectionReason: '',
    createdAt: '2026-11-09T09:40:00Z', // Duplicate within 48 hours!
  },
  {
    id: 'contrib_03',
    memberId: 'mem_03',
    memberName: 'Tamunoemi Horsfall',
    month: '2026-11',
    amount: 150000,
    method: 'bank_transfer',
    status: 'pending',
    receiptUrl: '/src/assets/images/sample_bank_receipt_1794253542404.jpg',
    bankName: 'Access Bank PLC',
    senderAccount: '0692341180',
    paystackRef: '',
    uploadedBy: 'uid_treasurer_01', // Uploaded by Treasurer — demonstrates Maker-Checker block when Treasurer views it!
    uploadedByName: 'Tamunoemi Horsfall (Treasurer)',
    approvedBy: '',
    rejectionReason: '',
    createdAt: '2026-11-09T07:30:00Z',
  },
  {
    id: 'contrib_04',
    memberId: 'mem_01',
    memberName: 'Chukwudi Nwoye',
    month: '2026-11',
    amount: 125000,
    method: 'paystack',
    status: 'confirmed',
    receiptUrl: '',
    paystackRef: 'PSTK_PHC_20261102_99418',
    uploadedBy: 'uid_mem_01',
    uploadedByName: 'Chukwudi Nwoye',
    approvedBy: 'paystack_webhook',
    approvedByName: 'Paystack Webhook (HMAC Verified)',
    rejectionReason: '',
    createdAt: '2026-11-02T14:22:10Z',
  },
  {
    id: 'contrib_05',
    memberId: 'mem_07',
    memberName: 'Eberechi Nwosu',
    month: '2026-11',
    amount: 150000,
    method: 'paystack',
    status: 'confirmed',
    receiptUrl: '',
    paystackRef: 'PSTK_PHC_20261103_88201',
    uploadedBy: 'uid_mem_07',
    uploadedByName: 'Eberechi Nwosu',
    approvedBy: 'paystack_webhook',
    approvedByName: 'Paystack Webhook (HMAC Verified)',
    rejectionReason: '',
    createdAt: '2026-11-03T11:05:44Z',
  },
  {
    id: 'contrib_06',
    memberId: 'mem_02',
    memberName: 'Boma Briggs',
    month: '2026-11',
    amount: 200000,
    method: 'paystack',
    status: 'confirmed',
    receiptUrl: '',
    paystackRef: 'PSTK_PHC_20261101_77104',
    uploadedBy: 'uid_admin_01',
    uploadedByName: 'Boma Briggs',
    approvedBy: 'paystack_webhook',
    approvedByName: 'Paystack Webhook (HMAC Verified)',
    rejectionReason: '',
    createdAt: '2026-11-01T09:12:00Z',
  },
  {
    id: 'contrib_07',
    memberId: 'mem_08',
    memberName: 'Preye Alamieyeseigha',
    month: '2026-10',
    amount: 90000,
    method: 'bank_transfer',
    status: 'rejected',
    receiptUrl: '/src/assets/images/sample_bank_receipt_1794253542404.jpg',
    bankName: 'First Bank of Nigeria',
    senderAccount: '3091847210',
    paystackRef: '',
    uploadedBy: 'uid_mem_08',
    uploadedByName: 'Preye Alamieyeseigha',
    approvedBy: 'uid_treasurer_01',
    approvedByName: 'Tamunoemi Horsfall',
    rejectionReason: 'Receipt image was cropped and missing NIP session ID; funds not reflected in Zenith statement.',
    createdAt: '2026-10-25T16:40:00Z',
  },
];

export const INITIAL_LOANS: LoanRecord[] = [
  {
    id: 'loan_01',
    memberId: 'mem_01',
    memberName: 'Chukwudi Nwoye',
    memberPhone: '+234 803 481 9201',
    principal: 1800000,
    interest: 144000,
    amountPaid: 648000,
    startDate: '2026-09-01',
    dueDate: '2027-03-01',
    tenorMonths: 6,
    purpose: 'Container clearing & haulage expansion at Onne Port',
    status: 'active',
    daysOverdue: 0,
    lastReminderSentAt: '2026-10-29T08:00:00Z',
    lastReminderChannel: 'SMS + In-App (3d pre-due)',
    schedule: [
      { installmentNumber: 1, dueDate: '2026-10-01', principalPart: 300000, interestPart: 24000, totalInstallment: 324000, status: 'paid' },
      { installmentNumber: 2, dueDate: '2026-11-01', principalPart: 300000, interestPart: 24000, totalInstallment: 324000, status: 'paid' },
      { installmentNumber: 3, dueDate: '2026-12-01', principalPart: 300000, interestPart: 24000, totalInstallment: 324000, status: 'upcoming' },
      { installmentNumber: 4, dueDate: '2027-01-01', principalPart: 300000, interestPart: 24000, totalInstallment: 324000, status: 'upcoming' },
      { installmentNumber: 5, dueDate: '2027-02-01', principalPart: 300000, interestPart: 24000, totalInstallment: 324000, status: 'upcoming' },
      { installmentNumber: 6, dueDate: '2027-03-01', principalPart: 300000, interestPart: 24000, totalInstallment: 324000, status: 'upcoming' },
    ],
  },
  {
    id: 'loan_02',
    memberId: 'mem_07',
    memberName: 'Eberechi Nwosu',
    memberPhone: '+234 818 332 1098',
    principal: 2400000,
    interest: 192000,
    amountPaid: 0,
    startDate: '2026-11-01',
    dueDate: '2027-05-01',
    tenorMonths: 6,
    purpose: 'Diagnostic pharmacy cold-storage inventory in D-Line',
    status: 'active',
    daysOverdue: 0,
    lastReminderSentAt: '2026-11-01T08:00:00Z',
    lastReminderChannel: 'WhatsApp + In-App',
    schedule: [],
  },
  {
    id: 'loan_03',
    memberId: 'mem_05',
    memberName: 'Ibinabo Jack',
    memberPhone: '+234 703 918 2204',
    principal: 950000,
    interest: 76000,
    amountPaid: 342000,
    startDate: '2026-07-15',
    dueDate: '2026-10-26',
    tenorMonths: 6,
    purpose: 'Wholesale grain & provision restock at Mile 3 Market',
    status: 'overdue',
    daysOverdue: 14, // 1–29 days overdue tab
    lastReminderSentAt: '2026-10-26T08:00:00Z',
    lastReminderChannel: 'SMS + WhatsApp (Due date)',
    schedule: [],
  },
  {
    id: 'loan_04',
    memberId: 'mem_06',
    memberName: 'Dappa Amachree',
    memberPhone: '+234 805 114 8723',
    principal: 1500000,
    interest: 120000,
    amountPaid: 540000,
    startDate: '2026-06-01',
    dueDate: '2026-10-05',
    tenorMonths: 6,
    purpose: 'Scaffolding & concrete mixer lease for Rumuola project',
    status: 'overdue',
    daysOverdue: 35, // 30 days overdue tab (30-59)
    lastReminderSentAt: '2026-11-04T08:00:00Z',
    lastReminderChannel: 'SMS + WhatsApp (Tier 30d)',
    schedule: [],
  },
  {
    id: 'loan_05',
    memberId: 'mem_08',
    memberName: 'Preye Alamieyeseigha',
    memberPhone: '+234 802 745 6610',
    principal: 1200000,
    interest: 96000,
    amountPaid: 216000,
    startDate: '2026-05-01',
    dueDate: '2026-09-04',
    tenorMonths: 6,
    purpose: 'Solar freezer retrofit for Borokiri fish depot',
    status: 'overdue',
    daysOverdue: 66, // 60 days overdue tab (60-89)
    lastReminderSentAt: '2026-11-03T08:00:00Z',
    lastReminderChannel: 'SMS + WhatsApp (Tier 60d)',
    schedule: [],
  },
  {
    id: 'loan_06',
    memberId: 'mem_09',
    memberName: 'Obinna Eze',
    memberPhone: '+234 814 502 9981',
    principal: 2100000,
    interest: 168000,
    amountPaid: 378000,
    startDate: '2026-03-01',
    dueDate: '2026-07-28',
    tenorMonths: 6,
    purpose: 'Heavy-duty diesel engine parts shipment at Ikoku',
    status: 'overdue',
    daysOverdue: 104, // 90+ days overdue tab
    lastReminderSentAt: '2026-10-30T09:15:00Z',
    lastReminderChannel: 'Surety & Committee Notice',
    escalated: true,
    schedule: [],
  },
  {
    id: 'loan_07',
    memberId: 'mem_10',
    memberName: 'Sokeipirim Pepple',
    memberPhone: '+234 807 889 4512',
    principal: 1350000,
    interest: 108000,
    amountPaid: 0,
    startDate: '2026-11-08',
    dueDate: '2027-05-08',
    tenorMonths: 6,
    purpose: 'Plotter & CAD workstation upgrade for Old GRA studio',
    status: 'pending', // Pending admin approval in "Members and loans"
    daysOverdue: 0,
    lastReminderSentAt: 'Not applicable',
    lastReminderChannel: 'Pending approval',
    schedule: [],
  },
  {
    id: 'loan_08',
    memberId: 'mem_12',
    memberName: 'Tariere Diete-Spiff',
    memberPhone: '+234 816 204 8839',
    principal: 1000000,
    interest: 80000,
    amountPaid: 1080000,
    startDate: '2026-02-01',
    dueDate: '2026-08-01',
    tenorMonths: 6,
    purpose: 'Industrial kitchen equipment for offshore catering contract',
    status: 'repaid',
    daysOverdue: 0,
    lastReminderSentAt: '2026-07-29T08:00:00Z',
    lastReminderChannel: 'Settled in full',
    schedule: [],
  },
];

export const INITIAL_LEDGER: LedgerRecord[] = [
  {
    id: 'led_01',
    type: 'contribution',
    amount: 125000,
    source: 'Paystack (PSTK_PHC_20261102_99418)',
    status: 'settled',
    approvedBy: 'paystack_webhook',
    approvedByName: 'Paystack Webhook',
    memberName: 'Chukwudi Nwoye',
    timestamp: '2026-11-02T14:22:12Z',
  },
  {
    id: 'led_02',
    type: 'contribution',
    amount: 150000,
    source: 'Paystack (PSTK_PHC_20261103_88201)',
    status: 'settled',
    approvedBy: 'paystack_webhook',
    approvedByName: 'Paystack Webhook',
    memberName: 'Eberechi Nwosu',
    timestamp: '2026-11-03T11:05:46Z',
  },
  {
    id: 'led_03',
    type: 'loan_repayment',
    amount: 324000,
    source: 'Paystack (PSTK_PHC_20261101_32400)',
    status: 'settled',
    approvedBy: 'paystack_webhook',
    approvedByName: 'Paystack Webhook',
    memberName: 'Chukwudi Nwoye',
    timestamp: '2026-11-01T10:15:00Z',
  },
  {
    id: 'led_04',
    type: 'loan_disbursement',
    amount: 1800000,
    source: 'Zenith Bank Corporate NIP — Loan #loan_01',
    status: 'settled',
    approvedBy: 'uid_admin_01',
    approvedByName: 'Boma Briggs (Admin)',
    memberName: 'Chukwudi Nwoye',
    timestamp: '2026-09-01T12:00:00Z',
  },
];

export const INITIAL_REMINDERS: ReminderRecord[] = [
  {
    id: 'rem_01',
    loanId: 'loan_04',
    memberId: 'mem_06',
    memberName: 'Dappa Amachree',
    tier: 'overdue_30d',
    sentAt: '2026-11-04T08:00:00Z',
    channel: 'multi',
    message: 'Automated 30-day overdue reminder dispatched via SMS, WhatsApp, and In-App notification.',
  },
  {
    id: 'rem_02',
    loanId: 'loan_05',
    memberId: 'mem_08',
    memberName: 'Preye Alamieyeseigha',
    tier: 'overdue_60d',
    sentAt: '2026-11-03T08:00:00Z',
    channel: 'multi',
    message: 'Automated 60-day overdue escalation notice dispatched via SMS, WhatsApp, and In-App.',
  },
  {
    id: 'rem_03',
    loanId: 'loan_01',
    memberId: 'mem_01',
    memberName: 'Chukwudi Nwoye',
    tier: 'pre_due_3d',
    sentAt: '2026-10-29T08:00:00Z',
    channel: 'sms',
    message: 'Friendly reminder: Your November loan installment of ₦324,000 is due in 3 days.',
  },
];

export const INITIAL_AUDIT_LOGS: AuditLogRecord[] = [
  {
    id: 'aud_01',
    actor: 'uid_treasurer_01',
    actorName: 'Tamunoemi Horsfall',
    actorRole: 'treasurer',
    action: 'REJECT_MANUAL_TRANSFER',
    target: 'Contribution contrib_07 (Preye Alamieyeseigha — ₦90,000)',
    timestamp: '2026-10-26T09:12:00Z',
  },
  {
    id: 'aud_02',
    actor: 'uid_admin_01',
    actorName: 'Boma Briggs',
    actorRole: 'admin',
    action: 'APPROVE_LOAN_DISBURSEMENT',
    target: 'Loan loan_01 (Chukwudi Nwoye — ₦1,800,000)',
    timestamp: '2026-09-01T11:58:00Z',
  },
];

export const MONTHLY_CASHFLOW_SERIES = [
  { month: 'Jun 26', inflow: 2450000, outflow: 1200000 },
  { month: 'Jul 26', inflow: 2680000, outflow: 1950000 },
  { month: 'Aug 26', inflow: 2910000, outflow: 2400000 },
  { month: 'Sep 26', inflow: 3120000, outflow: 1800000 },
  { month: 'Oct 26', inflow: 2890000, outflow: 950000 },
  { month: 'Nov 26', inflow: 3340000, outflow: 1350000 },
];

export const INITIAL_BIOMETRIC_CREDENTIALS: Record<string, BiometricCredentialRecord> = {
  uid_mem_01: {
    uid: 'uid_mem_01',
    memberId: 'mem_01',
    credentialId: 'pk_fingerprint_mem_01_8921a',
    modality: 'fingerprint',
    deviceLabel: 'Fingerprint / Touch ID Passkey (WebAuthn)',
    pinHash: validateAndHashPin('1234', '1234', 'uid_mem_01').pinHash || 'pbkdf2_sha256_default',
    biometricEnabled: true,
    pinEnabled: true,
    enrolledAt: '2026-10-15T09:00:00Z',
    lastVerifiedAt: '2026-11-09T08:00:00Z',
  },
  uid_treasurer_01: {
    uid: 'uid_treasurer_01',
    memberId: 'mem_03',
    credentialId: 'pk_face_id_mem_03_4410b',
    modality: 'face_id',
    deviceLabel: 'Face ID Platform Passkey (WebAuthn)',
    pinHash: validateAndHashPin('1234', '1234', 'uid_treasurer_01').pinHash || 'pbkdf2_sha256_default',
    biometricEnabled: true,
    pinEnabled: true,
    enrolledAt: '2026-10-12T11:30:00Z',
    lastVerifiedAt: '2026-11-09T07:30:00Z',
  },
  uid_admin_01: {
    uid: 'uid_admin_01',
    memberId: 'mem_02',
    credentialId: 'pk_face_id_mem_02_7712c',
    modality: 'face_id',
    deviceLabel: 'Face ID Platform Passkey (WebAuthn)',
    pinHash: validateAndHashPin('1234', '1234', 'uid_admin_01').pinHash || 'pbkdf2_sha256_default',
    biometricEnabled: true,
    pinEnabled: true,
    enrolledAt: '2026-09-20T14:10:00Z',
    lastVerifiedAt: '2026-11-09T09:00:00Z',
  },
};

export const INITIAL_PUSH_NOTIFICATIONS: PushNotificationItem[] = [
  {
    id: 'notif_01',
    recipientMemberId: 'mem_01',
    category: 'upcoming_repayment',
    title: 'Upcoming Loan Repayment (Due in 3 Days)',
    body: 'Friendly reminder: Your next installment of ₦324,000 for Loan #loan_01 is due on Dec 1, 2026. Pay via Paystack or bank transfer.',
    createdAt: '2026-11-09T08:30:00Z',
    read: false,
    fcmMessageId: 'fcm_phc_msg_99102',
    actionTab: 'loans',
    amount: 324000,
  },
  {
    id: 'notif_02',
    recipientMemberId: 'mem_01',
    category: 'overdue_payment',
    title: 'Overdue Thrift Contribution Notice (Jul 2026)',
    body: 'Our records show your July 2026 monthly thrift pledge (₦125,000) was missed. Settle arrears to keep your 3× loan multiplier active.',
    createdAt: '2026-11-08T14:15:00Z',
    read: false,
    fcmMessageId: 'fcm_phc_msg_99103',
    actionTab: 'pay',
    amount: 125000,
  },
  {
    id: 'notif_03',
    recipientMemberId: 'all',
    category: 'cooperative_announcement',
    title: '2026 Annual General Meeting & Dividend Declaration',
    body: 'PISET Cooperative Society Port Harcourt will hold its AGM on Saturday, Nov 28, 2026 at the GRA Phase 2 Secretariat. Annual surplus dividends will be credited after the meeting.',
    createdAt: '2026-11-07T10:00:00Z',
    read: false,
    fcmMessageId: 'fcm_phc_msg_99104',
    actionTab: 'home',
  },
  {
    id: 'notif_04',
    recipientMemberId: 'mem_05',
    category: 'overdue_payment',
    title: 'Overdue Loan Repayment Alert (14 Days Past Due)',
    body: 'Your loan balance of ₦684,000 (#loan_03) is 14 days past due. Please complete repayment or contact the Treasurer.',
    createdAt: '2026-11-09T08:00:00Z',
    read: false,
    fcmMessageId: 'fcm_phc_msg_99105',
    actionTab: 'pay',
    amount: 684000,
  },
];

export const INITIAL_HAPPENINGS: CooperativeHappeningItem[] = [
  {
    id: 'hap_01',
    title: 'November 2026 Treasury Liquidity Pool Crosses ₦26.4M',
    summary:
      'Following confirmed November thrift contributions and Q4 short-term treasury bill yields at Zenith Bank Port Harcourt, total cooperative liquidity rose by ₦1,450,000.',
    category: 'liquidity',
    amount: 1450000,
    memberId: 'all',
    memberName: 'All Cooperative Members',
    sourceFormat: 'admin_portal',
    publishedAt: '2026-11-09T09:15:00Z',
  },
  {
    id: 'hap_02',
    title: '2026 Annual Dividend & Surplus Sharing Ratio Fixed at 11.5%',
    summary:
      'The Executive Committee approved an 11.5% pro-rata dividend on confirmed thrift balances, automatically credited to member accounts upon AGM ratification.',
    category: 'general',
    memberId: 'all',
    memberName: 'All Cooperative Members',
    sourceFormat: 'word',
    publishedAt: '2026-11-08T16:40:00Z',
  },
  {
    id: 'hap_03',
    title: 'Batch Payroll & Bank Transfer Reconciliation Completed',
    summary:
      'All verified November thrift contributions and loan repayments uploaded via Excel schedule have been reconciled and synced to member portals.',
    category: 'contribution',
    amount: 125000,
    memberId: 'mem_01',
    memberName: 'Chukwudi Nwoye',
    sourceFormat: 'excel',
    publishedAt: '2026-11-07T11:20:00Z',
  },
];

export const SAMPLE_EXCEL_SYNC_ROWS: Array<Record<string, unknown>> = [
  {
    Type: 'Contribution',
    MemberID: 'mem_01',
    MemberName: 'Chukwudi Nwoye',
    Month: '2026-11',
    Amount: 150000,
    Description: 'Special November Thrift Top-Up (Excel Payroll Schedule)',
    Status: 'confirmed',
  },
  {
    Type: 'Loan',
    MemberID: 'mem_01',
    MemberName: 'Chukwudi Nwoye',
    Month: '2026-11',
    Amount: 324000,
    Description: 'Loan #loan_01 November Installment Deduction (Excel Batch)',
    Status: 'confirmed',
  },
  {
    Type: 'Contribution',
    MemberID: 'mem_04',
    MemberName: 'Ngozi Okafor',
    Month: '2026-11',
    Amount: 200000,
    Description: 'November Monthly Thrift Contribution (Excel Batch)',
    Status: 'confirmed',
  },
  {
    Type: 'Liquidity',
    MemberID: 'all',
    MemberName: 'Cooperative Treasury Reserve',
    Month: '2026-11',
    Amount: 1850000,
    Description: 'Zenith Bank Fixed Deposit Interest Credit to Liquidity Pool',
    Status: 'confirmed',
  },
  {
    Type: 'Happening',
    MemberID: 'all',
    MemberName: 'All Cooperative Members',
    Month: '2026-11',
    Amount: 0,
    Description:
      'November Excel Schedule Imported: Member balances, loan schedules, and liquidity updated.',
    Status: 'confirmed',
  },
];

export const SAMPLE_WORD_SYNC_TEXT = `PISET COOPERATIVE SOCIETY PORT HARCOURT — EXECUTIVE BULLETIN & TREASURY MEMO (WORD IMPORT)
CONTRIBUTION | mem_01 | Chukwudi Nwoye | 2026-11 | 125000 | Verified November Cooperative Thrift Contribution (Word Memo)
LOAN | mem_05 | Ibinabo Dokubo | 2026-11 | 342000 | Partial Overdue Loan Recovery Credited (#loan_03)
LIQUIDITY | all | Treasury Liquidity Pool | 2026-11 | 2200000 | Port Harcourt Marine Logistics Contract Surplus Added to Cash Reserves
HAPPENING | all | All Cooperative Members | 2026-11 | 0 | Emergency & Festive Loan Window Opens Nov 15 at 8% Flat Cooperative Rate`;


