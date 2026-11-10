import React, { useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  Megaphone,
  Send,
  ShieldCheck,
  X,
} from 'lucide-react';
import {
  PushNotificationCategory,
  PushNotificationItem,
  formatNaira,
} from '../utils/coopRules';

interface PushNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  memberId: string;
  memberName: string;
  notifications: PushNotificationItem[];
  fcmToken: string;
  fcmEnabled: boolean;
  onEnableFcm: () => void;
  onMarkAsRead: (notificationId: string) => void;
  onMarkAllRead: () => void;
  onTriggerTestPush: (category: PushNotificationCategory) => void;
  onNavigateTab: (tab: 'home' | 'pay' | 'loans' | 'statistics' | 'community') => void;
}

export const PushNotificationsModal: React.FC<PushNotificationsModalProps> = ({
  isOpen,
  onClose,
  memberId,
  memberName,
  notifications,
  fcmToken,
  fcmEnabled,
  onEnableFcm,
  onMarkAsRead,
  onMarkAllRead,
  onTriggerTestPush,
  onNavigateTab,
}) => {
  const [activeFilter, setActiveFilter] = useState<
    'all' | PushNotificationCategory
  >('all');

  if (!isOpen) return null;

  const memberNotifications = notifications.filter(
    (n) => n.recipientMemberId === 'all' || n.recipientMemberId === memberId
  );

  const filteredList = memberNotifications.filter((n) =>
    activeFilter === 'all' ? true : n.category === activeFilter
  );

  const unreadCount = memberNotifications.filter((n) => !n.read).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fcm-modal-heading"
    >
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-emerald-800" />
              <h2
                id="fcm-modal-heading"
                className="text-lg font-bold text-slate-900"
              >
                Firebase Cloud Messaging (FCM) Push Center
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-600">
              Real-time push alerts for {memberName}: upcoming repayments (3d
              before due), overdue payments, and cooperative announcements.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            aria-label="Close notifications modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* FCM Device Registration Status & Test Push Controls */}
        <div className="mt-4 rounded-2xl border border-emerald-800/20 bg-emerald-950/5 p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-950">
              <ShieldCheck className="h-4 w-4 text-emerald-800" />
              <span>
                FCM Delivery Status:{' '}
                {fcmEnabled ? 'Subscribed & Active' : 'Permission Pending'}
              </span>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-slate-500 truncate max-w-md">
              Token: {fcmToken}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!fcmEnabled && (
              <button
                type="button"
                onClick={onEnableFcm}
                className="min-h-[38px] rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
              >
                Enable Push Permission
              </button>
            )}
            <button
              type="button"
              onClick={() => onTriggerTestPush('upcoming_repayment')}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Simulate 3d Pre-Due Push
            </button>
            <button
              type="button"
              onClick={() => onTriggerTestPush('overdue_payment')}
              className="min-h-[38px] rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Simulate Overdue Push
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div
            className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1"
            role="tablist"
            aria-label="Notification categories"
          >
            {(
              [
                { id: 'all', label: `All (${memberNotifications.length})` },
                { id: 'upcoming_repayment', label: 'Upcoming Repayments (3d)' },
                { id: 'overdue_payment', label: 'Overdue Alerts' },
                {
                  id: 'cooperative_announcement',
                  label: 'Announcements',
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeFilter === tab.id}
                onClick={() => setActiveFilter(tab.id)}
                className={`min-h-[38px] rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeFilter === tab.id
                    ? 'bg-white text-emerald-950 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
            >
              <CheckCheck className="h-4 w-4" />
              <span>Mark all read ({unreadCount})</span>
            </button>
          )}
        </div>

        {/* Notifications List */}
        <div className="mt-4 flex-1 overflow-y-auto divide-y divide-slate-100 pr-1">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center">
              <Bell className="mx-auto h-8 w-8 text-slate-300" />
              <p className="mt-2 text-sm font-medium text-slate-700">
                No push notifications in this category.
              </p>
            </div>
          ) : (
            filteredList.map((item) => {
              const isUpcoming = item.category === 'upcoming_repayment';
              const isOverdue = item.category === 'overdue_payment';
              return (
                <div
                  key={item.id}
                  className={`py-4 px-3 rounded-2xl transition-colors ${
                    item.read ? 'bg-white' : 'bg-emerald-950/[0.03]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                          isOverdue
                            ? 'bg-red-50 text-red-700'
                            : isUpcoming
                            ? 'bg-amber-50 text-amber-800'
                            : 'bg-emerald-50 text-emerald-800'
                        }`}
                      >
                        {isOverdue ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : isUpcoming ? (
                          <CalendarClock className="h-4 w-4" />
                        ) : (
                          <Megaphone className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {item.title}
                          </span>
                          {!item.read && (
                            <span className="text-[11px] font-bold text-emerald-800">
                              · Unread
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                          {item.body}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                          <span className="font-mono">
                            FCM ID: {item.fcmMessageId}
                          </span>
                          <span>·</span>
                          <span>
                            {new Date(item.createdAt).toLocaleString()}
                          </span>
                          {item.amount && (
                            <>
                              <span>·</span>
                              <span className="font-mono font-semibold text-slate-700">
                                {formatNaira(item.amount)}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {item.actionTab && (
                        <button
                          type="button"
                          onClick={() => {
                            onMarkAsRead(item.id);
                            onNavigateTab(item.actionTab!);
                            onClose();
                          }}
                          className="min-h-[36px] rounded-xl bg-emerald-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap"
                        >
                          {isOverdue
                            ? 'Pay Arrears'
                            : isUpcoming
                            ? 'View Schedule'
                            : 'Open'}
                        </button>
                      )}
                      {!item.read && (
                        <button
                          type="button"
                          onClick={() => onMarkAsRead(item.id)}
                          className="text-[11px] font-semibold text-slate-500 hover:text-slate-800"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
