// Wakes the vendor for a new order with the dashboard closed.
//
// The server's push carries no payload (nothing to encrypt, no library
// needed), so this asks the server what's waiting — same origin, so the
// session cookie goes along — and says it. A push must always end in a
// notification, so a failed fetch still shows a generic one.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let body = 'وصلك طلب جديد — افتح اللوحة وشوفه.';
      try {
        const res = await fetch('/vendor/stats?days=1', { credentials: 'same-origin' });
        if (res.ok) {
          const data = await res.json();
          const waiting = data?.requests?.waiting ?? 0;
          if (waiting > 1) body = `عندك ${waiting} طلبات تنتظر ردك.`;
          else if (waiting === 1) body = 'عندك طلب ينتظر ردك.';
        }
      } catch {
        // offline or signed out: the generic line still gets them to look
      }
      await self.registration.showNotification('طلب جديد في ريكو', {
        body,
        tag: 'rico-new-order',
        renotify: true,
        dir: 'rtl',
        lang: 'ar',
        icon: '/favicon.svg',
      });
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const target = '/vendor/dashboard?tab=requests';
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const dashboard = open.find((c) => new URL(c.url).pathname.startsWith('/vendor/dashboard'));
      if (dashboard) {
        await dashboard.focus();
        return dashboard.navigate(target);
      }
      return self.clients.openWindow(target);
    })(),
  );
});
