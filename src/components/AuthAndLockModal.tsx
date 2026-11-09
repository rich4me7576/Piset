import React, { useState } from 'react';
import {
  CheckCircle2,
  Fingerprint,
  KeyRound,
  Lock,
  Mail,
  Phone,
  ScanFace,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  UserCheck,
  X,
} from 'lucide-react';
import {
  enrollWebAuthnBiometric,
  verifyWebAuthnBiometricAssertion,
} from '../firebase';
import { MemberRecord } from '../data/seedData';
import {
  ADMIN_EXECUTIVE_ROLES,
  AdminExecutiveRole,
  BiometricCredentialRecord,
  generateEmailBindingOtp,
  validateAndHashPin,
  validateMemberPasswordComplexity,
  verifyMemberPassword,
  verifyPinAgainstHash,
  verifyWhitelistedMemberAccess,
} from '../utils/coopRules';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: MemberRecord[];
  activeMember: MemberRecord;
  biometricCredentials: Record<string, BiometricCredentialRecord>;
  onSelectMember: (member: MemberRecord) => void;
  onUpdateBiometricCredential: (record: BiometricCredentialRecord) => void;
  onBindAndCreateMemberPassword?: (
    memberId: string,
    passwordHash?: string
  ) => void;
  activeExecutiveRole?: AdminExecutiveRole;
  onSwitchExecutiveRole?: (role: AdminExecutiveRole) => void;
  onNotify: (msg: string) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  members,
  activeMember,
  biometricCredentials,
  onSelectMember,
  onUpdateBiometricCredential,
  onBindAndCreateMemberPassword,
  activeExecutiveRole = 'PRESIDENT',
  onSwitchExecutiveRole,
  onNotify,
}) => {
  const [authTab, setAuthTab] = useState<
    'email_otp' | 'password_login' | 'biometric' | 'role_switch'
  >('email_otp');

  // Whitelisted Email + Phone + Email OTP Mobile Binding state
  const [emailInput, setEmailInput] = useState(
    'chukwudi.nwoye@pisetcoop.org.ng'
  );
  const [phoneInput, setPhoneInput] = useState('+234 803 481 9201');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [dispatchedOtpCode, setDispatchedOtpCode] = useState('');
  const [enteredEmailOtp, setEnteredEmailOtp] = useState('');
  const [verifiedWhitelistedMember, setVerifiedWhitelistedMember] =
    useState<MemberRecord | null>(null);
  const [awaitingFirstPasswordSetup, setAwaitingFirstPasswordSetup] =
    useState(false);

  // First sign-in custom password creation state
  const [newMemberPassword, setNewMemberPassword] = useState('');
  const [confirmMemberPassword, setConfirmMemberPassword] = useState('');

  // Returning member password login state
  const [loginPasswordInput, setLoginPasswordInput] = useState('');

  // Biometric & PIN login state
  const [selectedBioMemberId, setSelectedBioMemberId] = useState<string>(
    activeMember.id
  );
  const [bioPinInput, setBioPinInput] = useState('1234');
  const [isVerifyingBio, setIsVerifyingBio] = useState(false);

  const [authError, setAuthError] = useState('');

  if (!isOpen) return null;

  const whitelistedMembers = members.filter(
    (m) => m.uploadedByAdmin !== false && m.status === 'active'
  );

  const targetBioMember =
    whitelistedMembers.find((m) => m.id === selectedBioMemberId) ||
    activeMember;
  const targetBioCred: BiometricCredentialRecord = biometricCredentials[
    targetBioMember.uid
  ] || {
    uid: targetBioMember.uid,
    memberId: targetBioMember.id,
    credentialId: `pk_default_${targetBioMember.id}`,
    modality: 'fingerprint',
    deviceLabel: 'Fingerprint / Face ID Passkey (WebAuthn)',
    pinHash:
      validateAndHashPin('1234', '1234', targetBioMember.uid).pinHash || '',
    biometricEnabled: true,
    pinEnabled: true,
    enrolledAt: new Date().toISOString(),
    lastVerifiedAt: new Date().toISOString(),
  };

  // Password complexity live indicators
  const hasUppercase = /[A-Z]/.test(newMemberPassword);
  const hasLowercase = /[a-z]/.test(newMemberPassword);
  const hasSpecialSign = /[^A-Za-z0-9\s]/.test(newMemberPassword);
  const hasMinLength = newMemberPassword.length >= 8;

  // Step 1: Verify Admin Whitelist (Email + Phone) & Send Email OTP for Mobile Binding
  const handleSendEmailBindingOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const accessCheck = verifyWhitelistedMemberAccess(
      members,
      emailInput,
      phoneInput
    );
    if (!accessCheck.allowed || !accessCheck.member) {
      setEmailOtpSent(false);
      setVerifiedWhitelistedMember(null);
      setAwaitingFirstPasswordSetup(false);
      setAuthError(
        accessCheck.error ||
          'Access Denied: This app is the sole property of PISET COOPERATIVE SOCIETY PORT HARCOURT. Your email and phone number have not been uploaded by the Admin.'
      );
      return;
    }

    const member = accessCheck.member;
    const otp =
      member.emailOtpCode ||
      generateEmailBindingOtp(member.email, member.phone);
    setVerifiedWhitelistedMember(member);
    setDispatchedOtpCode(otp);
    setEnteredEmailOtp(otp);
    setEmailOtpSent(true);
    onNotify(
      `Admin-whitelisted profile verified for ${member.name}. Email OTP (${otp}) sent to ${member.email} for mobile device binding.`
    );
  };

  // Step 2: Verify Email OTP & Bind Mobile Device -> Prompt First-Sign-In Password Creation
  const handleVerifyEmailBindingOtp = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const accessCheck = verifyWhitelistedMemberAccess(
      members,
      emailInput,
      phoneInput
    );
    if (!accessCheck.allowed || !accessCheck.member) {
      setAuthError(
        accessCheck.error ||
          'Access Denied: Your email and phone number have not been uploaded by the Admin.'
      );
      return;
    }

    const member = accessCheck.member;
    const expectedOtp =
      dispatchedOtpCode ||
      member.emailOtpCode ||
      generateEmailBindingOtp(member.email, member.phone);

    if (enteredEmailOtp.trim() !== expectedOtp.trim()) {
      setAuthError(
        `Invalid Email OTP code. Please enter the 6-digit OTP (${expectedOtp}) sent to ${member.email}.`
      );
      return;
    }

    setVerifiedWhitelistedMember(member);
    setAwaitingFirstPasswordSetup(true);
    onNotify(
      `Mobile device bound via Email OTP for ${member.name}. Please create your custom password (uppercase, lowercase, and special signs) to complete sign-in.`
    );
  };

  // Step 3: Create Custom Password After First Sign-In
  const handleCreateCustomPasswordAndSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!verifiedWhitelistedMember) {
      setAuthError('Please verify your Admin-uploaded email and phone first.');
      return;
    }

    const pwdCheck = validateMemberPasswordComplexity(
      newMemberPassword,
      confirmMemberPassword
    );
    if (!pwdCheck.valid || !pwdCheck.passwordHash) {
      setAuthError(
        pwdCheck.error ||
          'Password must include uppercase letters, lowercase letters, and special signs.'
      );
      return;
    }

    if (onBindAndCreateMemberPassword) {
      onBindAndCreateMemberPassword(
        verifiedWhitelistedMember.id,
        pwdCheck.passwordHash
      );
    }

    const updatedMember: MemberRecord = {
      ...verifiedWhitelistedMember,
      mobileBound: true,
      hasCreatedPassword: true,
      passwordHash: pwdCheck.passwordHash,
    };

    onSelectMember(updatedMember);
    onNotify(
      `Welcome back, ${updatedMember.name}! Mobile device bound and custom password created. Your dashboard is now synchronized.`
    );
    setAwaitingFirstPasswordSetup(false);
    setEmailOtpSent(false);
    setNewMemberPassword('');
    setConfirmMemberPassword('');
    onClose();
  };

  // Returning Member Login with Whitelisted Email + Phone + Custom Password
  const handlePasswordSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    const accessCheck = verifyWhitelistedMemberAccess(
      members,
      emailInput,
      phoneInput
    );
    if (!accessCheck.allowed || !accessCheck.member) {
      setAuthError(
        accessCheck.error ||
          'Access Denied: This app is the sole property of PISET COOPERATIVE SOCIETY PORT HARCOURT. Your email and phone number have not been uploaded by the Admin.'
      );
      return;
    }

    const member = accessCheck.member;

    if (!member.hasCreatedPassword || !member.passwordHash) {
      setAuthError(
        `${member.name} has not created a custom password yet. Use the "Email OTP & Mobile Binding" tab first to verify your Email OTP and create your password.`
      );
      return;
    }

    if (!verifyMemberPassword(loginPasswordInput, member.passwordHash)) {
      setAuthError(
        'Incorrect password. Please enter the custom password you created after your first sign-in.'
      );
      return;
    }

    onSelectMember(member);
    onNotify(
      `Signed in with custom password as ${member.name} (${member.role}).`
    );
    setLoginPasswordInput('');
    onClose();
  };

  const handleBiometricLogin = async (modality: 'fingerprint' | 'face_id') => {
    setAuthError('');
    if (!targetBioMember.uploadedByAdmin) {
      setAuthError(
        'Access Denied: Member email and phone number have not been uploaded by the Admin.'
      );
      return;
    }
    if (!targetBioCred || !targetBioCred.biometricEnabled) {
      setAuthError(
        `Biometric login is not enabled for ${targetBioMember.name}. Enroll Fingerprint/Face ID in Security Settings or use your 4-digit PIN.`
      );
      return;
    }
    setIsVerifyingBio(true);
    try {
      const res = await verifyWebAuthnBiometricAssertion({
        ...targetBioCred,
        modality,
      });
      if (res.verified) {
        onUpdateBiometricCredential({
          ...targetBioCred,
          lastVerifiedAt: new Date().toISOString(),
        });
        onSelectMember(targetBioMember);
        onNotify(
          `Authenticated via ${
            modality === 'face_id' ? 'Face ID' : 'Fingerprint'
          } (WebAuthn Passkey) as ${targetBioMember.name}.`
        );
        onClose();
      }
    } finally {
      setIsVerifyingBio(false);
    }
  };

  const handlePinLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    if (!targetBioMember.uploadedByAdmin) {
      setAuthError(
        'Access Denied: Member email and phone number have not been uploaded by the Admin.'
      );
      return;
    }
    if (!targetBioCred || !targetBioCred.pinEnabled) {
      setAuthError(
        `4-digit PIN login is not enabled for ${targetBioMember.name}.`
      );
      return;
    }
    const isValid = verifyPinAgainstHash(
      bioPinInput,
      targetBioMember.uid,
      targetBioCred.pinHash
    );
    if (!isValid) {
      setAuthError('Invalid 4-digit Cooperative PIN. Default PIN is 1234.');
      return;
    }
    onUpdateBiometricCredential({
      ...targetBioCred,
      lastVerifiedAt: new Date().toISOString(),
    });
    setBioPinInput('');
    onSelectMember(targetBioMember);
    onNotify(
      `Authenticated via 4-digit Cooperative PIN as ${targetBioMember.name}.`
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-heading"
    >
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl my-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2
              id="auth-modal-heading"
              className="text-lg font-bold text-slate-900"
            >
              Whitelisted Member Sign-In & Mobile Binding
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Sole Property of PISET COOPERATIVE SOCIETY PORT HARCOURT — Only
              Admin-uploaded emails &amp; phone numbers are permitted
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close sign in modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Strict Whitelist Notice Banner */}
        <div className="mt-3 rounded-xl border border-emerald-800/20 bg-emerald-950/5 px-3.5 py-2.5 text-[11px] text-slate-700 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-800 shrink-0 mt-0.5" />
          <div>
            <strong className="text-emerald-950">
              Strict Cooperative Access Policy:
            </strong>{' '}
            Your email and phone number must be uploaded by the Admin first. An
            OTP is sent to your email for mobile binding, followed by custom
            password creation.
          </div>
        </div>

        {/* Segmented Auth Method Selector */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1">
          <button
            type="button"
            data-testid="auth-tab-email-otp"
            onClick={() => {
              setAuthTab('email_otp');
              setAuthError('');
            }}
            className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              authTab === 'email_otp'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Email OTP &amp; Bind
          </button>
          <button
            type="button"
            data-testid="auth-tab-password"
            onClick={() => {
              setAuthTab('password_login');
              setAuthError('');
            }}
            className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              authTab === 'password_login'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Password Login
          </button>
          <button
            type="button"
            data-testid="auth-tab-biometric"
            onClick={() => {
              setAuthTab('biometric');
              setAuthError('');
            }}
            className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              authTab === 'biometric'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Biometric / PIN
          </button>
          <button
            type="button"
            data-testid="auth-tab-role-switch"
            onClick={() => {
              setAuthTab('role_switch');
              setAuthError('');
            }}
            className={`min-h-[42px] rounded-lg px-2 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              authTab === 'role_switch'
                ? 'bg-white text-emerald-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Switch Role
          </button>
        </div>

        {authError && (
          <div
            data-testid="auth-error-banner"
            className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800 flex items-start gap-2"
          >
            <ShieldAlert className="h-4 w-4 text-red-700 shrink-0 mt-0.5" />
            <span>{authError}</span>
          </div>
        )}

        {/* TAB 1: ADMIN-WHITELISTED EMAIL + PHONE -> EMAIL OTP FOR MOBILE BINDING -> FIRST SIGN-IN CUSTOM PASSWORD */}
        {authTab === 'email_otp' && (
          <div className="mt-4 space-y-4">
            {!awaitingFirstPasswordSetup ? (
              <form
                onSubmit={
                  emailOtpSent
                    ? handleVerifyEmailBindingOtp
                    : handleSendEmailBindingOtp
                }
                className="space-y-3.5"
              >
                <div>
                  <label
                    htmlFor="auth-whitelist-email"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Admin-Uploaded Cooperative Email Address
                  </label>
                  <div className="relative mt-1">
                    <Mail className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                    <input
                      id="auth-whitelist-email"
                      data-testid="auth-whitelist-email-input"
                      type="email"
                      value={emailInput}
                      onChange={(e) => {
                        setEmailInput(e.target.value);
                        setEmailOtpSent(false);
                      }}
                      placeholder="member@pisetcoop.org.ng"
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 focus:border-emerald-800 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="auth-whitelist-phone"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Admin-Uploaded Nigerian Phone Number
                  </label>
                  <div className="relative mt-1">
                    <Phone className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-slate-400" />
                    <input
                      id="auth-whitelist-phone"
                      data-testid="auth-whitelist-phone-input"
                      type="tel"
                      value={phoneInput}
                      onChange={(e) => {
                        setPhoneInput(e.target.value);
                        setEmailOtpSent(false);
                      }}
                      placeholder="+234 803 481 9201"
                      className="w-full min-h-[44px] rounded-xl border border-slate-300 bg-white py-2.5 pr-4 pl-10 text-sm text-slate-900 focus:border-emerald-800 focus:outline-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Whitelisted demo: chukwudi.nwoye@pisetcoop.org.ng &amp; +234
                    803 481 9201
                  </p>
                </div>

                {emailOtpSent && verifiedWhitelistedMember && (
                  <div className="rounded-2xl border border-emerald-800/30 bg-emerald-950/5 p-3.5 space-y-2.5">
                    <div
                      data-testid="dispatched-email-otp-banner"
                      className="flex items-start gap-2 text-xs text-emerald-950"
                    >
                      <Smartphone className="h-4 w-4 text-emerald-800 shrink-0 mt-0.5" />
                      <div>
                        <strong>Email OTP Dispatched for Mobile Binding:</strong>{' '}
                        A 6-digit OTP{' '}
                        <span className="font-mono font-bold text-emerald-900 underline">
                          {dispatchedOtpCode}
                        </span>{' '}
                        was generated and sent to{' '}
                        <span className="font-semibold">
                          {verifiedWhitelistedMember.email}
                        </span>
                        .
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="email-otp-code-input"
                        className="block text-xs font-semibold text-slate-700"
                      >
                        Enter 6-Digit Email OTP for Mobile Device Binding
                      </label>
                      <input
                        id="email-otp-code-input"
                        data-testid="email-otp-code-input"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        value={enteredEmailOtp}
                        onChange={(e) => setEnteredEmailOtp(e.target.value)}
                        className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-base font-bold tracking-widest text-slate-900 focus:border-emerald-800 focus:outline-none"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  {!emailOtpSent ? (
                    <button
                      type="submit"
                      data-testid="send-email-otp-btn"
                      className="w-full min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
                    >
                      Verify Whitelist &amp; Send Email OTP for Mobile Binding
                    </button>
                  ) : (
                    <>
                      <button
                        type="submit"
                        data-testid="verify-email-otp-btn"
                        className="flex-1 min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
                      >
                        Verify Email OTP &amp; Bind Mobile Device
                      </button>
                      <button
                        type="button"
                        onClick={() => setEmailOtpSent(false)}
                        className="min-h-[44px] rounded-xl border border-slate-300 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Change Email
                      </button>
                    </>
                  )}
                </div>
              </form>
            ) : (
              /* STEP 3: FIRST SIGN-IN CUSTOM PASSWORD CREATION */
              <form
                onSubmit={handleCreateCustomPasswordAndSignIn}
                data-testid="first-signin-password-setup"
                className="rounded-2xl border border-emerald-800/30 bg-emerald-950/5 p-4 space-y-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                      Step 2 of 2 · Mobile Device Bound via Email OTP
                    </span>
                    <h3 className="text-sm font-bold text-slate-900">
                      Create Your Personal Cooperative Password
                    </h3>
                    <p className="text-xs text-slate-600">
                      Welcome,{' '}
                      <strong>{verifiedWhitelistedMember?.name}</strong>! Create
                      your custom password with uppercase, lowercase, and
                      special signs.
                    </p>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="member-first-password"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Create New Password
                  </label>
                  <input
                    id="member-first-password"
                    data-testid="member-new-password-input"
                    type="password"
                    value={newMemberPassword}
                    onChange={(e) => setNewMemberPassword(e.target.value)}
                    placeholder="e.g. PisetMember2026@#"
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="member-first-password-confirm"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Confirm New Password
                  </label>
                  <input
                    id="member-first-password-confirm"
                    data-testid="member-confirm-password-input"
                    type="password"
                    value={confirmMemberPassword}
                    onChange={(e) => setConfirmMemberPassword(e.target.value)}
                    placeholder="Re-enter password"
                    className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900 focus:border-emerald-800 focus:outline-none"
                  />
                </div>

                {/* Complexity Requirements Checklist */}
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div
                    className={`flex items-center gap-1.5 font-semibold ${
                      hasUppercase ? 'text-emerald-800' : 'text-slate-500'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Uppercase letter (A–Z)</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 font-semibold ${
                      hasLowercase ? 'text-emerald-800' : 'text-slate-500'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Lowercase letter (a–z)</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 font-semibold ${
                      hasSpecialSign ? 'text-emerald-800' : 'text-slate-500'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>Special sign (@#$!%)</span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 font-semibold ${
                      hasMinLength ? 'text-emerald-800' : 'text-slate-500'
                    }`}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                    <span>At least 8 characters</span>
                  </div>
                </div>

                <button
                  type="submit"
                  data-testid="save-member-password-btn"
                  className="w-full min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
                >
                  Save Custom Password &amp; Sign In
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 2: RETURNING MEMBER PASSWORD LOGIN */}
        {authTab === 'password_login' && (
          <form onSubmit={handlePasswordSignIn} className="mt-4 space-y-3.5">
            <div>
              <label
                htmlFor="pwd-login-email"
                className="block text-xs font-semibold text-slate-700"
              >
                Admin-Uploaded Email Address
              </label>
              <input
                id="pwd-login-email"
                data-testid="pwd-login-email-input"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="pwd-login-phone"
                className="block text-xs font-semibold text-slate-700"
              >
                Admin-Uploaded Phone Number
              </label>
              <input
                id="pwd-login-phone"
                data-testid="pwd-login-phone-input"
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="pwd-login-password"
                className="block text-xs font-semibold text-slate-700"
              >
                Member Custom Password
              </label>
              <input
                id="pwd-login-password"
                data-testid="pwd-login-password-input"
                type="password"
                value={loginPasswordInput}
                onChange={(e) => setLoginPasswordInput(e.target.value)}
                placeholder="Enter your custom password"
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm text-slate-900"
              />
            </div>
            <button
              type="submit"
              data-testid="pwd-login-submit-btn"
              className="w-full min-h-[44px] rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 transition-colors"
            >
              Sign In with Custom Password
            </button>
          </form>
        )}

        {/* TAB 3: BIOMETRIC (FINGERPRINT / FACE ID) & PIN LOGIN */}
        {authTab === 'biometric' && (
          <div className="mt-4 space-y-4">
            <div>
              <label
                htmlFor="bio-member-select"
                className="block text-xs font-semibold text-slate-700"
              >
                Admin-Whitelisted Cooperative Account
              </label>
              <select
                id="bio-member-select"
                value={selectedBioMemberId}
                onChange={(e) => setSelectedBioMemberId(e.target.value)}
                className="mt-1.5 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-900"
              >
                {whitelistedMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>

            {/* Fingerprint & Face ID Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                disabled={isVerifyingBio}
                onClick={() => handleBiometricLogin('fingerprint')}
                className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-emerald-800/30 bg-emerald-950/5 p-3.5 text-left hover:bg-emerald-950/10 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-amber-300">
                  <Fingerprint className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Sign In with Fingerprint
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Touch ID / Biometric Passkey
                  </div>
                </div>
              </button>

              <button
                type="button"
                disabled={isVerifyingBio}
                onClick={() => handleBiometricLogin('face_id')}
                className="flex min-h-[56px] items-center gap-3 rounded-2xl border border-emerald-800/30 bg-emerald-950/5 p-3.5 text-left hover:bg-emerald-950/10 transition-colors"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-amber-300">
                  <ScanFace className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900">
                    Sign In with Face ID
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Platform Face Passkey
                  </div>
                </div>
              </button>
            </div>

            {/* 4-Digit PIN Login Alternative */}
            <form
              onSubmit={handlePinLogin}
              className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <label
                  htmlFor="bio-pin-login-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Or Sign In with 4-Digit Cooperative PIN
                </label>
                <span className="font-mono text-[11px] text-slate-500">
                  Default PIN: 1234
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  id="bio-pin-login-input"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={bioPinInput}
                  onChange={(e) => setBioPinInput(e.target.value)}
                  placeholder="••••"
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2 font-mono text-base tracking-widest text-slate-900"
                />
                <button
                  type="submit"
                  className="min-h-[44px] rounded-xl bg-emerald-900 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-800 whitespace-nowrap"
                >
                  Verify PIN
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 4: ROLE SWITCHER */}
        {authTab === 'role_switch' && (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-600">
              After signing in, switch Admin Executive Roles across{' '}
              <strong>1) PRESIDENT</strong>, <strong>2) VICE PRESIDENT</strong>,{' '}
              <strong>3) TREASURER</strong>,{' '}
              <strong>4) FINANCIAL SECRETARY</strong>, and{' '}
              <strong>5) ADMINISTRATOR</strong>:
            </p>
            <div className="space-y-2">
              {ADMIN_EXECUTIVE_ROLES.map((execRole) => {
                const matchedMem =
                  members.find((m) => m.id === execRole.memberId) || members[1];
                const isSelected =
                  activeExecutiveRole === execRole.roleTitle &&
                  activeMember.id === matchedMem.id;
                return (
                  <button
                    key={execRole.roleTitle}
                    type="button"
                    data-testid={`modal-role-switch-${execRole.roleTitle}`}
                    onClick={() => {
                      if (onSwitchExecutiveRole) {
                        onSwitchExecutiveRole(execRole.roleTitle);
                      } else {
                        onSelectMember({
                          ...matchedMem,
                          role: execRole.systemRole,
                        });
                      }
                      onClose();
                    }}
                    className={`flex w-full min-h-[50px] items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                      isSelected
                        ? 'border-emerald-800 bg-emerald-950/5'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                          {execRole.numberedLabel}
                        </span>
                        <span className="text-xs text-slate-400">·</span>
                        <span className="text-sm font-bold text-slate-900">
                          {matchedMem.name}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {execRole.department} · {matchedMem.email}
                      </p>
                    </div>
                    <UserCheck
                      className={`h-5 w-5 shrink-0 ${
                        isSelected ? 'text-emerald-800' : 'text-slate-300'
                      }`}
                    />
                  </button>
                );
              })}

              {/* Standard Cooperative Member View Option */}
              {members[0] && (
                <button
                  type="button"
                  onClick={() => {
                    onSelectMember(members[0]);
                    onNotify(
                      `Switched active account to ${members[0].name} (MEMBER).`
                    );
                    onClose();
                  }}
                  className={`flex w-full min-h-[50px] items-center justify-between rounded-xl border p-3 text-left transition-colors ${
                    activeMember.id === members[0].id
                      ? 'border-emerald-800 bg-emerald-950/5'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                        MEMBER ACCOUNT
                      </span>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-sm font-bold text-slate-900">
                        {members[0].name}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {members[0].department} · {members[0].email}
                    </p>
                  </div>
                  <UserCheck
                    className={`h-5 w-5 shrink-0 ${
                      activeMember.id === members[0].id
                        ? 'text-emerald-800'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface BiometricSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: MemberRecord;
  credential: BiometricCredentialRecord;
  onSaveCredential: (updated: BiometricCredentialRecord) => void;
  onBindAndCreateMemberPassword?: (
    memberId: string,
    passwordHash?: string
  ) => void;
  onNotify: (msg: string) => void;
}

export const BiometricSetupModal: React.FC<BiometricSetupModalProps> = ({
  isOpen,
  onClose,
  member,
  credential,
  onSaveCredential,
  onBindAndCreateMemberPassword,
  onNotify,
}) => {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [customPassword, setCustomPassword] = useState('');
  const [confirmCustomPassword, setConfirmCustomPassword] = useState('');
  const [selectedModality, setSelectedModality] = useState<
    'fingerprint' | 'face_id'
  >(credential.modality === 'face_id' ? 'face_id' : 'fingerprint');
  const [setupError, setSetupError] = useState('');
  const [isEnrolling, setIsEnrolling] = useState(false);

  if (!isOpen) return null;

  const handleEnrollBiometric = async () => {
    setSetupError('');
    setIsEnrolling(true);
    try {
      const enrolled = await enrollWebAuthnBiometric({
        uid: member.uid,
        memberId: member.id,
        memberName: member.name,
        memberEmail: member.email,
        modality: selectedModality,
        pinHash: credential.pinHash,
      });

      const nowIso = new Date().toISOString();
      const updated: BiometricCredentialRecord = {
        ...credential,
        credentialId: enrolled.credentialId,
        modality: selectedModality,
        deviceLabel: enrolled.deviceLabel,
        biometricEnabled: true,
        enrolledAt: nowIso,
        lastVerifiedAt: nowIso,
      };
      onSaveCredential(updated);
      onNotify(
        `Enrolled ${
          selectedModality === 'face_id' ? 'Face ID' : 'Fingerprint'
        } WebAuthn Passkey (${enrolled.credentialId.slice(0, 18)}...) for ${
          member.name
        }.`
      );
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleUpdatePin = (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');
    const result = validateAndHashPin(newPin, confirmPin, member.uid);
    if (!result.valid || !result.pinHash) {
      setSetupError(result.error || 'Invalid PIN.');
      return;
    }
    const nowIso = new Date().toISOString();
    const updated: BiometricCredentialRecord = {
      ...credential,
      pinHash: result.pinHash,
      pinEnabled: true,
      lastVerifiedAt: nowIso,
    };
    onSaveCredential(updated);
    setNewPin('');
    setConfirmPin('');
    onNotify(`Updated 4-digit Cooperative PIN for ${member.name}.`);
  };

  const handleUpdateCustomPassword = (e: React.FormEvent) => {
    e.preventDefault();
    setSetupError('');
    const check = validateMemberPasswordComplexity(
      customPassword,
      confirmCustomPassword
    );
    if (!check.valid || !check.passwordHash) {
      setSetupError(
        check.error ||
          'Password must contain uppercase, lowercase, and special signs.'
      );
      return;
    }
    if (onBindAndCreateMemberPassword) {
      onBindAndCreateMemberPassword(member.id, check.passwordHash);
    }
    setCustomPassword('');
    setConfirmCustomPassword('');
    onNotify(
      `Saved custom cooperative password (uppercase, lowercase, and special signs) for ${member.name}.`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="biometric-setup-heading"
    >
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl space-y-5 my-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2
              id="biometric-setup-heading"
              className="text-lg font-bold text-slate-900"
            >
              Biometric, PIN &amp; Custom Password Settings
            </h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Configure Fingerprint, Face ID, 4-digit PIN, and your custom
              password for {member.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close biometric settings modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {setupError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800">
            {setupError}
          </div>
        )}

        {/* Section 1: Create / Update Custom Member Password */}
        <form
          onSubmit={handleUpdateCustomPassword}
          className="rounded-2xl border border-emerald-800/20 bg-emerald-950/5 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <KeyRound className="h-4 w-4 text-emerald-800" />
                <span>Member Custom Password</span>
              </h3>
              <p className="text-xs text-slate-600">
                Requires uppercase, lowercase, and special signs (e.g. @#$!%)
              </p>
            </div>
            <span className="text-[11px] font-bold text-emerald-800">
              {member.hasCreatedPassword ? 'Password Active' : 'Not Set Yet'}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="modal-custom-pwd"
                className="block text-xs font-semibold text-slate-700"
              >
                New Password
              </label>
              <input
                id="modal-custom-pwd"
                type="password"
                value={customPassword}
                onChange={(e) => setCustomPassword(e.target.value)}
                placeholder="e.g. PisetCoop2026@#"
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="modal-confirm-custom-pwd"
                className="block text-xs font-semibold text-slate-700"
              >
                Confirm Password
              </label>
              <input
                id="modal-confirm-custom-pwd"
                type="password"
                value={confirmCustomPassword}
                onChange={(e) => setConfirmCustomPassword(e.target.value)}
                placeholder="Re-enter password"
                className="mt-1 w-full min-h-[40px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="min-h-[40px] rounded-xl bg-emerald-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
            >
              Save Custom Password
            </button>
          </div>
        </form>

        {/* Section 2: Fingerprint & Face ID Enrollment */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Fingerprint &amp; Face ID Login
              </h3>
              <p className="text-xs text-slate-500">
                Status:{' '}
                <strong className="text-emerald-800">
                  {credential.biometricEnabled
                    ? `Enabled (${credential.deviceLabel})`
                    : 'Disabled'}
                </strong>
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                onSaveCredential({
                  ...credential,
                  biometricEnabled: !credential.biometricEnabled,
                })
              }
              className={`min-h-[38px] rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                credential.biometricEnabled
                  ? 'bg-emerald-900 text-white'
                  : 'border border-slate-300 bg-white text-slate-700'
              }`}
            >
              {credential.biometricEnabled ? 'Active' : 'Enable'}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setSelectedModality('fingerprint')}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                selectedModality === 'fingerprint'
                  ? 'border-emerald-800 bg-white text-emerald-950 shadow-xs'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <Fingerprint className="h-4 w-4" />
              <span>Fingerprint (Touch ID)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedModality('face_id')}
              className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                selectedModality === 'face_id'
                  ? 'border-emerald-800 bg-white text-emerald-950 shadow-xs'
                  : 'border-slate-200 text-slate-600'
              }`}
            >
              <ScanFace className="h-4 w-4" />
              <span>Face ID</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="font-mono text-[11px] text-slate-500 truncate max-w-[220px]">
              ID: {credential.credentialId}
            </span>
            <button
              type="button"
              disabled={isEnrolling}
              onClick={handleEnrollBiometric}
              className="min-h-[40px] rounded-xl bg-emerald-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-800"
            >
              {isEnrolling
                ? 'Enrolling...'
                : `Enroll ${
                    selectedModality === 'face_id' ? 'Face ID' : 'Fingerprint'
                  } Passkey`}
            </button>
          </div>
        </div>

        {/* Section 3: Set / Change 4-Digit Cooperative PIN */}
        <form onSubmit={handleUpdatePin} className="space-y-3">
          <h3 className="text-sm font-bold text-slate-900">
            Set Up or Change 4-Digit Cooperative PIN
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-pin-input"
                className="block text-xs font-semibold text-slate-700"
              >
                New 4-Digit PIN
              </label>
              <input
                id="new-pin-input"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder="e.g. 2580"
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-base tracking-widest text-slate-900"
              />
            </div>
            <div>
              <label
                htmlFor="confirm-pin-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Confirm 4-Digit PIN
              </label>
              <input
                id="confirm-pin-input"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value)}
                placeholder="Re-enter PIN"
                className="mt-1 w-full min-h-[44px] rounded-xl border border-slate-300 bg-white px-3.5 py-2 font-mono text-base tracking-widest text-slate-900"
              />
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-[11px] text-slate-500">
              Salted digest synced to Firestore `/biometricCredentials/
              {member.uid}`
            </span>
            <button
              type="submit"
              className="min-h-[44px] rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              Save New PIN
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PinLockOverlayProps {
  isLocked: boolean;
  memberUid: string;
  memberName: string;
  credential: BiometricCredentialRecord;
  onUnlock: (methodUsed: string) => void;
}

export const PinLockOverlay: React.FC<PinLockOverlayProps> = ({
  isLocked,
  memberUid,
  memberName,
  credential,
  onUnlock,
}) => {
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState('');

  if (!isLocked) return null;

  const handleDigit = (digit: string) => {
    setPinError('');
    const next = (enteredPin + digit).slice(0, 4);
    setEnteredPin(next);
    if (next.length === 4) {
      if (verifyPinAgainstHash(next, memberUid, credential.pinHash)) {
        setEnteredPin('');
        onUnlock('4-Digit Cooperative PIN');
      } else {
        setPinError('Incorrect 4-digit cooperative PIN.');
        setEnteredPin('');
      }
    }
  };

  const handleBiometricUnlock = async () => {
    setPinError('');
    if (!credential.biometricEnabled) {
      setPinError('Biometric login is currently disabled in settings.');
      return;
    }
    const res = await verifyWebAuthnBiometricAssertion(credential);
    if (res.verified) {
      setEnteredPin('');
      onUnlock(res.methodUsed);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/95 p-4 text-white backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pin-lock-heading"
    >
      <div className="w-full max-w-sm rounded-3xl border border-emerald-800/50 bg-emerald-900/60 p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-800/80 text-amber-300">
          <Lock className="h-6 w-6" />
        </div>
        <h2 id="pin-lock-heading" className="mt-4 text-xl font-bold">
          Member Privacy Lock
        </h2>
        <p className="mt-1 text-xs text-emerald-200">
          {memberName} · Enter 4-digit PIN or use{' '}
          {credential.modality === 'face_id' ? 'Face ID' : 'Fingerprint'}
        </p>

        {/* PIN Indicators */}
        <div className="my-6 flex justify-center gap-4">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`h-3.5 w-3.5 rounded-full border transition-all ${
                enteredPin.length > idx
                  ? 'border-amber-300 bg-amber-300 scale-110'
                  : 'border-emerald-400/50 bg-transparent'
              }`}
            />
          ))}
        </div>

        {pinError && (
          <p className="mb-4 rounded-xl bg-red-950/60 px-3 py-2 text-xs text-red-200">
            {pinError}
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="min-h-[52px] rounded-2xl border border-emerald-700/50 bg-emerald-950/40 font-mono text-lg font-bold text-white hover:bg-emerald-800/60 active:scale-95 transition-all"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleBiometricUnlock}
            className="flex min-h-[52px] flex-col items-center justify-center rounded-2xl border border-amber-400/40 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20"
            aria-label="Unlock with Biometrics"
          >
            {credential.modality === 'face_id' ? (
              <ScanFace className="h-5 w-5" />
            ) : (
              <Fingerprint className="h-5 w-5" />
            )}
            <span className="mt-0.5 text-[10px] font-semibold">
              {credential.modality === 'face_id' ? 'Face ID' : 'Fingerprint'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="min-h-[52px] rounded-2xl border border-emerald-700/50 bg-emerald-950/40 font-mono text-lg font-bold text-white hover:bg-emerald-800/60"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => setEnteredPin((prev) => prev.slice(0, -1))}
            className="min-h-[52px] rounded-2xl border border-emerald-700/50 bg-emerald-950/40 text-xs font-semibold text-emerald-200 hover:bg-emerald-800/60"
          >
            Clear
          </button>
        </div>

        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-emerald-300/80">
          <ShieldCheck className="h-3.5 w-3.5" />
          <span>Protected by Firebase Auth &amp; WebAuthn Passkey</span>
        </div>
      </div>
    </div>
  );
};
