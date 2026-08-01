import { AppState } from './AppState.js';
import { CanvasEngine } from './CanvasEngine.js';
import { HistoryManager } from './HistoryManager.js';

export const EventManager = {
    isDragging: false,
    dragAction: null, // 'move', 'resize', 'rotate'
    resizeHandle: null,
    startX: 0,
    startY: 0,
    startW: 0,
    startH: 0,
    startElX: 0,
    startElY: 0,
    startRot: 0,
    
    init: function () {
        const cv = CanvasEngine.canvas;
        if (!cv) return;

        // Pointer events keep mouse, touch and pen editing behavior identical.
        // This is important on phones where mouse events alone are unreliable.
        cv.style.touchAction = 'none';
        cv.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'touch') {
                const now = Date.now();
                const isDoubleTap = this.lastTap && now - this.lastTap.time < 340
                    && Math.hypot(event.clientX - this.lastTap.x, event.clientY - this.lastTap.y) < 24;
                this.lastTap = { time: now, x: event.clientX, y: event.clientY };
                if (isDoubleTap) this.handleDoubleClick(event);
            }
            cv.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            this.handleMouseDown(event);
        });
        window.addEventListener('pointermove', (event) => this.handleMouseMove(event));
        window.addEventListener('pointerup', (event) => this.handleMouseUp(event));
        window.addEventListener('pointercancel', (event) => this.handleMouseUp(event));
        cv.addEventListener('dblclick', this.handleDoubleClick.bind(this));
        cv.addEventListener('dragover', (event) => event.preventDefault());
        cv.addEventListener('drop', this.handleFileDrop.bind(this));
        window.addEventListener('paste', this.handlePaste.bind(this));

        // Keyboard hotkeys
        window.addEventListener('keydown', this.handleKeyDown.bind(this));
        
        // Inline editors setup
        const editor = document.getElementById('inline-editor');
        if (editor) {
            editor.addEventListener('blur', this.commitTextEditing.bind(this));
        }
    },

    handleFileDrop: function (event) {
        event.preventDefault();
        const files = [...(event.dataTransfer?.files || [])].filter(file => file.type.startsWith('image/'));
        if (files.length) document.dispatchEvent(new CustomEvent('design:image-file', { detail: { files } }));
    },

    handlePaste: function (event) {
        if (AppState.editingId || /^(INPUT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
        const files = [...(event.clipboardData?.files || [])].filter(file => file.type.startsWith('image/'));
        if (files.length) document.dispatchEvent(new CustomEvent('design:image-file', { detail: { files } }));
    },

    getMouseCoords: function (e) {
        const cv = CanvasEngine.canvas;
        const r = cv.getBoundingClientRect();
        // Use rendered canvas dimensions. This stays correct after zooming and scrolling.
        const x = (e.clientX - r.left) * (cv.width / r.width) - (CanvasEngine.viewportBleedX ?? CanvasEngine.viewportBleed ?? 0);
        const y = (e.clientY - r.top) * (cv.height / r.height) - (CanvasEngine.viewportBleedY ?? CanvasEngine.viewportBleed ?? 0);
        return { x, y };
    },

    getTableBoundaryAt: function (x, y, table) {
        const { rows, cols, colWidths, rowHeights } = CanvasEngine.getTableMetrics(table);
        const tolerance = 8;
        let cursor = table.x;
        for (let c = 0; c < cols - 1; c++) {
            cursor += colWidths[c];
            if (Math.abs(x - cursor) <= tolerance && y >= table.y && y <= table.y + table.h) return { axis: 'col', index: c };
        }
        cursor = table.y;
        for (let r = 0; r < rows - 1; r++) {
            cursor += rowHeights[r];
            if (Math.abs(y - cursor) <= tolerance && x >= table.x && x <= table.x + table.w) return { axis: 'row', index: r };
        }
        return null;
    },

    getTableCellAt: function (x, y, table) {
        const { rows, cols, colWidths, rowHeights } = CanvasEngine.getTableMetrics(table);
        const angle = -(Number(table.rot) || 0) * Math.PI / 180;
        const cx = table.x + table.w / 2, cy = table.y + table.h / 2;
        const localX = cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle);
        const localY = cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle);
        if (localX < table.x || localX > table.x + table.w || localY < table.y || localY > table.y + table.h) return null;
        let c = 0, r = 0, cursor = table.x;
        while (c < cols - 1 && localX >= cursor + colWidths[c]) cursor += colWidths[c++];
        cursor = table.y;
        while (r < rows - 1 && localY >= cursor + rowHeights[r]) cursor += rowHeights[r++];
        return { r, c };
    },

    getLinePointAt: function (x, y, line) {
        if (line?.type !== 'line' || !Array.isArray(line.points)) return -1;
        const tolerance = 12;
        const visiblePoints = line._lineRenderPoints || line.points.map(point => ({ x: line.x + point.x, y: line.y + point.y }));
        return visiblePoints.findIndex(point => Math.hypot(x - point.x, y - point.y) <= tolerance);
    },

    getHandleAt: function (x, y, el) {
        if (!el || !el._bbox) return null;
        const b = el._bbox;
        const tol = 8;
        
        const hs = [
            { name: 'tl', x: b.x - 4, y: b.y - 4 },
            { name: 'tc', x: b.x + b.w / 2, y: b.y - 4 },
            { name: 'tr', x: b.x + b.w + 4, y: b.y - 4 },
            { name: 'rc', x: b.x + b.w + 4, y: b.y + b.h / 2 },
            { name: 'br', x: b.x + b.w + 4, y: b.y + b.h + 4 },
            { name: 'bc', x: b.x + b.w / 2, y: b.y + b.h + 4 },
            { name: 'bl', x: b.x - 4, y: b.y + b.h + 4 },
            { name: 'lc', x: b.x - 4, y: b.y + b.h / 2 },
            { name: 'rot', x: b.x + b.w / 2, y: b.y - 20 }
        ];

        for (let h of hs) {
            if (Math.abs(x - h.x) <= tol && Math.abs(y - h.y) <= tol) {
                return h.name;
            }
        }
        return null;
    },

    handleMouseDown: function (e) {
        if (AppState.editingId) return; // ignore if text editing is active
        const { x, y } = this.getMouseCoords(e);
        const els = AppState.getEls();

        // Check handle click for selected element
        if (AppState.selectedIds.length === 1) {
            const el = els[AppState.selectedIds[0]];
            const linePointIndex = this.getLinePointAt(x, y, el);
            if (linePointIndex >= 0 && !el.locked) {
                this.isDragging = true;
                this.dragAction = 'line-point';
                this.linePointIndex = linePointIndex;
                return;
            }
            if (el?.type === 'table') {
                const boundary = this.getTableBoundaryAt(x, y, el);
                if (boundary) {
                    this.isDragging = true;
                    this.dragAction = boundary.axis === 'col' ? 'table-col-resize' : 'table-row-resize';
                    this.tableBoundaryIndex = boundary.index;
                    this.startX = x;
                    this.startY = y;
                    this.tableStartSizes = [...(boundary.axis === 'col' ? el.colWidths : el.rowHeights)];
                    return;
                }
            }
            const handle = this.getHandleAt(x, y, el);
            if (handle) {
                this.isDragging = true;
                this.startX = x;
                this.startY = y;
                this.startW = el.w || 100;
                this.startH = el.h || 100;
                this.startElX = el.x;
                this.startElY = el.y;
                this.startRot = el.rot || 0;
                this.startSize = el.size || 16;

                if (handle === 'rot') {
                    this.dragAction = 'rotate';
                } else {
                    this.dragAction = 'resize';
                    this.resizeHandle = handle;
                }
                return;
            }
        }

        // Check element clicks (top to bottom)
        let clickedId = null;
        const keys = Object.keys(els).reverse();

        for (let k of keys) {
            const el = els[k];
            if (el.hidden) continue;
            if (el._bbox && x >= el._bbox.x && x <= el._bbox.x + el._bbox.w && y >= el._bbox.y && y <= el._bbox.y + el._bbox.h) {
                clickedId = k;
                break;
            }
        }

        if (clickedId) {
            const el = els[clickedId];
            if (el.locked) {
                AppState.selectedIds = [clickedId];
                CanvasEngine.draw();
                return;
            }

            // Shift multiselect toggle
            if (e.shiftKey) {
                if (AppState.selectedIds.includes(clickedId)) {
                    AppState.selectedIds = AppState.selectedIds.filter(id => id !== clickedId);
                } else {
                    AppState.selectedIds.push(clickedId);
                }
            } else {
                if (!AppState.selectedIds.includes(clickedId)) {
                    AppState.selectedIds = [clickedId];
                }
            }

            this.isDragging = true;
            this.dragAction = 'move';
            this.startX = x;
            this.startY = y;
            this.pendingTableCell = null;
            
            // Record starting positions for selected elements, including group members
            const dragIds = new Set(AppState.selectedIds);
            AppState.selectedIds.forEach(id => {
                const target = els[id];
                if (target && target.groupId) {
                    Object.keys(els).forEach(k => {
                        if (els[k].groupId === target.groupId) {
                            dragIds.add(k);
                        }
                    });
                }
            });

            this.dragStartPositions = {};
            dragIds.forEach(id => {
                this.dragStartPositions[id] = { x: els[id].x, y: els[id].y };
            });

            // Table specific: check if user clicked cell
            if (el.type === 'table') {
                const cell = this.getTableCellAt(x, y, el);
                if (cell) {
                    // Dragging moves the whole table. A stationary click selects
                    // the cell on pointerup, so cell editing no longer steals drag.
                    this.pendingTableCell = { id: clickedId, ...cell };
                }
            } else {
                AppState.editingCell = null;
            }

        } else {
            // Clicked on empty space: start marquee selection box
            if (!e.shiftKey) {
                AppState.selectedIds = [];
            }
            AppState.editingCell = null;
            
            this.isDragging = true;
            this.dragAction = 'select';
            AppState.marquee = { x, y, w: 0, h: 0, active: true };
        }

        CanvasEngine.draw();
    },

    handleMouseMove: function (e) {
        if (!this.isDragging) return;
        const { x, y } = this.getMouseCoords(e);
        const els = AppState.getEls();

        // Check marquee select mode
        if (this.dragAction === 'select' && AppState.marquee && AppState.marquee.active) {
            const dx = x - AppState.marquee.x;
            const dy = y - AppState.marquee.y;
            AppState.marquee.w = dx;
            AppState.marquee.h = dy;

            // Find overlapping elements
            const mx = Math.min(AppState.marquee.x, AppState.marquee.x + AppState.marquee.w);
            const my = Math.min(AppState.marquee.y, AppState.marquee.y + AppState.marquee.h);
            const mw = Math.abs(AppState.marquee.w);
            const mh = Math.abs(AppState.marquee.h);

            const tempSelected = [];
            Object.keys(els).forEach(id => {
                const el = els[id];
                if (el.hidden || !el._bbox) return;
                const eb = el._bbox;
                const overlap = !(eb.x > mx + mw || 
                                  eb.x + eb.w < mx || 
                                  eb.y > my + mh || 
                                  eb.y + eb.h < my);
                if (overlap) {
                    tempSelected.push(id);
                }
            });
            AppState.selectedIds = tempSelected;
            CanvasEngine.draw();
            return;
        }

        const el = els[AppState.selectedIds[0]];
        if (!el) return;

        if (this.dragAction === 'table-cell-select' && el.type === 'table') {
            const cell = this.getTableCellAt(x, y, el);
            if (cell && AppState.tableSelection?.id === el._id) {
                AppState.tableSelection.focus = cell;
                AppState.editingCell = { id: el._id, ...cell };
            }
            CanvasEngine.draw();
            return;
        }

        const dx = x - this.startX;
        const dy = y - this.startY;

        if (this.dragAction === 'table-col-resize' || this.dragAction === 'table-row-resize') {
            const sizes = this.dragAction === 'table-col-resize' ? el.colWidths : el.rowHeights;
            const delta = this.dragAction === 'table-col-resize' ? dx : dy;
            const index = this.tableBoundaryIndex;
            const minSize = 24;
            const maxGrow = this.tableStartSizes[index + 1] - minSize;
            const maxShrink = this.tableStartSizes[index] - minSize;
            const applied = Math.max(-maxShrink, Math.min(maxGrow, delta));
            sizes[index] = this.tableStartSizes[index] + applied;
            sizes[index + 1] = this.tableStartSizes[index + 1] - applied;
        } else if (this.dragAction === 'line-point' && el.type === 'line' && el.points?.[this.linePointIndex]) {
            const center = el._lineCenter || { x: el.x + el.w / 2, y: el.y + el.h / 2 };
            const radians = -(Number(el.rot) || 0) * Math.PI / 180;
            const localX = center.x + (x - center.x) * Math.cos(radians) - (y - center.y) * Math.sin(radians);
            const localY = center.y + (x - center.x) * Math.sin(radians) + (y - center.y) * Math.cos(radians);
            el.points[this.linePointIndex] = { x: localX - el.x, y: localY - el.y };
            const xs = el.points.map(point => point.x), ys = el.points.map(point => point.y);
            el.w = Math.max(...xs) - Math.min(...xs);
            el.h = Math.max(...ys) - Math.min(...ys);
        } else if (this.dragAction === 'move') {
            const groupIds = Object.keys(this.dragStartPositions);
            groupIds.forEach(id => {
                const targetEl = els[id];
                const startPos = this.dragStartPositions[id];
                if (targetEl && startPos) {
                    targetEl.x = startPos.x + dx;
                    targetEl.y = startPos.y + dy;
                }
            });

            if (AppState.snapEnabled && groupIds.length === 1) {
                this.applySnapping(el);
            } else {
                CanvasEngine.snapGuides = [];
            }

        } else if (this.dragAction === 'resize') {
            const h = this.resizeHandle;
            
            if (el.type === 'text') {
                if (['tl', 'tr', 'br', 'bl'].includes(h)) {
                    const scale = 1 + (dy / this.startH);
                    el.size = Math.max(10, Math.round(this.startSize * scale));
                } else if (h === 'rc') {
                    el.w = Math.max(50, this.startW + dx);
                } else if (h === 'lc') {
                    const nw = this.startW - dx;
                    if (nw > 50) {
                        el.w = nw;
                        el.x = this.startElX + dx;
                    }
                }
            } else {
                // Shapes, tables, charts resizing
                if (h.includes('r')) el.w = Math.max(10, this.startW + dx);
                if (h.includes('l')) {
                    const nw = this.startW - dx;
                    if (nw > 10) {
                        el.w = nw;
                        el.x = this.startElX + dx;
                    }
                }
                if (h.includes('b')) el.h = Math.max(10, this.startH + dy);
                if (h.includes('t')) {
                    const nh = this.startH - dy;
                    if (nh > 10) {
                        el.h = nh;
                        el.y = this.startElY + dy;
                    }
                }
            }
        } else if (this.dragAction === 'rotate') {
            // Lines are rendered around their actual path center, which can differ
            // from x/y + w/h when they contain bend points. Use that same center
            // for the rotation handle so the line follows the pointer exactly.
            const center = el.type === 'line' && el._lineCenter
                ? el._lineCenter
                : { x: el.x + el.w / 2, y: el.y + el.h / 2 };
            const cx = center.x;
            const cy = center.y;
            const angle = Math.atan2(y - cy, x - cx);
            el.rot = Math.round(angle * 180 / Math.PI - 90);
        }

        CanvasEngine.draw();
    },

    handleMouseUp: function (e) {
        if (e && e.target && e.pointerId !== undefined) {
            try {
                e.target.releasePointerCapture?.(e.pointerId);
            } catch (err) {
                // ignore
            }
        }
        if (this.isDragging && this.pendingTableCell && this.dragAction === 'move') {
            const coords = e ? this.getMouseCoords(e) : { x: this.startX, y: this.startY };
            const moved = Math.hypot(coords.x - this.startX, coords.y - this.startY);
            if (moved < 5) {
                const { id, r, c } = this.pendingTableCell;
                AppState.editingCell = { id, r, c };
                AppState.tableSelection = { id, anchor: { r, c }, focus: { r, c } };
            } else {
                AppState.editingCell = null;
                AppState.tableSelection = null;
            }
        }
        if (this.isDragging) {
            HistoryManager.save();
        }
        this.isDragging = false;
        this.dragAction = null;
        this.resizeHandle = null;
        this.tableBoundaryIndex = null;
        this.tableStartSizes = null;
        this.linePointIndex = null;
        this.pendingTableCell = null;
        if (AppState.marquee) AppState.marquee.active = false;
        CanvasEngine.snapGuides = [];
        CanvasEngine.draw();
    },

    applySnapping: function (el) {
        CanvasEngine.snapGuides = [];
        let snapX = null;
        let snapY = null;
        const snapDist = 6;
        const page = AppState.getPage();

        const dragB = {
            l: el.x,
            r: el.x + el.w,
            c: el.x + el.w / 2,
            t: el.y,
            b: el.y + el.h,
            m: el.y + el.h / 2
        };

        // Snap to center of page
        if (Math.abs(dragB.c - page.w / 2) < snapDist) {
            snapX = page.w / 2 - el.w / 2;
            CanvasEngine.snapGuides.push({ type: 'v', val: page.w / 2 });
        }
        if (Math.abs(dragB.m - page.h / 2) < snapDist) {
            snapY = page.h / 2 - el.h / 2;
            CanvasEngine.snapGuides.push({ type: 'h', val: page.h / 2 });
        }

        // Snap to other elements
        const els = AppState.getEls();
        Object.keys(els).forEach(id => {
            if (id === AppState.selectedIds[0]) return;
            const target = els[id];
            if (target.hidden || !target._bbox) return;

            const tb = target._bbox;
            const t_l = tb.x;
            const t_r = tb.x + tb.w;
            const t_c = tb.x + tb.w / 2;
            const t_t = tb.y;
            const t_b = tb.y + tb.h;
            const t_m = tb.y + tb.h / 2;

            if (Math.abs(dragB.l - t_l) < snapDist) {
                snapX = t_l;
                CanvasEngine.snapGuides.push({ type: 'v', val: t_l });
            } else if (Math.abs(dragB.r - t_r) < snapDist) {
                snapX = t_r - el.w;
                CanvasEngine.snapGuides.push({ type: 'v', val: t_r });
            } else if (Math.abs(dragB.c - t_c) < snapDist) {
                snapX = t_c - el.w / 2;
                CanvasEngine.snapGuides.push({ type: 'v', val: t_c });
            } else if (Math.abs(dragB.l - t_r) < snapDist) {
                snapX = t_r;
                CanvasEngine.snapGuides.push({ type: 'v', val: t_r });
            } else if (Math.abs(dragB.r - t_l) < snapDist) {
                snapX = t_l - el.w;
                CanvasEngine.snapGuides.push({ type: 'v', val: t_l });
            }

            if (Math.abs(dragB.t - t_t) < snapDist) {
                snapY = t_t;
                CanvasEngine.snapGuides.push({ type: 'h', val: t_t });
            } else if (Math.abs(dragB.b - t_b) < snapDist) {
                snapY = t_b - el.h;
                CanvasEngine.snapGuides.push({ type: 'h', val: t_b });
            } else if (Math.abs(dragB.m - t_m) < snapDist) {
                snapY = t_m - el.h / 2;
                CanvasEngine.snapGuides.push({ type: 'h', val: t_m });
            } else if (Math.abs(dragB.t - t_b) < snapDist) {
                snapY = t_b;
                CanvasEngine.snapGuides.push({ type: 'h', val: t_b });
            } else if (Math.abs(dragB.b - t_t) < snapDist) {
                snapY = t_t - el.h;
                CanvasEngine.snapGuides.push({ type: 'h', val: t_t });
            }
        });

        if (snapX !== null) el.x = snapX;
        if (snapY !== null) el.y = snapY;
    },

    handleDoubleClick: function (e) {
        const { x, y } = this.getMouseCoords(e);
        const els = AppState.getEls();
        
        if (AppState.selectedIds.length === 1) {
            const id = AppState.selectedIds[0];
            const el = els[id];
            
            if (el.type === 'text') {
                this.startTextEditing(id, el);
            } else if (el.type === 'table' && AppState.editingCell) {
                this.startTableCellEditing(el);
            } else if (el.type === 'chart') {
                // Show chart editor panel on sidebar
                const tabCharts = document.querySelector('[data-target="tab-charts"]');
                if (tabCharts) tabCharts.click();
            }
        }
    },

    startTextEditing: function (id, el) {
        AppState.editingId = id;
        const cv = CanvasEngine.canvas;
        const r = cv.getBoundingClientRect();
        const editor = document.getElementById('inline-editor');
        if (!editor) return;

        const scaleX = r.width / cv.width;
        const scaleY = r.height / cv.height;
        editor.value = el.text;
        editor.style.display = 'block';
        // The editor is fixed to the viewport, just like getBoundingClientRect().
        // This prevents offset drift while the canvas workspace is scrolled.
        editor.style.left = Math.round(r.left + ((el._bbox.x + (CanvasEngine.viewportBleedX ?? CanvasEngine.viewportBleed ?? 0)) * scaleX)) + 'px';
        editor.style.top = Math.round(r.top + ((el._bbox.y + (CanvasEngine.viewportBleedY ?? CanvasEngine.viewportBleed ?? 0)) * scaleY)) + 'px';
        editor.style.fontSize = (el.size * scaleX) + 'px';
        editor.style.fontFamily = el.font || 'Pretendard';
        editor.style.fontWeight = el.bold ? 'bold' : 'normal';
        editor.style.fontStyle = el.italic ? 'italic' : 'normal';
        editor.style.color = el.color || '#000';
        editor.style.textAlign = el.align === 'justify' ? 'left' : el.align;
        // Match the visible text box exactly. A minimum of 160px previously
        // forced narrow elements away from their selected area.
        editor.style.width = Math.max(48, el._bbox.w * scaleX) + 'px';
        editor.style.height = Math.max(36, el._bbox.h * scaleY) + 'px';
        editor.style.lineHeight = el.lineHeight || 1.3;
        editor.style.letterSpacing = el.spacing ? (el.spacing * scaleX) + 'px' : 'normal';

        editor.focus();
        CanvasEngine.draw();
    },

    commitTextEditing: function () {
        if (AppState.editingId) {
            const editor = document.getElementById('inline-editor');
            const el = AppState.getEls()[AppState.editingId];
            if (el && editor) {
                el.text = editor.value;
                HistoryManager.save();
            }
            AppState.editingId = null;
            editor.style.display = 'none';
            CanvasEngine.draw();
        }
    },

    startTableCellEditing: function (el) {
        const cellInfo = AppState.editingCell;
        if (!cellInfo) return;

        const cell = el.cells[cellInfo.r][cellInfo.c];
        const currentText = cell ? cell.text : '';
        const newText = prompt("셀 텍스트를 입력하세요:", currentText);
        
        if (newText !== null) {
            if (!el.cells[cellInfo.r]) el.cells[cellInfo.r] = [];
            if (!el.cells[cellInfo.r][cellInfo.c]) el.cells[cellInfo.r][cellInfo.c] = { text: '' };
            el.cells[cellInfo.r][cellInfo.c].text = newText;
            HistoryManager.save();
            CanvasEngine.draw();
        }
    },

    handleKeyDown: function (e) {
        if (AppState.editingId) return; // let editor handle keys
        
        const els = AppState.getEls();
        
        // Undo (Ctrl+Z)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
            e.preventDefault();
            if (HistoryManager.undo()) {
                CanvasEngine.draw();
            }
            return;
        }

        // Redo (Ctrl+Y)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
            e.preventDefault();
            if (HistoryManager.redo()) {
                CanvasEngine.draw();
            }
            return;
        }

        // Delete / Backspace
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (AppState.selectedIds.length > 0) {
                AppState.selectedIds.forEach(id => {
                    delete els[id];
                });
                AppState.selectedIds = [];
                AppState.editingCell = null;
                HistoryManager.save();
                CanvasEngine.draw();
            }
            return;
        }

        // Copy (Ctrl+C)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
            if (AppState.selectedIds.length > 0) {
                e.preventDefault();
                AppState.copyBuffer = AppState.selectedIds.map(id => {
                    return JSON.parse(JSON.stringify(els[id]));
                });
            }
            return;
        }

        // Paste (Ctrl+V)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
            if (AppState.copyBuffer && AppState.copyBuffer.length > 0) {
                e.preventDefault();
                const newIds = [];
                AppState.copyBuffer.forEach(copied => {
                    const newEl = JSON.parse(JSON.stringify(copied));
                    newEl.x += 30; // offset
                    newEl.y += 30;
                    if (newEl.groupId) {
                        // generate new groupId for pasted group
                        newEl.groupId = 'group_' + Math.random().toString(36).substring(2, 9);
                    }
                    const newId = 'el_' + Math.random().toString(36).substring(2, 9);
                    els[newId] = newEl;
                    newIds.push(newId);
                });
                AppState.selectedIds = newIds;
                HistoryManager.save();
                CanvasEngine.draw();
            }
            return;
        }

        // Group (Ctrl+G)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            if (AppState.selectedIds.length > 1) {
                const groupId = 'group_' + Math.random().toString(36).substring(2, 9);
                AppState.selectedIds.forEach(id => {
                    els[id].groupId = groupId;
                });
                HistoryManager.save();
                CanvasEngine.draw();
                alert("선택된 요소들이 그룹화되었습니다!");
            }
            return;
        }

        // Ungroup (Ctrl+Shift+G)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'g') {
            e.preventDefault();
            if (AppState.selectedIds.length > 0) {
                AppState.selectedIds.forEach(id => {
                    if (els[id].groupId) {
                        delete els[id].groupId;
                    }
                });
                HistoryManager.save();
                CanvasEngine.draw();
                alert("그룹 해제되었습니다!");
            }
            return;
        }

        // Move Nudges (Arrow keys)
        const moveKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (moveKeys.includes(e.key) && AppState.selectedIds.length > 0) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            
            const groupIds = [];
            AppState.selectedIds.forEach(id => {
                groupIds.push(id);
                const el = els[id];
                if (el.groupId) {
                    Object.keys(els).forEach(k => {
                        if (els[k].groupId === el.groupId && !groupIds.includes(k)) {
                            groupIds.push(k);
                        }
                    });
                }
            });

            groupIds.forEach(id => {
                const el = els[id];
                if (el.locked) return;
                if (e.key === 'ArrowUp') el.y -= step;
                if (e.key === 'ArrowDown') el.y += step;
                if (e.key === 'ArrowLeft') el.x -= step;
                if (e.key === 'ArrowRight') el.x += step;
            });

            CanvasEngine.draw();
        }
    }
};
