    // ── PANEL ADMIN: funciones ────────────────────────────────────────────────
    async function paCargarAdmins() {
      if (!currentUser || currentUser.id !== SUPER_ADMIN_ID) return;
      const loading = document.getElementById('pa-loading');
      const lista   = document.getElementById('pa-lista');
      const contador = document.getElementById('pa-contador');
      const formWrap = document.getElementById('pa-form-wrap');

      loading.style.display = 'flex';
      lista.innerHTML = '';

      try {
        const r = await fetch(`/api/admin?action=listar&discord_id=${currentUser.id}`);
        const data = await r.json();
        loading.style.display = 'none';

        if (!r.ok) { lista.innerHTML = `<p style="color:#f87171;">${data.error}</p>`; return; }

        const admins = data.admins;
        const extras = admins.filter(a => a.discord_id !== SUPER_ADMIN_ID).length;
        contador.textContent = `${extras + 1}/5`;

        // Deshabilitar formulario si se llegó al límite
        formWrap.style.opacity = extras >= 4 ? '0.5' : '1';
        formWrap.style.pointerEvents = extras >= 4 ? 'none' : 'auto';

        admins.forEach(admin => {
          const esSuperAdmin = admin.discord_id === SUPER_ADMIN_ID;
          const div = document.createElement('div');
          div.style.cssText = 'display:flex;align-items:center;justify-content:space-between;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:14px 16px;';
          div.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:14px;color:#fff;font-weight:500;">${admin.nombre || 'Sin nombre'}</span>
                ${esSuperAdmin ? '<span style="font-size:10px;background:rgba(220,38,38,0.3);color:#fca5a5;padding:2px 8px;border-radius:20px;font-weight:600;">SUPER ADMIN</span>' : '<span style="font-size:10px;background:rgba(168,85,247,0.25);color:#d8b4fe;padding:2px 8px;border-radius:20px;">ADMIN</span>'}
              </div>
              <span style="font-size:11px;color:#6b7280;font-family:monospace;">${admin.discord_id}</span>
            </div>
            ${esSuperAdmin ? '' : `<button onclick="paEliminarAdmin('${admin.discord_id}')" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:8px;padding:7px 14px;color:#f87171;font-size:12px;cursor:pointer;">Eliminar</button>`}
          `;
          lista.appendChild(div);
        });

        if (admins.length === 0) {
          lista.innerHTML = '<p style="color:#6b7280;font-size:13px;">No hay admins registrados.</p>';
        }
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;">Error al cargar admins.</p>';
      }
    }

    async function paAgregarAdmin() {
      if (!currentUser || currentUser.id !== SUPER_ADMIN_ID) return;
      const targetId = document.getElementById('pa-input-id').value.trim();
      const nombre   = document.getElementById('pa-input-nombre').value.trim();
      const msg      = document.getElementById('pa-msg');

      if (!targetId) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa un Discord ID.'; return; }

      msg.style.color = '#9ca3af'; msg.textContent = 'Agregando...';

      try {
        const r = await fetch('/api/admin?action=agregar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discord_id: currentUser.id, target_id: targetId, nombre: nombre || null })
        });
        const data = await r.json();
        if (!r.ok) {
          msg.style.color = '#f87171'; msg.textContent = data.error;
          return;
        }
        msg.style.color = '#4ade80'; msg.textContent = '✓ Admin agregado correctamente.';
        document.getElementById('pa-input-id').value = '';
        document.getElementById('pa-input-nombre').value = '';
        paCargarAdmins();
      } catch {
        msg.style.color = '#f87171'; msg.textContent = 'Error de conexión.';
      }
    }

    async function paEliminarAdmin(targetId) {
      if (!currentUser || currentUser.id !== SUPER_ADMIN_ID) return;
      if (!confirm('¿Eliminar este admin?')) return;

      try {
        const r = await fetch(`/api/admin?action=eliminar&discord_id=${currentUser.id}&target_id=${targetId}`, {
          method: 'DELETE'
        });
        const data = await r.json();
        if (!r.ok) { toast.err(data.error || 'Error desconocido'); return; }
        paCargarAdmins();
      } catch {
        toast.err('Error al eliminar admin.');
      }
    }


    // ══════════════════════════════════════════════════════════════════════
