    // PERFIL PÚBLICO
    // ══════════════════════════════════════════════════════════════════════════
    let ppRegistros   = [];
    let ppSearchTimer = null;
    let ppPaginaActual = 1;
    let ppQueryActual  = '';
    let ppCargandoMas  = false;
    let ppHasMore      = false;

    // Debounce en búsqueda con validación en tiempo real
    (function() {
      const inp = document.getElementById('pp-search');
      if (!inp) return;
      inp.addEventListener('input', () => {
        clearTimeout(ppSearchTimer);
        const q = inp.value.trim();
        // Feedback visual inmediato
        const clearBtn = document.getElementById('pp-clear');
        if (clearBtn) clearBtn.style.opacity = q ? '1' : '0';
        ppSearchTimer = setTimeout(() => cargarPerfilPublico(q), 280);
      });
      inp.addEventListener('keydown', e => {
        if (e.key === 'Escape') { inp.value = ''; limpiarBusquedaPP(); }
      });
    })();

    function limpiarBusquedaPP() {
      const inp = document.getElementById('pp-search');
      const clearBtn = document.getElementById('pp-clear');
      if (inp) inp.value = '';
      if (clearBtn) clearBtn.style.opacity = '0';
      cargarPerfilPublico('');
    }

    // q: término de búsqueda. Siempre reinicia a la página 1 (nueva búsqueda).
    async function cargarPerfilPublico(q = '') {
      if (!currentUser?.id) return;
      ppQueryActual  = q;
      ppPaginaActual = 1;
      document.getElementById('pp-loading').style.display = 'flex';
      document.getElementById('pp-lista').innerHTML = '';
      document.getElementById('pp-stats').style.display = 'none';
      ocultarBotonCargarMasPP();

      try {
        const data = await ppFetchPagina(q, 1);
        document.getElementById('pp-loading').style.display = 'none';
        ppRegistros = data.registros || [];
        ppHasMore   = !!data.hasMore;
        renderPerfilPublico(ppRegistros, data.total ?? ppRegistros.length);
        actualizarBotonCargarMasPP();
      } catch(e) {
        document.getElementById('pp-loading').style.display = 'none';
        if (e && e.sesionInvalida) {
          document.getElementById('pp-lista').innerHTML =
            '<div class="historial-vacio">Sesión no válida. Cierra sesión y vuelve a entrar.</div>';
          return;
        }
        document.getElementById('pp-lista').innerHTML =
          '<div class="historial-vacio">Error al cargar el perfil público.</div>';
      }
    }

    // Trae la siguiente página y la agrega al final de la lista ya cargada
    // (en vez de pedir todos los ciudadanos de una sola vez, que se vuelve
    // pesado si la ciudad llega a tener miles de DNIs registrados).
    async function ppCargarMas() {
      if (ppCargandoMas || !ppHasMore) return;
      ppCargandoMas = true;
      const btn = document.getElementById('pp-cargar-mas');
      if (btn) { btn.disabled = true; btn.textContent = 'Cargando…'; }

      try {
        const data = await ppFetchPagina(ppQueryActual, ppPaginaActual + 1);
        ppPaginaActual += 1;
        ppHasMore = !!data.hasMore;
        ppRegistros = ppRegistros.concat(data.registros || []);
        renderPerfilPublico(ppRegistros, data.total ?? ppRegistros.length);
      } catch {
        mostrarToast && mostrarToast('Error al cargar más ciudadanos.', true);
      } finally {
        ppCargandoMas = false;
        actualizarBotonCargarMasPP();
      }
    }

    async function ppFetchPagina(q, page) {
      const params = new URLSearchParams({ page: String(page) });
      if (q) params.set('q', q);
      const res = await fetch(`/api/perfil-publico?${params.toString()}`, { credentials: 'same-origin' });
      if (res.status === 401) { const err = new Error('401'); err.sesionInvalida = true; throw err; }
      if (!res.ok) throw new Error('Error ' + res.status);
      return res.json();
    }

    function actualizarBotonCargarMasPP() {
      let btn = document.getElementById('pp-cargar-mas');
      const lista = document.getElementById('pp-lista');
      if (!ppHasMore) { ocultarBotonCargarMasPP(); return; }
      if (!btn) {
        btn = document.createElement('button');
        btn.id = 'pp-cargar-mas';
        btn.className = 'pp-cargar-mas-btn';
        btn.onclick = ppCargarMas;
        lista.parentElement.appendChild(btn);
      }
      btn.disabled = false;
      btn.textContent = `Cargar más ciudadanos`;
    }

    function ocultarBotonCargarMasPP() {
      const btn = document.getElementById('pp-cargar-mas');
      if (btn) btn.remove();
    }

    function renderPerfilPublico(lista, totalServer) {
      const el      = document.getElementById('pp-lista');
      const statsEl = document.getElementById('pp-stats');

      if (!lista.length) {
        el.innerHTML = '<div class="historial-vacio">No se encontraron ciudadanos.</div>';
        statsEl.style.display = 'none';
        return;
      }

      // El stat muestra el total real en la BD (o que calza con la búsqueda),
      // no solo lo que se ha cargado hasta ahora en pantalla.
      document.getElementById('pp-total-registros').textContent = totalServer ?? lista.length;
      statsEl.style.display = 'flex';

      el.innerHTML = lista.map(r => {
        const nombreCompleto = [r.nombre1, r.nombre2, r.apellido1, r.apellido2].filter(Boolean).join(' ');
        const apellidos      = [r.apellido1, r.apellido2].filter(Boolean).join(' ');
        const nombres        = [r.nombre1, r.nombre2].filter(Boolean).join(' ');
        const fnac           = r.fecha_nac
          ? (() => { const p = r.fecha_nac.split('-'); return p.length===3 ? `${p[2]}/${p[1]}/${p[0]}` : r.fecha_nac; })()
          : '—';

        const invCount  = r.inventario.length;
        const multCount = r.multas.length;
        const antCount  = r.antecedentes.length;
        const logrosLista = r.logros || [];
        const logCount  = logrosLista.filter(l => l.obtenido).length;

        // Badges de alerta
        const multaBadge = multCount > 0
          ? `<span class="pp-badge pp-badge-multa">${multCount} multa${multCount!==1?'s':''}</span>` : '';
        const antBadge = antCount > 0
          ? `<span class="pp-badge pp-badge-ant">${antCount} antecedente${antCount!==1?'s':''}</span>` : '';

        // Inventario HTML
        const invHtml = invCount === 0
          ? '<div class="pp-empty-slot">Sin items en inventario</div>'
          : r.inventario.map(item => `
              <div class="pp-inv-item">
                <div class="pp-inv-img">
                  ${item.imagen_url
                    ? `<img src="${escHtml(item.imagen_url)}" alt="${escHtml(item.nombre)}" loading="lazy" onerror="this.parentElement.innerHTML='${catEmoji(item.categoria)}';">`
                    : catEmoji(item.categoria)}
                </div>
                <div class="pp-inv-nombre">${escHtml(item.nombre)}</div>
                <div class="pp-inv-precio">${formatCLP(item.precio_pagado)}</div>
              </div>`).join('');

        // Multas HTML
        const multasHtml = multCount === 0
          ? '<div class="pp-empty-slot">Sin multas registradas</div>'
          : r.multas.map(m => {
              const fecha = m.created_at ? new Date(m.created_at).toLocaleDateString('es-CL') : '—';
              const estado = m.estado === 'pagada'
                ? '<span class="pp-estado pp-estado-ok">Pagada</span>'
                : '<span class="pp-estado pp-estado-pend">Pendiente</span>';
              return `
              <div class="pp-record-row">
                <div class="pp-record-main">
                  <div class="pp-record-titulo">${escHtml(m.motivo)}</div>
                  <div class="pp-record-meta">${fecha} · ${escHtml(m.funcionario_nombre || 'Sin datos')}</div>
                </div>
                <div class="pp-record-right">
                  <div class="pp-record-valor">${formatCLP(m.valor)}</div>
                  ${estado}
                </div>
              </div>`;
            }).join('');

        // Antecedentes HTML
        const antsHtml = antCount === 0
          ? '<div class="pp-empty-slot">Sin antecedentes registrados</div>'
          : r.antecedentes.map(a => {
              const fecha = a.created_at ? new Date(a.created_at).toLocaleDateString('es-CL') : '—';
              return `
              <div class="pp-record-row">
                <div class="pp-record-main">
                  <div class="pp-record-titulo">${escHtml(a.motivo)}</div>
                  ${a.articulos ? `<div class="pp-record-arts">${escHtml(a.articulos)}</div>` : ''}
                  <div class="pp-record-meta">${fecha} · ${escHtml(a.funcionario_nombre || 'Sin datos')}</div>
                </div>
                ${a.tiempo_carcel ? `<div class="pp-record-right"><span class="pp-carcel-badge">⏱ ${escHtml(a.tiempo_carcel)}</span></div>` : ''}
              </div>`;
            }).join('');

        // Logros HTML (reutiliza las mismas clases que la sección "Logros" personal)
        const logrosHtml = logrosLista.length === 0
          ? '<div class="pp-empty-slot">Sin logros</div>'
          : `<div class="logros-grid">${logrosLista.map(l => `
              <div class="logro-card ${l.obtenido ? 'desbloqueado' : 'bloqueado'}" style="--logro-color:${l.color}">
                <div class="logro-icono">${l.icono}</div>
                <div class="logro-info">
                  <div class="logro-nombre">${escHtml(l.nombre)}</div>
                  <div class="logro-desc">${escHtml(l.descripcion)}</div>
                  ${l.obtenido
                    ? `<div class="logro-fecha">Desbloqueado el ${new Date(l.fecha).toLocaleDateString('es-CL')}</div>`
                    : `<div class="logro-fecha logro-bloqueada-txt">Bloqueado</div>`}
                </div>
              </div>`).join('')}</div>`;

        return `
          <div class="pp-card" id="ppc-${r.discord_id}">
            <div class="pp-card-header" onclick="togglePPCard('${r.discord_id}')">
              <div class="pp-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              </div>
              <div class="pp-header-info">
                <div class="pp-nombre">${escHtml(nombreCompleto)}</div>
                <div class="pp-rut">${escHtml(r.rut || '—')}${r.discord_username ? ' · @' + escHtml(r.discord_username) : ''}</div>
              </div>
              <div class="pp-header-badges">
                ${multaBadge}${antBadge}
              </div>
              <div class="pp-header-meta">
                <span>${fnac}</span>
                <span>${invCount} item${invCount!==1?'s':''}</span>
              </div>
              <svg class="pp-chevron" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </div>

            <div class="pp-card-body">
              <!-- Carnet mini -->
              <div class="pp-carnet-mini">
                <div class="pp-mini-foto">
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#003087" stroke-width="1.5"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
                </div>
                <div class="pp-mini-datos">
                  <div class="pp-mini-campo"><div class="pp-mini-label">Apellidos</div><div class="pp-mini-valor">${escHtml(apellidos)}</div></div>
                  <div class="pp-mini-campo"><div class="pp-mini-label">Nombres</div><div class="pp-mini-valor">${escHtml(nombres)}</div></div>
                  <div class="pp-mini-campo"><div class="pp-mini-label">Fecha de Nacimiento</div><div class="pp-mini-valor">${fnac}</div></div>
                  <div class="pp-mini-campo"><div class="pp-mini-label">R.U.N.</div><div class="pp-mini-valor pp-mini-rut">${escHtml(r.rut || '—')}</div></div>
                  <div class="pp-mini-campo"><div class="pp-mini-label">Nacionalidad</div><div class="pp-mini-valor">${escHtml(r.nacionalidad || 'Chilena')}</div></div>
                  <div class="pp-mini-campo"><div class="pp-mini-label">Usuario Discord</div><div class="pp-mini-valor">${r.discord_username ? '@' + escHtml(r.discord_username) : 'Sin vincular'}</div></div>
                </div>
              </div>

              <!-- Tabs de contenido -->
              <div class="pp-tabs" id="ppt-${r.discord_id}">
                <button class="pp-tab active" onclick="ppSwitchTab('${r.discord_id}','inv',this)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
                  Inventario <span class="pp-tab-count">${invCount}</span>
                </button>
                <button class="pp-tab" onclick="ppSwitchTab('${r.discord_id}','multas',this)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Multas <span class="pp-tab-count ${multCount>0?'pp-tab-count-alert':''}">${multCount}</span>
                </button>
                <button class="pp-tab" onclick="ppSwitchTab('${r.discord_id}','ants',this)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                  Antecedentes <span class="pp-tab-count ${antCount>0?'pp-tab-count-alert':''}">${antCount}</span>
                </button>
                <button class="pp-tab" onclick="ppSwitchTab('${r.discord_id}','logros',this)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/><path d="M8 21h8M12 17v4"/></svg>
                  Logros <span class="pp-tab-count">${logCount}</span>
                </button>
              </div>

              <div class="pp-tab-panel active" id="pptp-${r.discord_id}-inv">
                <div class="pp-inv-grid">${invHtml}</div>
              </div>
              <div class="pp-tab-panel" id="pptp-${r.discord_id}-multas">
                <div class="pp-records-list">${multasHtml}</div>
              </div>
              <div class="pp-tab-panel" id="pptp-${r.discord_id}-ants">
                <div class="pp-records-list">${antsHtml}</div>
              </div>
              <div class="pp-tab-panel" id="pptp-${r.discord_id}-logros">
                ${logrosHtml}
              </div>
            </div>
          </div>`;
      }).join('');
    }

    function togglePPCard(id) {
      const card = document.getElementById(`ppc-${id}`);
      if (card) card.classList.toggle('open');
      ppDespertarScroll();
    }

    function ppSwitchTab(cardId, tabName, btn) {
      // Desactivar todos los tabs y panels de esta card
      const tabsContainer = document.getElementById(`ppt-${cardId}`);
      if (!tabsContainer) return;
      tabsContainer.querySelectorAll('.pp-tab').forEach(t => t.classList.remove('active'));

      ['inv','multas','ants','logros'].forEach(name => {
        const panel = document.getElementById(`pptp-${cardId}-${name}`);
        if (panel) panel.classList.remove('active');
      });

      btn.classList.add('active');
      const activePanel = document.getElementById(`pptp-${cardId}-${tabName}`);
      if (activePanel) { activePanel.classList.add('active'); activePanel.scrollTop = 0; }

      ppDespertarScroll();
    }

    // Workaround para un bug conocido de iOS Safari: dentro de un contenedor
    // con -webkit-overflow-scrolling:touch, si el contenido cambia de alto
    // de golpe (como al mostrar un panel con muchos logros), el scroll
    // puede quedar "trabado" y dejar de responder hacia arriba. Forzar un
    // reflow apagando y prendiendo esa propiedad lo destraba.
    function ppDespertarScroll() {
      const scroller = document.getElementById('perfil-publico-screen');
      if (!scroller) return;
      requestAnimationFrame(() => {
        scroller.style.webkitOverflowScrolling = 'auto';
        void scroller.offsetHeight; // fuerza el reflow
        scroller.style.webkitOverflowScrolling = 'touch';
      });
    }
