import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNaira,
  calculateLoanEligibility,
  validateMakerCheckerApproval,
  detectDuplicateContribution,
  calculateTreasuryKPIs,
  filterLoansByOverdueBucket,
  buildCommunityLoanFeed,
  generateRepaymentSchedule,
  validateAndHashPin,
  verifyPinAgainstHash,
  createFcmPushNotification,
  parseExcelRowsToSyncBatch,
  parseWordTextToSyncBatch,
  resolveSynchronizedDashboardFigures,
  DEFAULT_ADMIN_PORTAL_PASSWORD,
  generateEmailBindingOtp,
  verifyWhitelistedMemberAccess,
  validateMemberPasswordComplexity,
  verifyAdminPortalPassword,
  validateAdminPasswordChange,
  resolvePortalTargetMember,
  ADMIN_EXECUTIVE_ROLES,
  resolveAdminExecutiveRole,
} from './coopRules';

test('formatNaira formats Naira amounts with ₦ symbol and thousand separators', () => {
  assert.equal(formatNaira(1250000), '₦1,250,000');
  assert.equal(formatNaira(0), '₦0');
  assert.equal(formatNaira(75500.4), '₦75,500');
  assert.equal(formatNaira(-45000), '-₦45,000');
});

test('calculateLoanEligibility computes 3x multiplier for active members in good standing', () => {
  const eligibleResult = calculateLoanEligibility(1250000, 3, 'active', false, 0);
  assert.equal(eligibleResult.eligible, true);
  assert.equal(eligibleResult.maxLoanAmount, 3750000);

  const overdueResult = calculateLoanEligibility(1250000, 3, 'active', true, 0);
  assert.equal(overdueResult.eligible, false);
  assert.equal(overdueResult.maxLoanAmount, 0);

  const suspendedResult = calculateLoanEligibility(1250000, 3, 'suspended', false, 0);
  assert.equal(suspendedResult.eligible, false);
});

test('validateMakerCheckerApproval prevents self-approval and enforces treasurer/admin role', () => {
  // Uploader tries to approve their own receipt -> blocked
  const selfApprove = validateMakerCheckerApproval('uid_treasurer_1', 'uid_treasurer_1', 'treasurer');
  assert.equal(selfApprove.allowed, false);
  assert.match(selfApprove.reason || '', /Maker-checker rule violation/);

  // Regular member tries to approve -> blocked
  const memberApprove = validateMakerCheckerApproval('uid_member_1', 'uid_member_2', 'member');
  assert.equal(memberApprove.allowed, false);

  // Different treasurer approves -> allowed
  const validApprove = validateMakerCheckerApproval('uid_member_1', 'uid_treasurer_1', 'treasurer');
  assert.equal(validApprove.allowed, true);
});

test('detectDuplicateContribution warns on same member, amount, and month within 48 hours', () => {
  const existing = [
    {
      id: 'c1',
      memberId: 'm_01',
      amount: 150000,
      month: '2026-11',
      createdAt: '2026-11-08T10:00:00Z',
      status: 'pending' as const,
    },
    {
      id: 'c2',
      memberId: 'm_02',
      amount: 150000,
      month: '2026-11',
      createdAt: '2026-11-08T10:00:00Z',
      status: 'confirmed' as const,
    },
  ];

  // Submitted 18 hours later for same member, amount, and month
  const dupCheck = detectDuplicateContribution(
    {
      id: 'c3',
      memberId: 'm_01',
      amount: 150000,
      month: '2026-11',
      createdAt: '2026-11-09T04:00:00Z',
    },
    existing
  );
  assert.equal(dupCheck.isDuplicate, true);
  assert.deepEqual(dupCheck.matchingIds, ['c1']);

  // Submitted 72 hours later -> outside 48-hour window
  const nonDupCheck = detectDuplicateContribution(
    {
      id: 'c4',
      memberId: 'm_01',
      amount: 150000,
      month: '2026-11',
      createdAt: '2026-11-11T15:00:00Z',
    },
    existing
  );
  assert.equal(nonDupCheck.isDuplicate, false);
});

