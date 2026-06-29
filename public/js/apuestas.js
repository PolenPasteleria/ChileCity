    function apFmt(n) { return '$' + Math.round(n).toLocaleString('es-CL'); }
    function apFecha(iso) {
      if (!iso) return '';
      return new Date(iso).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' });
    }

    async function cargarApuestas() {
      if (!currentUser?.id) return;
      const el = document.getElementById('apuestas-screen');
      if (el) el.scrollTop = 0;
      // Obtener saldo
      try {
        const r = await fetch(`/api/banco?action=cuenta&discord_id=${currentUser.id}`);
        const d = await r.json();
        if (d.existe) {
          apSaldo = d.cuenta.saldo;
          document.getElementById('ap-saldo-val').textContent = apFmt(apSaldo);
        }
      } catch {}
      await apCargarPartidos();
    }

    function apTab(tab) {
      document.querySelectorAll('[id^="aptab-"]').forEach(b => b.classList.remove('active'));
      document.getElementById('aptab-' + tab).classList.add('active');
      document.getElementById('ap-partidos-section').style.display = tab === 'partidos' ? 'block' : 'none';
      document.getElementById('ap-historial-section').style.display = tab === 'historial' ? 'block' : 'none';
      if (tab === 'historial') apCargarHistorialPersonal();
    }

    async function apCargarPartidos() {
      const lista = document.getElementById('ap-partidos-lista');
      lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⏳</div><div class="ap-empty-text">Cargando partidos...</div></div>';
      try {
        const r = await fetch('/api/apuestas?action=partidos');
        const d = await r.json();
        if (!d.partidos || d.partidos.length === 0) {
          lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⚽</div><div class="ap-empty-text">No hay partidos disponibles en este momento.</div></div>';
          return;
        }
        lista.innerHTML = d.partidos.map(p => apRenderPartido(p)).join('');
      } catch {
        lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⚠️</div><div class="ap-empty-text">Error al cargar partidos.</div></div>';
      }
    }

    function apRenderLogo(url, nombre) {
      if (url) return `<img src="${escHtml(url)}" alt="${escHtml(nombre)}" onerror="this.style.display='none';this.parentElement.textContent='⚽'">`;
      return '⚽';
    }

    function apRenderPartido(p) {
      const estadoClass = 'estado-' + p.estado;
      const estadoLabel = { activo: '🟢 Abierto', en_curso: '⚡ En curso', finalizado: '🏁 Finalizado', cancelado: '❌ Cancelado' }[p.estado] || p.estado;
      const ganadorInfo = p.estado === 'finalizado' ? `
        <div style="text-align:center;font-size:12px;color:rgba(255,255,255,0.4);margin-top:-8px;">
          ${{A:`🏆 Ganó ${escHtml(p.equipo_a)}`, B:`🏆 Ganó ${escHtml(p.equipo_b)}`, empate:'🤝 Empate'}[p.ganador] || ''}
        </div>` : '';
      return `
      <div class="partido-card">
        <div class="partido-equipos">
          <div class="partido-equipo">
            <div class="equipo-logo">${apRenderLogo(p.logo_a, p.equipo_a)}</div>
            <div class="equipo-nombre">${escHtml(p.equipo_a)}</div>
          </div>
          <div class="partido-vs">
            <div class="partido-marcador">${p.goles_a} – ${p.goles_b}</div>
            <div class="partido-estado-badge ${estadoClass}">${estadoLabel}</div>
          </div>
          <div class="partido-equipo">
            <div class="equipo-logo">${apRenderLogo(p.logo_b, p.equipo_b)}</div>
            <div class="equipo-nombre">${escHtml(p.equipo_b)}</div>
          </div>
        </div>
        ${ganadorInfo}
        <div class="partido-mults">
          <div class="mult-pill ${p.estado==='finalizado'&&p.ganador==='A'?'ganador-A':''}">
            <div class="mult-pill-label">${escHtml(p.equipo_a)}</div>
            <div class="mult-pill-val">x${p.mult_a.toFixed(1)}</div>
          </div>
          <div class="mult-pill ${p.estado==='finalizado'&&p.ganador==='empate'?'ganador-empate':''}">
            <div class="mult-pill-label">Empate</div>
            <div class="mult-pill-val">x${p.mult_empate.toFixed(1)}</div>
          </div>
          <div class="mult-pill ${p.estado==='finalizado'&&p.ganador==='B'?'ganador-B':''}">
            <div class="mult-pill-label">${escHtml(p.equipo_b)}</div>
            <div class="mult-pill-val">x${p.mult_b.toFixed(1)}</div>
          </div>
        </div>
        ${p.estado === 'activo' || p.estado === 'en_curso' ? `
        <div class="partido-btns">
          <button class="btn-apostar simple" onclick='abrirModalApuesta(${JSON.stringify(p)}, "simple")'>🎯 Apuesta Simple</button>
          <button class="btn-apostar combinada" onclick='abrirModalApuesta(${JSON.stringify(p)}, "combinada")'>⭐ Apuesta Combinada</button>
        </div>` : ''}
      </div>`;
    }

    function abrirModalApuesta(partido, tipo) {
      apPartidoActivo = partido;
      apTipoActivo = tipo;
      apEleccion = null;

      document.getElementById('ap-modal-title').textContent = tipo === 'simple' ? '🎯 Apuesta Simple' : '⭐ Apuesta Combinada';
      document.getElementById('ap-modal-sub').textContent = `${partido.equipo_a} vs ${partido.equipo_b}`;
      document.getElementById('ap-label-A').textContent = partido.equipo_a;
      document.getElementById('ap-label-B').textContent = partido.equipo_b;
      document.getElementById('ap-mult-A').textContent = `x${partido.mult_a.toFixed(1)}`;
      document.getElementById('ap-mult-empate').textContent = `x${partido.mult_empate.toFixed(1)}`;
      document.getElementById('ap-mult-B').textContent = `x${partido.mult_b.toFixed(1)}`;

      // Reset
      ['A','empate','B'].forEach(e => document.getElementById('ap-btn-' + e).className = 'ap-eleccion-btn');
      document.getElementById('ap-monto-input').value = '';
      document.getElementById('ap-marc-a').value = '';
      document.getElementById('ap-marc-b').value = '';
      document.getElementById('ap-premio-preview').innerHTML = 'Elige un resultado e ingresa el monto para ver el premio estimado.';
      document.getElementById('ap-btn-confirm').disabled = true;
      document.getElementById('ap-btn-confirm').className = `btn-ap-confirm ${tipo}`;

      // Mostrar marcador solo en combinada
      document.getElementById('ap-marcador-section').style.display = tipo === 'combinada' ? 'block' : 'none';

      document.getElementById('ap-modal-overlay').classList.add('open');
    }

    function cerrarModalApuesta(e) {
      if (e && e.target !== document.getElementById('ap-modal-overlay')) return;
      document.getElementById('ap-modal-overlay').classList.remove('open');
      apPartidoActivo = null; apTipoActivo = null; apEleccion = null;
    }

    function apElegir(eleccion) {
      apEleccion = eleccion;
      ['A','empate','B'].forEach(e => {
        document.getElementById('ap-btn-' + e).className = 'ap-eleccion-btn' + (e === eleccion ? ' sel-' + e : '');
      });
      apActualizarPremio();
    }

    function apActualizarPremio() {
      if (!apPartidoActivo) return;
      const monto = parseInt(document.getElementById('ap-monto-input').value) || 0;
      const prevEl = document.getElementById('ap-premio-preview');
      const confirmBtn = document.getElementById('ap-btn-confirm');

      if (!apEleccion || monto <= 0) {
        prevEl.innerHTML = 'Elige un resultado e ingresa el monto para ver el premio estimado.';
        confirmBtn.disabled = true;
        return;
      }

      const p = apPartidoActivo;
      const multMap = { A: p.mult_a, empate: p.mult_empate, B: p.mult_b };
      const mult = multMap[apEleccion] || 1;
      const premioBase = Math.floor(monto * mult);

      if (apTipoActivo === 'simple') {
        prevEl.innerHTML = `Si <b>${apEleccion === 'A' ? escHtml(p.equipo_a) : apEleccion === 'B' ? escHtml(p.equipo_b) : 'Empate'}</b> gana, recibirás <b style="color:#fbbf24">${apFmt(premioBase)}</b> (x${mult.toFixed(1)})`;
      } else {
        const mA = document.getElementById('ap-marc-a').value;
        const mB = document.getElementById('ap-marc-b').value;
        const premioDoble = Math.floor(monto * mult * 2);
        if (mA !== '' && mB !== '') {
          prevEl.innerHTML = `Ganador: <b style="color:#fbbf24">${apFmt(premioBase)}</b> (x${mult.toFixed(1)})<br>
            Si además el marcador es exactamente <b>${mA}–${mB}</b>: <b style="color:#34d399">${apFmt(premioDoble)}</b> (x${(mult*2).toFixed(1)})`;
        } else {
          prevEl.innerHTML = `Si gana: <b style="color:#fbbf24">${apFmt(premioBase)}</b> (x${mult.toFixed(1)})<br>
            <span style="color:rgba(255,255,255,0.35)">Agrega marcador exacto para ganar x${(mult*2).toFixed(1)}</span>`;
        }
      }

      confirmBtn.disabled = monto <= 0 || monto > apSaldo;
    }

    async function confirmarApuesta() {
      if (!apPartidoActivo || !apEleccion) return;
      const monto = parseInt(document.getElementById('ap-monto-input').value);
      if (!monto || monto <= 0) { mostrarToast('Ingresa un monto válido.', true); return; }
      if (monto > apSaldo) { mostrarToast('Saldo insuficiente.', true); return; }

      const btn = document.getElementById('ap-btn-confirm');
      btn.disabled = true; btn.textContent = 'Procesando...';

      const body = {
        partido_id: apPartidoActivo.id,
        tipo: apTipoActivo,
        eleccion: apEleccion,
        monto,
      };
      if (apTipoActivo === 'combinada') {
        const mA = document.getElementById('ap-marc-a').value;
        const mB = document.getElementById('ap-marc-b').value;
        if (mA !== '') body.marcador_a = parseInt(mA);
        if (mB !== '') body.marcador_b = parseInt(mB);
      }

      try {
        const r = await fetch('/api/apuestas?action=apostar', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) { mostrarToast(d.error || 'Error al apostar.', true); btn.disabled = false; btn.textContent = 'Confirmar apuesta'; return; }

        apSaldo = d.nuevoSaldo;
        document.getElementById('ap-saldo-val').textContent = apFmt(apSaldo);
        document.getElementById('ap-modal-overlay').classList.remove('open');
        mostrarToast('✅ ¡Apuesta registrada! Suerte 🍀');
        apCargarPartidos();
      } catch {
        mostrarToast('Error de conexión.', true);
        btn.disabled = false; btn.textContent = 'Confirmar apuesta';
      }
    }

    async function apCargarHistorialPersonal() {
      const lista = document.getElementById('ap-historial-lista');
      lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⏳</div><div class="ap-empty-text">Cargando...</div></div>';
      try {
        const r = await fetch('/api/apuestas?action=mi-historial');
        const d = await r.json();
        if (!d.apuestas || d.apuestas.length === 0) {
          lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">📋</div><div class="ap-empty-text">Sin apuestas aún.</div></div>';
          return;
        }
        lista.innerHTML = d.apuestas.map(a => {
          const iconMap = { ganada: '🏆', perdida: '💸', pendiente: '⏳', cancelada: '↩️' };
          const eleccionLabel = { A: escHtml(a.equipo_a), B: escHtml(a.equipo_b), empate: 'Empate' }[a.eleccion] || a.eleccion;
          const marcadorInfo = a.tipo === 'combinada' && a.marcador_a !== null ? ` | Marcador: ${a.marcador_a}–${a.marcador_b}` : '';
          let amountStr = '';
          if (a.estado === 'ganada') amountStr = `+${apFmt(a.premio)}`;
          else if (a.estado === 'perdida') amountStr = `-${apFmt(a.monto)}`;
          else if (a.estado === 'cancelada') amountStr = `+${apFmt(a.monto)}`;
          else amountStr = apFmt(a.monto);
          return `
          <div class="ap-hist-item">
            <div class="ap-hist-icon ${a.estado}">${iconMap[a.estado] || '⚽'}</div>
            <div class="ap-hist-info">
              <div class="ap-hist-partido">${escHtml(a.equipo_a)} vs ${escHtml(a.equipo_b)}</div>
              <div class="ap-hist-det">${a.tipo === 'combinada' ? '⭐ Combinada' : '🎯 Simple'} · Elegí: ${eleccionLabel}${marcadorInfo}</div>
              <div class="ap-hist-det">${apFecha(a.created_at)}${a.acierto_marcador ? ' · 🎯 ¡Marcador exacto!' : ''}</div>
            </div>
            <div class="ap-hist-amount">
              <div class="ap-hist-amount-val ${a.estado}">${amountStr}</div>
              <div class="ap-hist-amount-sub">Aposté ${apFmt(a.monto)}</div>
            </div>
          </div>`;
        }).join('');
      } catch {
        lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⚠️</div><div class="ap-empty-text">Error al cargar historial.</div></div>';
      }
    }

    /* ═══════════════════════════════════════════════════════════════
       ADMIN CASINO — JS
    ═══════════════════════════════════════════════════════════════ */
    function abrirAdminCasino() {
      abrirSeccion('admin-casino-screen');
      admCargarPartidos();
      admCargarHistorial('todos');
    }

    async function admCrearPartido() {
      const equipo_a = document.getElementById('adm-eq-a').value.trim();
      const equipo_b = document.getElementById('adm-eq-b').value.trim();
      if (!equipo_a || !equipo_b) { mostrarToast('Ingresa los nombres de ambos equipos.', true); return; }
      const body = {
        equipo_a, equipo_b,
        logo_a: document.getElementById('adm-logo-a').value.trim() || null,
        logo_b: document.getElementById('adm-logo-b').value.trim() || null,
        mult_a: parseFloat(document.getElementById('adm-mult-a').value) || 2.0,
        mult_empate: parseFloat(document.getElementById('adm-mult-e').value) || 3.0,
        mult_b: parseFloat(document.getElementById('adm-mult-b').value) || 2.0,
      };
      try {
        const r = await fetch('/api/apuestas?action=crear-partido', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) { mostrarToast(d.error || 'Error.', true); return; }
        mostrarToast('✅ Partido creado correctamente.');
        ['adm-eq-a','adm-eq-b','adm-logo-a','adm-logo-b'].forEach(id => document.getElementById(id).value = '');
        document.getElementById('adm-mult-a').value = '2.0';
        document.getElementById('adm-mult-e').value = '3.0';
        document.getElementById('adm-mult-b').value = '2.0';
        admCargarPartidos();
      } catch { mostrarToast('Error de conexión.', true); }
    }

    async function admCargarPartidos() {
      const lista = document.getElementById('adm-partidos-lista');
      lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⏳</div><div class="ap-empty-text">Cargando...</div></div>';
      try {
        const r = await fetch('/api/apuestas?action=todos-partidos');
        const d = await r.json();
        if (!d.partidos || d.partidos.length === 0) {
          lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⚽</div><div class="ap-empty-text">Sin partidos aún.</div></div>';
          return;
        }
        lista.innerHTML = d.partidos.map(p => admRenderPartido(p)).join('');
      } catch { lista.innerHTML = '<div class="ap-empty"><div class="ap-empty-icon">⚠️</div><div class="ap-empty-text">Error.</div></div>'; }
    }

    function admRenderPartido(p) {
      const estadoClass = 'estado-' + p.estado;
      const estadoLabel = { activo:'🟢 Activo', en_curso:'⚡ En Curso', finalizado:'🏁 Finalizado', cancelado:'❌ Cancelado' }[p.estado] || p.estado;
      const puedeEditar = p.estado !== 'finalizado' && p.estado !== 'cancelado';
      const puedeAcciones = puedeEditar;
      return `
      <div class="adm-partido-card">
        <div class="adm-partido-header">
          <div>
            <div class="adm-partido-teams">${escHtml(p.equipo_a)} <span style="color:rgba(255,255,255,0.3)">vs</span> ${escHtml(p.equipo_b)}</div>
            <div style="display:flex;gap:6px;align-items:center;margin-top:4px;">
              <span class="partido-estado-badge ${estadoClass}" style="font-size:10px;">${estadoLabel}</span>
              <span style="font-size:11px;color:rgba(255,255,255,0.3);">Mults: x${p.mult_a} / x${p.mult_empate} / x${p.mult_b}</span>
            </div>
          </div>
          <div class="adm-partido-score">${p.goles_a} – ${p.goles_b}</div>
        </div>
        ${puedeAcciones ? `
        <div class="adm-marcador-form">
          <input type="number" min="0" max="99" id="marc-a-${p.id}" value="${p.goles_a}" placeholder="0">
          <div class="adm-marcador-sep">–</div>
          <input type="number" min="0" max="99" id="marc-b-${p.id}" value="${p.goles_b}" placeholder="0">
          <button class="btn-adm warning" onclick="admActualizarMarcador(${p.id})">📊 Actualizar</button>
          <button class="btn-adm success" onclick="admFinalizarPartido(${p.id})">🏁 Finalizar</button>
        </div>
        <div class="adm-partido-actions">
          <button class="btn-adm ghost" onclick="admAbrirEditar(${p.id}, '${escHtml(p.equipo_a)}','${escHtml(p.equipo_b)}','${p.logo_a||''}','${p.logo_b||''}',${p.mult_a},${p.mult_empate},${p.mult_b})">✏️ Editar</button>
          <button class="btn-adm warning" onclick="admCancelarPartido(${p.id})">↩️ Cancelar</button>
          <button class="btn-adm danger" onclick="admEliminarPartido(${p.id})">🗑️ Eliminar</button>
          <button class="btn-adm ghost" onclick="admVerApuestas(${p.id})">👁 Ver Apuestas</button>
        </div>` : `
        <div class="adm-partido-actions">
          <button class="btn-adm danger" onclick="admEliminarPartido(${p.id})">🗑️ Eliminar</button>
          <button class="btn-adm ghost" onclick="admVerApuestas(${p.id})">👁 Ver Apuestas</button>
        </div>`}
      </div>`;
    }

    async function admActualizarMarcador(id) {
      const goles_a = parseInt(document.getElementById('marc-a-'+id).value) || 0;
      const goles_b = parseInt(document.getElementById('marc-b-'+id).value) || 0;
      try {
        const r = await fetch('/api/apuestas?action=marcador', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, goles_a, goles_b}) });
        const d = await r.json();
        if (!r.ok) { mostrarToast(d.error || 'Error.', true); return; }
        mostrarToast('✅ Marcador actualizado.');
        admCargarPartidos();
      } catch { mostrarToast('Error de conexión.', true); }
    }

    async function admFinalizarPartido(id) {
      const goles_a = parseInt(document.getElementById('marc-a-'+id).value) || 0;
      const goles_b = parseInt(document.getElementById('marc-b-'+id).value) || 0;
      if (!confirm(`¿Finalizar el partido con marcador ${goles_a}–${goles_b}?\nEsto resolverá todas las apuestas y pagará a los ganadores.`)) return;
      try {
        const r = await fetch('/api/apuestas?action=finalizar', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, goles_a, goles_b}) });
        const d = await r.json();
        if (!r.ok) { mostrarToast(d.error || 'Error.', true); return; }
        mostrarToast('🏁 Partido finalizado y premios distribuidos.');
        admCargarPartidos();
        admCargarHistorial('todos');
      } catch { mostrarToast('Error de conexión.', true); }
    }

    async function admCancelarPartido(id) {
      if (!confirm('¿Cancelar el partido? Se devolverán todas las apuestas automáticamente.')) return;
      try {
        const r = await fetch('/api/apuestas?action=cancelar', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) });
        const d = await r.json();
        if (!r.ok) { mostrarToast(d.error || 'Error.', true); return; }
        mostrarToast('↩️ Partido cancelado y apuestas devueltas.');
        admCargarPartidos();
        admCargarHistorial('todos');
      } catch { mostrarToast('Error de conexión.', true); }
    }

    async function admEliminarPartido(id) {
      if (!confirm('¿Eliminar este partido? Esta acción no se puede deshacer.')) return;
      try {
        const r = await fetch(`/api/apuestas?action=eliminar-partido&id=${id}`, { method:'DELETE' });
        const d = await r.json();
        if (!r.ok) { mostrarToast(d.error || 'Error.', true); return; }
        mostrarToast('🗑️ Partido eliminado.');
        admCargarPartidos();
      } catch { mostrarToast('Error de conexión.', true); }
    }

    function admVerApuestas(partido_id) {
      admCargarHistorial('todos', partido_id);
      document.getElementById('admin-casino-screen').scrollTo({ top: 9999, behavior: 'smooth' });
    }

    function admAbrirEditar(id, eqA, eqB, logoA, logoB, mA, mE, mB) {
      document.getElementById('adm-edit-id').value = id;
      document.getElementById('adm-edit-sub').textContent = `${eqA} vs ${eqB}`;
      document.getElementById('adm-edit-eq-a').value = eqA;
      document.getElementById('adm-edit-eq-b').value = eqB;
      document.getElementById('adm-edit-logo-a').value = logoA || '';
      document.getElementById('adm-edit-logo-b').value = logoB || '';
      document.getElementById('adm-edit-mult-a').value = mA;
      document.getElementById('adm-edit-mult-e').value = mE;
      document.getElementById('adm-edit-mult-b').value = mB;
      document.getElementById('adm-edit-overlay').classList.add('open');
    }
    function admCerrarEditModal(e) {
      if (e && e.target !== document.getElementById('adm-edit-overlay')) return;
      document.getElementById('adm-edit-overlay').classList.remove('open');
    }
    async function admGuardarEdicion() {
      const body = {
        id: parseInt(document.getElementById('adm-edit-id').value),
        equipo_a: document.getElementById('adm-edit-eq-a').value.trim(),
        equipo_b: document.getElementById('adm-edit-eq-b').value.trim(),
        logo_a: document.getElementById('adm-edit-logo-a').value.trim() || null,
        logo_b: document.getElementById('adm-edit-logo-b').value.trim() || null,
        mult_a: parseFloat(document.getElementById('adm-edit-mult-a').value) || 2.0,
        mult_empate: parseFloat(document.getElementById('adm-edit-mult-e').value) || 3.0,
        mult_b: parseFloat(document.getElementById('adm-edit-mult-b').value) || 2.0,
      };
      try {
        const r = await fetch('/api/apuestas?action=editar-partido', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        const d = await r.json();
        if (!r.ok) { mostrarToast(d.error || 'Error.', true); return; }
        mostrarToast('✅ Partido actualizado.');
        document.getElementById('adm-edit-overlay').classList.remove('open');
        admCargarPartidos();
      } catch { mostrarToast('Error de conexión.', true); }
    }

    async function admCargarHistorial(estado, partido_id) {
      const tbody = document.getElementById('adm-hist-tbody');
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:rgba(255,255,255,0.2);padding:20px;">Cargando...</td></tr>';
      try {
        let url = '/api/apuestas?action=historial-admin';
        if (partido_id) url += `&partido_id=${partido_id}`;
        else if (estado && estado !== 'todos') url += `&estado=${estado}`;
        const r = await fetch(url);
        const d = await r.json();
        if (!d.apuestas || d.apuestas.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:rgba(255,255,255,0.2);padding:20px;">Sin apuestas.</td></tr>';
          return;
        }
        tbody.innerHTML = d.apuestas.map(a => {
          const eleccionLabel = { A: escHtml(a.equipo_a), B: escHtml(a.equipo_b), empate: 'Empate' }[a.eleccion] || a.eleccion;
          const marcador = a.tipo === 'combinada' && a.marcador_a !== null ? `${a.marcador_a}–${a.marcador_b}` : '–';
          const premioStr = a.premio > 0 ? apFmt(a.premio) : '–';
          return `<tr>
            <td style="font-weight:600;color:#fff;font-size:11px;">${escHtml(a.discord_id.slice(0,8))}…</td>
            <td style="font-size:11px;">${escHtml(a.equipo_a)} vs ${escHtml(a.equipo_b)}</td>
            <td style="font-size:11px;">${a.tipo === 'combinada' ? '⭐' : '🎯'} ${a.tipo}</td>
            <td style="color:#fbbf24;font-weight:700;">${apFmt(a.monto)}</td>
            <td>${eleccionLabel}</td>
            <td style="font-size:11px;">${marcador}${a.acierto_marcador ? ' 🎯' : ''}</td>
            <td><span class="hist-badge ${a.estado}">${a.estado}</span></td>
            <td style="color:#34d399;font-weight:700;">${premioStr}</td>
          </tr>`;
        }).join('');
      } catch { tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:rgba(255,255,255,0.2);">Error.</td></tr>'; }
    }

    function admFiltrarHistorial(estado, btn) {
      document.querySelectorAll('.hist-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      admCargarHistorial(estado);
    }

