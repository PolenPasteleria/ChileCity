    // EMPRESAS
    // ══════════════════════════════════════════════════════════════════════════
    const EMP_LIMIT = 8; // empresas por página (tanto vista pública como admin)

    // ── Vista pública ─────────────────────────────────────────────────────────
    let empPaginaActual = 1;
    let empTotal = 0;

    async function cargarEmpresas(page = 1) {
      const loading = document.getElementById('emp-loading');
      const lista   = document.getElementById('emp-lista');
      const pagBox  = document.getElementById('emp-paginacion');
      loading.style.display = 'flex';
      lista.innerHTML = '';
      pagBox.innerHTML = '';

      try {
        const res = await fetch(`/api/admin?action=empresas_listar&page=${page}&limit=${EMP_LIMIT}`);
        if (!res.ok) throw new Error('Error ' + res.status);
        const data = await res.json();
        loading.style.display = 'none';

        empPaginaActual = data.page || page;
        empTotal = data.total || 0;

        renderEmpresas(data.empresas || []);
        renderPaginacion(pagBox, empPaginaActual, empTotal, EMP_LIMIT, cargarEmpresas);
      } catch (e) {
        loading.style.display = 'none';
        lista.innerHTML = '<div class="tienda-empty">Error al cargar las empresas.</div>';
      }
    }

    function renderEmpresas(lista) {
      const el = document.getElementById('emp-lista');
      if (!lista.length) {
        el.innerHTML = '<div class="tienda-empty">No hay ninguna empresa registrada por el momento.</div>';
        return;
      }
      el.innerHTML = lista.map(e => `
        <div class="empresa-card">
          <div class="empresa-logo">
            ${e.logo_url
              ? `<img src="${escHtml(e.logo_url)}" alt="${escHtml(e.nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='🏢';">`
              : '🏢'}
          </div>
          <div class="empresa-info">
            <div class="empresa-nombre">${escHtml(e.nombre)}</div>
            <div class="empresa-desc">${escHtml(e.descripcion || 'Sin descripción.')}</div>
          </div>
          ${e.dueno_nombre ? `
          <div class="empresa-dueno">
            <div class="empresa-dueno-avatar">
              ${e.dueno_avatar_url
                ? `<img src="${escHtml(e.dueno_avatar_url)}" alt="${escHtml(e.dueno_nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='👤';">`
                : '👤'}
            </div>
            <span>Dueño: <strong>${escHtml(e.dueno_nombre)}</strong></span>
          </div>` : ''}
          <a class="btn-discord-empresa" href="${escHtml(e.discord_url)}" target="_blank" rel="noopener noreferrer">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.056a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
            Ir al Discord
          </a>
        </div>`).join('');
    }

    // Construye una barra de paginación numerada genérica (Anterior · 1 2 3 · Siguiente).
    // callback(page) se llama al hacer click en cualquier botón.
    function renderPaginacion(container, page, total, limit, callback) {
      const totalPaginas = Math.max(1, Math.ceil(total / limit));
      if (totalPaginas <= 1) { container.innerHTML = ''; return; }

      let html = '';
      html += `<button class="emp-pag-btn" ${page <= 1 ? 'disabled' : ''} onclick="(${callback.name})(${page - 1})">‹ Anterior</button>`;
      for (let i = 1; i <= totalPaginas; i++) {
        html += `<button class="emp-pag-btn ${i === page ? 'activo' : ''}" onclick="(${callback.name})(${i})">${i}</button>`;
      }
      html += `<button class="emp-pag-btn" ${page >= totalPaginas ? 'disabled' : ''} onclick="(${callback.name})(${page + 1})">Siguiente ›</button>`;
      container.innerHTML = html;
    }

    // ── Panel admin ──────────────────────────────────────────────────────────
    let aePaginaActual = 1;
    let aeTotal = 0;

    function adminEmpresasTab(tab) {
      document.querySelectorAll('.ae-tab').forEach((t, i) => {
        const ids = ['listado', 'crear'];
        t.classList.toggle('active', ids[i] === tab);
        document.getElementById(`ae-tab-${ids[i]}`).classList.toggle('visible', ids[i] === tab);
      });
      if (tab === 'listado') cargarAdminEmpresas();
    }

    async function cargarAdminEmpresas(page = 1) {
      const loading = document.getElementById('ae-loading');
      const lista   = document.getElementById('ae-lista');
      const pagBox  = document.getElementById('ae-paginacion');
      loading.style.display = 'flex';
      lista.innerHTML = '';
      pagBox.innerHTML = '';

      try {
        const res = await fetch(`/api/admin?action=empresas_admin_listar&page=${page}&limit=${EMP_LIMIT}`);
        const data = await res.json();
        loading.style.display = 'none';
        if (!res.ok) {
          lista.innerHTML = `<div class="tienda-empty">${escHtml(data.error || 'Error al cargar.')}</div>`;
          return;
        }

        aePaginaActual = data.page || page;
        aeTotal = data.total || 0;

        renderAdminEmpresas(data.empresas || []);
        renderPaginacion(pagBox, aePaginaActual, aeTotal, EMP_LIMIT, cargarAdminEmpresas);
      } catch (e) {
        loading.style.display = 'none';
        lista.innerHTML = '<div class="tienda-empty">Error de conexión.</div>';
      }
    }

    let empresasAdminCache = {};

    function renderAdminEmpresas(lista) {
      const el = document.getElementById('ae-lista');
      empresasAdminCache = {};
      lista.forEach(e => { empresasAdminCache[e.id] = e; });

      if (!lista.length) {
        el.innerHTML = '<div class="tienda-empty">Todavía no has creado ninguna empresa.</div>';
        return;
      }

      el.innerHTML = lista.map(e => `
        <div class="usuario-row">
          <div class="empresa-logo" style="width:46px;height:46px;flex-shrink:0;">
            ${e.logo_url
              ? `<img src="${escHtml(e.logo_url)}" alt="${escHtml(e.nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='🏢';">`
              : '🏢'}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;color:#fff;font-size:14px;">${escHtml(e.nombre)}</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.4);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">${escHtml(e.descripcion || 'Sin descripción')}</div>
            ${e.dueno_nombre ? `<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px;">Dueño: ${escHtml(e.dueno_nombre)}</div>` : ''}
          </div>
          <div class="ur-acciones">
            <button class="btn-small purple" onclick="abrirModalEditarEmpresa(${e.id})">Editar</button>
            <button class="btn-small red" onclick="adminEliminarEmpresa(${e.id})">Eliminar</button>
          </div>
        </div>`).join('');
    }

    async function adminCrearEmpresa() {
      const nombre        = document.getElementById('ae-nombre').value.trim();
      const logo_url      = document.getElementById('ae-logo').value.trim();
      const descripcion   = document.getElementById('ae-descripcion').value.trim();
      const discord_url   = document.getElementById('ae-discord').value.trim();
      const dueno_nombre  = document.getElementById('ae-dueno-nombre').value.trim();
      const dueno_avatar  = document.getElementById('ae-dueno-avatar').value.trim();
      const dueno_id      = document.getElementById('ae-dueno-id').value.trim();
      const errEl = document.getElementById('ae-crear-error');
      errEl.classList.remove('visible');

      if (!nombre || !discord_url || !dueno_nombre) {
        errEl.textContent = 'El nombre, el link de Discord y el nombre de Discord del dueño son obligatorios.';
        errEl.classList.add('visible');
        return;
      }
      if (!dueno_id || !/^\d{15,25}$/.test(dueno_id)) {
        errEl.textContent = 'El Discord ID del dueño es obligatorio y debe ser numérico.';
        errEl.classList.add('visible');
        return;
      }

      try {
        const res = await fetch('/api/admin?action=empresas_admin_crear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre, logo_url: logo_url || null, descripcion: descripcion || null, discord_url,
            dueno_nombre, dueno_avatar_url: dueno_avatar || null, dueno_discord_id: dueno_id,
          }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); return; }

        document.getElementById('ae-nombre').value = '';
        document.getElementById('ae-logo').value = '';
        document.getElementById('ae-descripcion').value = '';
        document.getElementById('ae-discord').value = '';
        document.getElementById('ae-dueno-nombre').value = '';
        document.getElementById('ae-dueno-avatar').value = '';
        document.getElementById('ae-dueno-id').value = '';
        mostrarToast('Empresa creada exitosamente. Se otorgó el logro "Empresario" al dueño.');
        adminEmpresasTab('listado');
      } catch (e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    function abrirModalEditarEmpresa(id) {
      const e = empresasAdminCache[id];
      if (!e) return;
      document.getElementById('ee-id').value = e.id;
      document.getElementById('ee-nombre').value = e.nombre;
      document.getElementById('ee-logo').value = e.logo_url || '';
      document.getElementById('ee-descripcion').value = e.descripcion || '';
      document.getElementById('ee-discord').value = e.discord_url;
      document.getElementById('ee-dueno-nombre').value = e.dueno_nombre || '';
      document.getElementById('ee-dueno-avatar').value = e.dueno_avatar_url || '';
      document.getElementById('ee-dueno-id').value = e.dueno_discord_id || '';
      document.getElementById('ee-error').classList.remove('visible');
      document.getElementById('modal-editar-empresa').classList.add('visible');
    }

    async function adminGuardarEdicionEmpresa() {
      const empresa_id     = document.getElementById('ee-id').value;
      const nombre         = document.getElementById('ee-nombre').value.trim();
      const logo_url       = document.getElementById('ee-logo').value.trim();
      const descripcion    = document.getElementById('ee-descripcion').value.trim();
      const discord_url    = document.getElementById('ee-discord').value.trim();
      const dueno_nombre   = document.getElementById('ee-dueno-nombre').value.trim();
      const dueno_avatar   = document.getElementById('ee-dueno-avatar').value.trim();
      const dueno_id       = document.getElementById('ee-dueno-id').value.trim();
      const errEl = document.getElementById('ee-error');
      errEl.classList.remove('visible');

      if (dueno_id && !/^\d{15,25}$/.test(dueno_id)) {
        errEl.textContent = 'El Discord ID del dueño debe ser numérico.';
        errEl.classList.add('visible');
        return;
      }

      try {
        const res = await fetch('/api/admin?action=empresas_admin_editar', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            empresa_id, nombre, logo_url, descripcion, discord_url,
            dueno_nombre, dueno_avatar_url: dueno_avatar, dueno_discord_id: dueno_id || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); return; }
        cerrarModal('modal-editar-empresa');
        mostrarToast('Empresa actualizada.');
        cargarAdminEmpresas(aePaginaActual);
      } catch (e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    async function adminEliminarEmpresa(id) {
      if (!confirm('¿Eliminar esta empresa? Esta acción no se puede deshacer.')) return;
      try {
        await fetch(`/api/admin?action=empresas_admin_eliminar&empresa_id=${id}`, { method: 'DELETE' });
        mostrarToast('Empresa eliminada.');
        cargarAdminEmpresas(aePaginaActual);
      } catch (e) {
        mostrarToast('Error al eliminar la empresa.', true);
      }
    }

    // Cerrar modal de edición al hacer click fuera
    document.getElementById('modal-editar-empresa').addEventListener('click', function(e) {
      if (e.target === this) cerrarModal('modal-editar-empresa');
    });