test('calculateTreasuryKPIs computes liquidity, exposure, reserves, and ratio accurately', () => {
  const members = [{ totalSavings: 5000000 }, { totalSavings: 3000000 }];
  const loans = [
    { principal: 2000000, interest: 160000, amountPaid: 560000, status: 'active' as const },
    { principal: 1000000, interest: 80000, amountPaid: 80000, status: 'overdue' as const },
    { principal: 500000, interest: 40000, amountPaid: 540000, status: 'repaid' as const },
  ];

  const kpis = calculateTreasuryKPIs(members, loans);
  // Total savings = 8,000,000 + realized interest 40,000 = 8,040,000
  assert.equal(kpis.totalLiquidity, 8040000);
  // Active exposure = (2,160,000 - 560,000) + (1,080,000 - 80,000) = 1,600,000 + 1,000,000 = 2,600,000
  assert.equal(kpis.activeLoanExposure, 2600000);
  assert.equal(kpis.cashReserves, 5440000);
  assert.equal(kpis.exposureToLiquidityRatio, 32.3);
});

test('filterLoansByOverdueBucket partitions defaulters into 1-29, 30, 60, and 90+ buckets', () => {
  const sampleLoans = [
    { id: 'l1', status: 'overdue' as const, daysOverdue: 14 },
    { id: 'l2', status: 'overdue' as const, daysOverdue: 35 },
    { id: 'l3', status: 'overdue' as const, daysOverdue: 64 },
    { id: 'l4', status: 'overdue' as const, daysOverdue: 105 },
    { id: 'l5', status: 'active' as const, daysOverdue: 0 },
  ];

  assert.equal(filterLoansByOverdueBucket(sampleLoans, '1-29').length, 1);
  assert.equal(filterLoansByOverdueBucket(sampleLoans, '30').length, 1);
  assert.equal(filterLoansByOverdueBucket(sampleLoans, '60').length, 1);
  assert.equal(filterLoansByOverdueBucket(sampleLoans, '90+').length, 1);
});

test('buildCommunityLoanFeed strips all amounts and balances, returning only name and status', () => {
  const rawLoans = [
    {
      id: 'loan_1',
      memberName: 'Chukwudi Nwoye',
      status: 'active' as const,
      amountPaid: 450000,
      principal: 1500000,
      interest: 120000,
    },
    {
      id: 'loan_2',
      memberName: 'Boma Briggs',
      status: 'overdue' as const,
      amountPaid: 0,
      principal: 900000,
      interest: 72000,
    },
  ];

  const feed = buildCommunityLoanFeed(rawLoans);
  assert.equal(feed.length, 2);
  assert.deepEqual(Object.keys(feed[0]).sort(), ['id', 'name', 'status']);
  assert.equal(feed[0].status, 'Repaying');
  assert.equal(feed[1].status, 'Active');
  assert.equal('principal' in feed[0], false);
  assert.equal('amountPaid' in feed[0], false);
});

test('generateRepaymentSchedule produces bounded monthly installments', () => {
  const plan = generateRepaymentSchedule(1200000, 8, 6, '2026-11-01');
  assert.equal(plan.interest, 96000);
  assert.equal(plan.totalPayable, 1296000);
  assert.equal(plan.monthlyInstallment, 216000);
  assert.equal(plan.schedule.length, 6);
});

test('validateAndHashPin and verifyPinAgainstHash enforce 4-digit PIN and verify salted hash', () => {
  const badPin = validateAndHashPin('12a4', '12a4', 'uid_mem_01');
  assert.equal(badPin.valid, false);

  const mismatchPin = validateAndHashPin('5678', '5679', 'uid_mem_01');
  assert.equal(mismatchPin.valid, false);

  const validSetup = validateAndHashPin('2580', '2580', 'uid_mem_01');
  assert.equal(validSetup.valid, true);
  assert.ok(validSetup.pinHash?.startsWith('pbkdf2_sha256_'));

  assert.equal(
    verifyPinAgainstHash('2580', 'uid_mem_01', validSetup.pinHash!),
    true
  );
  assert.equal(
    verifyPinAgainstHash('1234', 'uid_mem_01', validSetup.pinHash!),
    false
  );
});

