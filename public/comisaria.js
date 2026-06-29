    // COMISARÍA VIRTUAL
    // ══════════════════════════════════════════════════════════════════════

    let cvEsPolicia = false;

    // Tabs de comisaría
    const CV_TABS_USUARIO = [
      { id: 'mis-multas',     label: '🏷 Mis Multas' },
      { id: 'mis-antecedentes', label: '📋 Mis Antecedentes' },
      { id: 'denuncia',       label: '📣 Realizar Denuncia' },
    ];
    const CV_TABS_POLICIA = [
      { id: 'agregar-multa',  label: '➕ Agregar Multa' },
      { id: 'bd-multas',      label: '📂 BD Multas' },
      { id: 'agregar-antec',  label: '➕ Agregar Antecedente' },
      { id: 'bd-antec',       label: '📂 BD Antecedentes' },
      { id: 'bd-denuncias',   label: '📂 BD Denuncias' },
      { id: 'logs',           label: '🔎 Logs' },
    ];

    function cvSetTab(id) {
      document.querySelectorAll('#cv-tabs .admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#cv-contenido .admin-seccion').forEach(s => s.classList.remove('visible'));
      const btn = document.querySelector(`#cv-tabs [data-tab="${id}"]`);
      if (btn) btn.classList.add('active');
      const sec = document.getElementById(`cv-tab-${id}`);
      if (sec) sec.classList.add('visible');

      // Auto-cargar al cambiar de tab
      if (id === 'mis-multas')       cvCargarMisMultas();
      if (id === 'mis-antecedentes') cvCargarMisAntecedentes();
      if (id === 'denuncia')         document.getElementById('den-fecha').value = new Date().toLocaleDateString('es-CL');
      if (id === 'bd-multas')        cvCargarBDMultas();
      if (id === 'bd-antec')         cvCargarBDAntecedentes();
      if (id === 'bd-denuncias')     cvCargarBDDenuncias();
      if (id === 'logs')             cvCargarLogs();
    }

    function cvConstruirTabs() {
      const container = document.getElementById('cv-tabs');
      container.innerHTML = '';
      const todos = cvEsPolicia
        ? [...CV_TABS_USUARIO, ...CV_TABS_POLICIA]
        : CV_TABS_USUARIO;

      todos.forEach((t, i) => {
        const btn = document.createElement('button');
        btn.className = 'admin-tab' + (i === 0 ? ' active' : '');
        btn.dataset.tab = t.id;
        btn.textContent = t.label;
        btn.onclick = () => cvSetTab(t.id);
        container.appendChild(btn);
      });

      // Mostrar/ocultar secciones policiales
      document.querySelectorAll('.cv-policia-tab').forEach(el => {
        el.style.display = cvEsPolicia ? '' : 'none';
      });
    }

    async function abrirComisaria() {
      abrirSeccion('comisaria-screen');
      // Resetear estado
      document.getElementById('cv-acceso-loading').style.display = 'flex';
      document.getElementById('cv-contenido').style.display = 'none';
      const barra = document.getElementById('cv-barra-progreso');
      barra.style.width = '0%';

      // Animación barra progreso
      setTimeout(() => { barra.style.width = '60%'; }, 100);
      setTimeout(() => { barra.style.width = '85%'; }, 600);

      try {
        const r = await fetch('/api/comisaria?action=verificar');
        const data = await r.json();
        cvEsPolicia = data.esPolicia || false;
      } catch {
        cvEsPolicia = false;
      }

      barra.style.width = '100%';
      await new Promise(res => setTimeout(res, 500));

      document.getElementById('cv-acceso-loading').style.display = 'none';
      const contenido = document.getElementById('cv-contenido');
      contenido.style.display = 'flex';

      cvConstruirTabs();
      cvSetTab('mis-multas');
    }

    // ── Mis Multas ─────────────────────────────────────────────────────
    async function cvCargarMisMultas() {
      const loading = document.getElementById('cv-mis-multas-loading');
      const lista   = document.getElementById('cv-mis-multas-lista');
      loading.style.display = 'flex';
      lista.innerHTML = '';
      try {
        const r    = await fetch('/api/comisaria?action=misMultas');
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.multas || data.multas.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:14px;text-align:center;padding:32px 0;">No tienes multas registradas.</p>';
          return;
        }
        data.multas.forEach(m => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:8px;';
          const estadoColor = m.estado === 'pagada' ? '#4ade80' : '#fbbf24';
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <span style="font-weight:700;color:#fff;font-size:15px;">${cvEsc(m.motivo)}</span>
              <span style="background:rgba(0,0,0,0.3);border-radius:99px;padding:3px 12px;font-size:12px;font-weight:600;color:${estadoColor};">${m.estado.toUpperCase()}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;font-size:13px;color:rgba(255,255,255,0.55);">
              <span>💰 Valor: <b style="color:#fbbf24;">$${Number(m.valor).toLocaleString('es-CL')}</b></span>
              <span>📅 Emitida: ${cvFecha(m.created_at)}</span>
              <span>⏰ Vence: ${m.fecha_limite}</span>
              <span>👮 ${cvEsc(m.funcionario_nombre || m.funcionario_id)}</span>
            </div>
            <div style="font-size:11px;color:rgba(255,255,255,0.25);">ID Funcionario: ${cvEsc(m.funcionario_id)}</div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar multas.</p>';
      }
    }

    // ── Mis Antecedentes ───────────────────────────────────────────────
    async function cvCargarMisAntecedentes() {
      const loading = document.getElementById('cv-mis-antec-loading');
      const lista   = document.getElementById('cv-mis-antec-lista');
      loading.style.display = 'flex';
      lista.innerHTML = '';
      try {
        const r    = await fetch('/api/comisaria?action=misAntecedentes');
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.antecedentes || data.antecedentes.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:14px;text-align:center;padding:32px 0;">No existen antecedentes registrados.</p>';
          return;
        }
        data.antecedentes.forEach(a => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:16px;display:flex;gap:16px;';
          const fotoHtml = a.foto_url
            ? `<img src="${cvEsc(a.foto_url)}" style="width:72px;height:72px;object-fit:cover;border-radius:10px;border:1px solid rgba(255,255,255,0.1);flex-shrink:0;" onerror="this.style.display='none'">`
            : `<div style="width:72px;height:72px;background:rgba(255,255,255,0.06);border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:28px;">📷</div>`;
          card.innerHTML = `
            ${fotoHtml}
            <div style="display:flex;flex-direction:column;gap:6px;flex:1;">
              <span style="font-weight:700;color:#f87171;font-size:15px;">${cvEsc(a.motivo)}</span>
              <div style="font-size:13px;color:rgba(255,255,255,0.55);display:grid;grid-template-columns:1fr 1fr;gap:4px 16px;">
                <span>📜 Artículos: ${cvEsc(a.articulos || '—')}</span>
                <span>⏱ Cárcel: ${cvEsc(a.tiempo_carcel || '—')}</span>
                <span>📅 Fecha: ${cvFecha(a.created_at)}</span>
                <span>👮 ${cvEsc(a.funcionario_nombre || a.funcionario_id)}</span>
              </div>
              <div style="font-size:11px;color:rgba(255,255,255,0.25);">ID Funcionario: ${cvEsc(a.funcionario_id)}</div>
            </div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar antecedentes.</p>';
      }
    }

    // ── Enviar Denuncia ────────────────────────────────────────────────
    async function cvEnviarDenuncia() {
      const motivo      = document.getElementById('den-motivo').value.trim();
      const descripcion = document.getElementById('den-descripcion').value.trim();
      const evidencia   = document.getElementById('den-evidencia').value.trim();
      const errEl       = document.getElementById('den-error');
      const okEl        = document.getElementById('den-ok');
      errEl.style.display = 'none';
      okEl.style.display  = 'none';
      if (!motivo || !descripcion) { errEl.textContent = 'El motivo y la descripción son obligatorios.'; errEl.style.display = 'block'; return; }
      try {
        const r = await fetch('/api/comisaria?action=crearDenuncia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ motivo, descripcion, evidencia_url: evidencia || null })
        });
        const data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error al enviar denuncia.'; errEl.style.display = 'block'; return; }
        okEl.textContent = '✓ Denuncia enviada correctamente.';
        okEl.style.display = 'block';
        document.getElementById('den-motivo').value = '';
        document.getElementById('den-descripcion').value = '';
        document.getElementById('den-evidencia').value = '';
      } catch {
        errEl.textContent = 'Error de conexión.';
        errEl.style.display = 'block';
      }
    }

    // ── Buscar Ciudadano (formularios policía) ─────────────────────────
    async function cvBuscarCiudadano(ctx) {
      const inputId = ctx === 'multa' ? 'multa-buscar' : 'antec-buscar';
      const resId   = ctx === 'multa' ? 'multa-buscar-resultados' : 'antec-buscar-resultados';
      const q = document.getElementById(inputId).value.trim();
      if (!q) return;
      const resDiv = document.getElementById(resId);
      resDiv.style.display = 'block';
      resDiv.innerHTML = '<p style="padding:10px 14px;color:rgba(255,255,255,0.4);font-size:13px;">Buscando...</p>';
      try {
        const r    = await fetch(`/api/comisaria?action=buscarCiudadano&q=${encodeURIComponent(q)}`);
        const data = await r.json();
        if (!data.ciudadanos || data.ciudadanos.length === 0) {
          resDiv.innerHTML = '<p style="padding:10px 14px;color:rgba(255,255,255,0.3);font-size:13px;">Sin resultados.</p>';
          return;
        }
        resDiv.innerHTML = '';
        data.ciudadanos.forEach(c => {
          const row = document.createElement('div');
          row.style.cssText = 'padding:10px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;color:#fff;';
          row.innerHTML = `<b>${cvEsc(c.nombre_completo)}</b> <span style="color:rgba(255,255,255,0.4);">DNI: ${cvEsc(c.dni || '—')}</span>`;
          row.onmouseenter = () => { row.style.background = 'rgba(255,255,255,0.07)'; };
          row.onmouseleave = () => { row.style.background = ''; };
          row.onclick = () => {
            if (ctx === 'multa') {
              document.getElementById('multa-ciudadano-nombre').value = c.nombre_completo + (c.dni ? ` (${c.dni})` : '');
              document.getElementById('multa-ciudadano-id').value  = c.discord_id;
              document.getElementById('multa-ciudadano-dni').value = c.dni || '';
            } else {
              document.getElementById('antec-ciudadano-nombre').value = c.nombre_completo + (c.dni ? ` (${c.dni})` : '');
              document.getElementById('antec-ciudadano-id').value  = c.discord_id;
              document.getElementById('antec-ciudadano-dni').value = c.dni || '';
            }
            resDiv.style.display = 'none';
          };
          resDiv.appendChild(row);
        });
      } catch {
        resDiv.innerHTML = '<p style="padding:10px 14px;color:#f87171;font-size:13px;">Error al buscar.</p>';
      }
    }

    // ── Agregar Multa ──────────────────────────────────────────────────
    async function cvAgregarMulta() {
      const ciudadano_id     = document.getElementById('multa-ciudadano-id').value.trim();
      const ciudadano_nombre = document.getElementById('multa-ciudadano-nombre').value.trim();
      const ciudadano_dni    = document.getElementById('multa-ciudadano-dni').value.trim();
      const motivo           = document.getElementById('multa-motivo').value.trim();
      const valor            = document.getElementById('multa-valor').value.trim();
      const fecha_limite     = document.getElementById('multa-fecha-limite').value;
      const errEl = document.getElementById('multa-error');
      const okEl  = document.getElementById('multa-ok');
      errEl.style.display = 'none'; okEl.style.display = 'none';
      if (!ciudadano_id) { errEl.textContent = 'Selecciona un ciudadano.'; errEl.style.display = 'block'; return; }
      if (!motivo || !valor || !fecha_limite) { errEl.textContent = 'Completa todos los campos.'; errEl.style.display = 'block'; return; }
      try {
        const r = await fetch('/api/comisaria?action=agregarMulta', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ciudadano_id, ciudadano_nombre, ciudadano_dni, motivo, valor: Number(valor), fecha_limite })
        });
        const data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error.'; errEl.style.display = 'block'; return; }
        const pagada = data.multa?.estado === 'pagada';
        okEl.textContent = pagada ? '✓ Multa registrada y cobrada automáticamente.' : '✓ Multa registrada. Estado: Pendiente.';
        okEl.style.display = 'block';
        document.getElementById('multa-ciudadano-id').value = '';
        document.getElementById('multa-ciudadano-nombre').value = '';
        document.getElementById('multa-ciudadano-dni').value = '';
        document.getElementById('multa-motivo').value = '';
        document.getElementById('multa-valor').value = '';
        document.getElementById('multa-fecha-limite').value = '';
      } catch { errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'; }
    }

    // ── BD Multas ──────────────────────────────────────────────────────
    async function cvCargarBDMultas() {
      const q       = document.getElementById('bd-multas-q').value.trim();
      const loading = document.getElementById('cv-bd-multas-loading');
      const lista   = document.getElementById('cv-bd-multas-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=todasMultas${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.multas || data.multas.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin multas registradas.</p>';
          return;
        }
        data.multas.forEach(m => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;';
          const estadoColor = m.estado === 'pagada' ? '#4ade80' : '#fbbf24';
          card.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:5px;flex:1;min-width:200px;">
              <b style="color:#fff;">${cvEsc(m.ciudadano_nombre || m.ciudadano_id)}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">DNI: ${cvEsc(m.ciudadano_dni || '—')} · ID: ${cvEsc(m.ciudadano_id)}</span>
              <span style="font-size:13px;color:rgba(255,255,255,0.7);">${cvEsc(m.motivo)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.35);">👮 ${cvEsc(m.funcionario_nombre || m.funcionario_id)} · 📅 ${cvFecha(m.created_at)}</span>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <span style="color:${estadoColor};font-weight:700;font-size:13px;">${m.estado.toUpperCase()}</span>
              <span style="color:#fbbf24;font-weight:700;">$${Number(m.valor).toLocaleString('es-CL')}</span>
              <button onclick="cvEliminarMulta(${m.id}, this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:5px 12px;color:#f87171;font-size:12px;cursor:pointer;">Eliminar</button>
            </div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function cvEliminarMulta(id, btn) {
      if (!confirm('¿Eliminar esta multa? Se registrará en el log.')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=eliminarMulta&id=${id}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Eliminar'; return; }
        cvCargarBDMultas();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Eliminar'; }
    }

    // ── Agregar Antecedente ────────────────────────────────────────────
    async function cvAgregarAntecedente() {
      const ciudadano_id     = document.getElementById('antec-ciudadano-id').value.trim();
      const ciudadano_nombre = document.getElementById('antec-ciudadano-nombre').value.trim();
      const ciudadano_dni    = document.getElementById('antec-ciudadano-dni').value.trim();
      const foto_url         = document.getElementById('antec-foto').value.trim();
      const motivo           = document.getElementById('antec-motivo').value.trim();
      const articulos        = document.getElementById('antec-articulos').value.trim();
      const tiempo_carcel    = document.getElementById('antec-tiempo-carcel').value.trim();
      const errEl = document.getElementById('antec-error');
      const okEl  = document.getElementById('antec-ok');
      errEl.style.display = 'none'; okEl.style.display = 'none';
      if (!ciudadano_id) { errEl.textContent = 'Selecciona un ciudadano.'; errEl.style.display = 'block'; return; }
      if (!motivo) { errEl.textContent = 'El motivo es obligatorio.'; errEl.style.display = 'block'; return; }
      try {
        const r = await fetch('/api/comisaria?action=agregarAntecedente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ciudadano_id, ciudadano_nombre, ciudadano_dni, foto_url: foto_url || null, motivo, articulos: articulos || null, tiempo_carcel: tiempo_carcel || null })
        });
        const data = await r.json();
        if (!r.ok) { errEl.textContent = data.error || 'Error.'; errEl.style.display = 'block'; return; }
        okEl.textContent = '✓ Antecedente registrado correctamente.';
        okEl.style.display = 'block';
        ['antec-ciudadano-id','antec-ciudadano-nombre','antec-ciudadano-dni','antec-foto','antec-motivo','antec-articulos','antec-tiempo-carcel'].forEach(id => { document.getElementById(id).value = ''; });
      } catch { errEl.textContent = 'Error de conexión.'; errEl.style.display = 'block'; }
    }

    // ── BD Antecedentes ────────────────────────────────────────────────
    async function cvCargarBDAntecedentes() {
      const q       = document.getElementById('bd-antec-q').value.trim();
      const loading = document.getElementById('cv-bd-antec-loading');
      const lista   = document.getElementById('cv-bd-antec-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=todosAntecedentes${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.antecedentes || data.antecedentes.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin antecedentes registrados.</p>';
          return;
        }
        data.antecedentes.forEach(a => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;gap:14px;flex-wrap:wrap;';
          const fotoHtml = a.foto_url
            ? `<img src="${cvEsc(a.foto_url)}" style="width:56px;height:56px;object-fit:cover;border-radius:8px;flex-shrink:0;" onerror="this.style.display='none'">`
            : '';
          card.innerHTML = `
            ${fotoHtml}
            <div style="flex:1;min-width:180px;display:flex;flex-direction:column;gap:5px;">
              <b style="color:#fff;">${cvEsc(a.ciudadano_nombre || a.ciudadano_id)}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">DNI: ${cvEsc(a.ciudadano_dni || '—')} · ID: ${cvEsc(a.ciudadano_id)}</span>
              <span style="font-size:13px;color:#f87171;">${cvEsc(a.motivo)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">📜 ${cvEsc(a.articulos || '—')} · ⏱ ${cvEsc(a.tiempo_carcel || '—')}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.3);">👮 ${cvEsc(a.funcionario_nombre || a.funcionario_id)} · 📅 ${cvFecha(a.created_at)}</span>
            </div>
            <div style="display:flex;align-items:flex-start;">
              <button onclick="cvEliminarAntecedente(${a.id}, this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:5px 12px;color:#f87171;font-size:12px;cursor:pointer;">Eliminar</button>
            </div>
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function cvEliminarAntecedente(id, btn) {
      if (!confirm('¿Eliminar este antecedente? Se registrará en el log.')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=eliminarAntecedente&id=${id}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Eliminar'; return; }
        cvCargarBDAntecedentes();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Eliminar'; }
    }

    // ── BD Denuncias ───────────────────────────────────────────────────
    async function cvCargarBDDenuncias() {
      const q       = document.getElementById('bd-den-q').value.trim();
      const loading = document.getElementById('cv-bd-den-loading');
      const lista   = document.getElementById('cv-bd-den-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=todasDenuncias${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.denuncias || data.denuncias.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin denuncias registradas.</p>';
          return;
        }
        data.denuncias.forEach(d => {
          const card = document.createElement('div');
          card.style.cssText = 'background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:8px;';
          card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
              <div>
                <b style="color:#fff;">${cvEsc(d.motivo)}</b>
                <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;">📣 ${cvEsc(d.denunciante_nombre || d.denunciante_id)} · ID: ${cvEsc(d.denunciante_id)} · 📅 ${cvFecha(d.created_at)}</div>
              </div>
              <button onclick="cvEliminarDenuncia(${d.id}, this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:5px 12px;color:#f87171;font-size:12px;cursor:pointer;flex-shrink:0;">Eliminar</button>
            </div>
            <p style="font-size:13px;color:rgba(255,255,255,0.65);line-height:1.5;">${cvEsc(d.descripcion)}</p>
            ${d.evidencia_url ? `<a href="${cvEsc(d.evidencia_url)}" target="_blank" style="color:#38bdf8;font-size:12px;">🔗 Ver evidencia</a>` : ''}
          `;
          lista.appendChild(card);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function cvEliminarDenuncia(id, btn) {
      if (!confirm('¿Eliminar esta denuncia? Se registrará en el log.')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=eliminarDenuncia&id=${id}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Eliminar'; return; }
        cvCargarBDDenuncias();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Eliminar'; }
    }

    // ── Logs ───────────────────────────────────────────────────────────
    async function cvCargarLogs() {
      const q       = document.getElementById('cv-logs-q').value.trim();
      const loading = document.getElementById('cv-logs-loading');
      const lista   = document.getElementById('cv-logs-lista');
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const r    = await fetch(`/api/comisaria?action=logs${q ? '&q=' + encodeURIComponent(q) : ''}`);
        const data = await r.json();
        loading.style.display = 'none';
        if (!data.logs || data.logs.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:24px;">Sin logs registrados.</p>';
          return;
        }
        data.logs.forEach(l => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05);flex-wrap:wrap;';
          const accionColor = l.accion.includes('ELIMINAR') ? '#f87171' : l.accion.includes('REVOCAR') ? '#fbbf24' : '#4ade80';
          row.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;flex:1;min-width:200px;">
              <span style="font-size:13px;font-weight:700;color:${accionColor};">${cvEsc(l.accion)}</span>
              <span style="font-size:12px;color:rgba(255,255,255,0.55);">${cvEsc(l.detalle || '')}</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.25);">👤 ${cvEsc(l.usuario_nombre || l.usuario_id)} · ID: ${cvEsc(l.usuario_id)}</span>
            </div>
            <span style="font-size:11px;color:rgba(255,255,255,0.3);white-space:nowrap;">${cvFecha(l.created_at)}</span>
          `;
          lista.appendChild(row);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar logs.</p>';
      }
    }

    // ══ GESTIÓN DE POLICÍAS DESDE PANEL ADMIN ══════════════════════════
    // (Se insertan como tab adicional al cargar el panel admin)

    let _paPoliciaTabInyectado = false;

    function _inyectarTabPolicia() {
      if (_paPoliciaTabInyectado) return;
      _paPoliciaTabInyectado = true;

      // Agregar tab button
      const tabContainer = document.querySelector('#panel-admin-screen .admin-tabs');
      if (tabContainer) {
        const btn = document.createElement('button');
        btn.className = 'admin-tab';
        btn.textContent = '🚔 Policías Virtuales';
        btn.onclick = () => { paAdminTab('policias'); };
        tabContainer.appendChild(btn);
      }

      // Agregar sección
      const panel = document.querySelector('#panel-admin-screen .admin-panel');
      if (panel) {
        const sec = document.createElement('div');
        sec.className = 'admin-seccion';
        sec.id = 'pa-tab-policias';
        sec.innerHTML = `
          <h3 style="font-size:16px;font-weight:700;color:#38bdf8;display:flex;align-items:center;gap:8px;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Gestión de Policías Virtuales
          </h3>
          <div class="rc-form" style="gap:14px;">
            <h4 style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.7);">Autorizar nuevo policía</h4>
            <div class="form-row">
              <div class="form-group">
                <label>Discord ID</label>
                <input type="text" id="gp-input-id" placeholder="ID de Discord">
              </div>
              <div class="form-group">
                <label>Nombre (opcional)</label>
                <input type="text" id="gp-input-nombre" placeholder="Nombre o tag">
              </div>
            </div>
            <p id="gp-msg" style="font-size:13px;color:rgba(255,255,255,0.4);min-height:18px;"></p>
            <button onclick="gpAutorizar()" style="background:linear-gradient(135deg,rgba(14,165,233,0.2),rgba(14,165,233,0.1));border:1px solid rgba(14,165,233,0.35);border-radius:12px;padding:12px;color:#38bdf8;font-weight:700;font-size:14px;cursor:pointer;">
              ✦ Autorizar como Policía Virtual
            </button>
          </div>
          <div style="display:flex;gap:8px;margin-top:6px;">
            <input type="text" id="gp-buscar-q" placeholder="Buscar policía por nombre o ID" style="flex:1;">
            <button onclick="gpCargarPolicias()" style="background:rgba(14,165,233,0.15);border:1px solid rgba(14,165,233,0.3);border-radius:10px;padding:0 14px;color:#38bdf8;cursor:pointer;font-size:13px;">Buscar</button>
          </div>
          <div class="rc-loading" id="gp-loading" style="display:none;"><div class="spinner"></div><span>Cargando...</span></div>
          <div id="gp-lista"></div>
        `;
        panel.appendChild(sec);
      }
    }

    function paAdminTab(tab) {
      document.querySelectorAll('#panel-admin-screen .admin-tab').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#panel-admin-screen .admin-seccion').forEach(s => s.classList.remove('visible'));
      const btn = [...document.querySelectorAll('#panel-admin-screen .admin-tab')].find(b => b.textContent.includes(
        tab === 'admins' ? 'Administradores' : tab === 'logs' ? 'Logs' : 'Policías'
      ));
      if (btn) btn.classList.add('active');
      const sec = document.getElementById(tab === 'admins' ? 'pa-tab-admins' : tab === 'logs' ? 'pa-tab-logs' : 'pa-tab-policias');
      if (sec) sec.classList.add('visible');
      if (tab === 'policias') gpCargarPolicias();
    }

    async function gpCargarPolicias() {
      const q       = document.getElementById('gp-buscar-q')?.value?.trim() || '';
      const loading = document.getElementById('gp-loading');
      const lista   = document.getElementById('gp-lista');
      if (!loading || !lista) return;
      loading.style.display = 'flex'; lista.innerHTML = '';
      try {
        const url = q
          ? `/api/comisaria?action=buscarPolicia&q=${encodeURIComponent(q)}`
          : '/api/comisaria?action=listarPolicias';
        const r    = await fetch(url);
        const data = await r.json();
        loading.style.display = 'none';
        const policias = data.policias || [];
        if (policias.length === 0) {
          lista.innerHTML = '<p style="color:rgba(255,255,255,0.3);font-size:13px;padding:16px 0;">Sin policías autorizados.</p>';
          return;
        }
        policias.forEach(p => {
          const row = document.createElement('div');
          row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px;background:rgba(14,165,233,0.07);border:1px solid rgba(14,165,233,0.15);border-radius:10px;gap:12px;flex-wrap:wrap;';
          row.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:3px;">
              <b style="color:#38bdf8;">${cvEsc(p.nombre || '—')}</b>
              <span style="font-size:12px;color:rgba(255,255,255,0.4);">ID: ${cvEsc(p.discord_id)}</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.25);">Autorizado por: ${cvEsc(p.autorizado_por_nombre || p.autorizado_por_id)} · ${cvFecha(p.created_at)}</span>
            </div>
            <button onclick="gpRevocar('${cvEsc(p.discord_id)}', this)" style="background:rgba(220,38,38,0.15);border:1px solid rgba(220,38,38,0.3);border-radius:7px;padding:6px 14px;color:#f87171;font-size:12px;cursor:pointer;flex-shrink:0;">Revocar</button>
          `;
          lista.appendChild(row);
        });
      } catch {
        loading.style.display = 'none';
        lista.innerHTML = '<p style="color:#f87171;font-size:13px;">Error al cargar.</p>';
      }
    }

    async function gpAutorizar() {
      const targetId = document.getElementById('gp-input-id')?.value?.trim();
      const nombre   = document.getElementById('gp-input-nombre')?.value?.trim();
      const msg      = document.getElementById('gp-msg');
      if (!msg) return;
      if (!targetId) { msg.style.color = '#f87171'; msg.textContent = 'Ingresa un Discord ID.'; return; }
      msg.style.color = '#9ca3af'; msg.textContent = 'Autorizando...';
      try {
        const r = await fetch('/api/comisaria?action=autorizarPolicia', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_id: targetId, nombre: nombre || null })
        });
        const data = await r.json();
        if (!r.ok) { msg.style.color = '#f87171'; msg.textContent = data.error || 'Error.'; return; }
        msg.style.color = '#4ade80'; msg.textContent = '✓ Policía Virtual autorizado.';
        document.getElementById('gp-input-id').value = '';
        document.getElementById('gp-input-nombre').value = '';
        gpCargarPolicias();
      } catch { msg.style.color = '#f87171'; msg.textContent = 'Error de conexión.'; }
    }

    async function gpRevocar(targetId, btn) {
      if (!confirm('¿Revocar los permisos de este Policía Virtual?')) return;
      btn.disabled = true; btn.textContent = '...';
      try {
        const r = await fetch(`/api/comisaria?action=revocarPolicia&target_id=${encodeURIComponent(targetId)}`, { method: 'DELETE' });
        const data = await r.json();
        if (!r.ok) { alert(data.error || 'Error.'); btn.disabled = false; btn.textContent = 'Revocar'; return; }
        gpCargarPolicias();
      } catch { alert('Error de conexión.'); btn.disabled = false; btn.textContent = 'Revocar'; }
    }

    // Helpers
    function cvEsc(str) {
      if (!str) return '';
      return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function cvFecha(iso) {
      if (!iso) return '—';
      return new Date(iso).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
    }

    // Inyectar tab policías cuando se abra el panel admin
    const _origPaCargarAdmins = window.paCargarAdmins;
    document.addEventListener('DOMContentLoaded', () => {
      // patch panel admin card click
      const panelAdminCard = document.getElementById('panel-admin-card');
      if (panelAdminCard) {
        const origClick = panelAdminCard.onclick;
        panelAdminCard.addEventListener('click', () => {
          setTimeout(() => { _inyectarTabPolicia(); }, 50);
        });
      }
    });

