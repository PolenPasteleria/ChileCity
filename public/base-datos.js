    // BASE DE DATOS (admin)
    // ══════════════════════════════════════════════════════════════════════════
    let bdRegistros    = [];
    let bdSearchTimer  = null;

    // Listener de búsqueda con debounce
    (function() {
      const inp = document.getElementById('bd-search');
      if (inp) inp.addEventListener('input', () => {
        clearTimeout(bdSearchTimer);
        bdSearchTimer = setTimeout(() => cargarBaseDatos(inp.value), 300);
      });
    })();

    async function cargarBaseDatos(q = '') {
      if (!currentUser?.id) return;
      document.getElementById('bd-loading').style.display = 'flex';
      document.getElementById('bd-lista').innerHTML = '';
      document.getElementById('bd-stats').style.display = 'none';

      try {
        const url = `/api/tienda?action=base_datos${q ? '&q=' + encodeURIComponent(q) : ''}`;
        const res  = await fetch(url);
        const data = await res.json();
        document.getElementById('bd-loading').style.display = 'none';

        bdRegistros = data.registros || [];
        renderBaseDatos(bdRegistros);
      } catch(e) {
        document.getElementById('bd-loading').style.display = 'none';
        document.getElementById('bd-lista').innerHTML = '<div class="historial-vacio">Error al cargar la base de datos.</div>';
      }
    }

    function renderBaseDatos(lista) {
      const el     = document.getElementById('bd-lista');
      const statsEl = document.getElementById('bd-stats');

      if (!lista.length) {
        el.innerHTML = '<div class="historial-vacio">No se encontraron registros.</div>';
        statsEl.style.display = 'none';
        return;
      }

      // Stats
      const totalItems = lista.reduce((s, r) => s + r.inventario.length, 0);
      document.getElementById('bd-total-registros').textContent = lista.length;
      document.getElementById('bd-total-items').textContent     = totalItems;
      statsEl.style.display = 'flex';

      el.innerHTML = lista.map(r => {
        const nombreCompleto = [r.nombre1, r.nombre2, r.apellido1, r.apellido2].filter(Boolean).join(' ');
        const apellidos      = [r.apellido1, r.apellido2].filter(Boolean).join(' ');
        const nombres        = [r.nombre1, r.nombre2].filter(Boolean).join(' ');
        const fnac           = r.fecha_nac ? (() => { const p = r.fecha_nac.split('-'); return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : r.fecha_nac; })() : '—';
        const invCount       = r.inventario.length;

        // inventario items HTML
        const invHtml = invCount === 0
          ? '<div class="bd-inv-empty">Sin items en inventario</div>'
          : r.inventario.map(item => `
              <div class="bd-inv-item">
                <div class="bd-inv-item-img">
                  ${item.imagen_url
                    ? `<img src="${escHtml(item.imagen_url)}" alt="${escHtml(item.nombre)}" onerror="this.parentElement.innerHTML='${catEmoji(item.categoria)}';">`
                    : catEmoji(item.categoria)}
                </div>
                <div class="bd-inv-item-nombre">${escHtml(item.nombre)}</div>
                <div class="bd-inv-item-precio">${formatearSaldo(item.precio_pagado)}</div>
              </div>`).join('');

        return `
          <div class="bd-carnet-row" id="bdr-${r.discord_id}">
            <div class="bd-carnet-header" onclick="toggleBdRow('${r.discord_id}')">
              <div class="bd-avatar">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
              <div class="bd-info">
                <div class="bd-nombre">${escHtml(nombreCompleto)}</div>
                <div class="bd-rut">${escHtml(r.rut || '—')}</div>
              </div>
              <div class="bd-meta">
                <div class="bd-fecha">${fnac}</div>
                <div class="bd-items">${invCount} item${invCount !== 1 ? 's' : ''}</div>
              </div>
              <svg class="bd-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </div>
            <div class="bd-detail">
              <div class="bd-carnet-mini">
                <div class="bd-mini-foto">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#003087" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </div>
                <div class="bd-mini-datos">
                  <div class="bd-mini-campo">
                    <div class="bd-mini-label">Apellidos</div>
                    <div class="bd-mini-valor">${escHtml(apellidos)}</div>
                  </div>
                  <div class="bd-mini-campo">
                    <div class="bd-mini-label">Nombres</div>
                    <div class="bd-mini-valor">${escHtml(nombres)}</div>
                  </div>
                  <div class="bd-mini-campo">
                    <div class="bd-mini-label">Fecha de Nacimiento</div>
                    <div class="bd-mini-valor">${fnac}</div>
                  </div>
                  <div class="bd-mini-campo">
                    <div class="bd-mini-label">R.U.N.</div>
                    <div class="bd-mini-valor bd-mini-rut">${escHtml(r.rut || '—')}</div>
                  </div>
                </div>
              </div>
              <div class="bd-inv-titulo">Inventario</div>
              <div class="bd-inv-lista">${invHtml}</div>
            </div>
          </div>`;
      }).join('');
    }

    function toggleBdRow(discordId) {
      const row = document.getElementById(`bdr-${discordId}`);
      if (row) row.classList.toggle('open');
    }