test('createFcmPushNotification routes upcoming_repayment, overdue_payment, and cooperative_announcement correctly', () => {
  const upcoming = createFcmPushNotification({
    recipientMemberId: 'mem_01',
    category: 'upcoming_repayment',
    title: 'Upcoming Loan Installment (Due in 3 Days)',
    body: 'Your installment of ₦324,000 is due on Dec 1, 2026.',
    amount: 324000,
  });
  assert.equal(upcoming.actionTab, 'loans');
  assert.equal(upcoming.read, false);

  const overdue = createFcmPushNotification({
    recipientMemberId: 'mem_05',
    category: 'overdue_payment',
    title: 'Overdue Loan & Contribution Alert',
    body: 'Your repayment of ₦684,000 is 14 days overdue.',
    amount: 684000,
  });
  assert.equal(overdue.actionTab, 'pay');

  const announcement = createFcmPushNotification({
    recipientMemberId: 'all',
    category: 'cooperative_announcement',
    title: 'Annual General Meeting — Port Harcourt',
    body: 'AGM holds on Nov 28 at GRA Phase 2 Secretariat.',
  });
  assert.equal(announcement.actionTab, 'home');
});

test('parseExcelRowsToSyncBatch and parseWordTextToSyncBatch parse contributions, loans, liquidity, and happenings', () => {
  const excelRows = [
    {
      Type: 'Contribution',
      MemberID: 'mem_01',
      MemberName: 'Chukwudi Nwoye',
      Month: '2026-11',
      Amount: '150,000',
      Description: 'November Bonus Thrift Contribution',
    },
    {
      Type: 'Liquidity',
      MemberID: 'all',
      MemberName: 'Treasury Pool',
      Month: '2026-11',
      Amount: 2500000,
      Description: 'Q4 Fixed Deposit Maturity Inflow',
    },
  ];
  const parsedExcel = parseExcelRowsToSyncBatch(excelRows, 'excel');
  assert.equal(parsedExcel.length, 2);
  assert.equal(parsedExcel[0].recordType, 'contribution');
  assert.equal(parsedExcel[0].memberId, 'mem_01');
  assert.equal(parsedExcel[0].amount, 150000);
  assert.equal(parsedExcel[1].recordType, 'liquidity');
  assert.equal(parsedExcel[1].amount, 2500000);

  const wordReport = `
    CONTRIBUTION | mem_01 | Chukwudi Nwoye | 2026-11 | 125000 | November Monthly Pledge Confirmed
    LOAN | mem_01 | Chukwudi Nwoye | 2026-11 | 324000 | Loan Installment #3 Settled via Bank Transfer
    HAPPENING | all | All Members | 2026-11 | 0 | Port Harcourt Cooperative Estate Phase 2 Allocation Open
  `;
  const parsedWord = parseWordTextToSyncBatch(wordReport);
  assert.equal(parsedWord.length, 3);
  assert.equal(parsedWord[0].recordType, 'contribution');
  assert.equal(parsedWord[1].recordType, 'loan');
  assert.equal(parsedWord[2].recordType, 'happening');
});

