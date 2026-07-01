    // ── Super Admin ID (solo para resaltar visualmente su fila en el Panel
    // Admin; la autorización real ya se valida en el servidor con la sesión) ──
    const SUPER_ADMIN_ID = "1192236737565577287";

    // ── Estado global de sesión ───────────────────────────────────────────────
    // Todas las variables de sesión viven aquí. Para resetear la sesión completa
    // usa resetEstado() — no las borres una por una en distintos archivos.
    let currentUser     = null;  // objeto Discord del usuario logueado
    let currentDNI      = null;  // datos del carnet (dni, nombre, etc.)
    let currentCuenta   = null;  // datos de la cuenta bancaria
    let adminTargetUser = null;  // usuario objetivo en panel admin banco
    let countdownInterval = null; // intervalo del countdown de sueldo

    function resetEstado() {
      currentUser = null;
      currentDNI  = null;
      currentCuenta = null;
      adminTargetUser = null;
      if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    // ── Pantallas ─────────────────────────────────────────────────────────────
    const screens = ['landing','dashboard','registro-civil','banco-screen','admin-screen','tienda-screen','inventario-screen','admin-tienda-screen','perfil-publico-screen','panel-admin-screen','comisaria-screen','casino-screen','apuestas-screen','admin-casino-screen','empresas-screen','admin-empresas-screen','logros-screen','error-403','error-404'];

    // ── Indicador de sección activa ──────────────────────────────────────────
    let _sectionIndicatorTimer = null;
    function mostrarIndicadorSeccion(id) {
      const labels = {
        'landing': null,
        'dashboard': null,
        'registro-civil': 'Registro Civil',
        'banco-screen': 'Banco',
        'admin-screen': 'Admin Banco',
        'tienda-screen': 'Tienda',
        'inventario-screen': 'Inventario',
        'admin-tienda-screen': 'Admin Tienda',
        'perfil-publico-screen': 'Perfil Público',
        'panel-admin-screen': 'Panel Admin',
        'comisaria-screen': 'Comisaría Virtual',
        'casino-screen': 'Casino',
        'apuestas-screen': 'Apuestas',
        'admin-casino-screen': 'Admin Casino',
        'empresas-screen': 'Empresas',
        'admin-empresas-screen': 'Administrar Empresas',
        'logros-screen': 'Logros',
      };
      const label = labels[id];
      let indicator = document.getElementById('section-indicator');
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'section-indicator';
        document.body.appendChild(indicator);
      }
      if (!label) { indicator.classList.remove('si-visible'); return; }
      indicator.textContent = label;
      indicator.classList.add('si-visible');
      clearTimeout(_sectionIndicatorTimer);
      _sectionIndicatorTimer = setTimeout(() => indicator.classList.remove('si-visible'), 1800);
    }

    function mostrarPantalla(id) {
      const prev = screens.find(s => {
        const el = document.getElementById(s);
        return el && el.classList.contains('active');
      });
      const isDashToSection = prev === 'dashboard' && id !== 'dashboard' && id !== 'landing';
      const isSectionToDash = id === 'dashboard' && prev !== 'landing';

      screens.forEach(s => {
        const el = document.getElementById(s);
        if (!el) return;
        if (s === id) {
          el.classList.add('active');
          if (isDashToSection) {
            el.classList.add('screen-enter');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => el.classList.remove('screen-enter'));
            });
          } else if (isSectionToDash) {
            el.classList.add('screen-return');
            requestAnimationFrame(() => {
              requestAnimationFrame(() => el.classList.remove('screen-return'));
            });
          }
        } else {
          el.classList.remove('active');
        }
      });
      mostrarIndicadorSeccion(id);
    }

    function volverDashboard() { mostrarPantalla('dashboard'); _navegandoProgramaticamente = true; window.history.pushState({ screen: 'dashboard' }, '', '/'); setTimeout(() => { _navegandoProgramaticamente = false; }, 50); }

    
    async function goToDashboard(user) {
      currentUser = user;
      actualizarBotonLogin();
      document.getElementById('discord-name').textContent = user.name;
      document.getElementById('discord-tag').textContent  = user.tag || '';
      document.getElementById('discord-avatar').src       = user.avatar;

      // Card de perfil (avatar, nombre, badges, bio) y saldo bancario
      document.getElementById('profile-avatar').src = user.avatar;
      document.getElementById('profile-name').textContent = user.name;
      cargarPerfilDashboard();

      // Verificar mi propio estado de admin contra la BD (action=verificar es
      // accesible para cualquier sesión válida). Antes se usaba action=listar,
      // que el backend reserva solo al super admin y devuelve 403 para el
      // resto — por eso a los admins agregados nunca les aparecían sus
      // paneles, y por eso a ti tampoco te aparecía el de Casino (que depende
      // de user.esAdmin, valor que nunca llegaba a asignarse).
      try {
        const r = await fetch('/api/admin?action=verificar');
        if (r.ok) {
          const data = await r.json();
          user.esAdmin = data.esAdmin;
          user.esSuperAdmin = data.esSuperAdmin;
        }
      } catch {}

      // Mostrar card admin banco si corresponde
      const adminCard = document.getElementById('admin-card');
      if (user.esAdmin) {
        adminCard.style.display = 'flex';
        adminCard.onclick = () => { abrirSeccion('admin-screen'); cargarAdminUsuarios(); };
      } else {
        adminCard.style.display = 'none';
      }

      // Mostrar card admin tienda si corresponde
      const adminTiendaCard = document.getElementById('admin-tienda-card');
      if (user.esAdmin) {
        adminTiendaCard.style.display = 'flex';
        adminTiendaCard.onclick = () => { abrirSeccion('admin-tienda-screen'); cargarAdminProductos(); };
      } else {
        adminTiendaCard.style.display = 'none';
      }

      // Mostrar card Panel Admin solo al super admin (verificado por el servidor)
      const panelAdminCard = document.getElementById('panel-admin-card');
      if (user.esSuperAdmin) {
        panelAdminCard.style.display = 'flex';
        panelAdminCard.onclick = () => { abrirSeccion('panel-admin-screen'); paCargarAdmins(); gpCargarPolicias(); };
      } else {
        panelAdminCard.style.display = 'none';
      }

      // Mostrar card Admin Casino a todos los admins
      const adminCasinoCard = document.getElementById('admin-casino-card');
      if (user.esAdmin) {
        adminCasinoCard.style.display = 'flex';
      } else {
        adminCasinoCard.style.display = 'none';
      }

      // Mostrar card Administrar Empresas a todos los admins
      const adminEmpresasCard = document.getElementById('admin-empresas-card');
      if (user.esAdmin) {
        adminEmpresasCard.style.display = 'flex';
        adminEmpresasCard.onclick = () => { abrirSeccion('admin-empresas-screen'); cargarAdminEmpresas(); };
      } else {
        adminEmpresasCard.style.display = 'none';
      }

      mostrarPantalla('dashboard');
      if (typeof notifIniciar === 'function') notifIniciar();
    }

    function goToLanding() {
      resetEstado();
      if (typeof notifDetener === 'function') notifDetener();
      // La sesión ahora vive en una cookie httpOnly del servidor; se cierra
      // pidiéndole al servidor que la borre (antes solo se borraba un dato
      // en localStorage, que ni siquiera era la fuente real de verdad).
      fetch('/api/logout', { method: 'POST' }).catch(() => {});
      actualizarBotonLogin();
      mostrarPantalla('landing');
    }

    // Vuelve a la pantalla de inicio (portal) SIN cerrar sesión. A diferencia
    // de goToLanding(), no borra el estado ni pide al servidor cerrar la
    // cookie: el usuario sigue logueado y puede volver al panel cuando quiera.
    function irAlPortal() {
      const pill = document.getElementById('user-pill');
      if (pill) pill.classList.remove('open');
      actualizarBotonLogin();
      mostrarPantalla('landing');
      _navegandoProgramaticamente = true;
      window.history.pushState({ screen: 'landing' }, '', '/');
      setTimeout(() => { _navegandoProgramaticamente = false; }, 50);
    }

    // Si hay sesión activa, el botón de la landing ya no debe mandar a
    // /auth/login (eso reiniciaría el login con Discord innecesariamente):
    // debe llevar directo al panel. Sin sesión, se comporta como siempre.
    function actualizarBotonLogin() {
      const btn = document.getElementById('login-btn');
      const txt = document.getElementById('login-btn-text');
      if (!btn) return;
      if (currentUser) {
        btn.href = '#';
        txt.textContent = 'Ir al Panel';
        btn.onclick = (e) => {
          e.preventDefault();
          mostrarPantalla('dashboard');
          _navegandoProgramaticamente = true;
          window.history.pushState({ screen: 'dashboard' }, '', '/');
          setTimeout(() => { _navegandoProgramaticamente = false; }, 50);
        };
      } else {
        btn.href = '/auth/login';
        txt.textContent = 'Entrar con Discord';
        btn.onclick = null;
      }
    }

    let _navegandoProgramaticamente = false;

    function abrirSeccion(id) {
      mostrarPantalla(id);
      _navegandoProgramaticamente = true;
      window.history.pushState({ screen: id }, '', '/');
      setTimeout(() => { _navegandoProgramaticamente = false; }, 50);
    }

    // Interceptar botón atrás del navegador/celular
    window.addEventListener('popstate', () => {
      if (_navegandoProgramaticamente) return;
      if (currentUser) {
        mostrarPantalla('dashboard');
        _navegandoProgramaticamente = true;
        window.history.pushState({ screen: 'dashboard' }, '', '/');
        setTimeout(() => { _navegandoProgramaticamente = false; }, 50);
      }
    });

    // ── Login desde URL params o sesión guardada ──────────────────────────────
    document.getElementById('f-fecha').max = new Date().toISOString().split('T')[0];

    // La identidad ya no se lee de la URL ni de localStorage (cualquiera podía
    // editar esos valores y hacerse pasar por otro usuario). Ahora se le
    // pregunta al servidor quién está autenticado según la cookie de sesión
    // firmada que dejó /api/callback al iniciar sesión con Discord.
    (async function initSesion() {
      try {
        const r = await fetch('/api/me');
        if (r.ok) {
          const data = await r.json();
          if (data.autenticado) {
            const user = {
              id: data.id,
              name: data.name,
              tag: data.tag,
              avatar: data.avatar,
              esSuperAdmin: data.esSuperAdmin,
            };
            window.history.replaceState({ screen: 'dashboard' }, '', '/');
            goToDashboard(user);
          }
        }
      } catch {}
    })();

    // ── User pill ─────────────────────────────────────────────────────────────
    document.getElementById('user-pill').addEventListener('click', (e) => {
      if (e.target.closest('#logout-btn')) return;
      document.getElementById('user-pill').classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!document.getElementById('user-pill').contains(e.target))
        document.getElementById('user-pill').classList.remove('open');
    });
    document.getElementById('logout-btn').addEventListener('click', () => {
      document.getElementById('user-pill').classList.remove('open');
      goToLanding();
    });
    document.getElementById('portal-btn').addEventListener('click', () => {
      irAlPortal();
    });


    // ── Utilidades globales ──────────────────────────────────────────────────
    // Función única de escape HTML (antes: escHtml en tienda/admin-tienda,
    // cvEsc en comisaria — ahora una sola definición global)
    function escHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    // Función única de formato de pesos CLP (antes: formatearSaldo, apFmt, casinoFmt)
    function formatCLP(n) {
      return '$' + Math.round(Number(n) || 0).toLocaleString('es-CL');
    }

    // ── Feedback de victoria/derrota (sonido + microanimación) ───────────────
    // Compartido entre Casino y Apuestas para que la sensación de "ganaste"
    // o "perdiste" sea consistente en toda la app. No reemplaza los sonidos
    // específicos de cada juego (giro de ruleta, motor del avión, etc.),
    // se suma como una capa extra justo cuando se revela el resultado.
    let _fbAudioCtx = null;
    function _fbGetCtx() {
      if (!_fbAudioCtx) {
        try { _fbAudioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
      }
      return _fbAudioCtx;
    }

    function sonidoVictoria() {
      const ctx = _fbGetCtx(); if (!ctx) return;
      // Arpegio ascendente y brillante (do-mi-sol-do agudo)
      const notas = [523.25, 659.25, 783.99, 1046.5];
      notas.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.09;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
        osc.start(t); osc.stop(t + 0.34);
      });
    }

    function sonidoDerrota() {
      const ctx = _fbGetCtx(); if (!ctx) return;
      // Descenso grave y corto, tipo "buzzer" suave (no agresivo)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(90, t + 0.4);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.start(t); osc.stop(t + 0.45);
    }

    // Dispara un puñado de "confeti" (emojis) cayendo dentro del elemento
    // de resultado. Liviano: sin librerías, solo spans con animación CSS
    // que se autodestruyen.
    function dispararConfeti(el) {
      if (!el) return;
      const wrap = document.createElement('div');
      wrap.className = 'fb-confeti-wrap';
      const piezas = ['🎉', '✨', '💰', '🪙'];
      const cantidad = 10;
      for (let i = 0; i < cantidad; i++) {
        const span = document.createElement('span');
        span.className = 'fb-confeti-pieza';
        span.textContent = piezas[Math.floor(Math.random() * piezas.length)];
        span.style.left = (Math.random() * 90 + 2) + '%';
        span.style.animationDelay = (Math.random() * 0.15) + 's';
        span.style.fontSize = (12 + Math.random() * 10) + 'px';
        wrap.appendChild(span);
      }
      el.appendChild(wrap);
      setTimeout(() => wrap.remove(), 1200);
    }

    // Punto de entrada único: aplica la animación de pulso/sacudida sobre
    // el elemento de resultado (clásicamente .casino-resultado) y reproduce
    // el sonido correspondiente. Se puede llamar en cualquier juego o
    // historial donde se revele un resultado de victoria/derrota.
    function feedbackResultado(el, gano) {
      if (el) {
        el.classList.remove('fb-gano', 'fb-perdio');
        void el.offsetWidth; // reflow, para poder repetir la animación
        el.classList.add(gano ? 'fb-gano' : 'fb-perdio');
      }
      // Haptic feedback (gratis en código, se siente nativo en PWA instaladas).
      // Patrón doble y corto para victoria (sensación de "celebración"), un
      // solo pulso seco para derrota. navigator.vibrate no existe en iOS
      // Safari/PWA — el try/catch + chequeo de existencia lo vuelve un no-op ahí.
      if (navigator.vibrate) {
        try { navigator.vibrate(gano ? [15, 50, 25] : 30); } catch {}
      }
      if (gano) {
        sonidoVictoria();
        dispararConfeti(el);
      } else {
        sonidoDerrota();
      }
    }

    // ── Sonidos generales de UI (notificación / confirmación) ────────────────
    // Mismo motor de audio que sonidoVictoria/sonidoDerrota, pero pensado para
    // microinteracciones discretas: avisar una notificación nueva o confirmar
    // que una acción (transferencia, compra, registro) se completó bien.
    function sonidoNotificacion() {
      const ctx = _fbGetCtx(); if (!ctx) return;
      // Dos tonos cortos tipo "ping" suave, no intrusivo
      const notas = [880, 1108.73];
      notas.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.1;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.09, t + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.start(t); osc.stop(t + 0.24);
      });
    }

    function sonidoConfirmacion() {
      const ctx = _fbGetCtx(); if (!ctx) return;
      // Click breve y limpio, tipo "listo" — para transferencias, compras,
      // registros y otras acciones exitosas que no son apuestas/juegos.
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      const t = ctx.currentTime;
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.exponentialRampToValueAtTime(990, t + 0.09);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.start(t); osc.stop(t + 0.2);
    }

    // ── Cerrar modales con Escape ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Panel de notificaciones
      if (typeof notifCerrar === 'function') notifCerrar();
      // Modales de banco/admin (clase admin-modal-overlay con toggle 'visible')
      ['modal-saldo', 'modal-reset', 'modal-editar-prod', 'modal-recibo-transferencia'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.classList.contains('visible')) el.classList.remove('visible');
      });
      // Modal de apuesta deportiva
      const apModal = document.getElementById('ap-modal-overlay');
      if (apModal && apModal.classList.contains('open')) {
        apModal.classList.remove('open');
        if (typeof apPartidoActivo !== 'undefined') { apPartidoActivo = null; apTipoActivo = null; apEleccion = null; }
      }
      // Modal editar partido (admin casino)
      const admModal = document.getElementById('adm-edit-overlay');
      if (admModal && admModal.classList.contains('open')) admModal.classList.remove('open');
    });

    // ── Service Worker (PWA: cache de estáticos + soporte offline básico) ──
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Si falla el registro (ej. navegador raro), la app sigue funcionando normal sin SW.
        });
      });
    }

    // ── Indicador de sin conexión ─────────────────────────────────────────────
    // El sw.js ya sirve estáticos/HTML cacheados cuando no hay red, pero eso es
    // invisible para el usuario: podría estar viendo un saldo o un partido
    // desactualizado sin saberlo, o intentar una apuesta que nunca llega al
    // servidor. Este banner discreto avisa el estado real de la conexión.
    function ccActualizarBannerOffline() {
      let banner = document.getElementById('offline-banner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'offline-banner';
        banner.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.58 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg><span>Sin conexión — mostrando datos guardados</span>`;
        document.body.appendChild(banner);
      }
      banner.classList.toggle('visible', !navigator.onLine);
    }
    window.addEventListener('online', ccActualizarBannerOffline);
    window.addEventListener('offline', ccActualizarBannerOffline);
    document.addEventListener('DOMContentLoaded', ccActualizarBannerOffline);

    // ── Card de Perfil del dashboard (avatar, badges, bio, saldo) ────────────
    // Se llama al entrar al dashboard. Reutiliza /api/dni y /api/banco (no se
    // crean endpoints nuevos, ya se llegó al límite de 12 funciones serverless
    // del plan gratuito de Vercel).
    async function cargarPerfilDashboard() {
      const badgesWrap = document.getElementById('profile-badges');
      const bioText     = document.getElementById('profile-bio-text');
      if (!badgesWrap || !currentUser?.id) return;

      badgesWrap.innerHTML = `<span class="profile-badge pb-discord">@${escHtml(currentUser.tag || currentUser.name)}</span>`;

      // DNI (para badge de RUT + biografía)
      try {
        const res = await fetch('/api/dni');
        const data = await res.json();
        if (data.existe && data.dni) {
          currentDNI = data.dni;
          badgesWrap.innerHTML += `<span class="profile-badge pb-rut">🪪 ${escHtml(data.dni.rut)}</span>`;
          bioText.textContent = data.dni.bio && data.dni.bio.trim()
            ? data.dni.bio
            : 'Sin biografía todavía. ¡Cuéntale a la ciudad quién eres!';
        } else {
          bioText.textContent = 'Crea tu cédula de identidad para poder editar tu biografía.';
          badgesWrap.innerHTML += `<span class="profile-badge pb-sin-rut" onclick="abrirSeccion('registro-civil'); cargarDNI()">⚠️ Sin cédula</span>`;
        }
      } catch (e) {
        bioText.textContent = 'No se pudo cargar tu biografía.';
      }

      // Logros desbloqueados
      try {
        const res = await fetch('/api/banco?action=logros');
        const data = await res.json();
        if (res.ok && Array.isArray(data.logros)) {
          const obtenidos = data.logros.filter(l => l.obtenido).length;
          badgesWrap.innerHTML += `<span class="profile-badge pb-logros" onclick="abrirSeccion('logros-screen'); cargarLogros()">🏅 ${obtenidos} Logros</span>`;
        }
      } catch (e) {}

      // Saldo bancario
      const balEl    = document.getElementById('profile-balance');
      const balSubEl = document.getElementById('profile-balance-sub');
      try {
        const res = await fetch('/api/banco?action=cuenta');
        if (res.status === 404) {
          balEl.textContent = '—';
          balSubEl.textContent = 'Aún no tienes cuenta bancaria';
          return;
        }
        const data = await res.json();
        if (res.ok && data.cuenta) {
          currentCuenta = data.cuenta;
          balEl.textContent = formatCLP(data.cuenta.saldo);
          balSubEl.textContent = `Cuenta N° ${data.cuenta.numero_cuenta}`;
        } else {
          balEl.textContent = '—';
          balSubEl.textContent = 'No se pudo cargar el saldo';
        }
      } catch (e) {
        balEl.textContent = '—';
        balSubEl.textContent = 'Sin conexión';
      }
    }

    // ── Edición de biografía ──────────────────────────────────────────────────
    (function initBioEdit() {
      const wrap    = document.getElementById('profile-bio-wrap');
      const editBtn = document.getElementById('profile-bio-edit-btn');
      const cancel  = document.getElementById('profile-bio-cancel');
      const save    = document.getElementById('profile-bio-save');
      const input   = document.getElementById('profile-bio-input');
      const count   = document.getElementById('profile-bio-count');
      if (!wrap || !editBtn) return;

      function abrirEdicion() {
        input.value = (currentDNI?.bio) || '';
        count.textContent = `${input.value.length}/160`;
        wrap.classList.add('editing');
        input.focus();
      }
      function cerrarEdicion() { wrap.classList.remove('editing'); }

      editBtn.addEventListener('click', () => {
        if (!currentDNI) { abrirSeccion('registro-civil'); cargarDNI(); return; }
        abrirEdicion();
      });
      cancel.addEventListener('click', cerrarEdicion);
      input.addEventListener('input', () => { count.textContent = `${input.value.length}/160`; });

      save.addEventListener('click', async () => {
        save.disabled = true;
        try {
          const res = await fetch('/api/dni', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bio: input.value })
          });
          const data = await res.json();
          if (res.ok && data.dni) {
            currentDNI = data.dni;
            document.getElementById('profile-bio-text').textContent =
              data.dni.bio && data.dni.bio.trim() ? data.dni.bio : 'Sin biografía todavía. ¡Cuéntale a la ciudad quién eres!';
            if (typeof mostrarToast === 'function') mostrarToast('Biografía actualizada.');
            cerrarEdicion();
          } else if (typeof mostrarToast === 'function') {
            mostrarToast(data.error || 'No se pudo guardar la biografía.', true);
          }
        } catch (e) {
          if (typeof mostrarToast === 'function') mostrarToast('Error de conexión.', true);
        } finally {
          save.disabled = false;
        }
      });
    })();
