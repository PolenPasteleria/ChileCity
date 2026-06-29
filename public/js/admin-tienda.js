    // ADMIN TIENDA
    // ══════════════════════════════════════════════════════════════════════════
    function adminTiendaTab(tab) {
      document.querySelectorAll('.ta-tab').forEach((t, i) => {
        const ids = ['productos','inventarios','crear'];
        t.classList.toggle('active', ids[i] === tab);
        document.getElementById(`at-tab-${ids[i]}`).classList.toggle('visible', ids[i] === tab);
      });
      if (tab === 'productos')    cargarAdminProductos();
      if (tab === 'inventarios')  cargarAdminInventarios();
    }

    let todosLosProductosAdmin = [];

    function aplicarFiltrosAdmin() {
      const q = (document.getElementById('admin-tienda-search')?.value || '').trim().toLowerCase();
      const lista = q
        ? todosLosProductosAdmin.filter(p => p.nombre.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q))
        : todosLosProductosAdmin;
      renderAdminProductos(lista);
    }

    function renderAdminProductos(lista) {
      const el = document.getElementById('at-productos-lista');
      if (!lista.length) {
        el.innerHTML = '<div class="historial-vacio">No se encontraron productos.</div>';
        return;
      }
      el.innerHTML = lista.map(p => `
          <div class="admin-producto-row" id="apr-${p.id}">
            <div class="apr-img">
              ${p.imagen_url
                ? `<img src="${escHtml(p.imagen_url)}" alt="${escHtml(p.nombre)}" onerror="this.parentElement.innerHTML='${catEmoji(p.categoria)}';">`
                : catEmoji(p.categoria)}
            </div>
            <div class="apr-info">
              <div class="apr-nombre">${escHtml(p.nombre)}</div>
              <div class="apr-meta">${catLabel(p.categoria)} · ${p.activo ? 'Activo' : 'Inactivo'}</div>
            </div>
            <div class="apr-precio">${formatearSaldo(p.precio)}</div>
            <div class="apr-acciones">
              <button class="btn-small purple" onclick="abrirModalEditar(${JSON.stringify(p).replace(/"/g,'&quot;')})">Editar</button>
              <button class="btn-small red" onclick="adminEliminarProducto(${p.id})">Eliminar</button>
            </div>
          </div>
        `).join('');
    }

    async function cargarAdminProductos() {
      if (!currentUser?.id) return;
      const loading = document.getElementById('at-loading');
      const lista   = document.getElementById('at-productos-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';

      try {
        const res  = await fetch(`/api/tienda?action=admin_productos&admin_id=${currentUser.id}`);
        const data = await res.json();
        loading.style.display = 'none';

        todosLosProductosAdmin = (data.productos || []).filter(p => p.activo !== false);
        if (!todosLosProductosAdmin.length) {
          lista.innerHTML = '<div class="historial-vacio">No hay productos. ¡Agrega el primero!</div>';
          return;
        }
        // Reset búsqueda al recargar
        const sq = document.getElementById('admin-tienda-search');
        if (sq) sq.value = '';
        renderAdminProductos(todosLosProductosAdmin);
      } catch(e) {
        loading.style.display = 'none';
        lista.innerHTML = '<div class="historial-vacio">Error al cargar.</div>';
      }
    }

    async function adminCrearProducto() {
      const nombre    = document.getElementById('at-nombre').value.trim();
      const precio    = document.getElementById('at-precio').value.trim();
      const categoria = document.getElementById('at-categoria').value;
      const imagen    = document.getElementById('at-imagen').value.trim();
      const errEl     = document.getElementById('at-crear-error');
      errEl.classList.remove('visible');

      if (!nombre || !precio || !categoria) {
        errEl.textContent = 'Completa nombre, precio y categoría.';
        errEl.classList.add('visible'); return;
      }

      try {
        const res  = await fetch('/api/tienda?action=admin_crear_producto', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: currentUser.id, nombre, precio, categoria, imagen_url: imagen || null }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); return; }

        document.getElementById('at-nombre').value   = '';
        document.getElementById('at-precio').value   = '';
        document.getElementById('at-categoria').value = '';
        document.getElementById('at-imagen').value   = '';
        mostrarToast('Producto creado exitosamente.');
        adminTiendaTab('productos');
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    function abrirModalEditar(p) {
      document.getElementById('ep-id').value       = p.id;
      document.getElementById('ep-nombre').value   = p.nombre;
      document.getElementById('ep-precio').value   = p.precio;
      document.getElementById('ep-categoria').value = p.categoria;
      document.getElementById('ep-imagen').value   = p.imagen_url || '';
      document.getElementById('ep-error').classList.remove('visible');
      document.getElementById('modal-editar-prod').classList.add('visible');
    }

    async function adminGuardarEdicion() {
      const id        = document.getElementById('ep-id').value;
      const nombre    = document.getElementById('ep-nombre').value.trim();
      const precio    = document.getElementById('ep-precio').value.trim();
      const categoria = document.getElementById('ep-categoria').value;
      const imagen    = document.getElementById('ep-imagen').value.trim();
      const errEl     = document.getElementById('ep-error');
      errEl.classList.remove('visible');

      try {
        const res = await fetch('/api/tienda?action=admin_editar_producto', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: currentUser.id, producto_id: id, nombre, precio, categoria, imagen_url: imagen || null }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); return; }
        cerrarModal('modal-editar-prod');
        mostrarToast('Producto actualizado.');
        cargarAdminProductos();
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    async function adminEliminarProducto(productoId) {
      if (!confirm('¿Eliminar este producto de la tienda?')) return;
      try {
        const r = await fetch(`/api/tienda?action=admin_eliminar_producto&admin_id=${currentUser.id}&producto_id=${productoId}`, {
          method: 'DELETE',
        });
        if (!r.ok) { mostrarToast('Error al eliminar.', true); return; }
        // Quitar fila del DOM directamente, sin recargar
        const row = document.getElementById(`apr-${productoId}`);
        if (row) row.remove();
        // Quitar del array en memoria
        todosLosProductosAdmin = todosLosProductosAdmin.filter(p => p.id !== productoId);
        const listaEl = document.getElementById('at-productos-lista');
        if (listaEl && !listaEl.children.length)
          listaEl.innerHTML = '<div class="historial-vacio">No hay productos. ¡Agrega el primero!</div>';
        mostrarToast('Producto eliminado.');
      } catch(e) { mostrarToast('Error al eliminar.', true); }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ADMIN TIENDA: INVENTARIOS POR USUARIO
    // ══════════════════════════════════════════════════════════════════════════
    let invAdminUsuariosData = [];
    let invAdminSelectedUser = null;

    // Listener búsqueda inventarios admin
    (function() {
      const si = document.getElementById('inv-admin-search');
      if (si) si.addEventListener('input', filtrarInvAdminUsuarios);
    })();

    async function cargarAdminInventarios() {
      if (!currentUser?.id) return;
      const loading = document.getElementById('inv-admin-loading');
      const lista   = document.getElementById('inv-admin-usuarios-lista');
      loading.style.display = 'flex';
      lista.innerHTML = '';
      invAdminSelectedUser = null;

      try {
        const res  = await fetch(`/api/tienda?action=admin_inventarios&admin_id=${currentUser.id}`);
        const data = await res.json();
        loading.style.display = 'none';

        invAdminUsuariosData = data.usuarios || [];

        if (!invAdminUsuariosData.length) {
          lista.innerHTML = '<div class="historial-vacio">No hay inventarios registrados.</div>';
          return;
        }

        const sq = document.getElementById('inv-admin-search');
        if (sq) sq.value = '';
        renderInvAdminUsuarios(invAdminUsuariosData);
      } catch(e) {
        loading.style.display = 'none';
        lista.innerHTML = '<div class="historial-vacio">Error al cargar inventarios.</div>';
      }
    }

    function filtrarInvAdminUsuarios() {
      const q = (document.getElementById('inv-admin-search')?.value || '').trim().toLowerCase();
      const lista = q
        ? invAdminUsuariosData.filter(u =>
            (u.nombre || '').toLowerCase().includes(q) ||
            (u.rut || '').toLowerCase().includes(q) ||
            (u.discord_id || '').toLowerCase().includes(q))
        : invAdminUsuariosData;
      renderInvAdminUsuarios(lista);
    }

    function renderInvAdminUsuarios(lista) {
      const el = document.getElementById('inv-admin-usuarios-lista');
      if (!lista.length) {
        el.innerHTML = '<div class="historial-vacio">No se encontraron usuarios.</div>';
        return;
      }
      el.innerHTML = lista.map(u => `
        <div class="inv-admin-user-row" id="iau-${u.discord_id}" onclick="toggleInvAdminUser('${u.discord_id}')">
          <div class="iau-info">
            <div class="iau-nombre">${escHtml(u.nombre || u.discord_id)}</div>
            <div class="iau-rut">${escHtml(u.rut || 'Sin RUT')}</div>
          </div>
          <div class="iau-count">${u.cantidad} item${u.cantidad !== 1 ? 's' : ''}</div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" stroke-width="2" style="flex-shrink:0;transition:transform 0.2s;" id="iau-chevron-${u.discord_id}"><polyline points="6 9 12 15 18 9"/></svg>
          <div id="iau-items-${u.discord_id}" style="display:none;width:100%;margin-top:8px;"></div>
        </div>
      `).join('');
    }

    async function toggleInvAdminUser(discordId) {
      const itemsWrap = document.getElementById(`iau-items-${discordId}`);
      const chevron   = document.getElementById(`iau-chevron-${discordId}`);
      const row       = document.getElementById(`iau-${discordId}`);

      if (itemsWrap.style.display !== 'none') {
        itemsWrap.style.display = 'none';
        chevron.style.transform = '';
        row.classList.remove('selected');
        return;
      }

      row.classList.add('selected');
      chevron.style.transform = 'rotate(180deg)';
      itemsWrap.style.display = 'block';
      itemsWrap.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px;padding:8px 0;">Cargando...</div>';

      try {
        const res  = await fetch(`/api/tienda?action=admin_inventario_usuario&admin_id=${currentUser.id}&discord_id=${discordId}`);
        const data = await res.json();
        const items = data.items || [];

        if (!items.length) {
          itemsWrap.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px;padding:8px 0;">Sin items.</div>';
          return;
        }

        itemsWrap.innerHTML = `
          <div class="inv-admin-items-wrap">
            ${items.map(item => {
              const fecha = new Date(item.comprado_at).toLocaleDateString('es-CL', {day:'2-digit',month:'2-digit',year:'2-digit'});
              return `
                <div class="inv-admin-item-row" id="iai-${item.id}">
                  <div class="iai-img">
                    ${item.imagen_url
                      ? `<img src="${escHtml(item.imagen_url)}" alt="${escHtml(item.nombre)}" onerror="this.parentElement.innerHTML='${catEmoji(item.categoria)}';">`
                      : catEmoji(item.categoria)}
                  </div>
                  <div class="iai-info">
                    <div class="iai-nombre">${escHtml(item.nombre)}</div>
                    <div class="iai-meta">${catLabel(item.categoria)} · ${fecha}</div>
                  </div>
                  <div class="iai-precio">${formatearSaldo(item.precio_pagado)}</div>
                  <button class="btn-small red" onclick="adminEliminarItemInventario(${item.id}, '${discordId}')">Eliminar</button>
                </div>`;
            }).join('')}
          </div>`;
      } catch(e) {
        itemsWrap.innerHTML = '<div style="color:#ff8080;font-size:12px;padding:8px 0;">Error al cargar items.</div>';
      }
    }

    async function adminEliminarItemInventario(itemId, discordId) {
      if (!confirm('¿Eliminar este item del inventario del usuario?')) return;
      try {
        const res = await fetch(`/api/tienda?action=admin_eliminar_item_inventario&admin_id=${currentUser.id}&item_id=${itemId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          // Quitar fila del DOM
          const row = document.getElementById(`iai-${itemId}`);
          if (row) row.remove();

          // Actualizar contador
          const usuario = invAdminUsuariosData.find(u => u.discord_id === discordId);
          if (usuario) {
            usuario.cantidad = Math.max(0, usuario.cantidad - 1);
            const countEl = document.querySelector(`#iau-${discordId} .iau-count`);
            if (countEl) countEl.textContent = `${usuario.cantidad} item${usuario.cantidad !== 1 ? 's' : ''}`;
          }
          mostrarToast('Item eliminado del inventario.');
        } else {
          mostrarToast('Error al eliminar el item.', true);
        }
      } catch(e) {
        mostrarToast('Error de conexión.', true);
      }
    }


    // ══════════════════════════════════════════════════════════════════════════