test('resolveSynchronizedDashboardFigures defaults all dashboards to 0 Naira until signed in and synchronizes when signed in', () => {
  const sampleMember = {
    totalSavings: 1250000,
    monthlyPledge: 125000,
    status: 'active' as const,
    contributionGrid: [
      { month: '2026-11', label: 'Nov 26', status: 'paid' as const, amount: 125000 },
    ],
  };
  const sampleLoans = [
    {
      principal: 1800000,
      interest: 144000,
      amountPaid: 648000,
      status: 'active' as const,
    },
  ];

  const loggedOutView = resolveSynchronizedDashboardFigures({
    isSignedIn: false,
    member: sampleMember,
    memberLoans: sampleLoans,
    allMembers: [sampleMember],
    allLoans: sampleLoans,
    extraLiquidityPool: 500000,
  });

  assert.equal(loggedOutView.memberSavings, 0);
  assert.equal(loggedOutView.memberPledge, 0);
  assert.equal(loggedOutView.remainingEligibleCredit, 0);
  assert.equal(loggedOutView.maxLoanAmount, 0);
  assert.equal(loggedOutView.currentExposure, 0);
  assert.equal(loggedOutView.totalLiquidity, 0);
  assert.equal(loggedOutView.activeLoanExposure, 0);
  assert.equal(loggedOutView.cashReserves, 0);
  assert.equal(loggedOutView.exposureToLiquidityRatio, 0);

  const loggedInView = resolveSynchronizedDashboardFigures({
    isSignedIn: true,
    member: sampleMember,
    memberLoans: sampleLoans,
    allMembers: [sampleMember],
    allLoans: sampleLoans,
    extraLiquidityPool: 500000,
  });

  assert.equal(loggedInView.memberSavings, 1250000);
  assert.equal(loggedInView.memberPledge, 125000);
  assert.equal(loggedInView.maxLoanAmount, 3750000);
  assert.equal(loggedInView.currentExposure, 1296000);
  assert.equal(loggedInView.remainingEligibleCredit, 2454000);
  assert.equal(loggedInView.totalLiquidity, 1750000);
  assert.equal(loggedInView.activeLoanExposure, 1296000);
  assert.equal(loggedInView.cashReserves, 454000);
});

test('verifyWhitelistedMemberAccess denies un-uploaded email/phone and grants Admin-uploaded members with Email OTP generation', () => {
  const whitelistedMembers = [
    {
      id: 'mem_01',
      name: 'Chukwudi Nwoye',
      email: 'chukwudi.nwoye@pisetcoop.org.ng',
      phone: '+234 803 481 9201',
      uploadedByAdmin: true,
    },
  ];

  // Unregistered person -> strictly denied
  const stranger = verifyWhitelistedMemberAccess(
    whitelistedMembers,
    'outsider@gmail.com',
    '+234 800 000 0000'
  );
  assert.equal(stranger.allowed, false);
  assert.match(
    stranger.error || '',
    /sole property of PISET COOPERATIVE SOCIETY PORT HARCOURT/
  );

  // Registered email but wrong phone -> strictly denied
  const wrongPhone = verifyWhitelistedMemberAccess(
    whitelistedMembers,
    'chukwudi.nwoye@pisetcoop.org.ng',
    '+234 809 999 9999'
  );
  assert.equal(wrongPhone.allowed, false);

  // Both email & phone uploaded by Admin (supports local 0803... or +234 803...) -> allowed
  const validAccess = verifyWhitelistedMemberAccess(
    whitelistedMembers,
    'CHUKWUDI.NWOYE@pisetcoop.org.ng',
    '08034819201'
  );
  assert.equal(validAccess.allowed, true);
  assert.equal(validAccess.member?.id, 'mem_01');

  const otp = generateEmailBindingOtp(
    'chukwudi.nwoye@pisetcoop.org.ng',
    '+234 803 481 9201'
  );
  assert.match(otp, /^[0-9]{6}$/);
});

test('validateMemberPasswordComplexity enforces uppercase, lowercase, and special signs', () => {
  // Missing uppercase
  assert.equal(validateMemberPasswordComplexity('piset@12345').valid, false);
  // Missing lowercase
  assert.equal(validateMemberPasswordComplexity('PISET@12345').valid, false);
  // Missing special sign
  assert.equal(validateMemberPasswordComplexity('Piset123456').valid, false);
  // Too short
  assert.equal(validateMemberPasswordComplexity('Pi@1').valid, false);
  // Mismatched confirmation
  assert.equal(
    validateMemberPasswordComplexity('PisetCoop@2026', 'PisetCoop#2026').valid,
    false
  );

  // Valid password with uppercase, lowercase, and special signs
  const valid = validateMemberPasswordComplexity(
    'PisetCoop@2026#',
    'PisetCoop@2026#'
  );
  assert.equal(valid.valid, true);
  assert.equal(valid.hasUppercase, true);
  assert.equal(valid.hasLowercase, true);
  assert.equal(valid.hasSpecialSign, true);
  assert.ok(valid.passwordHash?.startsWith('pwd_sha256_'));
});

