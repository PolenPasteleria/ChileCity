    // NOTIFICACIONES (campanita)
    // ══════════════════════════════════════════════════════════════════════════
    // Junta multas nuevas, resultados de apuestas y transferencias recibidas
    // en un solo panel. Se mantiene visible sobre cualquier sección porque su
    // markup vive fuera de los .screen (ver index.html), y se sondea cada
    // cierto tiempo mientras haya sesión activa.

    let notifItems = [];
    let notifPollTimer = null;
    let notifPrimeraCarga = true;

    function notifIniciar() {
      const wrap = document.getElementById('notif-bell-wrap');
      if (wrap) wrap.classList.add('nb-activo');
      notifPrimeraCarga = true;
      notifCargar();
      clearInterval(notifPollTimer);
      notifPollTimer = setInterval(notifCargar, 45000); // sondeo cada 45s
    }

    function notifDetener() {
      const wrap = document.getElementById('notif-bell-wrap');
      if (wrap) { wrap.classList.remove('nb-activo', 'nb-open'); }
      clearInterval(notifPollTimer);
      notifPollTimer = null;
      notifItems = [];
    }

    async function notifCargar() {
      if (!currentUser?.id) return;
      try {
        const r = await fetch('/api/notificaciones', { credentials: 'same-origin' });
        if (!r.ok) return;
        const data = await r.json();
        const previas = notifItems.length;
        const noLeidasPrevias = notifItems.filter(i => i.nuevo).length;
        notifItems = data.items || [];
        notifRenderBadge(data.noLeidas || 0);
        notifRenderLista();

        // Si hay notificaciones nuevas desde el último sondeo (y no es la
        // primera carga de la sesión), agita la campanita para llamar la
        // atención sin ser invasivo con sonido.
        if (!notifPrimeraCarga && (data.noLeidas || 0) > noLeidasPrevias) {
          notifAgitarCampana();
        }
        notifPrimeraCarga = false;
      } catch { /* fallo silencioso: no rompe la navegación por esto */ }
    }

    function notifRenderBadge(n) {
      const badge = document.getElementById('notif-badge');
      if (!badge) return;
      if (n > 0) {
        badge.textContent = n > 9 ? '9+' : String(n);
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    }

    function notifAgitarCampana() {
      const btn = document.getElementById('notif-bell-btn');
      if (!btn) return;
      btn.classList.remove('nb-ring');
      void btn.offsetWidth; // reflow para poder repetir la animación
      btn.classList.add('nb-ring');
    }

    function notifTiempoRelativo(fechaStr) {
      const fecha = new Date(fechaStr);
      const seg = Math.floor((Date.now() - fecha.getTime()) / 1000);
      if (seg < 60) return 'Hace un momento';
      const min = Math.floor(seg / 60);
      if (min < 60) return `Hace ${min} min`;
      const hrs = Math.floor(min / 60);
      if (hrs < 24) return `Hace ${hrs} h`;
      const dias = Math.floor(hrs / 24);
      if (dias < 7) return `Hace ${dias} d`;
      return fecha.toLocaleDateString('es-CL');
    }

    function notifRenderLista() {
      const lista = document.getElementById('notif-list');
      if (!lista) return;
      if (!notifItems.length) {
        lista.innerHTML = '<div class="notif-empty">No tienes notificaciones por ahora.</div>';
        return;
      }
      lista.innerHTML = notifItems.map((it, idx) => `
        <div class="notif-item ${it.nuevo ? 'nv-nuevo' : ''}" onclick="notifClickItem(${idx})">
          <div class="notif-item-icono">${it.icono}</div>
          <div class="notif-item-info">
            <div class="notif-item-titulo">${escHtml(it.titulo)}${it.nuevo ? '<span class="notif-item-dot"></span>' : ''}</div>
            <div class="notif-item-detalle">${escHtml(it.detalle)}</div>
            <div class="notif-item-tiempo">${notifTiempoRelativo(it.fecha)}</div>
          </div>
        </div>`).join('');
    }

    // Lleva al usuario a la sección relevante según el tipo de notificación.
    function notifClickItem(idx) {
      const it = notifItems[idx];
      if (!it) return;
      notifCerrar();
      if (it.tipo === 'multa') {
        abrirSeccion('comisaria-screen');
        // abrirComisaria ya se encarga de cargar el contenido y dejar el tab
        // "Mis Multas" activo por defecto.
        if (typeof abrirComisaria === 'function') abrirComisaria();
      } else if (it.tipo === 'transferencia') {
        abrirSeccion('banco-screen');
        if (typeof cargarBanco === 'function') cargarBanco();
      } else if (it.tipo === 'apuesta') {
        abrirSeccion('apuestas-screen');
        if (typeof apCargarHistorialPersonal === 'function') apCargarHistorialPersonal();
      } else if (it.tipo === 'antecedente') {
        abrirSeccion('comisaria-screen');
        if (typeof abrirComisaria === 'function') abrirComisaria();
      } else if (it.tipo === 'admin') {
        // Aviso de administración: no tiene una sección propia a la cual ir,
        // solo se marca como leído al abrir el panel.
      }
    }

    function notifAbrir() {
      document.getElementById('notif-bell-wrap')?.classList.add('nb-open');
      notifMarcarLeidas();
    }
    function notifCerrar() {
      document.getElementById('notif-bell-wrap')?.classList.remove('nb-open');
    }
    function notifToggle() {
      const wrap = document.getElementById('notif-bell-wrap');
      if (!wrap) return;
      wrap.classList.contains('nb-open') ? notifCerrar() : notifAbrir();
    }

    async function notifMarcarLeidas() {
      if (!notifItems.some(i => i.nuevo)) return;
      notifItems = notifItems.map(i => ({ ...i, nuevo: false }));
      notifRenderBadge(0);
      notifRenderLista();
      try {
        await fetch('/api/notificaciones', { method: 'POST', credentials: 'same-origin' });
      } catch { /* si falla, el próximo sondeo lo vuelve a intentar */ }
    }

    // Vacía la bandeja del usuario. No borra multas, transferencias,
    // antecedentes ni apuestas — esos datos siguen intactos en sus tablas.
    // Solo deja de mostrar, en la campanita de ESTE usuario, todo lo
    // anterior a este instante (vía notif_estado.limpiado_en en el server).
    async function notifLimpiarBandeja() {
      if (!notifItems.length) return;
      if (!confirm('¿Vaciar tu bandeja de notificaciones? No borra multas, transferencias ni antecedentes, solo deja de mostrarte lo que ya pasó.')) return;
      notifItems = [];
      notifRenderBadge(0);
      notifRenderLista();
      try {
        await fetch('/api/notificaciones?action=limpiar', { method: 'POST', credentials: 'same-origin' });
      } catch { /* si falla, el próximo sondeo trae todo de nuevo */ }
    }

    // ── Campanita movible ────────────────────────────────────────────────
    // El usuario puede arrastrarla a cualquier parte de la pantalla para
    // que no le tape el botón de su perfil/cerrar sesión. La posición se
    // guarda en localStorage para que quede donde la dejó la próxima vez.
    const NOTIF_POS_KEY = 'cc_notif_bell_pos';
    let notifDragState = null;
    let notifUltimoFueDrag = false;

    function notifUbicarEn(x, y, guardar = true) {
      const wrap = document.getElementById('notif-bell-wrap');
      if (!wrap) return;
      const w = wrap.offsetWidth || 42;
      const h = wrap.offsetHeight || 42;
      const margen = 8;
      const maxX = Math.max(margen, window.innerWidth - w - margen);
      const maxY = Math.max(margen, window.innerHeight - h - margen);
      x = Math.max(margen, Math.min(x, maxX));
      y = Math.max(margen, Math.min(y, maxY));

      wrap.style.left = `${x}px`;
      wrap.style.top = `${y}px`;
      wrap.style.right = 'auto';

      // El panel se abre hacia el lado donde haya espacio, para que nunca
      // quede cortado por el borde de la pantalla.
      const panelAncho = Math.min(340, window.innerWidth - 24);
      wrap.classList.toggle('nb-anchor-left', x < panelAncho);
      wrap.classList.toggle('nb-anchor-top', y > window.innerHeight * 0.55);

      if (guardar) {
        try { localStorage.setItem(NOTIF_POS_KEY, JSON.stringify({ x, y })); } catch {}
      }
    }

    function notifAplicarPosicionGuardada() {
      try {
        const raw = localStorage.getItem(NOTIF_POS_KEY);
        if (!raw) return;
        const { x, y } = JSON.parse(raw);
        if (typeof x === 'number' && typeof y === 'number') notifUbicarEn(x, y, false);
      } catch {}
    }

    function notifDragInit() {
      const btn = document.getElementById('notif-bell-btn');
      const wrap = document.getElementById('notif-bell-wrap');
      if (!btn || !wrap) return;

      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        const rect = wrap.getBoundingClientRect();
        notifDragState = {
          startX: e.clientX, startY: e.clientY,
          origX: rect.left, origY: rect.top,
          moved: false,
          pointerId: e.pointerId,
        };
        try { btn.setPointerCapture(e.pointerId); } catch {}
      });

      btn.addEventListener('pointermove', (e) => {
        if (!notifDragState || notifDragState.pointerId !== e.pointerId) return;
        const dx = e.clientX - notifDragState.startX;
        const dy = e.clientY - notifDragState.startY;
        if (!notifDragState.moved && Math.hypot(dx, dy) > 6) {
          notifDragState.moved = true;
          wrap.classList.add('nb-dragging');
          notifCerrar(); // si el panel estaba abierto, se cierra al arrastrar
        }
        if (notifDragState.moved) {
          e.preventDefault();
          notifUbicarEn(notifDragState.origX + dx, notifDragState.origY + dy);
        }
      });

      function soltar(e) {
        if (!notifDragState || notifDragState.pointerId !== e.pointerId) return;
        wrap.classList.remove('nb-dragging');
        notifUltimoFueDrag = notifDragState.moved;
        notifDragState = null;
      }
      btn.addEventListener('pointerup', soltar);
      btn.addEventListener('pointercancel', soltar);

      // Si la ventana cambia de tamaño, la reacomoda para que no quede
      // fuera de pantalla (p. ej. al rotar el celular).
      window.addEventListener('resize', () => {
        if (!wrap.style.left) return; // nunca la movieron, sigue con la posición por defecto
        const rect = wrap.getBoundingClientRect();
        notifUbicarEn(rect.left, rect.top, false);
      });
    }

    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('notif-bell-btn');
      if (btn) btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (notifUltimoFueDrag) { notifUltimoFueDrag = false; return; } // fue arrastre, no click
        notifToggle();
      });
      document.getElementById('notif-marcar-leidas')?.addEventListener('click', (e) => {
        e.stopPropagation();
        notifMarcarLeidas();
      });
      document.getElementById('notif-limpiar-bandeja')?.addEventListener('click', (e) => {
        e.stopPropagation();
        notifLimpiarBandeja();
      });
      notifAplicarPosicionGuardada();
      notifDragInit();
      document.addEventListener('click', (e) => {
        const wrap = document.getElementById('notif-bell-wrap');
        if (wrap && wrap.classList.contains('nb-open') && !wrap.contains(e.target)) notifCerrar();
      });
    });
