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
    const screens = ['landing','dashboard','registro-civil','banco-screen','admin-screen','tienda-screen','inventario-screen','admin-tienda-screen','perfil-publico-screen','panel-admin-screen','comisaria-screen','casino-screen','apuestas-screen','admin-casino-screen','empresas-screen','admin-empresas-screen','error-403','error-404'];

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
      document.getElementById('welcome-msg').textContent  = `Hola, ${user.name}`;

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
      if (gano) {
        sonidoVictoria();
        dispararConfeti(el);
      } else {
        sonidoDerrota();
      }
    }

    // ── Cerrar modales con Escape ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      // Panel de notificaciones
      if (typeof notifCerrar === 'function') notifCerrar();
      // Modales de banco/admin (clase admin-modal-overlay con toggle 'visible')
      ['modal-saldo', 'modal-reset', 'modal-editar-prod'].forEach(id => {
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