test('verifyAdminPortalPassword enforces COOPERative357@# and validateAdminPasswordChange allows changing it once granted access', () => {
  assert.equal(DEFAULT_ADMIN_PORTAL_PASSWORD, 'COOPERative357@#');

  const wrongAttempt = verifyAdminPortalPassword('WrongPass123@#');
  assert.equal(wrongAttempt.allowed, false);

  const rightAttempt = verifyAdminPortalPassword('COOPERative357@#');
  assert.equal(rightAttempt.allowed, true);

  // Change password once granted access
  const weakNew = validateAdminPasswordChange(
    'COOPERative357@#',
    'COOPERative357@#',
    'weakpassword',
    'weakpassword'
  );
  assert.equal(weakNew.valid, false);

  const validChange = validateAdminPasswordChange(
    'COOPERative357@#',
    'COOPERative357@#',
    'NewAdminPortHarcourt@2026!',
    'NewAdminPortHarcourt@2026!'
  );
  assert.equal(validChange.valid, true);
  assert.equal(validChange.nextPassword, 'NewAdminPortHarcourt@2026!');

  // Subsequent login uses the updated password
  assert.equal(
    verifyAdminPortalPassword(
      'NewAdminPortHarcourt@2026!',
      validChange.nextPassword
    ).allowed,
    true
  );
});

test('resolvePortalTargetMember supports both dropdown selection and manual member input', () => {
  const sampleRoster = [
    {
      id: 'mem_01',
      name: 'Chukwudi Nwoye',
      email: 'chukwudi.nwoye@pisetcoop.org.ng',
      phone: '+234 803 481 9201',
    },
    {
      id: 'mem_04',
      name: 'Ngozi Okafor',
      email: 'ngozi.okafor@pisetcoop.org.ng',
      phone: '+234 805 112 3344',
    },
  ];

  // 1. Dropdown selection when manual input is empty
  const fromDropdown = resolvePortalTargetMember(sampleRoster, 'mem_04', '');
  assert.equal(fromDropdown.memberId, 'mem_04');
  assert.equal(fromDropdown.memberName, 'Ngozi Okafor');
  assert.equal(fromDropdown.isManualCustom, false);

  // 2. Manual input matching an existing member by name or ID
  const fromManualExisting = resolvePortalTargetMember(
    sampleRoster,
    'manual_input',
    'Chukwudi Nwoye'
  );
  assert.equal(fromManualExisting.memberId, 'mem_01');
  assert.equal(fromManualExisting.memberName, 'Chukwudi Nwoye');
  assert.equal(fromManualExisting.isManualCustom, false);

  // 3. Manual input with a custom/new member name
  const fromManualCustom = resolvePortalTargetMember(
    sampleRoster,
    'manual_input',
    'Chief Ebere Wike'
  );
  assert.equal(fromManualCustom.memberName, 'Chief Ebere Wike');
  assert.equal(fromManualCustom.isManualCustom, true);
  assert.ok(fromManualCustom.memberId.startsWith('mem_'));
});

test('ADMIN_EXECUTIVE_ROLES and resolveAdminExecutiveRole support switching across all 5 executive roles', () => {
  assert.equal(ADMIN_EXECUTIVE_ROLES.length, 5);
  assert.deepEqual(
    ADMIN_EXECUTIVE_ROLES.map((r) => r.roleTitle),
    [
      'PRESIDENT',
      'VICE PRESIDENT',
      'TREASURER',
      'FINANCIAL SECRETARY',
      'ADMINISTRATOR',
    ]
  );

  assert.equal(resolveAdminExecutiveRole('PRESIDENT').roleTitle, 'PRESIDENT');
  assert.equal(
    resolveAdminExecutiveRole('VICE PRESIDENT').roleTitle,
    'VICE PRESIDENT'
  );
  assert.equal(resolveAdminExecutiveRole('TRESURER').roleTitle, 'TREASURER');
  assert.equal(resolveAdminExecutiveRole('TREASURER').roleTitle, 'TREASURER');
  assert.equal(
    resolveAdminExecutiveRole('FINANCIAL SECRETARY').roleTitle,
    'FINANCIAL SECRETARY'
  );
  assert.equal(
    resolveAdminExecutiveRole('ADMINISTRATOR').roleTitle,
    'ADMINISTRATOR'
  );
});
