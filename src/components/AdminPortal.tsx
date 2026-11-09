import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  BellRing,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  FileSpreadsheet,
  FileText,
  KeyRound,
  Lock,
  Mail,
  PhoneCall,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Upload,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react';
import {
  AuditLogRecord,
  ContributionRecord,
  LedgerRecord,
  LoanRecord,
  MONTHLY_CASHFLOW_SERIES,
  MemberRecord,
  ReminderRecord,
  SAMPLE_EXCEL_SYNC_ROWS,
  SAMPLE_WORD_SYNC_TEXT,
} from '../data/seedData';
import {
  ADMIN_EXECUTIVE_ROLES,
  AdminExecutiveRole,
  CooperativeHappeningItem,
  CooperativeSyncRow,
  OverdueBucket,
  calculateTreasuryKPIs,
  detectDuplicateContribution,
  filterLoansByOverdueBucket,
  formatNaira,
  parseExcelRowsToSyncBatch,
  parseWordTextToSyncBatch,
  resolvePortalTargetMember,
  validateMakerCheckerApproval,
} from '../utils/coopRules';

export type AdminSection =
  | 'treasury'
  | 'defaulters'
  | 'reconciliation'
  | 'members'
  | 'operations_sync';

interface AdminPortalProps {
  currentOperator: MemberRecord;
  members: MemberRecord[];
  contributions: ContributionRecord[];
  loans: LoanRecord[];
  ledger: LedgerRecord[];
  reminders: ReminderRecord[];
  auditLogs: AuditLogRecord[];
  happenings: CooperativeHappeningItem[];
  extraLiquidityPool: number;
  activeSection: AdminSection;
  onChangeSection: (section: AdminSection) => void;
  onApproveContribution: (contributionId: string) => void;
  onRejectContribution: (contributionId: string, reason: string) => void;
  onSendLoanReminder: (
    loanId: string,
    channel: 'sms' | 'whatsapp' | 'in_app' | 'multi'
  ) => void;
  onEscalateLoan: (loanId: string) => void;
  onRunScheduledReminders: () => void;
  onDecideLoanRequest: (
    loanId: string,
    decision: 'approve' | 'decline'
  ) => void;
  onUpdateMemberPledge: (memberId: string, newPledge: number) => void;
  onBroadcastAnnouncement: (title: string, body: string) => void;
  onApplySyncBatch: (rows: CooperativeSyncRow[], sourceLabel: string) => void;
  onSwitchOperatorRole: () => void;
  activeExecutiveRole?: AdminExecutiveRole;
  onSwitchExecutiveRole?: (role: AdminExecutiveRole) => void;
  onNotify: (msg: string) => void;
  isSignedIn?: boolean;
  onOpenAuthModal?: () => void;
  isAdminAuthenticated?: boolean;
  onAuthenticateAdmin?: (password: string) => boolean;
  onChangeAdminPassword?: (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ) => { valid: boolean; error?: string };
  onLockAdminPortal?: () => void;
  onUploadWhitelistedMember?: (payload: {
    name: string;
    email: string;
    phone: string;
    department: string;
    monthlyPledge: number;
    role: 'member' | 'treasurer' | 'admin';
  }) => MemberRecord;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentOperator,
  members,
  contributions,
  loans,
  ledger,
  reminders,
  auditLogs,
  happenings,
  extraLiquidityPool,
  activeSection,
  onChangeSection,
  onApproveContribution,
  onRejectContribution,
  onSendLoanReminder,
  onEscalateLoan,
  onRunScheduledReminders,
  onDecideLoanRequest,
  onUpdateMemberPledge,
  onBroadcastAnnouncement,
  onApplySyncBatch,
  onSwitchOperatorRole,
  activeExecutiveRole = 'PRESIDENT',
  onSwitchExecutiveRole,
  onNotify,
  isSignedIn = false,
  onOpenAuthModal,
  isAdminAuthenticated = false,
  onAuthenticateAdmin,
  onChangeAdminPassword,
  onLockAdminPortal,
  onUploadWhitelistedMember,
}) => {
  // Admin Portal Password Gate & Password Change state
  const [adminGatePasswordInput, setAdminGatePasswordInput] = useState('');
  const [adminGateError, setAdminGateError] = useState('');
  const [showChangeAdminPwdPanel, setShowChangeAdminPwdPanel] = useState(false);
  const [adminCurrentPwdInput, setAdminCurrentPwdInput] = useState('');
  const [adminNewPwdInput, setAdminNewPwdInput] = useState('');
  const [adminConfirmPwdInput, setAdminConfirmPwdInput] = useState('');
  const [adminPwdChangeError, setAdminPwdChangeError] = useState('');

  // Admin Whitelist Member Upload (Email + Phone -> Auto Email OTP) state
  const [newWhitelistName, setNewWhitelistName] = useState('');
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [newWhitelistPhone, setNewWhitelistPhone] = useState('');
  const [newWhitelistDept, setNewWhitelistDept] = useState(
    'Marine Logistics — Onne Port'
  );
  const [newWhitelistPledge, setNewWhitelistPledge] = useState('150000');
  const [newWhitelistRole, setNewWhitelistRole] = useState<
    'member' | 'treasurer' | 'admin'
  >('member');
  const [whitelistFormError, setWhitelistFormError] = useState('');
  const [lastUploadedMemberOtp, setLastUploadedMemberOtp] =
    useState<MemberRecord | null>(null);

  // Defaulters Desk state
  const [overdueTab, setOverdueTab] = useState<OverdueBucket>('1-29');

  // Cooperative Announcement FCM Broadcast state
  const [announcementTitle, setAnnouncementTitle] = useState(
    '2026 Annual General Meeting & 11.5% Dividend Payout Notice'
  );
  const [announcementBody, setAnnouncementBody] = useState(
    'All Port Harcourt members are invited to the AGM on Saturday, 28 Nov 2026 at 10:00 AM (GRA Phase 2 Secretariat).'
  );

  // Live Updates & Excel/Word Import Portal state
  const [stagedSyncRows, setStagedSyncRows] = useState<CooperativeSyncRow[]>(
    () => parseExcelRowsToSyncBatch(SAMPLE_EXCEL_SYNC_ROWS, 'excel')
  );
  const [importSourceLabel, setImportSourceLabel] = useState<string>(
    'piset_nov2026_schedule.xlsx (Ready to Sync)'
  );
  const [manualRecordType, setManualRecordType] = useState<
    CooperativeSyncRow['recordType']
  >('contribution');
  const [manualMemberId, setManualMemberId] = useState<string>('mem_01');
  const [manualTargetMemberInput, setManualTargetMemberInput] =
    useState<string>('');
  const [manualMonth, setManualMonth] = useState<string>('2026-11');
  const [manualAmount, setManualAmount] = useState<string>('125000');
  const [manualDescription, setManualDescription] = useState<string>(
    'November Special Cooperative Thrift & Liquidity Update'
  );

  // Reconciliation Ledger state
  const [reconFilter, setReconFilter] = useState<
    'needs_review' | 'auto_settled' | 'rejected' | 'all'
  >('needs_review');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');
  const [rejectError, setRejectError] = useState('');
  const [previewReceipt, setPreviewReceipt] =
    useState<ContributionRecord | null>(null);

  // Members & Loans state
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [pledgeDraft, setPledgeDraft] = useState<string>('');
  const [memberSearch, setMemberSearch] = useState('');

  const rawKpis = calculateTreasuryKPIs(members, loans, extraLiquidityPool);
  const kpis = isSignedIn
    ? rawKpis
    : {
        totalLiquidity: 0,
        activeLoanExposure: 0,
        cashReserves: 0,
        exposureToLiquidityRatio: 0,
      };
  const pendingReviewCount = isSignedIn
    ? contributions.filter((c) => c.status === 'pending').length
    : 0;
  const pendingLoanCount = isSignedIn
    ? loans.filter((l) => l.status === 'pending').length
    : 0;

  const handleImportFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const lowerName = file.name.toLowerCase();

    try {
      const arrayBuffer = await file.arrayBuffer();

      // 1. Word Document (.docx / .doc / .txt)
      if (
        lowerName.endsWith('.docx') ||
        lowerName.endsWith('.doc') ||
        lowerName.endsWith('.txt')
      ) {
        let extractedText = '';
        if (lowerName.endsWith('.docx')) {
          try {
            const res = await mammoth.extractRawText({ arrayBuffer });
            extractedText = res.value;
          } catch {
            extractedText = new TextDecoder().decode(arrayBuffer);
          }
        } else {
          extractedText = new TextDecoder().decode(arrayBuffer);
        }

        const parsed = parseWordTextToSyncBatch(extractedText);
        if (parsed.length === 0) {
          onNotify(
            `No structured cooperative records detected in ${file.name}. Loaded sample Word structure.`
          );
          return;
        }
        setStagedSyncRows(parsed);
        setImportSourceLabel(`${file.name} (Word Document · ${parsed.length} items)`);
        onNotify(
          `Imported ${parsed.length} cooperative update records from Word document "${file.name}".`
        );
        return;
      }

      // 2. Excel / CSV Workbook (.xlsx / .xls / .csv)
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        worksheet,
        { defval: '' }
      );
      const parsed = parseExcelRowsToSyncBatch(jsonRows, 'excel');
      if (parsed.length === 0) {
        onNotify(`No valid rows found in spreadsheet "${file.name}".`);
        return;
      }
      setStagedSyncRows(parsed);
      setImportSourceLabel(`${file.name} (Excel Sheet · ${parsed.length} rows)`);
      onNotify(
        `Imported ${parsed.length} cooperative records from Excel workbook "${file.name}".`
      );
    } catch (err) {
      onNotify(
        `Could not parse ${file.name}: ${
          err instanceof Error ? err.message : 'Invalid file format'
        }`
      );
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadSampleExcel = () => {
    const ws = XLSX.utils.json_to_sheet(SAMPLE_EXCEL_SYNC_ROWS);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PISET_Updates');
    XLSX.writeFile(wb, 'piset_cooperative_updates_template.xlsx');
    onNotify('Downloaded sample Excel (.xlsx) template.');
  };

  const handleDownloadSampleWord = () => {
    const blob = new Blob([SAMPLE_WORD_SYNC_TEXT], {
      type: 'application/msword;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'piset_cooperative_bulletin_template.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    onNotify('Downloaded sample Word (.doc) template.');
  };

  const resolvedPortalTarget = resolvePortalTargetMember(
    members,
    manualMemberId,
    manualTargetMemberInput
  );

  const handleAddManualSyncRow = (e: React.FormEvent) => {
    e.preventDefault();
    const resolved = resolvePortalTargetMember(
      members,
      manualMemberId,
      manualTargetMemberInput
    );
    const numericAmt = Number(manualAmount) || 0;
    const newRow: CooperativeSyncRow = {
      id: `sync_manual_${Date.now()}`,
      recordType: manualRecordType,
      memberId:
        manualRecordType === 'liquidity' &&
        resolved.memberId === 'all' &&
        !manualTargetMemberInput.trim()
          ? 'all'
          : resolved.memberId === 'all' &&
            (manualRecordType === 'contribution' || manualRecordType === 'loan')
          ? 'mem_01'
          : resolved.memberId,
      memberName:
        resolved.memberId === 'all' &&
        (manualRecordType === 'contribution' || manualRecordType === 'loan')
          ? members[0]?.name || 'Chukwudi Nwoye'
          : resolved.memberName,
      month: manualMonth,
      amount: Math.max(0, Math.round(numericAmt)),
      description:
        manualDescription.trim() || 'Live Admin Cooperative Update',
      status: 'confirmed',
      sourceFormat: 'admin_portal',
    };
    setStagedSyncRows((prev) => [newRow, ...prev]);
    setImportSourceLabel('Live Admin Entry + Staged Batch');
    onNotify(
      `Added ${newRow.recordType.toUpperCase()} update for ${
        newRow.memberName
      } (${newRow.memberId}) to staging batch.`
    );
  };

  const filteredContributions = contributions.filter((c) => {
    if (reconFilter === 'needs_review') return c.status === 'pending';
    if (reconFilter === 'auto_settled') return c.status === 'confirmed';
    if (reconFilter === 'rejected') return c.status === 'rejected';
    return true;
  });

  const overdueLoansForTab = filterLoansByOverdueBucket(loans, overdueTab);

  const handleConfirmReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingId) return;
    if (rejectReasonInput.trim().length < 5) {
      setRejectError(
        'A clear rejection reason (at least 5 characters) is required for the audit log.'
      );
      return;
    }
    onRejectContribution(rejectingId, rejectReasonInput.trim());
    setRejectingId(null);
    setRejectReasonInput('');
    setRejectError('');
  };

  const handleExportCsv = () => {
    const headers = [
      'Member ID',
      'Full Name',
      'Phone',
      'Role',
      'Join Date',
      'Status',
      'Monthly Pledge (NGN)',
      'Confirmed Savings (NGN)',
    ];
    const rows = members.map((m) => [
      m.id,
      `"${m.name}"`,
      `"${m.phone}"`,
      m.role,
      m.joinDate,
      m.status,
      m.monthlyPledge,
      m.totalSavings,
    ]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `piset_cooperative_members_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify('Exported 12 member records & pledges to CSV.');
  };

  const maxCashflowVal = Math.max(
    ...MONTHLY_CASHFLOW_SERIES.flatMap((d) => [d.inflow, d.outflow]),
    1
  );

  const handleAdminGateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminGateError('');
    if (!onAuthenticateAdmin) return;
    const ok = onAuthenticateAdmin(adminGatePasswordInput);
    if (!ok) {
      setAdminGateError(
        'Unauthorized password. Only authorized personnel with the PISET Cooperative Admin Portal password have access.'
      );
      return;
    }
    setAdminGatePasswordInput('');
  };

  const handleAdminChangePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPwdChangeError('');
    if (!onChangeAdminPassword) return;
    const res = onChangeAdminPassword(
      adminCurrentPwdInput,
      adminNewPwdInput,
      adminConfirmPwdInput
    );
    if (!res.valid) {
      setAdminPwdChangeError(res.error || 'Could not update Admin password.');
      return;
    }
    setAdminCurrentPwdInput('');
    setAdminNewPwdInput('');
    setAdminConfirmPwdInput('');
    setShowChangeAdminPwdPanel(false);
  };

  const handleUploadWhitelistMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setWhitelistFormError('');
    if (!newWhitelistName.trim() || newWhitelistName.trim().length < 3) {
      setWhitelistFormError('Please enter the member full name.');
      return;
    }
    if (!newWhitelistEmail.includes('@')) {
      setWhitelistFormError('Please enter a valid cooperative email address.');
      return;
    }
    if (newWhitelistPhone.replace(/\D/g, '').length < 7) {
      setWhitelistFormError('Please enter a valid Nigerian phone number.');
      return;
    }
    const pledgeNum = Number(newWhitelistPledge) || 100000;
    if (onUploadWhitelistedMember) {
      const created = onUploadWhitelistedMember({
        name: newWhitelistName.trim(),
        email: newWhitelistEmail.trim(),
        phone: newWhitelistPhone.trim(),
        department:
          newWhitelistDept.trim() || 'Port Harcourt Cooperative Operations',
        monthlyPledge: Math.max(5000, Math.round(pledgeNum)),
        role: newWhitelistRole,
      });
      setLastUploadedMemberOtp(created);
      setNewWhitelistName('');
      setNewWhitelistEmail('');
      setNewWhitelistPhone('');
    }
  };

  // Strict Password Gate for Admin Portal
  if (!isAdminAuthenticated) {
    return (
      <div
        data-testid="admin-password-gate"
        className="mx-auto max-w-lg px-4 py-12 sm:py-20"
      >
        <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl space-y-5">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-950 text-amber-300">
              <Lock className="h-6 w-6" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Authorized Personnel Only
              </span>
              <h1 className="text-xl font-bold text-slate-900">
                Admin Portal Security Gate
              </h1>
            </div>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed">
            This application is the sole property of{' '}
            <strong className="text-slate-900">
              PISET COOPERATIVE SOCIETY PORT HARCOURT
            </strong>
            . Enter the authorized Admin Portal password to manage treasury
            liquidity, upload member emails &amp; phone numbers for Email OTP
            mobile binding, and synchronize member portals.
          </p>

          {adminGateError && (
            <div
              data-testid="admin-gate-error"
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 flex items-start gap-2"
            >
              <ShieldAlert className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
              <span>{adminGateError}</span>
            </div>
          )}

          <form onSubmit={handleAdminGateSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="admin-gate-password"
                className="block text-xs font-semibold text-slate-700"
              >
                Authorized Admin Portal Password
              </label>
              <input
                id="admin-gate-password"
                data-testid="admin-gate-password-input"
                type="password"
                value={adminGatePasswordInput}
                onChange={(e) => setAdminGatePasswordInput(e.target.value)}
                placeholder="Enter authorized Admin password"
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-800 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              data-testid="admin-gate-submit-btn"
              className="w-full min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
            >
              Unlock Admin Portal
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] flex flex-col lg:flex-row min-h-[calc(100vh-65px)]">
      {/* Desktop-First Sidebar Navigation */}
      <aside
        aria-label="Admin Portal Sidebar Navigation"
        className="w-full lg:w-64 xl:w-72 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-white p-4 lg:p-6 flex flex-col justify-between"
      >
        <div>
          <div className="mb-4 pb-4 border-b border-slate-100 space-y-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                Admin & Treasury Console
              </span>
              <p
                data-testid="admin-operator-name"
                className="mt-1 text-sm font-bold text-slate-900"
              >
                {isSignedIn ? currentOperator.name : 'Welcome back'}
              </p>
              <p className="text-xs text-slate-500">
                Active Role:{' '}
                <strong
                  data-testid="admin-active-executive-role"
                  className="text-emerald-900"
                >
                  {isSignedIn ? activeExecutiveRole : 'Sign in required'}
                </strong>
              </p>
            </div>

            {isSignedIn && (
              <div className="pt-1">
                <label
                  htmlFor="admin-executive-role-select"
                  className="block text-[11px] font-semibold text-slate-600"
                >
                  Switch Admin Executive Role
                </label>
                <select
                  id="admin-executive-role-select"
                  data-testid="admin-executive-role-select"
                  value={activeExecutiveRole}
                  onChange={(e) => {
                    if (onSwitchExecutiveRole) {
                      onSwitchExecutiveRole(
                        e.target.value as AdminExecutiveRole
                      );
                    }
                  }}
                  className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs font-bold text-emerald-950 focus:border-emerald-800 focus:outline-none"
                >
                  {ADMIN_EXECUTIVE_ROLES.map((r) => (
                    <option key={r.roleTitle} value={r.roleTitle}>
                      {r.numberedLabel}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <nav className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1.5">
            {(
              [
                {
                  id: 'treasury',
                  label: 'Treasury overview',
                  icon: BarChart3,
                  count: undefined,
                },
                {
                  id: 'defaulters',
                  label: 'Loan health & defaulters',
                  icon: BellRing,
                  count: isSignedIn
                    ? loans.filter((l) => l.status === 'overdue').length
                    : 0,
                },
                {
                  id: 'reconciliation',
                  label: 'Reconciliation ledger',
                  icon: ShieldCheck,
                  count: pendingReviewCount,
                },
                {
                  id: 'members',
                  label: 'Members and loans',
                  icon: Users,
                  count: pendingLoanCount,
                },
                {
                  id: 'operations_sync',
                  label: 'Live Updates & Import',
                  icon: FileSpreadsheet,
                  count: stagedSyncRows.length,
                },
              ] as const
            ).map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeSection(item.id)}
                  className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold transition-colors ${
                    isActive
                      ? 'bg-emerald-950 text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.count !== undefined && item.count > 0 && (
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        isActive ? 'text-amber-300' : 'text-emerald-800'
                      }`}
                    >
                      {item.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Maker-Checker Governance & Admin Security Card in Sidebar */}
        <div className="mt-6 space-y-3">
          <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200/80 space-y-2.5">
            <div className="text-xs font-bold text-slate-900">
              Switch Admin Executive Role
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
              Switch between executive roles to manage treasury approvals and
              Maker-Checker governance:
            </p>

            {/* 5 Executive Role Quick-Switch Buttons */}
            <div className="grid grid-cols-1 gap-1.5">
              {ADMIN_EXECUTIVE_ROLES.map((roleItem) => {
                const isSelected = activeExecutiveRole === roleItem.roleTitle;
                return (
                  <button
                    key={roleItem.roleTitle}
                    type="button"
                    data-testid={`admin-role-btn-${roleItem.roleTitle}`}
                    onClick={() => {
                      if (onSwitchExecutiveRole) {
                        onSwitchExecutiveRole(roleItem.roleTitle);
                      }
                    }}
                    className={`w-full min-h-[38px] rounded-xl px-3 py-1.5 text-left text-xs font-bold transition-colors flex items-center justify-between gap-2 ${
                      isSelected
                        ? 'bg-emerald-950 text-amber-300 shadow-xs'
                        : 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <span className="truncate">{roleItem.numberedLabel}</span>
                    <span
                      className={`text-[10px] font-medium truncate ${
                        isSelected ? 'text-emerald-200' : 'text-slate-500'
                      }`}
                    >
                      {roleItem.operatorName}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-200/80 flex flex-col gap-2">
              <button
                type="button"
                data-testid="toggle-change-admin-pwd-btn"
                onClick={() =>
                  setShowChangeAdminPwdPanel((prev) => !prev)
                }
                className="w-full min-h-[40px] rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 flex items-center justify-center gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5" />
                <span>
                  {showChangeAdminPwdPanel
                    ? 'Hide Password Form'
                    : 'Change Admin Password'}
                </span>
              </button>
              <button
                type="button"
                onClick={onSwitchOperatorRole}
                className="w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
              >
                Cycle Next Executive Role
              </button>
              {onLockAdminPortal && (
                <button
                  type="button"
                  data-testid="lock-admin-portal-btn"
                  onClick={onLockAdminPortal}
                  className="w-full min-h-[40px] rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                >
                  Lock Admin Portal
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main Workspace Viewport */}
      <div className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 overflow-x-hidden">
        {/* Authorized Personnel Change Admin Password Panel */}
        {showChangeAdminPwdPanel && (
          <section
            aria-label="Change Admin Portal Password"
            data-testid="admin-change-password-form"
            className="rounded-2xl border border-emerald-800/30 bg-white p-5 shadow-sm space-y-4"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Change Admin Portal Password
                </h2>
                <p className="text-xs text-slate-600">
                  Update the password required to unlock the PISET Cooperative
                  Admin Portal (must include uppercase, lowercase, and special
                  signs)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowChangeAdminPwdPanel(false)}
                className="min-h-[38px] rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>

            {adminPwdChangeError && (
              <div
                data-testid="admin-pwd-change-error"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800"
              >
                {adminPwdChangeError}
              </div>
            )}

            <form
              onSubmit={handleAdminChangePasswordSubmit}
              className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end"
            >
              <div>
                <label
                  htmlFor="admin-current-pwd"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Current Admin Password
                </label>
                <input
                  id="admin-current-pwd"
                  data-testid="admin-current-pwd-input"
                  type="password"
                  value={adminCurrentPwdInput}
                  onChange={(e) => setAdminCurrentPwdInput(e.target.value)}
                  placeholder="Current password"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="admin-new-pwd"
                  className="block text-xs font-semibold text-slate-700"
                >
                  New Admin Password
                </label>
                <input
                  id="admin-new-pwd"
                  data-testid="admin-new-pwd-input"
                  type="password"
                  value={adminNewPwdInput}
                  onChange={(e) => setAdminNewPwdInput(e.target.value)}
                  placeholder="Uppercase, lowercase & signs"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                />
              </div>
              <div>
                <label
                  htmlFor="admin-confirm-pwd"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Confirm New Password
                </label>
                <input
                  id="admin-confirm-pwd"
                  data-testid="admin-confirm-pwd-input"
                  type="password"
                  value={adminConfirmPwdInput}
                  onChange={(e) => setAdminConfirmPwdInput(e.target.value)}
                  placeholder="Re-enter new password"
                  className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                />
              </div>
              <button
                type="submit"
                data-testid="admin-change-pwd-submit-btn"
                className="min-h-[42px] rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                Update Admin Password
              </button>
            </form>
          </section>
        )}
        {!isSignedIn && (
          <div
            data-testid="admin-unauthenticated-banner"
            className="rounded-2xl border border-emerald-800/20 bg-emerald-950/5 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="text-xs text-slate-700">
              <strong className="text-emerald-950">
                Zero-Balance Privacy Protection Active:
              </strong>{' '}
              All Admin Treasury KPIs and balances default to{' '}
              <strong>₦0</strong> until an authorized user signs in. Sign in to
              synchronize live Admin &amp; Member Portal figures.
            </div>
            {onOpenAuthModal && (
              <button
                type="button"
                onClick={onOpenAuthModal}
                data-testid="admin-signin-sync-btn"
                className="min-h-[40px] rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                Sign In to Sync Portals
              </button>
            )}
          </div>
        )}

        {/* SECTION 1: TREASURY OVERVIEW */}
        {activeSection === 'treasury' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Treasury Overview & Liquidity Position
                </h1>
                <p className="text-xs text-slate-600">
                  Real-time Port Harcourt cooperative balance sheet, cash
                  reserves, and append-only ledger
                </p>
              </div>
              <button
                type="button"
                onClick={() => onChangeSection('reconciliation')}
                className="min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                Review Pending Transfers ({pendingReviewCount})
              </button>
            </div>

            {/* 4 KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs font-medium text-slate-500">
                  Total Cooperative Liquidity
                </span>
                <div
                  className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
                  data-testid="kpi-total-liquidity"
                >
                  {formatNaira(kpis.totalLiquidity)}
                </div>
                <p className="mt-1 text-xs text-emerald-800">
                  Confirmed thrift pool + realized interest
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs font-medium text-slate-500">
                  Active Loan Exposure
                </span>
                <div
                  className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
                  data-testid="kpi-loan-exposure"
                >
                  {formatNaira(kpis.activeLoanExposure)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Across{' '}
                  {isSignedIn
                    ? loans.filter(
                        (l) => l.status === 'active' || l.status === 'overdue'
                      ).length
                    : 0}{' '}
                  active/overdue facilities
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs font-medium text-slate-500">
                  Available Cash Reserves
                </span>
                <div
                  className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-900"
                  data-testid="kpi-cash-reserves"
                >
                  {formatNaira(kpis.cashReserves)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Held in Zenith Bank corporate account
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <span className="text-xs font-medium text-slate-500">
                  Exposure-to-Liquidity Ratio
                </span>
                <div
                  className="mt-2 font-mono text-2xl font-bold tabular-nums text-slate-900"
                  data-testid="kpi-exposure-ratio"
                >
                  {kpis.exposureToLiquidityRatio}%
                </div>
                <p className="mt-1 text-xs text-emerald-800">
                  Healthy threshold (&lt; 65.0% policy cap)
                </p>
              </div>
            </div>

            {/* Monthly Inflow / Outflow Chart + Append-Only Ledger */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
              {/* Monthly Inflow / Outflow Chart */}
              <section
                aria-label="Monthly Inflow and Outflow Chart"
                className="xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Monthly Inflow vs. Outflow (₦)
                    </h2>
                    <p className="text-xs text-slate-500">
                      Thrift savings & repayments inflow vs. loan disbursements
                      (Jun – Nov 2026)
                    </p>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <span className="inline-block h-2.5 w-2.5 rounded-xs bg-emerald-800" />
                      Inflow (Savings + Repayments)
                    </span>
                    <span className="flex items-center gap-1.5 font-medium text-slate-700">
                      <span className="inline-block h-2.5 w-2.5 rounded-xs bg-amber-500" />
                      Outflow (Loan Disbursements)
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-6 gap-3 pt-4 items-end h-56 border-b border-slate-200 pb-3">
                  {MONTHLY_CASHFLOW_SERIES.map((item) => {
                    const effectiveInflow = isSignedIn ? item.inflow : 0;
                    const effectiveOutflow = isSignedIn ? item.outflow : 0;
                    const inflowPct = isSignedIn
                      ? Math.round((effectiveInflow / maxCashflowVal) * 100)
                      : 4;
                    const outflowPct = isSignedIn
                      ? Math.round((effectiveOutflow / maxCashflowVal) * 100)
                      : 4;
                    return (
                      <div
                        key={item.month}
                        className="flex flex-col items-center h-full justify-end group"
                      >
                        <div className="flex items-end justify-center gap-1.5 w-full h-44">
                          <div
                            title={`Inflow: ${formatNaira(effectiveInflow)}`}
                            className="w-4 sm:w-6 rounded-t-md bg-emerald-800 transition-all"
                            style={{ height: `${Math.max(4, inflowPct)}%` }}
                          />
                          <div
                            title={`Outflow: ${formatNaira(effectiveOutflow)}`}
                            className="w-4 sm:w-6 rounded-t-md bg-amber-500 transition-all"
                            style={{ height: `${Math.max(4, outflowPct)}%` }}
                          />
                        </div>
                        <span className="mt-2 text-xs font-semibold text-slate-700">
                          {item.month}
                        </span>
                        <span className="font-mono text-[10px] text-slate-500">
                          {formatNaira(effectiveInflow)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Recent Append-Only Financial Ledger */}
              <section
                aria-label="Append-Only Financial Ledger"
                className="xl:col-span-5 rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">
                      Append-Only Financial Ledger
                    </h2>
                    <p className="text-xs text-slate-500">
                      Every confirmed money movement writes an immutable entry
                    </p>
                  </div>
                  <span className="font-mono text-xs font-semibold text-emerald-800">
                    {isSignedIn ? ledger.length : 0} entries
                  </span>
                </div>

                {!isSignedIn ? (
                  <div className="rounded-2xl bg-slate-50 p-6 text-center">
                    <p className="text-xs font-medium text-slate-600">
                      Sign in as an authorized member, Treasurer, or Admin to
                      synchronize and view the append-only ledger.
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {ledger.slice(0, 5).map((entry) => (
                      <div
                        key={entry.id}
                        className="py-3 flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            {entry.memberName} ·{' '}
                            <span className="capitalize">
                              {entry.type.replace('_', ' ')}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {entry.source} · Approved by {entry.approvedByName}
                          </div>
                        </div>
                        <div className="text-right">
                          <div
                            className={`font-mono text-xs font-bold tabular-nums ${
                              entry.type === 'loan_disbursement'
                                ? 'text-amber-800'
                                : 'text-emerald-800'
                            }`}
                          >
                            {entry.type === 'loan_disbursement' ? '-' : '+'}
                            {formatNaira(entry.amount)}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(entry.timestamp).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Cooperative Announcement FCM Push Broadcast */}
            <section
              aria-label="Broadcast Cooperative Announcement via FCM Push"
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Broadcast Cooperative Announcement (Firebase Cloud Messaging)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Dispatch an immediate FCM push notification to all 12 Port
                    Harcourt cooperative members
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-800">
                  Topic: cooperative_announcements
                </span>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!announcementTitle.trim() || !announcementBody.trim()) {
                    return;
                  }
                  onBroadcastAnnouncement(
                    announcementTitle.trim(),
                    announcementBody.trim()
                  );
                }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end"
              >
                <div className="lg:col-span-4">
                  <label
                    htmlFor="fcm-announcement-title"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Announcement Headline
                  </label>
                  <input
                    id="fcm-announcement-title"
                    type="text"
                    value={announcementTitle}
                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-900"
                  />
                </div>
                <div className="lg:col-span-6">
                  <label
                    htmlFor="fcm-announcement-body"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Message Body
                  </label>
                  <input
                    id="fcm-announcement-body"
                    type="text"
                    value={announcementBody}
                    onChange={(e) => setAnnouncementBody(e.target.value)}
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                  />
                </div>
                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    data-testid="broadcast-fcm-announcement-btn"
                    className="w-full min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
                  >
                    Send FCM Push
                  </button>
                </div>
              </form>
            </section>
          </div>
        )}

        {/* SECTION 2: LOAN HEALTH AND DEFAULTERS DESK */}
        {activeSection === 'defaulters' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Loan Health & Defaulters Desk
                </h1>
                <p className="text-xs text-slate-600">
                  Overdue aging buckets and scheduled Cloud Function reminder
                  dispatch (3d pre-due, due date, 30d & 60d overdue)
                </p>
              </div>
              <button
                type="button"
                onClick={onRunScheduledReminders}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                <RefreshCw className="h-4 w-4" />
                <span>Run Scheduled Reminder Cron</span>
              </button>
            </div>

            {/* 4 Overdue Aging Tabs: 1-29, 30, 60, 90+ days overdue */}
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5"
              role="tablist"
              aria-label="Overdue aging buckets"
            >
              {(
                [
                  { id: '1-29', label: '1–29 Days Overdue' },
                  { id: '30', label: '30 Days Overdue' },
                  { id: '60', label: '60 Days Overdue' },
                  { id: '90+', label: '90+ Days Overdue' },
                ] as const
              ).map((tab) => {
                const count = filterLoansByOverdueBucket(loans, tab.id).length;
                const isActive = overdueTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setOverdueTab(tab.id)}
                    className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                      isActive
                        ? 'bg-white text-emerald-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Defaulters Table */}
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
              {overdueLoansForTab.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    No overdue loans in the {overdueTab} days bucket.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3.5 px-4">Member</th>
                        <th className="py-3.5 px-4 text-right">Amount Due</th>
                        <th className="py-3.5 px-4 text-right">Days Overdue</th>
                        <th className="py-3.5 px-4">Last Reminder</th>
                        <th className="py-3.5 px-4 text-right">
                          Recovery Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {overdueLoansForTab.map((loan) => {
                        const amountDue = Math.max(
                          0,
                          loan.principal + loan.interest - loan.amountPaid
                        );
                        return (
                          <tr key={loan.id} className="hover:bg-slate-50/80">
                            <td className="py-4 px-4">
                              <div className="font-bold text-slate-900">
                                {loan.memberName}
                              </div>
                              <div className="text-slate-500">
                                {loan.memberPhone} · {loan.purpose}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right font-mono text-sm font-bold tabular-nums text-red-700">
                              {formatNaira(amountDue)}
                            </td>
                            <td className="py-4 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                              {loan.daysOverdue} days
                            </td>
                            <td className="py-4 px-4">
                              <div className="font-medium text-slate-800">
                                {loan.lastReminderChannel}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {new Date(
                                  loan.lastReminderSentAt
                                ).toLocaleString()}
                              </div>
                            </td>
                            <td className="py-4 px-4 text-right whitespace-nowrap">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onSendLoanReminder(loan.id, 'multi')
                                  }
                                  className="min-h-[40px] rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                                >
                                  Send reminder
                                </button>
                                <a
                                  href={`tel:${loan.memberPhone.replace(
                                    /\s+/g,
                                    ''
                                  )}`}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    onNotify(
                                      `Initiating voice call to ${loan.memberName} (${loan.memberPhone})...`
                                    );
                                  }}
                                  className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                                >
                                  <PhoneCall className="h-3.5 w-3.5" />
                                  <span>Call</span>
                                </a>
                                <button
                                  type="button"
                                  onClick={() => onEscalateLoan(loan.id)}
                                  className="min-h-[40px] rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 whitespace-nowrap"
                                >
                                  {loan.escalated ? 'Escalated' : 'Escalate'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Automated Reminder Dispatch Log */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-base font-bold text-slate-900">
                Recent Reminder Dispatch Log (SMS / WhatsApp / In-App)
              </h2>
              <div className="mt-3 divide-y divide-slate-100 text-xs">
                {reminders.slice(0, 5).map((rem) => (
                  <div
                    key={rem.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-bold text-slate-900">
                        {rem.memberName}
                      </span>{' '}
                      · <span className="text-slate-600">{rem.message}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">
                      {rem.tier} · {new Date(rem.sentAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 3: RECONCILIATION LEDGER */}
        {activeSection === 'reconciliation' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Reconciliation Ledger & Maker-Checker Desk
                </h1>
                <p className="text-xs text-slate-600">
                  Verify manual bank transfer receipts, check 48-hour duplicate
                  warnings, and audit auto-settled Paystack webhooks
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">
                  Signed in as:{' '}
                  <strong className="text-slate-900">
                    {currentOperator.name} ({currentOperator.role})
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={onSwitchOperatorRole}
                  className="min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-semibold text-emerald-900 hover:bg-slate-50"
                >
                  Switch Checker Role
                </button>
              </div>
            </div>

            {/* Filter Tabs: Needs review / Auto-settled / Rejected */}
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-100 p-1.5"
              role="tablist"
              aria-label="Reconciliation filters"
            >
              {(
                [
                  {
                    id: 'needs_review',
                    label: `Needs review (${
                      contributions.filter((c) => c.status === 'pending').length
                    })`,
                  },
                  {
                    id: 'auto_settled',
                    label: `Auto-settled & Confirmed (${
                      contributions.filter((c) => c.status === 'confirmed')
                        .length
                    })`,
                  },
                  {
                    id: 'rejected',
                    label: `Rejected (${
                      contributions.filter((c) => c.status === 'rejected')
                        .length
                    })`,
                  },
                  { id: 'all', label: `All (${contributions.length})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={reconFilter === tab.id}
                  onClick={() => setReconFilter(tab.id)}
                  className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                    reconFilter === tab.id
                      ? 'bg-white text-emerald-950 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Contributions & Receipts List */}
            <div className="space-y-4">
              {filteredContributions.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    No contributions match the selected filter.
                  </p>
                </div>
              ) : (
                filteredContributions.map((item) => {
                  const dupCheck = detectDuplicateContribution(
                    item,
                    contributions
                  );
                  const makerChecker = validateMakerCheckerApproval(
                    item.uploadedBy,
                    currentOperator.uid,
                    currentOperator.role
                  );

                  return (
                    <div
                      key={item.id}
                      className="rounded-2xl border border-slate-200 bg-white p-5 transition-colors"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex items-start gap-4 min-w-0 flex-1">
                          {/* Receipt Thumbnail for Manual Transfers */}
                          {item.method === 'bank_transfer' && item.receiptUrl ? (
                            <button
                              type="button"
                              onClick={() => setPreviewReceipt(item)}
                              className="group relative h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-100"
                              aria-label={`View receipt image for ${item.memberName}`}
                            >
                              <img
                                src={item.receiptUrl}
                                alt={`Receipt uploaded by ${item.memberName}`}
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                              />
                            </button>
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-emerald-950/5 text-emerald-800 font-mono text-xs font-bold">
                              PSTK
                            </div>
                          )}

                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-base font-bold text-slate-900">
                                {item.memberName}
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="font-mono text-base font-bold text-emerald-900">
                                {formatNaira(item.amount)}
                              </span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs font-medium text-slate-600">
                                Month: {item.month}
                              </span>
                            </div>

                            <p className="mt-1 text-xs text-slate-500">
                              {item.method === 'paystack'
                                ? `Auto-settled via Paystack Webhook · Ref: ${item.paystackRef}`
                                : `Manual Bank Transfer (${
                                    item.bankName || 'NIP'
                                  } · Acct ${
                                    item.senderAccount || 'N/A'
                                  }) · Uploaded by ${item.uploadedByName}`}
                            </p>

                            {/* 48-Hour Duplicate Warning */}
                            {dupCheck.isDuplicate && (
                              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 border border-amber-200">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                                <span>
                                  Possible duplicate: Same member, amount (
                                  {formatNaira(item.amount)}), and month (
                                  {item.month}) submitted within 48 hours (matches{' '}
                                  {dupCheck.matchingIds.join(', ')}).
                                </span>
                              </div>
                            )}

                            {/* Maker-Checker Warning if Current Operator Uploaded This Receipt */}
                            {item.status === 'pending' &&
                              !makerChecker.allowed && (
                                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-900 border border-red-200">
                                  <ShieldAlert className="h-4 w-4 text-red-700 shrink-0" />
                                  <span>{makerChecker.reason}</span>
                                  <button
                                    type="button"
                                    onClick={onSwitchOperatorRole}
                                    className="underline font-bold text-red-950 hover:text-red-800 ml-1"
                                  >
                                    Switch to another Admin/Treasurer to approve
                                  </button>
                                </div>
                              )}

                            {item.status === 'rejected' &&
                              item.rejectionReason && (
                                <p className="mt-2 text-xs text-red-700">
                                  Rejected Reason: {item.rejectionReason}
                                </p>
                              )}
                          </div>
                        </div>

                        {/* Action Controls */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.status === 'pending' ? (
                            <>
                              <button
                                type="button"
                                disabled={!makerChecker.allowed}
                                onClick={() => onApproveContribution(item.id)}
                                className={`min-h-[44px] rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
                                  makerChecker.allowed
                                    ? 'bg-emerald-900 text-white hover:bg-emerald-800'
                                    : 'cursor-not-allowed bg-slate-200 text-slate-500'
                                }`}
                              >
                                Approve & Write Ledger
                              </button>
                              <button
                                type="button"
                                disabled={!makerChecker.allowed}
                                onClick={() => {
                                  setRejectingId(item.id);
                                  setRejectReasonInput('');
                                  setRejectError('');
                                }}
                                className={`min-h-[44px] rounded-xl border px-4 py-2 text-xs font-semibold transition-colors ${
                                  makerChecker.allowed
                                    ? 'border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                                    : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                                }`}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <span
                              className={`text-xs font-semibold ${
                                item.status === 'confirmed'
                                  ? 'text-emerald-800'
                                  : 'text-red-700'
                              }`}
                            >
                              {item.status === 'confirmed'
                                ? `Settled (${
                                    item.approvedByName || item.approvedBy
                                  })`
                                : 'Rejected'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Inline Reject Reason Form */}
                      {rejectingId === item.id && (
                        <form
                          onSubmit={handleConfirmReject}
                          className="mt-4 pt-4 border-t border-slate-100 space-y-3"
                        >
                          <label
                            htmlFor={`reject-reason-${item.id}`}
                            className="block text-xs font-semibold text-slate-700"
                          >
                            Mandatory Rejection Reason (logged in Audit Trail)
                          </label>
                          {rejectError && (
                            <p className="text-xs text-red-700">{rejectError}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            <input
                              id={`reject-reason-${item.id}`}
                              type="text"
                              value={rejectReasonInput}
                              onChange={(e) =>
                                setRejectReasonInput(e.target.value)
                              }
                              placeholder="e.g. Duplicate upload or NIP session ID not found on bank statement"
                              className="flex-1 min-w-[240px] min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs text-slate-900"
                            />
                            <button
                              type="submit"
                              className="min-h-[44px] rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white hover:bg-red-800"
                            >
                              Confirm Rejection
                            </button>
                            <button
                              type="button"
                              onClick={() => setRejectingId(null)}
                              className="min-h-[44px] rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* SECTION 4: MEMBERS AND LOANS */}
        {activeSection === 'members' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Members Whitelist, Email OTP Binding &amp; Loan Approvals
                </h1>
                <p className="text-xs text-slate-600">
                  Upload member email &amp; phone numbers to grant cooperative
                  access and dispatch Email OTPs for mobile binding, approve
                  loans, and adjust pledges
                </p>
              </div>
              <button
                type="button"
                onClick={handleExportCsv}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
              >
                <Download className="h-4 w-4" />
                <span>Export Members CSV</span>
              </button>
            </div>

            {/* Upload & Whitelist Member Email + Phone (Auto-Generates Email OTP for Mobile Binding) */}
            <section
              aria-label="Upload and Whitelist Member Email and Phone"
              data-testid="admin-upload-whitelist-form"
              className="rounded-2xl border border-emerald-800/25 bg-white p-6 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <UserPlus className="h-4 w-4 text-emerald-800" />
                    <span>
                      Upload Member Email &amp; Phone Number (Whitelist &amp;
                      Generate Email OTP)
                    </span>
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-600">
                    No one whose email and phone number have not been uploaded
                    here can access the app. Uploading automatically generates
                    and dispatches a 6-digit OTP to their email for mobile
                    binding and first sign-in.
                  </p>
                </div>
                <span className="text-xs font-semibold text-emerald-800">
                  {members.filter((m) => m.uploadedByAdmin).length} Whitelisted
                  Members
                </span>
              </div>

              {whitelistFormError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-800">
                  {whitelistFormError}
                </div>
              )}

              {lastUploadedMemberOtp && (
                <div
                  data-testid="uploaded-member-otp-confirmation"
                  className="rounded-xl border border-emerald-800/30 bg-emerald-950/5 px-4 py-3 text-xs text-emerald-950 flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <strong>Whitelisted &amp; Email OTP Sent:</strong>{' '}
                    {lastUploadedMemberOtp.name} ({lastUploadedMemberOtp.email}{' '}
                    · {lastUploadedMemberOtp.phone}) — Mobile Binding Email OTP:{' '}
                    <span className="font-mono font-bold underline">
                      {lastUploadedMemberOtp.emailOtpCode}
                    </span>
                  </div>
                </div>
              )}

              <form
                onSubmit={handleUploadWhitelistMemberSubmit}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end"
              >
                <div className="lg:col-span-1">
                  <label
                    htmlFor="whitelist-name"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Full Name
                  </label>
                  <input
                    id="whitelist-name"
                    data-testid="whitelist-name-input"
                    type="text"
                    value={newWhitelistName}
                    onChange={(e) => setNewWhitelistName(e.target.value)}
                    placeholder="e.g. Nkechi Opara"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label
                    htmlFor="whitelist-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Email Address
                  </label>
                  <input
                    id="whitelist-email"
                    data-testid="whitelist-email-input"
                    type="email"
                    value={newWhitelistEmail}
                    onChange={(e) => setNewWhitelistEmail(e.target.value)}
                    placeholder="nkechi.opara@pisetcoop.org.ng"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label
                    htmlFor="whitelist-phone"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Phone Number
                  </label>
                  <input
                    id="whitelist-phone"
                    data-testid="whitelist-phone-input"
                    type="tel"
                    value={newWhitelistPhone}
                    onChange={(e) => setNewWhitelistPhone(e.target.value)}
                    placeholder="+234 803 555 0199"
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label
                    htmlFor="whitelist-dept"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Department
                  </label>
                  <input
                    id="whitelist-dept"
                    data-testid="whitelist-dept-input"
                    type="text"
                    value={newWhitelistDept}
                    onChange={(e) => setNewWhitelistDept(e.target.value)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                  />
                </div>
                <div className="lg:col-span-1">
                  <label
                    htmlFor="whitelist-pledge"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Monthly Pledge (₦)
                  </label>
                  <input
                    id="whitelist-pledge"
                    data-testid="whitelist-pledge-input"
                    type="number"
                    min={5000}
                    step={5000}
                    value={newWhitelistPledge}
                    onChange={(e) => setNewWhitelistPledge(e.target.value)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900"
                  />
                </div>
                <div className="lg:col-span-1">
                  <button
                    type="submit"
                    data-testid="whitelist-submit-btn"
                    className="w-full min-h-[42px] rounded-xl bg-emerald-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
                  >
                    Upload &amp; Send OTP
                  </button>
                </div>
              </form>
            </section>

            {/* Pending Loan Applications Queue */}
            <section
              aria-label="Pending Loan Requests"
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <h2 className="text-base font-bold text-slate-900">
                Pending Loan Applications (
                {loans.filter((l) => l.status === 'pending').length})
              </h2>
              <p className="text-xs text-slate-500">
                Approving a loan disburses funds, creates a repayment schedule,
                and appends a disbursement entry to the ledger
              </p>

              {loans.filter((l) => l.status === 'pending').length === 0 ? (
                <p className="mt-4 text-xs text-slate-500">
                  All cooperative loan requests have been processed.
                </p>
              ) : (
                <div className="mt-4 divide-y divide-slate-100">
                  {loans
                    .filter((l) => l.status === 'pending')
                    .map((loan) => (
                      <div
                        key={loan.id}
                        className="py-4 flex flex-wrap items-center justify-between gap-4"
                      >
                        <div>
                          <div className="text-sm font-bold text-slate-900">
                            {loan.memberName} ·{' '}
                            <span className="font-mono text-emerald-900">
                              {formatNaira(loan.principal)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600">
                            Purpose: {loan.purpose} · Tenor: {loan.tenorMonths}{' '}
                            months · Interest: {formatNaira(loan.interest)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              onDecideLoanRequest(loan.id, 'approve')
                            }
                            className="min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                          >
                            Approve & Disburse
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              onDecideLoanRequest(loan.id, 'decline')
                            }
                            className="min-h-[44px] rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-800 hover:bg-red-100"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </section>

            {/* Members Directory Table with Whitelist Email OTP & Edit Pledge */}
            <section
              aria-label="Cooperative Members Roster"
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <h2 className="text-base font-bold text-slate-900">
                  Whitelisted Cooperative Members ({members.length})
                </h2>
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search member by name, email or phone..."
                  aria-label="Search member by name, email or phone"
                  className="min-h-[40px] w-full sm:w-64 rounded-xl border border-slate-300 px-3.5 py-1.5 text-xs text-slate-900"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-3.5 px-4">Member &amp; Email</th>
                      <th className="py-3.5 px-4">Phone &amp; Role</th>
                      <th className="py-3.5 px-4">
                        Email OTP &amp; Binding Status
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        Confirmed Savings
                      </th>
                      <th className="py-3.5 px-4 text-right">
                        Monthly Pledge
                      </th>
                      <th className="py-3.5 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {members
                      .filter(
                        (m) =>
                          m.name
                            .toLowerCase()
                            .includes(memberSearch.toLowerCase()) ||
                          m.email
                            .toLowerCase()
                            .includes(memberSearch.toLowerCase()) ||
                          m.phone.includes(memberSearch)
                      )
                      .map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-slate-900">
                              {m.name}
                            </div>
                            <div className="text-slate-600">{m.email}</div>
                            <div className="text-[11px] text-slate-400">
                              {m.department}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-mono text-slate-700">
                              {m.phone}
                            </div>
                            <div className="uppercase text-[10px] font-bold text-emerald-800">
                              {m.role} · {m.status}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="font-mono text-xs font-bold text-emerald-950">
                              OTP:{' '}
                              <span data-testid={`member-otp-${m.id}`}>
                                {m.emailOtpCode}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {m.mobileBound
                                ? 'Mobile Bound'
                                : 'Awaiting Binding'}{' '}
                              ·{' '}
                              {m.hasCreatedPassword
                                ? 'Custom Password Set'
                                : 'First Login Pending'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                            {formatNaira(isSignedIn ? m.totalSavings : 0)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-semibold tabular-nums text-emerald-900">
                            {editingMemberId === m.id ? (
                              <input
                                type="number"
                                value={pledgeDraft}
                                onChange={(e) => setPledgeDraft(e.target.value)}
                                aria-label={`New monthly pledge for ${m.name}`}
                                className="w-28 rounded-lg border border-emerald-700 px-2 py-1 text-right font-mono text-xs"
                              />
                            ) : (
                              formatNaira(isSignedIn ? m.monthlyPledge : 0)
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {editingMemberId === m.id ? (
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const val = Number(pledgeDraft);
                                    if (Number.isFinite(val) && val >= 5000) {
                                      onUpdateMemberPledge(m.id, val);
                                      setEditingMemberId(null);
                                    }
                                  }}
                                  className="min-h-[36px] rounded-lg bg-emerald-900 px-2.5 py-1 text-xs font-bold text-white"
                                >
                                  Save
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingMemberId(null)}
                                  className="min-h-[36px] rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingMemberId(m.id);
                                  setPledgeDraft(String(m.monthlyPledge));
                                }}
                                className="min-h-[36px] rounded-lg border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                Edit pledge
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        {/* SECTION 5: LIVE COOPERATIVE UPDATES & EXCEL / WORD IMPORT PORTAL */}
        {activeSection === 'operations_sync' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
                  Live Cooperative Updates & Excel / Word Import Portal
                </h1>
                <p className="text-xs text-slate-600">
                  Import Excel (.xlsx, .csv) or Word (.docx, .doc) schedules or
                  post live updates for contributions, loans, liquidity, and
                  happenings — automatically synced to every member&apos;s
                  portal upon sign-in
                </p>
              </div>
              <button
                type="button"
                data-testid="publish-sync-batch-btn"
                disabled={stagedSyncRows.length === 0}
                onClick={() =>
                  onApplySyncBatch(stagedSyncRows, importSourceLabel)
                }
                className={`inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white transition-colors whitespace-nowrap ${
                  stagedSyncRows.length > 0
                    ? 'bg-emerald-900 hover:bg-emerald-800 shadow-xs'
                    : 'cursor-not-allowed bg-slate-300'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  Publish & Sync to Member Portals ({stagedSyncRows.length})
                </span>
              </button>
            </div>

            {/* Excel & Word File Import + Sample Loaders */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
              {/* Left 7 cols: File Dropzone for Excel & Word */}
              <section
                aria-label="Import Excel or Word Document"
                className="xl:col-span-7 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      1. Import Excel (.xlsx / .csv) or Word (.docx / .doc)
                    </h2>
                    <span className="text-xs font-semibold text-emerald-800">
                      Supports Excel & Word
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Upload your monthly payroll spreadsheet or executive Word
                    memorandum. The parser automatically extracts member
                    contributions, loan repayments, treasury liquidity inflows,
                    and current cooperative happenings.
                  </p>

                  <div className="mt-4 rounded-2xl border-2 border-dashed border-emerald-800/30 bg-emerald-950/5 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-white">
                          <Upload className="h-5 w-5" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            Active Batch: {importSourceLabel}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Accepted formats: .xlsx, .xls, .csv, .docx, .doc,
                            .txt
                          </div>
                        </div>
                      </div>

                      <label
                        htmlFor="admin-excel-word-upload"
                        className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl bg-emerald-900 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Upload Excel or Word File</span>
                        <input
                          id="admin-excel-word-upload"
                          data-testid="admin-excel-word-upload-input"
                          type="file"
                          accept=".xlsx,.xls,.csv,.docx,.doc,.txt"
                          onChange={handleImportFileChange}
                          className="sr-only"
                        />
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="load-sample-excel-btn"
                      onClick={() => {
                        const rows = parseExcelRowsToSyncBatch(
                          SAMPLE_EXCEL_SYNC_ROWS,
                          'excel'
                        );
                        setStagedSyncRows(rows);
                        setImportSourceLabel(
                          'piset_nov2026_excel_schedule.xlsx (5 rows)'
                        );
                        onNotify(
                          'Loaded sample Excel (.xlsx) batch with contributions, loan updates, and liquidity.'
                        );
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-800" />
                      <span>Load Sample Excel Batch</span>
                    </button>

                    <button
                      type="button"
                      data-testid="load-sample-word-btn"
                      onClick={() => {
                        const rows = parseWordTextToSyncBatch(
                          SAMPLE_WORD_SYNC_TEXT
                        );
                        setStagedSyncRows(rows);
                        setImportSourceLabel(
                          'piset_executive_memo_nov2026.docx (4 items)'
                        );
                        onNotify(
                          'Loaded sample Word (.docx) executive memo with contributions, loans, liquidity, and happenings.'
                        );
                      }}
                      className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                    >
                      <FileText className="h-3.5 w-3.5 text-emerald-800" />
                      <span>Load Sample Word Memo</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadSampleExcel}
                      className="min-h-[40px] rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 whitespace-nowrap"
                    >
                      Download .xlsx Template
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadSampleWord}
                      className="min-h-[40px] rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-200 whitespace-nowrap"
                    >
                      Download .doc Template
                    </button>
                  </div>
                </div>
              </section>

              {/* Right 5 cols: Direct Live Entry Form */}
              <section
                aria-label="Add Direct Live Cooperative Update"
                className="xl:col-span-5 rounded-2xl border border-slate-200 bg-white p-6 flex flex-col justify-between"
              >
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    2. Add Direct Live Happening or Balance Update
                  </h2>
                  <p className="mt-1 text-xs text-slate-600">
                    Append an individual contribution, loan repayment, treasury
                    liquidity adjustment, or cooperative happening to the sync
                    queue.
                  </p>

                  <form
                    onSubmit={handleAddManualSyncRow}
                    className="mt-4 space-y-3"
                  >
                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="sync-record-type"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Update Category
                        </label>
                        <select
                          id="sync-record-type"
                          value={manualRecordType}
                          onChange={(e) =>
                            setManualRecordType(
                              e.target.value as CooperativeSyncRow['recordType']
                            )
                          }
                          className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
                        >
                          <option value="contribution">
                            Member Contribution
                          </option>
                          <option value="loan">Loan Repayment / Update</option>
                          <option value="liquidity">
                            Treasury Liquidity Inflow
                          </option>
                          <option value="happening">
                            Current Happening Bulletin
                          </option>
                        </select>
                      </div>

                      {/* Target Member: Both Dropdown ("Draw down") AND Manual Text Input */}
                      <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-1">
                          <span className="text-xs font-bold text-slate-800">
                            Target Member (Dropdown or Manual Input)
                          </span>
                          <span
                            data-testid="resolved-target-member-preview"
                            className="font-mono text-[11px] font-semibold text-emerald-900"
                          >
                            Target: {resolvedPortalTarget.memberName} (
                            {resolvedPortalTarget.memberId})
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label
                              htmlFor="sync-target-member"
                              className="block text-[11px] font-semibold text-slate-600"
                            >
                              Select from Dropdown
                            </label>
                            <select
                              id="sync-target-member"
                              data-testid="sync-target-member-select"
                              value={manualMemberId}
                              onChange={(e) => {
                                const val = e.target.value;
                                setManualMemberId(val);
                                if (val !== 'manual_input') {
                                  const found = members.find(
                                    (m) => m.id === val
                                  );
                                  setManualTargetMemberInput(
                                    val === 'all'
                                      ? ''
                                      : found
                                      ? `${found.name} (${found.id})`
                                      : ''
                                  );
                                }
                              }}
                              className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-900"
                            >
                              <option value="all">
                                All Members (Cooperative-Wide)
                              </option>
                              <option value="manual_input">
                                -- Manually Input Member Name / ID --
                              </option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name} ({m.id})
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label
                              htmlFor="sync-target-member-manual"
                              className="block text-[11px] font-semibold text-slate-600"
                            >
                              Or Manually Input Member Name / ID
                            </label>
                            <input
                              id="sync-target-member-manual"
                              data-testid="sync-target-member-manual-input"
                              type="text"
                              list="cooperative-target-members-list"
                              value={manualTargetMemberInput}
                              onChange={(e) => {
                                const val = e.target.value;
                                setManualTargetMemberInput(val);
                                const matched = members.find(
                                  (m) =>
                                    m.id.toLowerCase() ===
                                      val.trim().toLowerCase() ||
                                    m.name.toLowerCase() ===
                                      val.trim().toLowerCase() ||
                                    `${m.name} (${m.id})`.toLowerCase() ===
                                      val.trim().toLowerCase()
                                );
                                if (matched) {
                                  setManualMemberId(matched.id);
                                } else if (val.trim().length > 0) {
                                  setManualMemberId('manual_input');
                                }
                              }}
                              placeholder="Type name, ID (mem_04), or email..."
                              className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
                            />
                            <datalist id="cooperative-target-members-list">
                              <option value="All Cooperative Members" />
                              {members.map((m) => (
                                <option
                                  key={m.id}
                                  value={`${m.name} (${m.id})`}
                                />
                              ))}
                            </datalist>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label
                          htmlFor="sync-amount-input"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Amount in Naira (₦)
                        </label>
                        <input
                          id="sync-amount-input"
                          type="number"
                          min={0}
                          step={1000}
                          value={manualAmount}
                          onChange={(e) => setManualAmount(e.target.value)}
                          className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="sync-month-input"
                          className="block text-xs font-semibold text-slate-700"
                        >
                          Accounting Period
                        </label>
                        <input
                          id="sync-month-input"
                          type="text"
                          value={manualMonth}
                          onChange={(e) => setManualMonth(e.target.value)}
                          className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 font-mono text-xs text-slate-900"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="sync-desc-input"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Happening Headline / Transaction Description
                      </label>
                      <input
                        id="sync-desc-input"
                        type="text"
                        value={manualDescription}
                        onChange={(e) => setManualDescription(e.target.value)}
                        className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 px-3 py-1.5 text-xs text-slate-900"
                      />
                    </div>

                    <button
                      type="submit"
                      data-testid="add-manual-sync-row-btn"
                      className="w-full inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add to Staged Member Portal Sync Batch</span>
                    </button>
                  </form>
                </div>
              </section>
            </div>

            {/* Staged Records Table Ready to Sync to Member Portal */}
            <section
              aria-label="Staged Updates Ready for Member Portal Sync"
              className="rounded-2xl border border-slate-200 bg-white overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Staged Updates Queue ({stagedSyncRows.length} items ready)
                  </h2>
                  <p className="text-xs text-slate-500">
                    Clicking &ldquo;Publish & Sync to Member Portals&rdquo;
                    commits these records to member savings, loans, treasury
                    liquidity, and live happenings
                  </p>
                </div>
                {stagedSyncRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setStagedSyncRows([])}
                    className="min-h-[38px] rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Clear Queue
                  </button>
                )}
              </div>

              {stagedSyncRows.length === 0 ? (
                <div className="p-10 text-center">
                  <p className="text-sm font-semibold text-slate-700">
                    Staging queue is empty. Upload an Excel (.xlsx) or Word
                    (.docx) file above, or load a sample batch.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-3 px-4">Type & Source</th>
                        <th className="py-3 px-4">Target Member</th>
                        <th className="py-3 px-4">Period</th>
                        <th className="py-3 px-4 text-right">Amount (₦)</th>
                        <th className="py-3 px-4">
                          Happening / Update Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs">
                      {stagedSyncRows.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className="font-bold uppercase text-emerald-900">
                              {row.recordType}
                            </span>
                            <span className="ml-1.5 text-[11px] text-slate-500 uppercase">
                              ({row.sourceFormat})
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-semibold text-slate-900">
                            {row.memberName}{' '}
                            <span className="font-mono text-[11px] text-slate-500">
                              ({row.memberId})
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-slate-600">
                            {row.month}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums text-slate-900">
                            {row.amount > 0 ? formatNaira(row.amount) : '—'}
                          </td>
                          <td className="py-3.5 px-4 text-slate-700">
                            {row.description}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Published Cooperative Happenings Feed */}
            <section
              aria-label="Published Cooperative Happenings History"
              className="rounded-2xl border border-slate-200 bg-white p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Published Cooperative Happenings (Live on Member Portals)
                  </h2>
                  <p className="text-xs text-slate-500">
                    These updates appear automatically on the Member App as soon
                    as a member signs in
                  </p>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-800">
                  {happenings.length} live bulletins
                </span>
              </div>

              <div className="divide-y divide-slate-100">
                {happenings.slice(0, 6).map((hap) => (
                  <div
                    key={hap.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        {hap.title}{' '}
                        <span className="text-[11px] font-normal text-slate-500">
                          · Target: {hap.memberName || hap.memberId} · Source:{' '}
                          {hap.sourceFormat.toUpperCase()}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-600">
                        {hap.summary}
                      </p>
                    </div>
                    {hap.amount !== undefined && hap.amount > 0 && (
                      <span className="font-mono text-xs font-bold text-emerald-900">
                        {formatNaira(hap.amount)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>

      {/* Receipt Image Lightbox Modal */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
          aria-labelledby="receipt-preview-title"
        >
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3
                  id="receipt-preview-title"
                  className="text-base font-bold text-slate-900"
                >
                  Transfer Receipt — {previewReceipt.memberName}
                </h3>
                <p className="text-xs text-slate-500">
                  Claimed Amount: {formatNaira(previewReceipt.amount)} · Month:{' '}
                  {previewReceipt.month}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
                aria-label="Close receipt preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              <img
                src={previewReceipt.receiptUrl}
                alt={`Transfer receipt for ${previewReceipt.memberName}`}
                referrerPolicy="no-referrer"
                className="max-h-96 w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
