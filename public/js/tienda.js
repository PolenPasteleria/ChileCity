    // TIENDA
    // ══════════════════════════════════════════════════════════════════════════
    let todosLosProductos = [];
    let categoriaActual = 'todos';

    let misProductosIds = new Set(); // IDs de productos que ya tengo

    async function cargarTienda() {
      if (!currentUser?.id) return;
      document.getElementById('tienda-loading').style.display = 'flex';
      document.getElementById('tienda-productos-wrap').style.display = 'none';

      try {
        // Cargar productos e inventario en paralelo
        const [resP, resI] = await Promise.all([
          fetch('/api/tienda?action=productos'),
          fetch(`/api/tienda?action=inventario&discord_id=${currentUser.id}`),
        ]);
        const dataP = await resP.json();
        const dataI = await resI.json();

        todosLosProductos = dataP.productos || [];
        misProductosIds   = new Set((dataI.items || []).map(i => i.producto_id));

        document.getElementById('tienda-loading').style.display = 'none';
        document.getElementById('tienda-productos-wrap').style.display = 'block';
        const sq = document.getElementById('tienda-search');
        if (sq) sq.value = '';
        categoriaActual = 'todos';
        document.querySelectorAll('.filtro-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        renderProductos(todosLosProductos);
      } catch(e) {
        document.getElementById('tienda-loading').style.display = 'none';
        document.getElementById('tienda-grid').innerHTML = '<div class="tienda-empty">Error al cargar la tienda.</div>';
        document.getElementById('tienda-productos-wrap').style.display = 'block';
      }
    }

    function filtrarCategoria(cat, btn) {
      categoriaActual = cat;
      document.querySelectorAll('.filtro-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aplicarFiltros();
    }

    function aplicarFiltros() {
      const q = (document.getElementById('tienda-search')?.value || '').trim().toLowerCase();
      let lista = categoriaActual === 'todos' ? todosLosProductos : todosLosProductos.filter(p => p.categoria === categoriaActual);
      if (q) lista = lista.filter(p => p.nombre.toLowerCase().includes(q));
      renderProductos(lista);
    }

    // Listeners de búsqueda - se registran una sola vez al cargar la página.
    // OJO: tienda.js se carga ANTES que admin-tienda.js, así que
    // aplicarFiltrosAdmin todavía no existe en este punto. Se envuelve en
    // una función anónima para que solo se resuelva cuando el usuario
    // realmente escriba algo (momento en el que admin-tienda.js ya cargó).
    (function() {
      const s = document.getElementById('tienda-search');
      if (s) s.addEventListener('input', aplicarFiltros);
      const sa = document.getElementById('admin-tienda-search');
      if (sa) sa.addEventListener('input', () => {
        if (typeof aplicarFiltrosAdmin === 'function') aplicarFiltrosAdmin();
      });
    })();

    function catEmoji(cat) {
      const map = { vehiculos: '🚗', armas: '🔫', licencias: '📄', otros: '📦' };
      return map[cat] || '📦';
    }
    function catLabel(cat) {
      const map = { vehiculos: 'Vehículos', armas: 'Armas', licencias: 'Licencias', otros: 'Otros' };
      return map[cat] || cat;
    }

    function renderProductos(lista) {
      const grid = document.getElementById('tienda-grid');
      if (!lista.length) {
        grid.innerHTML = '<div class="tienda-empty">No hay productos disponibles en esta categoría.</div>';
        return;
      }
      grid.innerHTML = lista.map(p => {
        const yaComprado = misProductosIds.has(p.id);
        return `
        <div class="producto-card">
          <div class="producto-img">
            ${p.imagen_url
              ? `<img src="${escHtml(p.imagen_url)}" alt="${escHtml(p.nombre)}" onerror="this.parentElement.innerHTML='${catEmoji(p.categoria)}';">`
              : catEmoji(p.categoria)}
          </div>
          <div class="producto-info">
            <div class="producto-nombre">${escHtml(p.nombre)}</div>
            <span class="producto-cat cat-${p.categoria}">${catLabel(p.categoria)}</span>
            <div class="producto-precio">${formatCLP(p.precio)}</div>
            <button class="btn-comprar${yaComprado ? ' btn-ya-tienes' : ''}"
              ${yaComprado ? 'disabled title="Ya tienes este producto"' : `onclick="comprarProducto(${p.id}, this)"`}>
              ${yaComprado ? 'Ya tienes' : 'Comprar'}
            </button>
          </div>
        </div>`;
      }).join('');
    }

    async function comprarProducto(productoId, btn) {
      if (!currentUser?.id) { mostrarToast('Debes iniciar sesión.', true); return; }
      btn.disabled = true;
      btn.textContent = 'Comprando...';

      try {
        const res  = await fetch('/api/tienda?action=comprar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discord_id: currentUser.id, producto_id: productoId }),
        });
        const data = await res.json();
        if (!res.ok) {
          const msg = data.faltante
            ? `Fondos insuficientes. Te faltan ${formatCLP(data.faltante)}.`
            : (data.error || 'Error al comprar.');
          mostrarToast(msg, true);
          btn.disabled = false;
          btn.textContent = 'Comprar';
        } else {
          // Actualizar saldo si la cuenta está cargada
          if (currentCuenta) {
            currentCuenta.saldo = data.nuevoSaldo;
            const saldoEl = document.getElementById('bank-saldo');
            if (saldoEl) saldoEl.textContent = formatCLP(data.nuevoSaldo);
          }
          mostrarToast(`Compra exitosa. Nuevo saldo: ${formatCLP(data.nuevoSaldo)}`);
          btn.disabled = false;
          btn.textContent = 'Comprar';
        }
      } catch(e) {
        mostrarToast('Error de conexión.', true);
        btn.disabled = false;
        btn.textContent = 'Comprar';
      }
    }

    // ── TOAST SYSTEM ────────────────────────────────────────────────────────
    const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    function mostrarToast(msg, esError = false, tipo = null) {
      const type = tipo || (esError ? 'error' : 'success');
      const container = document.getElementById('toast-container');
      const el = document.createElement('div');
      el.className = 'toast-item ' + type;
      el.innerHTML = '<span class="toast-icon">' + TOAST_ICONS[type] + '</span><span class="toast-text">' + msg + '</span>';
      el.addEventListener('click', () => removeToast(el));
      container.appendChild(el);
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
      el._timer = setTimeout(() => removeToast(el), 4000);
    }
    function removeToast(el) {
      clearTimeout(el._timer);
      el.classList.remove('show');
      setTimeout(() => el.remove(), 400);
    }
    const toast = {
      ok:   (m) => mostrarToast(m, false, 'success'),
      err:  (m) => mostrarToast(m, true,  'error'),
      warn: (m) => mostrarToast(m, false, 'warning'),
      info: (m) => mostrarToast(m, false, 'info'),
    };

    // ── CONTADOR JUGADORES ─────────────────────────────────────────────────
    async function actualizarContadorJugadores() {
      try {
        const r = await fetch('https://discord.com/api/v10/invites/NfqShRg2Xc?with_counts=true');
        if (r.ok) {
          const d = await r.json();
          const online = d.approximate_presence_count || 0;
          const total  = d.approximate_member_count  || 0;
          const txt = online.toLocaleString() + ' online · ' + total.toLocaleString() + ' miembros';
          const el1 = document.getElementById('footer-players');
          const el2 = document.getElementById('dash-footer-players');
          if (el1) el1.textContent = txt;
          if (el2) el2.textContent = txt;
        }
      } catch(e) { /* silencioso */ }
    }
    actualizarContadorJugadores();

    // ── PÁGINAS DE ERROR ───────────────────────────────────────────────────
    function mostrarError(tipo) {
      ['landing','dashboard','registro-civil','banco-screen','admin-screen','tienda-screen',
       'inventario-screen','admin-tienda-screen','base-datos-screen','panel-admin-screen',
       'casino-screen','apuestas-screen','admin-casino-screen','error-403','error-404'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.classList.remove('active');
      });
      const errEl = document.getElementById('error-' + tipo);
      if (errEl) errEl.classList.add('active');
    }


    // ══════════════════════════════════════════════════════════════════════════
    // INVENTARIO
    // ══════════════════════════════════════════════════════════════════════════
    async function cargarInventario() {
      if (!currentUser?.id) return;
      document.getElementById('inventario-loading').style.display = 'flex';
      document.getElementById('inventario-wrap').style.display = 'none';

      try {
        const res  = await fetch(`/api/tienda?action=inventario&discord_id=${currentUser.id}`);
        const data = await res.json();
        document.getElementById('inventario-loading').style.display = 'none';
        document.getElementById('inventario-wrap').style.display = 'block';

        const grid = document.getElementById('inventario-grid');
        if (!data.items?.length) {
          grid.innerHTML = '<div class="tienda-empty" style="grid-column:1/-1;">Tu inventario está vacío.<br>¡Visita la tienda para comprar!</div>';
          return;
        }
        grid.innerHTML = data.items.map(item => {
          const fecha = new Date(item.comprado_at).toLocaleDateString('es-CL', {day:'2-digit',month:'2-digit',year:'2-digit'});
          return `
            <div class="inv-card">
              <div class="inv-img">
                ${item.imagen_url
                  ? `<img src="${escHtml(item.imagen_url)}" alt="${escHtml(item.nombre)}" onerror="this.parentElement.innerHTML='${catEmoji(item.categoria)}';">`
                  : catEmoji(item.categoria)}
              </div>
              <div class="inv-info">
                <div class="inv-nombre">${escHtml(item.nombre)}</div>
                <span class="producto-cat cat-${item.categoria}">${catLabel(item.categoria)}</span>
                <div class="inv-precio">Pagado: ${formatCLP(item.precio_pagado)}</div>
                <div class="inv-fecha">${fecha}</div>
              </div>
            </div>`;
        }).join('');
      } catch(e) {
        document.getElementById('inventario-loading').style.display = 'none';
        document.getElementById('inventario-wrap').style.display = 'block';
        document.getElementById('inventario-grid').innerHTML = '<div class="tienda-empty">Error al cargar el inventario.</div>';
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
