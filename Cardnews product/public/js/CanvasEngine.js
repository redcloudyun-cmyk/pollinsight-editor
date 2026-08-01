import { AppState } from './AppState.js';

export const CanvasEngine = {
    canvas: null,
    ctx: null,
    viewportBleed: 0,
    viewportBleedX: 0,
    viewportBleedY: 0,
    // Keep a generous horizontal work area for off-page assets, but use a
    // compact vertical work area so consecutive pages form a readable stack.
    editorBleedX: 240,
    editorBleedY: 44,
    snapGuides: [], // temporary guides to draw: { type: 'v'|'h', val: number }

    init: function (canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    },

    getRotatedBounds: function (el) {
        const angle = (Number(el.rot) || 0) * Math.PI / 180;
        if (!angle) return { x: el.x, y: el.y, w: el.w, h: el.h };
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
        const rotate = (x, y) => ({ x: cx + (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle), y: cy + (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle) });
        const corners = [rotate(el.x, el.y), rotate(el.x + el.w, el.y), rotate(el.x + el.w, el.y + el.h), rotate(el.x, el.y + el.h)];
        const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    },

    getPageWidth: function () { return AppState.getPage()?.w || this.canvas?.width || 0; },
    getPageHeight: function () { return AppState.getPage()?.h || this.canvas?.height || 0; },

    getShadowColor: function (el) {
        const color = el.shadowColor || '#000000';
        const alpha = Math.max(0, Math.min(1, Number(el.shadowOpacity ?? 0.4)));
        if (!color.startsWith('#') || color.length !== 7) return color;
        const value = parseInt(color.slice(1), 16);
        return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
    },

    applyElementShadow: function (el) {
        if (!el.useShadow) return;
        this.ctx.shadowColor = this.getShadowColor(el);
        this.ctx.shadowBlur = Number(el.shadowBlur) || 0;
        this.ctx.shadowOffsetX = Number(el.shadowOffsetX) || 0;
        this.ctx.shadowOffsetY = Number(el.shadowOffsetY) || 0;
    },

    draw: function (hideControls = false, suppressUISync = false) {
        if (!this.canvas || !this.ctx) return;

        const page = AppState.getPage();
        if (!page) return;

        // Editor view gets a non-exported work area around the page. Export and
        // preview calls use draw(true), keeping their exact configured size.
        const isEditorCanvas = this.canvas.id === 'cardCanvas';
        const bleedX = isEditorCanvas && !hideControls ? this.editorBleedX : 0;
        const bleedY = isEditorCanvas && !hideControls ? this.editorBleedY : 0;
        this.viewportBleed = bleedX;
        this.viewportBleedX = bleedX;
        this.viewportBleedY = bleedY;
        const visualWidth = page.w + bleedX * 2;
        const visualHeight = page.h + bleedY * 2;
        if (this.canvas.width !== visualWidth) this.canvas.width = visualWidth;
        if (this.canvas.height !== visualHeight) this.canvas.height = visualHeight;

        this.ctx.clearRect(0, 0, visualWidth, visualHeight);
        this.ctx.save();
        this.ctx.translate(bleedX, bleedY);

        // Draw Background
        this.ctx.save();
        if (page.bgType === 'gradient') {
            const angleRad = (page.bgGradientAngle || 180) * Math.PI / 180;
            const x1 = page.w / 2 - Math.cos(angleRad) * page.w / 2;
            const y1 = page.h / 2 - Math.sin(angleRad) * page.h / 2;
            const x2 = page.w / 2 + Math.cos(angleRad) * page.w / 2;
            const y2 = page.h / 2 + Math.sin(angleRad) * page.h / 2;
            const grad = this.ctx.createLinearGradient(x1, y1, x2, y2);
            grad.addColorStop(0, page.bgColor || '#ffffff');
            grad.addColorStop(1, page.bgColor2 || '#eff6ff');
            this.ctx.fillStyle = grad;
        } else {
            this.ctx.fillStyle = page.bgColor || '#ffffff';
        }
        this.ctx.fillRect(0, 0, page.w, page.h);
        if (page.bgType === 'image' && page.bgImageSrc) {
            if (!page._bgImage) {
                page._bgImage = new Image();
                page._bgImage.onload = () => this.draw();
                page._bgImage.src = page.bgImageSrc;
            }
            const image = page._bgImage;
            if (image.complete && image.naturalWidth) {
                const scale = Math.max(page.w / image.naturalWidth, page.h / image.naturalHeight);
                const drawW = image.naturalWidth * scale;
                const drawH = image.naturalHeight * scale;
                this.ctx.drawImage(image, (page.w - drawW) / 2, (page.h - drawH) / 2, drawW, drawH);
            }
        }
        this.ctx.restore();

        // Draw Background Border
        if (page.bgStrokeWidth > 0) {
            this.ctx.save();
            this.ctx.strokeStyle = page.bgStrokeColor || '#000000';
            this.ctx.lineWidth = page.bgStrokeWidth;
            const hw = page.bgStrokeWidth / 2;
            this.ctx.strokeRect(hw, hw, page.w - page.bgStrokeWidth, page.h - page.bgStrokeWidth);
            this.ctx.restore();
        }

        // Draw background grid lines
        if (AppState.showGrid && !hideControls) {
            this.drawGrid();
        }

        // Draw Elements
        const els = AppState.getEls();
        Object.keys(els).forEach(id => {
            const el = els[id];
            if (el.hidden) return;
            el._id = id;

            this.ctx.save();
            this.ctx.globalAlpha = el.opacity !== undefined ? el.opacity : 1;
            this.applyElementShadow(el);

            if (el.type === 'rect') {
                this.drawRect(el);
            } else if (el.type === 'circle') {
                this.drawCircle(el);
            } else if (el.type === 'triangle') {
                this.drawTriangle(el);
            } else if (el.type === 'star') {
                this.drawStar(el);
            } else if (el.type === 'polygon') {
                this.drawPolygon(el);
            } else if (el.type === 'line') {
                this.drawLine(el);
            } else if (el.type === 'text') {
                this.drawText(el);
            } else if (el.type === 'image') {
                this.drawImage(el);
            } else if (el.type === 'table') {
                this.drawTable(el);
            } else if (el.type === 'chart') {
                this.drawChart(el);
            }

            this.ctx.restore();
        });

        // Draw Snap Lines
        if (!hideControls && AppState.snapEnabled && this.snapGuides.length > 0) {
            this.drawSnapGuides();
        }

        // Draw Active Selection Bounding Box & Resizer Handles
        if (!hideControls && AppState.selectedIds.length > 0 && !AppState.editingId) {
            this.drawSelectionControls();
        }

        // Draw Marquee drag selection box
        if (!hideControls && AppState.marquee && AppState.marquee.active) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(37, 99, 235, 0.08)';
            this.ctx.strokeStyle = 'rgba(37, 99, 235, 0.6)';
            this.ctx.lineWidth = 1;
            this.ctx.fillRect(AppState.marquee.x, AppState.marquee.y, AppState.marquee.w, AppState.marquee.h);
            this.ctx.strokeRect(AppState.marquee.x, AppState.marquee.y, AppState.marquee.w, AppState.marquee.h);
            this.ctx.restore();
        }

        this.ctx.restore();

        // Broadcast to trigger UI sync
        if (!suppressUISync && window.updateUIFromCanvasState) {
            window.updateUIFromCanvasState();
        }
    },

    drawGrid: function () {
        this.ctx.save();
        this.ctx.strokeStyle = 'rgba(148, 163, 184, 0.15)';
        this.ctx.lineWidth = 1;
        const page = AppState.getPage();
        const step = 50;
        
        for (let x = step; x < page.w; x += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, page.h);
            this.ctx.stroke();
        }
        for (let y = step; y < page.h; y += step) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(page.w, y);
            this.ctx.stroke();
        }
        this.ctx.restore();
    },

    getShapeFill: function (el) {
        if (el.fillType !== 'gradient') return el.color || '#3b82f6';
        const start = el.gradientColor1 || el.color || '#3b82f6';
        const end = el.gradientColor2 || '#ffffff';
        const width = Math.max(1, Number(el.w) || 1);
        const height = Math.max(1, Number(el.h) || 1);
        let gradient;
        if (el.gradientType === 'radial') {
            gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) / 2);
        } else {
            const angle = (Number(el.gradientAngle) || 0) * Math.PI / 180;
            const radius = Math.sqrt(width * width + height * height) / 2;
            gradient = this.ctx.createLinearGradient(-Math.cos(angle) * radius, -Math.sin(angle) * radius, Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        gradient.addColorStop(0, start);
        gradient.addColorStop(1, end);
        return gradient;
    },

    getShapeStroke: function (el) {
        if (el.strokeFillType !== 'gradient') return el.strokeColor || 'transparent';
        const start = el.strokeGradientColor1 || el.strokeColor || '#000000';
        const end = el.strokeGradientColor2 || '#ffffff';
        const width = Math.max(1, Number(el.w) || 1);
        const height = Math.max(1, Number(el.h) || 1);
        let gradient;
        if (el.strokeGradientType === 'radial') {
            gradient = this.ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) / 2);
        } else {
            const angle = (Number(el.strokeGradientAngle) || 0) * Math.PI / 180;
            const radius = Math.sqrt(width * width + height * height) / 2;
            gradient = this.ctx.createLinearGradient(-Math.cos(angle) * radius, -Math.sin(angle) * radius, Math.cos(angle) * radius, Math.sin(angle) * radius);
        }
        gradient.addColorStop(0, start);
        gradient.addColorStop(1, end);
        return gradient;
    },

    drawRect: function (el) {
        this.ctx.lineWidth = el.strokeWidth || 0;

        this.ctx.save();
        this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        this.ctx.fillStyle = this.getShapeFill(el);
        this.ctx.strokeStyle = this.getShapeStroke(el);

        this.ctx.beginPath();
        const r = el.borderRadius || 0;
        this.ctx.roundRect(-el.w / 2, -el.h / 2, el.w, el.h, r);
        this.ctx.fill();
        if (el.strokeWidth > 0) {
            this.ctx.stroke();
        }
        this.ctx.restore();

        el._bbox = this.getRotatedBounds(el);
    },

    drawCircle: function (el) {
        this.ctx.lineWidth = el.strokeWidth || 0;

        this.ctx.save();
        this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        this.ctx.fillStyle = this.getShapeFill(el);
        this.ctx.strokeStyle = this.getShapeStroke(el);

        this.ctx.beginPath();
        this.ctx.ellipse(0, 0, el.w / 2, el.h / 2, 0, 0, 2 * Math.PI);
        this.ctx.fill();
        if (el.strokeWidth > 0) {
            this.ctx.stroke();
        }
        this.ctx.restore();

        el._bbox = this.getRotatedBounds(el);
    },

    drawTriangle: function (el) {
        this.ctx.lineWidth = el.strokeWidth || 0;

        this.ctx.save();
        this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        this.ctx.fillStyle = this.getShapeFill(el);
        this.ctx.strokeStyle = this.getShapeStroke(el);

        this.ctx.beginPath();
        this.ctx.moveTo(0, -el.h / 2);
        this.ctx.lineTo(el.w / 2, el.h / 2);
        this.ctx.lineTo(-el.w / 2, el.h / 2);
        this.ctx.closePath();
        this.ctx.fill();
        if (el.strokeWidth > 0) {
            this.ctx.stroke();
        }
        this.ctx.restore();

        el._bbox = this.getRotatedBounds(el);
    },

    drawStar: function (el) {
        this.ctx.lineWidth = el.strokeWidth || 0;

        this.ctx.save();
        this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        this.ctx.fillStyle = this.getShapeFill(el);
        this.ctx.strokeStyle = this.getShapeStroke(el);

        const spikes = el.spikes || 5;
        const outerRadius = el.w / 2;
        const innerRadius = outerRadius * 0.4;
        let rot = Math.PI / 2 * 3;
        const step = Math.PI / spikes;

        this.ctx.beginPath();
        this.ctx.moveTo(0, -outerRadius);
        for (let i = 0; i < spikes; i++) {
            this.ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
            rot += step;
            this.ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
            rot += step;
        }
        this.ctx.closePath();
        this.ctx.fill();
        if (el.strokeWidth > 0) {
            this.ctx.stroke();
        }
        this.ctx.restore();

        el._bbox = this.getRotatedBounds(el);
    },

    drawPolygon: function (el) {
        this.ctx.lineWidth = el.strokeWidth || 0;

        this.ctx.save();
        this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        this.ctx.fillStyle = this.getShapeFill(el);
        this.ctx.strokeStyle = this.getShapeStroke(el);

        const sides = el.sides || 6;
        const radius = el.w / 2;
        this.ctx.beginPath();
        this.ctx.moveTo(radius * Math.cos(0), radius * Math.sin(0));
        for (let i = 1; i <= sides; i++) {
            this.ctx.lineTo(radius * Math.cos(i * 2 * Math.PI / sides), radius * Math.sin(i * 2 * Math.PI / sides));
        }
        this.ctx.closePath();
        this.ctx.fill();
        if (el.strokeWidth > 0) {
            this.ctx.stroke();
        }
        this.ctx.restore();

        el._bbox = this.getRotatedBounds(el);
    },

    drawLine: function (el) {
        const points = Array.isArray(el.points) && el.points.length >= 2
            ? el.points : [{ x: 0, y: 0 }, { x: el.w || 200, y: el.h || 0 }];
        if (!el.points) el.points = points;
        const absolute = points.map(point => ({ x: el.x + point.x, y: el.y + point.y }));
        const baseXs = absolute.map(point => point.x), baseYs = absolute.map(point => point.y);
        const center = { x: (Math.min(...baseXs) + Math.max(...baseXs)) / 2, y: (Math.min(...baseYs) + Math.max(...baseYs)) / 2 };
        const radians = (Number(el.rot) || 0) * Math.PI / 180;
        const rotatePoint = point => radians ? ({ x: center.x + (point.x - center.x) * Math.cos(radians) - (point.y - center.y) * Math.sin(radians), y: center.y + (point.x - center.x) * Math.sin(radians) + (point.y - center.y) * Math.cos(radians) }) : point;
        const rendered = absolute.map(rotatePoint);
        const width = Number(el.strokeWidth) || 4;
        const style = el.lineStyle || (el.dashed ? 'dashed' : 'solid');
        const dashLength = Math.max(1, Number(el.dashLength) || 12);
        const dashGap = Math.max(1, Number(el.dashGap) || 8);

        this.ctx.save();
        this.ctx.strokeStyle = el.color || '#475569';
        this.ctx.fillStyle = el.color || '#475569';
        this.ctx.lineWidth = width;
        this.ctx.lineJoin = el.lineJoin === 'round' ? 'round' : 'miter';
        this.ctx.lineCap = el.lineCap || 'butt';
        if (style === 'dashed') this.ctx.setLineDash([dashLength, dashGap]);
        else if (style === 'dotted') this.ctx.setLineDash([Math.max(1, width), dashGap]);
        else this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.moveTo(rendered[0].x, rendered[0].y);
        rendered.slice(1).forEach(point => this.ctx.lineTo(point.x, point.y));
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        const drawCap = (type, point, toward) => {
            if (!type || type === 'none') return;
            const angle = Math.atan2(point.y - toward.y, point.x - toward.x);
            const size = Math.max(10, width * 2.7);
            this.ctx.save(); this.ctx.translate(point.x, point.y); this.ctx.rotate(angle);
            this.ctx.lineWidth = Math.max(1, width * 0.7);
            if (type === 'arrow') {
                this.ctx.beginPath(); this.ctx.moveTo(0, 0); this.ctx.lineTo(-size, -size * 0.55); this.ctx.lineTo(-size, size * 0.55); this.ctx.closePath(); this.ctx.fill();
            } else if (type === 'circle') {
                this.ctx.beginPath(); this.ctx.arc(0, 0, size * 0.38, 0, Math.PI * 2); this.ctx.fill();
            } else if (type === 'square') {
                this.ctx.fillRect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.8);
            } else if (type === 'bar') {
                this.ctx.beginPath(); this.ctx.moveTo(0, -size * 0.55); this.ctx.lineTo(0, size * 0.55); this.ctx.stroke();
            }
            this.ctx.restore();
        };
        drawCap(el.startCap || 'none', rendered[0], rendered[1]);
        drawCap(el.endCap || (el.arrowEnd ? 'arrow' : 'none'), rendered[rendered.length - 1], rendered[rendered.length - 2]);
        this.ctx.restore();

        const xs = rendered.map(point => point.x), ys = rendered.map(point => point.y);
        const pad = Math.max(10, width * 2 + 8);
        el._bbox = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(12, Math.max(...xs) - Math.min(...xs) + pad * 2), h: Math.max(12, Math.max(...ys) - Math.min(...ys) + pad * 2) };
        el._lineRenderPoints = rendered;
        el._lineCenter = center;
    },

    getWrappedLines: function (text, font, size, width, letterSpacing = 0) {
        if (!this.ctx) return [text];
        this.ctx.save();
        this.ctx.font = font;

        const paragraphs = text.split('\n');
        const lines = [];

        paragraphs.forEach(p => {
            if (p === '') {
                lines.push('');
                return;
            }

            const chars = p.split('');
            let currentLine = '';
            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];
                const testLine = currentLine + char;
                const testWidth = this.ctx.measureText(testLine).width + (testLine.length * letterSpacing);

                if (testWidth > width && currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }
            if (currentLine !== '') {
                lines.push(currentLine);
            }
        });

        this.ctx.restore();
        return lines;
    },

    drawText: function (el) {
        const fontFamily = el.font || 'Pretendard';
        this.ctx.save();

        this.ctx.translate(el.x, el.y);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        if (el.scaleX) this.ctx.scale(el.scaleX, 1);

        const fontStr = `${el.italic ? 'italic ' : ''}${el.bold ? 'bold ' : ''}${el.size}px ${fontFamily}`;
        this.ctx.font = fontStr;
        // `el.x` is the left / centre / right anchor according to alignment.
        // Keep the canvas alignment and the selection-box coordinate system in
        // sync; applying the box offset to a centred fillText draws it outside
        // of its own selection box.
        this.ctx.textAlign = el.align === 'justify' ? 'left' : (el.align || 'left');
        this.ctx.textBaseline = 'top';

        const boxWidth = el.w || 300;
        const letterSpacing = el.spacing || 0;
        const lineHeight = el.size * (el.lineHeight || 1.3);

        const lines = this.getWrappedLines(el.text || '텍스트를 입력하세요', fontStr, el.size, boxWidth, letterSpacing);
        let totalHeight = lines.length * lineHeight;

        let startX = 0;
        if (el.align === 'center') startX = -boxWidth / 2;
        if (el.align === 'right') startX = -boxWidth;

        // Background highlight
        if (el.useBg) {
            this.ctx.fillStyle = el.bgColor || '#ffffff';
            this.ctx.fillRect(startX - 6, -6, boxWidth + 12, totalHeight + 12);
        }

        // Shadow settings
        if (el.useShadow) {
            this.ctx.shadowColor = this.getShadowColor(el);
            this.ctx.shadowBlur = el.shadowBlur || 4;
            this.ctx.shadowOffsetX = el.shadowOffsetX || 3;
            this.ctx.shadowOffsetY = el.shadowOffsetY || 3;
        } else {
            this.ctx.shadowColor = 'transparent';
        }

        const textAnchorX = (el.align === 'center' || el.align === 'right') ? 0 : startX;
        const drawTextLine = (text, x, y, isStroke, strokeWidth, strokeColor) => {
            if (isStroke) {
                this.ctx.lineWidth = strokeWidth;
                this.ctx.strokeStyle = strokeColor;
                this.ctx.lineJoin = 'round';
            } else {
                this.ctx.fillStyle = el.color || '#000000';
            }

            if (letterSpacing === 0 && el.align !== 'justify') {
                if (isStroke) this.ctx.strokeText(text, x, y); else this.ctx.fillText(text, x, y);
            } else {
                const chars = text.split('');
                // Per-character rendering must start at the visual left edge,
                // regardless of the element's alignment anchor.
                let currentX = startX;
                let spaceToAdd = letterSpacing;
                if (el.align === 'justify' && chars.length > 1) {
                    const rawW = this.ctx.measureText(text).width;
                    spaceToAdd = (boxWidth - rawW) / (chars.length - 1);
                }
                this.ctx.save();
                this.ctx.textAlign = 'left';
                chars.forEach(char => {
                    if (isStroke) this.ctx.strokeText(char, currentX, y); else this.ctx.fillText(char, currentX, y);
                    currentX += this.ctx.measureText(char).width + spaceToAdd;
                });
                this.ctx.restore();
            }
        };

        lines.forEach((line, idx) => {
            let py = idx * lineHeight;
            if (el.useDoubleOutline) drawTextLine(line, textAnchorX, py, true, el.doubleWidth || 7, el.doubleColor || '#ffffff');
            if (el.useOutline) drawTextLine(line, textAnchorX, py, true, el.outlineWidth || 3, el.outlineColor || '#000000');
            drawTextLine(line, textAnchorX, py, false);

            if (el.underline) {
                this.ctx.save();
                this.ctx.beginPath();
                this.ctx.moveTo(startX, py + el.size + 2);
                this.ctx.lineTo(startX + boxWidth, py + el.size + 2);
                this.ctx.lineWidth = Math.max(1, el.size * 0.06);
                this.ctx.strokeStyle = el.color || '#000';
                this.ctx.stroke();
                this.ctx.restore();
            }
        });

        this.ctx.restore();

        el.w = boxWidth;
        el.h = totalHeight;
        // The text is rotated around its anchor (el.x / el.y). Calculate the
        // enclosing screen-space rectangle from all four transformed corners.
        // This keeps the visible part of a rotated or edge-overlapping text
        // selectable instead of testing only its unrotated original rectangle.
        const textScaleX = el.scaleX || 1;
        const textRadians = (Number(el.rot) || 0) * Math.PI / 180;
        const localLeft = startX * textScaleX;
        const localRight = (startX + boxWidth) * textScaleX;
        const transformCorner = (localX, localY) => ({
            x: el.x + localX * Math.cos(textRadians) - localY * Math.sin(textRadians),
            y: el.y + localX * Math.sin(textRadians) + localY * Math.cos(textRadians)
        });
        const textCorners = [
            transformCorner(localLeft, 0), transformCorner(localRight, 0),
            transformCorner(localRight, totalHeight), transformCorner(localLeft, totalHeight)
        ];
        const textXs = textCorners.map(point => point.x);
        const textYs = textCorners.map(point => point.y);
        el._bbox = {
            x: Math.min(...textXs), y: Math.min(...textYs),
            w: Math.max(1, Math.max(...textXs) - Math.min(...textXs)),
            h: Math.max(1, Math.max(...textYs) - Math.min(...textYs))
        };
        el._hitPolygon = textCorners;
    },

    drawImage: function (el) {
        if (!el.img && el.imgSrc) {
            el.img = new Image();
            el.img.onload = () => this.draw();
            el.img.src = el.imgSrc;
        }

        if (el.img && el.img.complete) {
            this.ctx.save();
            const imageFilter = el.filter || [
                `brightness(${Number(el.imageBrightness ?? 100)}%)`,
                `contrast(${Number(el.imageContrast ?? 100)}%)`,
                `saturate(${Number(el.imageSaturation ?? 100)}%)`,
                `blur(${Number(el.imageBlur ?? 0)}px)`,
                `hue-rotate(${Number(el.imageHue ?? 0)}deg)`,
                `grayscale(${el.imageGrayscale ? 100 : 0}%)`,
                `invert(${el.imageInvert ? 100 : 0}%)`
            ].join(' ');
            this.ctx.filter = imageFilter;

            this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
            if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
            if (el.flipX || el.flipY) this.ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);

            // Image crop is an in-frame zoom/pan.  The bounding box never
            // changes, so it remains predictable with resize and rotation.
            const cropScale = Math.max(1, Number(el.cropScale ?? 1));
            const cropOffsetX = (Number(el.cropOffsetX) || 0) * el.w / 100;
            const cropOffsetY = (Number(el.cropOffsetY) || 0) * el.h / 100;
            if (el.imageBackgroundColor) {
                this.ctx.fillStyle = el.imageBackgroundColor;
                this.ctx.fillRect(-el.w / 2, -el.h / 2, el.w, el.h);
            }
            this.ctx.beginPath();
            this.ctx.rect(-el.w / 2, -el.h / 2, el.w, el.h);
            this.ctx.clip();
            this.ctx.drawImage(el.img, -el.w * cropScale / 2 + cropOffsetX, -el.h * cropScale / 2 + cropOffsetY, el.w * cropScale, el.h * cropScale);
            if (Number(el.imageTintOpacity) > 0) {
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'source-atop';
                this.ctx.globalAlpha = Math.min(1, Number(el.imageTintOpacity) / 100);
                this.ctx.fillStyle = el.imageTintColor || '#2563eb';
                this.ctx.fillRect(-el.w / 2, -el.h / 2, el.w, el.h);
                this.ctx.restore();
            }
            if (Number(el.imageBorderWidth) > 0) {
                this.ctx.filter = 'none';
                this.ctx.strokeStyle = el.imageBorderColor || '#000000';
                this.ctx.lineWidth = Number(el.imageBorderWidth);
                this.ctx.strokeRect(-el.w / 2 + this.ctx.lineWidth / 2, -el.h / 2 + this.ctx.lineWidth / 2, el.w - this.ctx.lineWidth, el.h - this.ctx.lineWidth);
            }
            this.ctx.restore();
        } else {
            this.ctx.save();
            this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
            if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
            this.ctx.translate(-(el.x + el.w / 2), -(el.y + el.h / 2));
            this.ctx.fillStyle = '#f1f5f9';
            this.ctx.fillRect(el.x, el.y, el.w, el.h);
            this.ctx.strokeStyle = '#cbd5e1';
            this.ctx.lineWidth = 1;
            this.ctx.strokeRect(el.x, el.y, el.w, el.h);

            this.ctx.fillStyle = '#94a3b8';
            this.ctx.font = '12px Pretendard';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText("이미지 불러오는 중...", el.x + el.w / 2, el.y + el.h / 2);
            this.ctx.restore();
        }
        el._bbox = this.getRotatedBounds(el);
    },

    getTableMetrics: function (el) {
        const rows = el.rows || 3;
        const cols = el.cols || 3;
        const normalize = (values, count, total) => {
            const fallback = total / count;
            const result = Array.from({ length: count }, (_, index) => Math.max(24, Number(values?.[index]) || fallback));
            const sum = result.reduce((value, size) => value + size, 0);
            return result.map(size => (size / sum) * total);
        };
        el.colWidths = normalize(el.colWidths, cols, el.w);
        el.rowHeights = normalize(el.rowHeights, rows, el.h);
        return { rows, cols, colWidths: el.colWidths, rowHeights: el.rowHeights };
    },

    drawTable: function (el) {
        const { rows: rowCount, cols: colCount, colWidths, rowHeights } = this.getTableMetrics(el);

        this.ctx.save();
        this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        this.ctx.translate(-(el.x + el.w / 2), -(el.y + el.h / 2));
        const selection = AppState.tableSelection?.id === el._id ? AppState.tableSelection : null;
        let selectionRect = null;
        if (selection) {
            const minRow = Math.min(selection.anchor.r, selection.focus.r);
            const maxRow = Math.max(selection.anchor.r, selection.focus.r);
            const minCol = Math.min(selection.anchor.c, selection.focus.c);
            const maxCol = Math.max(selection.anchor.c, selection.focus.c);
            selectionRect = {
                x: el.x + colWidths.slice(0, minCol).reduce((sum, width) => sum + width, 0),
                y: el.y + rowHeights.slice(0, minRow).reduce((sum, height) => sum + height, 0),
                w: colWidths.slice(minCol, maxCol + 1).reduce((sum, width) => sum + width, 0),
                h: rowHeights.slice(minRow, maxRow + 1).reduce((sum, height) => sum + height, 0),
                count: (maxRow - minRow + 1) * (maxCol - minCol + 1)
            };
        }
        let cellY = el.y;
        for (let r = 0; r < rowCount; r++) {
            let cellX = el.x;
            for (let c = 0; c < colCount; c++) {
                const cellW = colWidths[c];
                const cellH = rowHeights[r];

                const cell = (el.cells && el.cells[r] && el.cells[r][c]) ? el.cells[r][c] : { text: '' };

                this.ctx.fillStyle = cell.bgColor || '#ffffff';
                this.ctx.fillRect(cellX, cellY, cellW, cellH);

                const selectionMatches = selection
                    && r >= Math.min(selection.anchor.r, selection.focus.r) && r <= Math.max(selection.anchor.r, selection.focus.r)
                    && c >= Math.min(selection.anchor.c, selection.focus.c) && c <= Math.max(selection.anchor.c, selection.focus.c);
                if (selectionMatches) {
                    this.ctx.fillStyle = 'rgba(37, 99, 235, 0.18)';
                    this.ctx.fillRect(cellX, cellY, cellW, cellH);
                }

                // A cell may override the table's default border.  This lets a
                // dragged cell range receive its own inner/outer border style.
                const borderColor = cell.borderColor || el.borderColor || '#cbd5e1';
                const borderWidth = Math.max(0.5, Number(cell.borderWidth ?? el.borderWidth) || 1);
                const borderStyle = cell.borderStyle || el.borderStyle || 'solid';
                const dashLength = Math.max(1, Number(cell.dashLength ?? el.dashLength) || 8);
                const dashGap = Math.max(1, Number(cell.dashGap ?? el.dashGap) || 5);
                this.ctx.strokeStyle = borderColor;
                this.ctx.lineWidth = borderWidth;
                if (borderStyle === 'dashed') this.ctx.setLineDash([dashLength, dashGap]);
                else if (borderStyle === 'dotted') this.ctx.setLineDash([Math.max(1, Math.min(dashLength, this.ctx.lineWidth)), dashGap]);
                else this.ctx.setLineDash([]);
                this.ctx.strokeRect(cellX, cellY, cellW, cellH);
                this.ctx.setLineDash([]);

                if (selectionMatches || (AppState.editingCell && AppState.editingCell.id === el._id && AppState.editingCell.r === r && AppState.editingCell.c === c)) {
                    this.ctx.strokeStyle = '#2563eb';
                    this.ctx.lineWidth = 2.5;
                    this.ctx.strokeRect(cellX + 1, cellY + 1, cellW - 2, cellH - 2);
                }

                if (cell.text) {
                    this.ctx.save();
                    this.ctx.beginPath();
                    this.ctx.rect(cellX + 4, cellY + 4, cellW - 8, cellH - 8);
                    this.ctx.clip();

                    this.ctx.fillStyle = cell.color || '#1e293b';
                    this.ctx.font = `${cell.bold ? 'bold ' : ''}${cell.italic ? 'italic ' : ''}${cell.size || 14}px ${cell.font || 'Pretendard'}`;
                    this.ctx.textAlign = cell.align || 'center';
                    this.ctx.textBaseline = 'middle';

                    let tx = cellX + cellW / 2;
                    if (cell.align === 'left') tx = cellX + 8;
                    if (cell.align === 'right') tx = cellX + cellW - 8;

                    this.ctx.fillText(cell.text, tx, cellY + cellH / 2);
                    if (cell.underline) {
                        const textWidth = this.ctx.measureText(cell.text).width;
                        const lineStart = cell.align === 'left' ? tx : cell.align === 'right' ? tx - textWidth : tx - textWidth / 2;
                        this.ctx.beginPath(); this.ctx.moveTo(lineStart, cellY + cellH / 2 + (cell.size || 14) * 0.62); this.ctx.lineTo(lineStart + textWidth, cellY + cellH / 2 + (cell.size || 14) * 0.62); this.ctx.lineWidth = Math.max(1, (cell.size || 14) * 0.06); this.ctx.strokeStyle = cell.color || '#1e293b'; this.ctx.stroke();
                    }
                    this.ctx.restore();
                }
                cellX += cellW;
            }
            cellY += rowHeights[r];
        }
        if (selectionRect) {
            this.ctx.save();
            this.ctx.setLineDash([]);
            this.ctx.strokeStyle = '#2563eb';
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(selectionRect.x + 1.5, selectionRect.y + 1.5, Math.max(0, selectionRect.w - 3), Math.max(0, selectionRect.h - 3));
            this.ctx.fillStyle = '#2563eb';
            this.ctx.fillRect(selectionRect.x - 3, selectionRect.y - 3, 7, 7);
            this.ctx.fillRect(selectionRect.x + selectionRect.w - 4, selectionRect.y + selectionRect.h - 4, 7, 7);
            this.ctx.fillStyle = 'rgba(30, 64, 175, 0.96)';
            this.ctx.fillRect(selectionRect.x + 5, selectionRect.y + 5, 42, 17);
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = 'bold 10px Pretendard, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.fillText(`${selectionRect.count}셀`, selectionRect.x + 26, selectionRect.y + 13.5);
            this.ctx.restore();
        }
        this.ctx.restore();
        el._bbox = this.getRotatedBounds(el);
    },

    drawChart: function (el) {
        this.ctx.save();
        this.ctx.translate(el.x + el.w / 2, el.y + el.h / 2);
        if (el.rot) this.ctx.rotate(el.rot * Math.PI / 180);
        this.ctx.translate(-(el.x + el.w / 2), -(el.y + el.h / 2));
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.98)';
        this.ctx.fillRect(el.x, el.y, el.w, el.h);
        this.ctx.strokeStyle = '#e2e8f0';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(el.x, el.y, el.w, el.h);

        const labels = el.labels || ['데이터A', '데이터B', '데이터C', '데이터D'];
        const data = el.data || [40, 75, 50, 90];
        const colors = el.colors || ['#3b82f6', '#10b981', '#ef4444', '#f59e0b', '#8b5cf6'];

        const margin = 45;
        const chartW = el.w - margin * 2;
        const chartH = el.h - margin * 2;
        const maxVal = Math.max(...data, 10);

        if (el.chartType === 'bar') {
            this.ctx.strokeStyle = '#64748b';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(el.x + margin, el.y + margin);
            this.ctx.lineTo(el.x + margin, el.y + el.h - margin);
            this.ctx.lineTo(el.x + el.w - margin, el.y + el.h - margin);
            this.ctx.stroke();

            const barCount = data.length;
            const groupW = chartW / barCount;
            const barW = groupW * 0.6;
            const spacing = groupW * 0.4;

            for (let i = 0; i < barCount; i++) {
                const h = (data[i] / maxVal) * chartH;
                const bx = el.x + margin + i * groupW + spacing / 2;
                const by = el.y + el.h - margin - h;

                this.ctx.fillStyle = colors[i % colors.length];
                this.ctx.fillRect(bx, by, barW, h);

                this.ctx.fillStyle = '#475569';
                this.ctx.font = '11px Pretendard';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(labels[i], bx + barW / 2, el.y + el.h - margin + 6);
                
                this.ctx.textBaseline = 'bottom';
                this.ctx.fillText(data[i], bx + barW / 2, by - 4);
            }
        } else if (el.chartType === 'line') {
            this.ctx.strokeStyle = '#64748b';
            this.ctx.lineWidth = 1.5;
            this.ctx.beginPath();
            this.ctx.moveTo(el.x + margin, el.y + margin);
            this.ctx.lineTo(el.x + margin, el.y + el.h - margin);
            this.ctx.lineTo(el.x + el.w - margin, el.y + el.h - margin);
            this.ctx.stroke();

            const stepX = chartW / (data.length - 1 || 1);
            this.ctx.strokeStyle = colors[0];
            this.ctx.lineWidth = 2.5;
            this.ctx.beginPath();
            
            for (let i = 0; i < data.length; i++) {
                const px = el.x + margin + i * stepX;
                const py = el.y + el.h - margin - (data[i] / maxVal) * chartH;
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
            this.ctx.stroke();

            for (let i = 0; i < data.length; i++) {
                const px = el.x + margin + i * stepX;
                const py = el.y + el.h - margin - (data[i] / maxVal) * chartH;

                this.ctx.fillStyle = colors[0];
                this.ctx.beginPath();
                this.ctx.arc(px, py, 4, 0, 2 * Math.PI);
                this.ctx.fill();

                this.ctx.fillStyle = '#475569';
                this.ctx.font = '11px Pretendard';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'top';
                this.ctx.fillText(labels[i], px, el.y + el.h - margin + 6);

                this.ctx.textBaseline = 'bottom';
                this.ctx.fillText(data[i], px, py - 6);
            }
        } else if (el.chartType === 'pie' || el.chartType === 'donut') {
            const total = data.reduce((a, b) => a + b, 0) || 1;
            const cx = el.x + el.w / 2;
            const cy = el.y + el.h / 2;
            const radius = Math.min(chartW, chartH) / 2;

            let startAngle = -Math.PI / 2;
            for (let i = 0; i < data.length; i++) {
                const sliceAngle = (data[i] / total) * 2 * Math.PI;
                const endAngle = startAngle + sliceAngle;

                this.ctx.fillStyle = colors[i % colors.length];
                this.ctx.beginPath();
                this.ctx.moveTo(cx, cy);
                this.ctx.arc(cx, cy, radius, startAngle, endAngle);
                this.ctx.closePath();
                this.ctx.fill();

                const textAngle = startAngle + sliceAngle / 2;
                const tx = cx + Math.cos(textAngle) * (radius * 0.65);
                const ty = cy + Math.sin(textAngle) * (radius * 0.65);

                const pct = Math.round(data[i] / total * 100);
                if (pct > 5) {
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.font = 'bold 10px Pretendard';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText(`${labels[i]}\n(${pct}%)`, tx, ty);
                }
                startAngle = endAngle;
            }

            if (el.chartType === 'donut') {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, radius * 0.5, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }
        this.ctx.restore();
        el._bbox = this.getRotatedBounds(el);
    },

    drawSnapGuides: function () {
        this.ctx.save();
        this.ctx.strokeStyle = '#ec4899';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);

        const page = AppState.getPage();

        this.snapGuides.forEach(guide => {
            this.ctx.beginPath();
            if (guide.type === 'v') {
                this.ctx.moveTo(guide.val, 0);
                this.ctx.lineTo(guide.val, page.h);
            } else {
                this.ctx.moveTo(0, guide.val);
                this.ctx.lineTo(page.w, guide.val);
            }
            this.ctx.stroke();
        });
        this.ctx.restore();
    },

    drawSelectionControls: function () {
        const els = AppState.getEls();
        if (AppState.selectedIds.length === 0) return;

        const zoom = AppState.zoom || 1;
        const offset = 4 / zoom;
        const thick = 1.5 / zoom;

        this.ctx.save();
        this.ctx.strokeStyle = '#2563eb';
        this.ctx.lineWidth = thick;

        if (AppState.selectedIds.length === 1) {
            const el = els[AppState.selectedIds[0]];
            if (!el || !el._bbox) { this.ctx.restore(); return; }

            this.ctx.strokeRect(el._bbox.x - offset, el._bbox.y - offset, el._bbox.w + offset * 2, el._bbox.h + offset * 2);

            if (el.type === 'line' && Array.isArray(el.points)) {
                this.ctx.save();
                el.points.forEach((point, index) => {
                    const renderPoint = el._lineRenderPoints?.[index] || { x: el.x + point.x, y: el.y + point.y };
                    this.ctx.beginPath();
                    this.ctx.fillStyle = index === 0 || index === el.points.length - 1 ? '#ffffff' : '#bfdbfe';
                    this.ctx.arc(renderPoint.x, renderPoint.y, 6 / zoom, 0, Math.PI * 2);
                    this.ctx.fill(); this.ctx.stroke();
                });
                this.ctx.restore();
            }

            // Draw active scaling dots
            this.ctx.fillStyle = '#ffffff';
            this.ctx.strokeStyle = '#2563eb';
            this.ctx.lineWidth = 2 / zoom;
            const handleSize = 7 / zoom;

            const handles = [
                { x: el._bbox.x - offset, y: el._bbox.y - offset, cursor: 'nwse-resize' }, // TL
                { x: el._bbox.x + el._bbox.w / 2, y: el._bbox.y - offset, cursor: 'ns-resize' }, // TC
                { x: el._bbox.x + el._bbox.w + offset, y: el._bbox.y - offset, cursor: 'nesw-resize' }, // TR
                { x: el._bbox.x + el._bbox.w + offset, y: el._bbox.y + el._bbox.h / 2, cursor: 'ew-resize' }, // RC
                { x: el._bbox.x + el._bbox.w + offset, y: el._bbox.y + el._bbox.h + offset, cursor: 'nwse-resize' }, // BR
                { x: el._bbox.x + el._bbox.w / 2, y: el._bbox.y + el._bbox.h + offset, cursor: 'ns-resize' }, // BC
                { x: el._bbox.x - offset, y: el._bbox.y + el._bbox.h + offset, cursor: 'nesw-resize' }, // BL
                { x: el._bbox.x - offset, y: el._bbox.y + el._bbox.h / 2, cursor: 'ew-resize' }  // LC
            ];

            handles.forEach(h => {
                this.ctx.beginPath();
                this.ctx.rect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
                this.ctx.fill();
                this.ctx.stroke();
            });

            // Rotation indicator
            const rx = el._bbox.x + el._bbox.w / 2;
            const ry = el._bbox.y - (20 / zoom);
            this.ctx.beginPath();
            this.ctx.moveTo(rx, el._bbox.y - offset);
            this.ctx.lineTo(rx, ry);
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(rx, ry, 5 / zoom, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();
        } else {
            // Draw combined selection box for multi selection
            let minX = Infinity, minY = Infinity;
            let maxX = -Infinity, maxY = -Infinity;

            AppState.selectedIds.forEach(id => {
                const el = els[id];
                if (el && el._bbox) {
                    minX = Math.min(minX, el._bbox.x);
                    minY = Math.min(minY, el._bbox.y);
                    maxX = Math.max(maxX, el._bbox.x + el._bbox.w);
                    maxY = Math.max(maxY, el._bbox.y + el._bbox.h);
                }
            });

            if (minX !== Infinity) {
                this.ctx.save();
                this.ctx.strokeStyle = '#2563eb';
                this.ctx.lineWidth = thick;
                this.ctx.setLineDash([4 / zoom, 4 / zoom]);
                this.ctx.strokeRect(minX - offset, minY - offset, (maxX - minX) + offset * 2, (maxY - minY) + offset * 2);
                this.ctx.restore();
            }
        }

        this.ctx.restore();
    }
};
