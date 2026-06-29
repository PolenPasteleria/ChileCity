    // BANCO
    // ══════════════════════════════════════════════════════════════════════════
    async function cargarBanco() {
      if (!currentUser?.id) return;
      document.getElementById('banco-loading').style.display = 'flex';
      document.getElementById('banco-crear-form').style.display = 'none';
      document.getElementById('banco-cuenta-wrap').style.display = 'none';

      try {
        const res = await fetch(`/api/banco?action=cuenta&discord_id=${currentUser.id}`);
        document.getElementById('banco-loading').style.display = 'none';

        if (res.status === 404) {
          // Verificar si tiene DNI
          const dniRes = await fetch(`/api/dni?discord_id=${currentUser.id}`);
          const dniData = await dniRes.json();
          if (!dniData.existe) {
            const err = document.getElementById('banco-crear-error');
            err.textContent = 'Debes crear tu cédula de identidad (DNI) antes de abrir una cuenta bancaria.';
            err.classList.add('visible');
            document.getElementById('btn-abrir-cuenta').disabled = true;
          }
          document.getElementById('banco-crear-form').style.display = 'flex';
          return;
        }

        const data = await res.json();
        currentCuenta = data.cuenta;

        // Buscar DNI para nombre completo
        let dniData = { existe: false };
        try {
          const dr = await fetch(`/api/dni?discord_id=${currentUser.id}`);
          dniData = await dr.json();
          if (dniData.existe) currentDNI = dniData.dni;
        } catch(e){}

        mostrarTarjeta(data.cuenta, dniData.dni);
        document.getElementById('bank-saldo').textContent = formatCLP(data.cuenta.saldo);
        document.getElementById('banco-cuenta-wrap').style.display = 'flex';

        // Próximo sueldo
        if (data.proximoSueldo) {
          iniciarCountdown(data.proximoSueldo);
        } else {
          document.getElementById('proximo-sueldo-box').style.display = 'none';
        }

      } catch (err) {
        document.getElementById('banco-loading').style.display = 'none';
        document.getElementById('banco-crear-form').style.display = 'flex';
      }
    }

    function mostrarTarjeta(cuenta, dni) {
      document.getElementById('bank-numero').textContent = cuenta.numero_cuenta;
      if (dni) {
        document.getElementById('bank-titular').textContent = `${dni.nombre1} ${dni.apellido1}`;
        document.getElementById('bank-rut').textContent = dni.rut;
      }
    }


    function iniciarCountdown(ps) {
      const box = document.getElementById('proximo-sueldo-box');
      box.style.display = 'flex';
      document.getElementById('ps-nombre').textContent = ps.nombre;
      if (countdownInterval) clearInterval(countdownInterval);

      function actualizar() {
        const ms = ps.msRestantes - (Date.now() - iniciadoEn);
        if (ms <= 0) {
          document.getElementById('ps-tiempo').textContent = 'Disponible ahora';
          clearInterval(countdownInterval);
          return;
        }
        const d = Math.floor(ms / 86400000);
        const h = Math.floor((ms % 86400000) / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        let txt = '';
        if (d > 0) txt += `${d}d `;
        if (h > 0) txt += `${h}h `;
        if (m > 0) txt += `${m}m `;
        txt += `${s}s`;
        document.getElementById('ps-tiempo').textContent = txt;
      }

      const iniciadoEn = Date.now();
      actualizar();
      countdownInterval = setInterval(actualizar, 1000);
    }

    async function crearCuenta() {
      const btn = document.getElementById('btn-abrir-cuenta');
      btn.disabled = true;
      btn.textContent = 'Creando...';

      try {
        const res = await fetch('/api/banco?action=crear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discord_id: currentUser.id }),
        });
        const data = await res.json();
        if (!res.ok) {
          const err = document.getElementById('banco-crear-error');
          err.textContent = data.error || 'Error al crear la cuenta.';
          err.classList.add('visible');
          btn.disabled = false;
          btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg> Crear Cuenta Bancaria`;
          return;
        }
        currentCuenta = data.cuenta;
        document.getElementById('banco-crear-form').style.display = 'none';
        document.getElementById('banco-loading').style.display = 'none';
        document.getElementById('bank-saldo').textContent = formatCLP(data.cuenta.saldo);
        if (currentDNI) mostrarTarjeta(data.cuenta, currentDNI);
        document.getElementById('banco-cuenta-wrap').style.display = 'flex';
        document.getElementById('proximo-sueldo-box').style.display = 'none';
      } catch (err) {
        btn.disabled = false;
      }
    }

    // Transferencia
    function mostrarTransferir() {
      ocultarSecciones();
      document.getElementById('transfer-form').style.display = 'flex';
    }
    function ocultarTransferir() {
      document.getElementById('transfer-form').style.display = 'none';
    }

    async function hacerTransferencia() {
      const rut   = document.getElementById('transfer-rut').value.trim();
      const monto = document.getElementById('transfer-monto').value.trim();
      const errEl = document.getElementById('transfer-error');
      const okEl  = document.getElementById('transfer-success');
      errEl.classList.remove('visible'); okEl.classList.remove('visible');

      if (!rut || !monto) {
        errEl.textContent = 'Completa el RUT y el monto.';
        errEl.classList.add('visible'); return;
      }

      const btn = document.getElementById('btn-transferir');
      btn.disabled = true; btn.textContent = 'Transfiriendo...';

      try {
        const res = await fetch('/api/banco?action=transferir', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ discord_id: currentUser.id, rut_destino: rut, monto }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible');
        } else {
          currentCuenta.saldo = data.nuevoSaldo;
          document.getElementById('bank-saldo').textContent = formatCLP(data.nuevoSaldo);
          okEl.textContent = `Transferencia exitosa. Nuevo saldo: ${formatCLP(data.nuevoSaldo)}`;
          okEl.classList.add('visible');
          document.getElementById('transfer-rut').value = '';
          document.getElementById('transfer-monto').value = '';
        }
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Transferir`;
    }

    // Historial
    async function mostrarHistorial() {
      const wrap = document.getElementById('historial-wrap');
      const lista = document.getElementById('historial-lista');
      ocultarSecciones();
      wrap.style.display = 'block';
      lista.innerHTML = '<div class="historial-vacio">Cargando...</div>';

      try {
        const res = await fetch(`/api/banco?action=historial&discord_id=${currentUser.id}`);
        const data = await res.json();
        if (!data.transacciones.length) {
          lista.innerHTML = '<div class="historial-vacio">Sin movimientos aún</div>';
          return;
        }
        lista.innerHTML = data.transacciones.map(t => {
          const signo = t.tipo === 'egreso' ? '-' : '+';
          const fecha = new Date(t.created_at).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});
          const icono = t.tipo === 'sueldo'
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
            : t.tipo === 'ingreso'
            ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`
            : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>`;
          return `<div class="historial-item">
            <div class="hi-icono ${t.tipo}">${icono}</div>
            <div class="hi-desc">
              <div class="hi-desc-titulo">${t.descripcion || t.tipo}</div>
              <div class="hi-desc-fecha">${fecha}</div>
            </div>
            <div class="hi-monto ${t.tipo}">${signo}${formatCLP(t.monto)}</div>
          </div>`;
        }).join('');
      } catch(e) {
        lista.innerHTML = '<div class="historial-vacio">Error al cargar historial</div>';
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ══════════════════════════════════════════════════════════════════════════
    function adminTab(tab) {
      document.querySelectorAll('.admin-tab').forEach((t,i) => {
        const ids = ['usuarios','sueldos'];
        t.classList.toggle('active', ids[i] === tab);
        document.getElementById(`admin-tab-${ids[i]}`).classList.toggle('visible', ids[i] === tab);
      });
    }

    async function cargarAdminUsuarios() {
      const loading = document.getElementById('admin-loading-users');
      const lista   = document.getElementById('admin-usuarios-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';

      try {
        const res = await fetch(`/api/banco?action=admin_usuarios&discord_id=${currentUser.id}`);
        const data = await res.json();
        loading.style.display = 'none';

        if (!data.usuarios?.length) {
          lista.innerHTML = '<div class="historial-vacio">No hay usuarios con cuenta bancaria.</div>';
          return;
        }

        lista.innerHTML = data.usuarios.map(u => `
          <div class="usuario-row">
            <div class="ur-info">
              <div class="ur-nombre">${u.nombre1 || '?'} ${u.apellido1 || ''}</div>
              <div class="ur-rut">${u.rut || u.discord_id}</div>
            </div>
            <div class="ur-saldo">${formatCLP(u.saldo)}</div>
            <div class="ur-acciones">
              <button class="btn-small purple" onclick="abrirModalSaldo('${u.discord_id}','${u.nombre1} ${u.apellido1}')">
                Ajustar
              </button>
              <button class="btn-small" style="background:rgba(245,158,11,0.15);color:var(--gold);border:1px solid rgba(245,158,11,0.25);"
                onclick="seleccionarParaSueldo('${u.discord_id}','${u.nombre1} ${u.apellido1}')">
                Sueldos
              </button>
              <button class="btn-small orange" onclick="abrirModalReset('${u.discord_id}','${u.nombre1} ${u.apellido1}')">
                Resetear
              </button>
            </div>
          </div>
        `).join('');
      } catch(e) {
        loading.style.display = 'none';
        lista.innerHTML = '<div class="historial-vacio">Error al cargar.</div>';
      }
    }

    function abrirModalSaldo(discordId, nombre) {
      adminTargetUser = { discordId, nombre };
      document.getElementById('modal-saldo-label').textContent = `Usuario: ${nombre}`;
      document.getElementById('modal-saldo-monto').value = '';
      document.getElementById('modal-saldo-desc').value  = '';
      document.getElementById('modal-saldo-error').classList.remove('visible');
      document.getElementById('modal-saldo').classList.add('visible');
    }

    async function adminConfirmarSaldo() {
      const monto = document.getElementById('modal-saldo-monto').value.trim();
      const desc  = document.getElementById('modal-saldo-desc').value.trim();
      const errEl = document.getElementById('modal-saldo-error');
      errEl.classList.remove('visible');

      if (!monto || isNaN(parseInt(monto))) {
        errEl.textContent = 'Ingresa un monto válido.';
        errEl.classList.add('visible'); return;
      }

      try {
        const res = await fetch('/api/banco?action=admin_saldo', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ admin_id: currentUser.id, discord_id_target: adminTargetUser.discordId, monto, descripcion: desc }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible'); return;
        }
        cerrarModal('modal-saldo');
        cargarAdminUsuarios();
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    function abrirModalReset(discordId, nombre) {
      adminTargetUser = { discordId, nombre };
      document.getElementById('modal-reset-label').textContent = `Usuario: ${nombre}`;
      document.getElementById('modal-reset-error').classList.remove('visible');
      document.getElementById('modal-reset').classList.add('visible');
    }

    async function adminConfirmarReset() {
      const errEl = document.getElementById('modal-reset-error');
      errEl.classList.remove('visible');

      try {
        const res = await fetch('/api/banco?action=admin_reset_cuenta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ admin_id: currentUser.id, discord_id_target: adminTargetUser.discordId }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.';
          errEl.classList.add('visible');
          return;
        }
        cerrarModal('modal-reset');
        cargarAdminUsuarios();
      } catch (e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
      }
    }

    function seleccionarParaSueldo(discordId, nombre) {
      adminTargetUser = { discordId, nombre };
      adminTab('sueldos');
      document.getElementById('admin-sueldo-target-label').textContent = `Gestionando sueldos de: ${nombre}`;
      document.getElementById('admin-sueldo-form-wrap').style.display = 'flex';
      document.getElementById('admin-sueldo-info').style.display = 'none';
      cargarSueldosTarget(discordId);
    }

    async function cargarSueldosTarget(discordId) {
      const lista = document.getElementById('admin-sueldos-lista-target');
      lista.innerHTML = '<div style="color:rgba(255,255,255,0.3);font-size:12px;">Cargando sueldos...</div>';

      try {
        const res = await fetch(`/api/banco?action=cuenta&discord_id=${discordId}`);
        const data = await res.json();
        const sueldos = data.sueldos || [];

        if (!sueldos.length) {
          lista.innerHTML = '<div class="historial-vacio">Sin sueldos activos.</div>';
          return;
        }

        lista.innerHTML = sueldos.map(s => `
          <div class="sueldo-item">
            <div class="si-info">
              <div class="si-nombre">${s.nombre}</div>
              <div class="si-detalle">${formatCLP(s.monto)} cada ${s.dias} día(s)</div>
            </div>
            <button class="btn-small red" onclick="adminEliminarSueldo(${s.id})">Quitar</button>
          </div>
        `).join('');
      } catch(e) {
        lista.innerHTML = '<div class="historial-vacio">Error al cargar.</div>';
      }
    }

    async function adminCrearSueldo() {
      if (!adminTargetUser) return;
      const nombre = document.getElementById('admin-sueldo-nombre').value.trim();
      const monto  = document.getElementById('admin-sueldo-monto').value.trim();
      const dias   = document.getElementById('admin-sueldo-dias').value.trim();
      const errEl  = document.getElementById('admin-sueldo-error');
      errEl.classList.remove('visible');

      if (!nombre || !monto || !dias) {
        errEl.textContent = 'Completa todos los campos.'; errEl.classList.add('visible'); return;
      }

      try {
        const res = await fetch('/api/banco?action=admin_sueldo_crear', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ admin_id: currentUser.id, discord_id_target: adminTargetUser.discordId, nombre, monto, dias }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error.'; errEl.classList.add('visible'); return;
        }
        document.getElementById('admin-sueldo-nombre').value = '';
        document.getElementById('admin-sueldo-monto').value  = '';
        document.getElementById('admin-sueldo-dias').value   = '';
        cargarSueldosTarget(adminTargetUser.discordId);
      } catch(e) {
        errEl.textContent = 'Error de conexión.'; errEl.classList.add('visible');
      }
    }

    async function adminEliminarSueldo(sueldoId) {
      try {
        await fetch(`/api/banco?action=admin_sueldo_borrar&admin_id=${currentUser.id}&sueldo_id=${sueldoId}`, {
          method: 'DELETE',
        });
        cargarSueldosTarget(adminTargetUser.discordId);
      } catch(e) {}
    }

    function cerrarModal(id) {
      document.getElementById(id).classList.remove('visible');
    }

    // Cerrar modal al hacer click fuera
    document.getElementById('modal-editar-prod').addEventListener('click', function(e) {
      if (e.target === this) cerrarModal('modal-editar-prod');
    });

    // ══════════════════════════════════════════════════════════════════════════

    // ── Contactos ─────────────────────────────────────────────────────────────
    function ocultarSecciones() {
      document.getElementById('transfer-form').style.display = 'none';
      document.getElementById('historial-wrap').style.display = 'none';
      document.getElementById('contactos-wrap').style.display = 'none';
    }

    async function mostrarContactos() {
      ocultarSecciones();
      document.getElementById('contactos-wrap').style.display = 'block';
      await cargarContactos();
    }

    async function cargarContactos() {
      const lista = document.getElementById('contactos-lista');
      lista.innerHTML = '<div class="historial-vacio">Cargando...</div>';
      try {
        const res = await fetch('/api/banco?action=contactos');
        const data = await res.json();
        const contactos = data.contactos || [];
        if (!contactos.length) {
          lista.innerHTML = '<div class="historial-vacio">No tienes contactos guardados aún</div>';
          return;
        }
        lista.innerHTML = contactos.map(c => `
          <div class="historial-item" style="cursor:default;">
            <div class="hi-icono ingreso" style="background:rgba(139,92,246,0.15); color:#8B5CF6;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <div class="hi-desc" style="flex:1;">
              <div class="hi-desc-titulo">${c.nombre}</div>
              <div class="hi-desc-fecha">${c.rut}</div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <button class="btn-small" style="background:rgba(16,185,129,0.12);color:#10B981;border:1px solid rgba(16,185,129,0.25);font-size:11px;padding:4px 10px;"
                onclick="transferirAContacto('${c.rut}')">Transferir</button>
              <button class="btn-small red" style="font-size:11px;padding:4px 10px;"
                onclick="eliminarContacto(${c.id})">✕</button>
            </div>
          </div>
        `).join('');
      } catch(e) {
        lista.innerHTML = '<div class="historial-vacio">Error al cargar contactos</div>';
      }
    }

    function mostrarFormAgregarContacto() {
      const form = document.getElementById('contactos-agregar-form');
      form.style.display = 'flex';
      document.getElementById('btn-mostrar-agregar-contacto').style.display = 'none';
      document.getElementById('nuevo-contacto-nombre').value = '';
      document.getElementById('nuevo-contacto-rut').value = '';
      document.getElementById('contacto-error').classList.remove('visible');
    }

    function ocultarFormAgregarContacto() {
      document.getElementById('contactos-agregar-form').style.display = 'none';
      document.getElementById('btn-mostrar-agregar-contacto').style.display = '';
    }

    async function agregarContacto() {
      const nombre = document.getElementById('nuevo-contacto-nombre').value.trim();
      const rut    = document.getElementById('nuevo-contacto-rut').value.trim();
      const errEl  = document.getElementById('contacto-error');
      errEl.classList.remove('visible');

      if (!nombre || !rut) {
        errEl.textContent = 'Completa el nombre y el RUT.';
        errEl.classList.add('visible'); return;
      }

      try {
        const res = await fetch('/api/banco?action=contacto_agregar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre, rut }),
        });
        const data = await res.json();
        if (!res.ok) {
          errEl.textContent = data.error || 'Error al guardar.';
          errEl.classList.add('visible'); return;
        }
        ocultarFormAgregarContacto();
        await cargarContactos();
      } catch(e) {
        errEl.textContent = 'Error de conexión.';
        errEl.classList.add('visible');
      }
    }

    async function eliminarContacto(id) {
      try {
        await fetch(`/api/banco?action=contacto_borrar&id=${id}`, { method: 'DELETE' });
        await cargarContactos();
      } catch(e) {}
    }

    function transferirAContacto(rut) {
      ocultarSecciones();
      document.getElementById('transfer-form').style.display = 'flex';
      document.getElementById('transfer-rut').value = rut;
      document.getElementById('transfer-monto').focus();
    }
