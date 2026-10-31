import type { Metadata } from 'next';
import './globals.css';
import ShellLayout from '../components/ShellLayout';
import NetworkStatusBar from '../components/NetworkStatusBar';

export const metadata: Metadata = {
  title: 'dentOS — Zamonaviy Stomatologiya Klinikasi Boshqaruv Tizimi | Dental Cloud CRM',
  description: 'dentOS — zamonaviy stomatologiya klinikalari uchun professional bulutli boshqaruv tizimi: Qabullar (zapis), 32-tish formulasi, rentgen va 3D skanlar arxivi, moliya va shifokor foizlari, zubnoy texnik laboratoriyasi.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined') {
                window.addEventListener('error', function(e) {
                  var isExt = (e.filename && e.filename.indexOf('chrome-extension://') !== -1) ||
                              (e.error && e.error.stack && e.error.stack.indexOf('chrome-extension://') !== -1);
                  if (isExt) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);
                window.addEventListener('unhandledrejection', function(e) {
                  var reason = (e.reason && (e.reason.stack || e.reason.message || String(e.reason))) || '';
                  if (reason.indexOf('chrome-extension://') !== -1) {
                    e.stopImmediatePropagation();
                    e.preventDefault();
                  }
                }, true);

                // Brauzer kengaytmalari (Bitdefender, Grammarly, Dark Reader va h.k.)
                // SSR HTML ga qo'shadigan atributlar React hydration xatosini keltirib
                // chiqaradi. Hydration dan OLDIN va DAVOMIDA ularni tozalab turamiz.
                (function () {
                  var BAD_ATTRS = ['bis_skin_checked', 'bis_register', 'data-new-gr-c-s-check-loaded',
                    'data-gr-ext-installed', 'data-darkreader-inline-bgcolor', 'data-darkreader-inline-color',
                    'cz-shortcut-listen'];
                  var BAD_PREFIX = ['__processed', 'bis_', 'data-darkreader-'];
                  function strip(node) {
                    if (!node || node.nodeType !== 1) return;
                    var attrs = node.attributes;
                    if (attrs) {
                      for (var i = attrs.length - 1; i >= 0; i--) {
                        var name = attrs[i].name;
                        var bad = BAD_ATTRS.indexOf(name) !== -1;
                        if (!bad) for (var p = 0; p < BAD_PREFIX.length; p++) { if (name.indexOf(BAD_PREFIX[p]) === 0) { bad = true; break; } }
                        if (bad) { try { node.removeAttribute(name); } catch (err) {} }
                      }
                    }
                  }
                  function stripAll(root) {
                    strip(root);
                    if (root && root.querySelectorAll) {
                      var els = root.querySelectorAll('*');
                      for (var i = 0; i < els.length; i++) strip(els[i]);
                    }
                  }
                  // Hydration'dan OLDIN bir marta to'liq tozalash (arzon, bir martalik).
                  try { stripAll(document.documentElement); } catch (e) {}
                  // "/" bosh sahifada status-bar yo'q — joy ajratmaymiz. Birinchi bo'yoqdan
                  // OLDIN qo'yamiz (SSR'dagi 26px'dan 0'ga sakrash bo'lmasin).
                  try { if (location.pathname === '/') document.documentElement.style.setProperty('--netbar-h','0px'); } catch (e) {}
                  // Kuzatuv FAQAT atribut o'zgarishlarini ushlaydi (kengaytmalar bis_*/darkreader
                  // kabi ATRIBUT qo'shadi). Ilgari childList+subtree bo'ylab har qo'shilgan node'da
                  // querySelectorAll('*') qilinardi — bu har React render'ida butun DOM'ni skanlab
                  // asosiy oqimni band qilardi (qotish sababi). Uni OLIB TASHLADIK.
                  try {
                    var obs = new MutationObserver(function (muts) {
                      for (var i = 0; i < muts.length; i++) {
                        if (muts[i].type === 'attributes') strip(muts[i].target);
                      }
                    });
                    obs.observe(document.documentElement, { attributes: true, subtree: true,
                      attributeFilter: BAD_ATTRS.concat(['bis_skin_checked']) });
                    // Hydration bir martalik — tugagach kengaytma atributlari hydration xatosi
                    // bermaydi. Doimiy kuzatuv yukini olib tashlash uchun 'load'+4s da uzamiz.
                    var stop = function () { try { obs.disconnect(); } catch (e) {} };
                    if (document.readyState === 'complete') setTimeout(stop, 4000);
                    else window.addEventListener('load', function () { setTimeout(stop, 4000); });
                  } catch (e) {}
                })();
              }
            `,
          }}
        />
      </head>
      <body className="antialiased select-none" suppressHydrationWarning>
        <NetworkStatusBar />
        <ShellLayout>{children}</ShellLayout>
      </body>
    </html>
  );
}
