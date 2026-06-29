    // ── Super Admin ID (solo para resaltar visualmente su fila en el Panel
    // Admin; la autorización real ya se valida en el servidor con la sesión) ──
    const SUPER_ADMIN_ID = "1192236737565577287";

    // ── Estado global ─────────────────────────────────────────────────────────
    let currentUser = null;
    let currentDNI  = null;
    let currentCuenta = null;
    let adminTargetUser = null;
    let countdownInterval = null;

    // ── Pantallas ─────────────────────────────────────────────────────────────
    const screens = ['landing','dashboard','registro-civil','banco-screen','admin-screen','tienda-screen','inventario-screen','admin-tienda-screen','base-datos-screen','panel-admin-screen','comisaria-screen','casino-screen','apuestas-screen','admin-casino-screen','error-403','error-404'];

    function mostrarPantalla(id) {
      screens.forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.toggle('active', s === id);
      });
    }

    function volverDashboard() { mostrarPantalla('dashboard'); _navegandoProgramaticamente = true; window.history.pushState({ screen: 'dashboard' }, '', '/'); setTimeout(() => { _navegandoProgramaticamente = false; }, 50); }

    
    async function goToDashboard(user) {
      currentUser = user;
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

      mostrarPantalla('dashboard');
    }

    function goToLanding() {
      currentUser = null; currentDNI = null; currentCuenta = null;
      // La sesión ahora vive en una cookie httpOnly del servidor; se cierra
      // pidiéndole al servidor que la borre (antes solo se borraba un dato
      // en localStorage, que ni siquiera era la fuente real de verdad).
      fetch('/api/logout', { method: 'POST' }).catch(() => {});
      mostrarPantalla('landing');
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

