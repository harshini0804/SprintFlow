import React, { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { notificationsApi } from '../../api/client'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const fetchNotifications = async () => {
    try {
      const res = await notificationsApi.list()
      setNotifications(res.data)
    } catch {
      // fail silently
    }
  }

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkAsRead = async () => {
    try {
      await notificationsApi.markAllRead()
      setNotifications([])
      setIsOpen(false)
    } catch {
      // fail silently
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-slate-800 focus:outline-none"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {notifications.length > 0 && (
          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
            {notifications.length > 9 ? '9+' : notifications.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 origin-top-right rounded-xl bg-white py-1 shadow-lg ring-1 ring-black/5 z-50">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
            <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
            {notifications.length > 0 && (
              <button
                onClick={handleMarkAsRead}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-500">
                You're all caught up!
              </div>
            ) : (
              notifications.map((notif: any) => (
                <Link
                  key={notif.id}
                  to={notif.action_link || '#'}
                  onClick={() => setIsOpen(false)}
                  className="block border-b border-slate-50 px-4 py-3 hover:bg-slate-50"
                >
                  <p className="text-sm text-slate-800">{notif.message}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {new Date(notif.created_at).toLocaleDateString()}
                  </p>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
