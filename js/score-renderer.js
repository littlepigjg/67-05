// ============ 歌词同步引擎 - 乐谱渲染和歌词高亮 ============

const PITCH_ORDER = ['C5', 'B4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'];

class ScoreRenderer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.canvas = null;
        this.ctx = null;
        this.layers = {
            background: null,
            staff: null,
            notes: null,
            lyrics: null,
            highlight: null,
            overlay: null
        };
        this.dpr = window.devicePixelRatio || 1;
        this.lyricsCanvas = null;
        this.lyricsCtx = null;
        this.init();
    }

    init() {
        if (!this.container) return;
        this.container.innerHTML = '';
        const scrollContainer = document.createElement('div');
        scrollContainer.id = 'score-scroll-container';
        scrollContainer.className = 'score-scroll-container';
        const innerWrap = document.createElement('div');
        innerWrap.style.position = 'relative';
        innerWrap.style.width = '100%';
        innerWrap.style.height = '100%';
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'score-canvas';
        this.canvas.style.position = 'absolute';
        this.canvas.style.top = '0';
        this.canvas.style.left = '0';
        this.lyricsCanvas = document.createElement('canvas');
        this.lyricsCanvas.id = 'lyrics-canvas';
        this.lyricsCanvas.style.position = 'absolute';
        this.lyricsCanvas.style.top = '0';
        this.lyricsCanvas.style.left = '0';
        this.lyricsCanvas.style.pointerEvents = 'none';
        innerWrap.appendChild(this.canvas);
        innerWrap.appendChild(this.lyricsCanvas);
        scrollContainer.appendChild(innerWrap);
        this.container.appendChild(scrollContainer);
        this.ctx = this.canvas.getContext('2d');
        this.lyricsCtx = this.lyricsCanvas.getContext('2d');
        this.setupDPR();
        this.bindScrollEvents();
        this.bindDropEvents();
        this.bindInteractionEvents();
        syncEngine.onScrollChange(() => this.render());
    }

    setupDPR() {
        if (!this.container) return;
        const rect = this.container.getBoundingClientRect();
        const cssWidth = rect.width;
        const cssHeight = rect.height;
        ScoreState.viewport = { width: cssWidth, height: cssHeight };
        [
            { canvas: this.canvas, ctx: this.ctx },
            { canvas: this.lyricsCanvas, ctx: this.lyricsCtx }
        ].forEach(({ canvas, ctx }) => {
            if (!canvas) return;
            canvas.width = cssWidth * this.dpr;
            canvas.height = cssHeight * this.dpr;
            canvas.style.width = cssWidth + 'px';
            canvas.style.height = cssHeight + 'px';
            ctx.scale(this.dpr, this.dpr);
        });
    }

    bindScrollEvents() {
        const sc = document.getElementById('score-scroll-container');
        if (!sc) return;
        sc.addEventListener('scroll', () => {
            syncEngine.setScrollOffset(sc.scrollLeft, sc.scrollTop);
        });
    }

    bindDropEvents() {
        if (!this.canvas) return;
        this.canvas.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'link';
        });
        this.canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            const pos = this.getCanvasPosition(e);
            const note = this.findNoteAtPosition(pos.x, pos.y);
            if (note && lyricsEditorInstance && lyricsEditorInstance.dragSource) {
                const lyricId = lyricsEditorInstance.dragSource.id;
                ScoreState.mapper.mapLyricToNote(lyricId, note.id);
                ScoreState.mapper.recalculateLyricTimestamps();
                calculateTotalDuration();
                if (lyricsEditorInstance) lyricsEditorInstance.renderLines();
                this.render();
            }
        });
    }

    bindInteractionEvents() {
        if (!this.canvas) return;
        this.canvas.addEventListener('click', (e) => {
            const pos = this.getCanvasPosition(e);
            const note = this.findNoteAtPosition(pos.x, pos.y);
            if (note) {
                syncEngine.seekToNote(note.id);
                if (lyricsEditorInstance) {
                    lyricsEditorInstance.selectLyricByNote(note.id);
                }
            }
        });
    }

    getCanvasPosition(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: e.clientX - rect.left + ScoreState.scrollOffset.x,
            y: e.clientY - rect.top + ScoreState.scrollOffset.y
        };
    }

    findNoteAtPosition(x, y) {
        const config = ScoreState.config;
        const tolerance = 30;
        const notes = ScoreState.mapper.getAllNotesSorted();
        for (const note of notes) {
            const pos = this.calculateNotePosition(note);
            note.position = pos;
            const dx = x - pos.x;
            const dy = y - pos.y;
            if (Math.abs(dx) < tolerance && Math.abs(dy) < tolerance) {
                return note;
            }
        }
        return null;
    }

    calculateNotePosition(note) {
        const config = ScoreState.config;
        const pixelsPerBeat = config.pixelsPerBeat;
        const beatsPerMeasure = config.beatsPerMeasure;
        const measureWidth = beatsPerMeasure * pixelsPerBeat;
        const staffTop = config.staffTop;
        const lineSpacing = config.staffLineSpacing;
        const pitchIndex = PITCH_ORDER.indexOf(note.pitch);
        const totalBeat = note.getAbsoluteBeat(beatsPerMeasure);
        const x = 50 + totalBeat * pixelsPerBeat + pixelsPerBeat / 2;
        let y;
        if (note.isRest) {
            y = staffTop + lineSpacing * 3;
        } else if (pitchIndex >= 0) {
            y = staffTop + pitchIndex * lineSpacing / 2;
        } else {
            y = staffTop + lineSpacing * 2;
        }
        return { x, y };
    }

    calculateTotalWidth() {
        const config = ScoreState.config;
        const notes = ScoreState.mapper.getAllNotesSorted();
        if (notes.length === 0) return ScoreState.viewport.width + 100;
        const lastNote = notes[notes.length - 1];
        const lastBeat = lastNote.getAbsoluteBeat(config.beatsPerMeasure) + lastNote.duration + 2;
        return 50 + lastBeat * config.pixelsPerBeat + 100;
    }

    calculateTotalHeight() {
        const mapper = ScoreState.mapper;
        const config = ScoreState.config;
        const linesCount = Math.max(1, mapper.lines.length);
        const staffBlockHeight = 200;
        const perLineHeight = staffBlockHeight + 60;
        return linesCount * perLineHeight + 200;
    }

    assignLinesToRows() {
        const mapper = ScoreState.mapper;
        const config = ScoreState.config;
        const staffBlockHeight = 200;
        const perLineHeight = staffBlockHeight + 60;
        const baseTop = 50;
        mapper.lines.forEach((line, idx) => {
            line.y = baseTop + idx * perLineHeight;
        });
        return perLineHeight;
    }

    getStaffYOffsetForLine(lineIndex) {
        const mapper = ScoreState.mapper;
        const line = mapper.lines[lineIndex];
        if (!line) return 0;
        return line.y;
    }

    render() {
        if (!this.ctx || !this.lyricsCtx) return;
        this.setupDPR();
        const config = ScoreState.config;
        const vw = ScoreState.viewport.width;
        const vh = ScoreState.viewport.height;
        this.ctx.clearRect(0, 0, vw, vh);
        this.lyricsCtx.clearRect(0, 0, vw, vh);
        const perLineHeight = this.assignLinesToRows();
        const totalW = this.calculateTotalWidth();
        const totalH = this.calculateTotalHeight();
        const sc = document.getElementById('score-scroll-container');
        if (sc) {
            sc.scrollWidth;
            const innerWrap = sc.firstChild;
            if (innerWrap) {
                innerWrap.style.width = totalW + 'px';
                innerWrap.style.height = totalH + 'px';
                this.canvas.style.width = totalW + 'px';
                this.canvas.style.height = totalH + 'px';
                this.lyricsCanvas.style.width = totalW + 'px';
                this.lyricsCanvas.style.height = totalH + 'px';
                this.canvas.width = totalW * this.dpr;
                this.canvas.height = totalH * this.dpr;
                this.lyricsCanvas.width = totalW * this.dpr;
                this.lyricsCanvas.height = totalH * this.dpr;
                this.ctx.setTransform(1, 0, 0, 1, 0, 0);
                this.ctx.scale(this.dpr, this.dpr);
                this.lyricsCtx.setTransform(1, 0, 0, 1, 0, 0);
                this.lyricsCtx.scale(this.dpr, this.dpr);
                this.ctx.clearRect(0, 0, totalW, totalH);
                this.lyricsCtx.clearRect(0, 0, totalW, totalH);
            }
        }
        this.renderBackground(totalW, totalH);
        this.renderAllStaves(totalW);
        this.renderNotes(totalH);
        this.renderLyricsLayer(totalH);
        this.renderHighlightLayer(totalH);
        this.renderPlaybackCursor(totalH);
    }

    renderBackground(w, h) {
        this.ctx.fillStyle = '#fafbfc';
        this.ctx.fillRect(0, 0, w, h);
    }

    renderAllStaves(totalW) {
        const mapper = ScoreState.mapper;
        const config = ScoreState.config;
        const lineCount = Math.max(1, mapper.lines.length);
        for (let i = 0; i < lineCount; i++) {
            const yOffset = this.getStaffYOffsetForLine(i);
            this.renderStaff(yOffset, totalW, i);
        }
    }

    renderStaff(yOffset, totalW, lineIndex) {
        const config = ScoreState.config;
        const staffTop = yOffset + config.staffTop;
        const lineSpacing = config.staffLineSpacing;
        const left = 40;
        const right = totalW - 40;
        this.ctx.strokeStyle = '#2c3e50';
        this.ctx.lineWidth = 1;
        for (let i = 0; i < 5; i++) {
            const y = staffTop + i * lineSpacing;
            this.ctx.beginPath();
            this.ctx.moveTo(left, y);
            this.ctx.lineTo(right, y);
            this.ctx.stroke();
        }
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(left, staffTop);
        this.ctx.lineTo(left, staffTop + 4 * lineSpacing);
        this.ctx.stroke();
        this.ctx.fillStyle = '#2c3e50';
        this.ctx.font = '28px serif';
        this.ctx.fillText('𝄞', left - 8, staffTop + lineSpacing * 2.8);
        const beatsPerMeasure = config.beatsPerMeasure;
        const measureWidth = beatsPerMeasure * config.pixelsPerBeat;
        const startMeasure = 0;
        const endMeasure = Math.ceil((totalW - 80) / measureWidth) + 1;
        this.ctx.strokeStyle = config.measureLineColor;
        this.ctx.lineWidth = 1;
        for (let m = startMeasure + 1; m <= endMeasure; m++) {
            const x = 50 + m * measureWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(x, staffTop);
            this.ctx.lineTo(x, staffTop + 4 * lineSpacing);
            this.ctx.stroke();
        }
        this.ctx.fillStyle = '#888';
        this.ctx.font = '12px sans-serif';
        for (let m = startMeasure; m <= endMeasure; m++) {
            const x = 50 + m * measureWidth + 5;
            this.ctx.fillText(String(m + 1), x, staffTop - 10);
        }
    }

    renderNotes(totalHeight) {
        const mapper = ScoreState.mapper;
        const config = ScoreState.config;
        const sortedNotes = mapper.getAllNotesSorted();
        sortedNotes.forEach(note => {
            const pos = this.calculateNotePosition(note);
            note.position = pos;
            const lineIndex = this.findLineIndexForNote(note);
            const yOffset = this.getStaffYOffsetForLine(lineIndex);
            const staffTop = yOffset + config.staffTop;
            const finalPos = { x: pos.x, y: staffTop + (pos.y - config.staffTop) };
            note.position = finalPos;
            const activeNoteIds = syncEngine.getActiveNotes().map(n => n.id);
            const isActive = activeNoteIds.includes(note.id);
            this.renderSingleNote(finalPos, note, isActive);
        });
    }

    findLineIndexForNote(note) {
        const mapper = ScoreState.mapper;
        for (let i = 0; i < mapper.lines.length; i++) {
            const line = mapper.lines[i];
            for (const seg of line.segments) {
                if (seg.noteIds.includes(note.id)) {
                    return i;
                }
            }
        }
        const totalMeasures = mapper.lines.length * 4 || 4;
        return Math.min(mapper.lines.length - 1, Math.floor(note.measure / 4));
    }

    renderSingleNote(pos, note, isActive) {
        const ctx = this.ctx;
        const config = ScoreState.config;
        const lineSpacing = config.staffLineSpacing;
        const noteWidth = 16;
        const noteHeight = lineSpacing * 0.7;
        if (note.isRest) {
            ctx.strokeStyle = isActive ? '#e94560' : '#2c3e50';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(pos.x - 8, pos.y - 6);
            ctx.lineTo(pos.x + 8, pos.y - 6);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(pos.x, pos.y + 5, 5, 0, Math.PI * 2);
            ctx.stroke();
            return;
        }
        ctx.save();
        if (isActive) {
            ctx.shadowColor = '#e94560';
            ctx.shadowBlur = 15;
        }
        ctx.fillStyle = isActive ? '#e94560' : '#2c3e50';
        ctx.strokeStyle = isActive ? '#c73659' : '#1a252f';
        ctx.lineWidth = 1.5;
        if (note.duration >= 4) {
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y, noteWidth, noteHeight, 0, 0, Math.PI * 2);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.ellipse(pos.x, pos.y, noteWidth, noteHeight, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        if (note.duration < 4) {
            ctx.strokeStyle = isActive ? '#e94560' : '#2c3e50';
            ctx.lineWidth = 2;
            const stemX = pos.x + noteWidth;
            const stemTop = pos.y - noteHeight - 25;
            const stemBottom = pos.y - noteHeight * 0.2;
            ctx.beginPath();
            ctx.moveTo(stemX, stemTop);
            ctx.lineTo(stemX, stemBottom);
            ctx.stroke();
            if (note.duration <= 0.5) {
                ctx.lineWidth = 1.5;
                const flagCount = note.duration <= 0.25 ? 2 : 1;
                for (let f = 0; f < flagCount; f++) {
                    ctx.beginPath();
                    ctx.moveTo(stemX, stemTop + f * 8);
                    ctx.quadraticCurveTo(stemX + 12, stemTop + 4 + f * 8, stemX, stemTop + 8 + f * 8);
                    ctx.stroke();
                }
            }
        }
        ctx.restore();
        const staffTopForNote = pos.y - ((PITCH_ORDER.indexOf(note.pitch) * lineSpacing / 2) || 0);
        ctx.strokeStyle = '#2c3e50';
        ctx.lineWidth = 1;
        const pitchIndex = PITCH_ORDER.indexOf(note.pitch);
        if (pitchIndex >= 0) {
            for (let i = -1; i >= pitchIndex - 4 && i >= 0; i -= 2) {
                const ledgerY = pos.y - (pitchIndex - i) * lineSpacing / 2;
                ctx.beginPath();
                ctx.moveTo(pos.x - noteWidth - 3, ledgerY);
                ctx.lineTo(pos.x + noteWidth + 3, ledgerY);
                ctx.stroke();
            }
            for (let i = 9; i <= pitchIndex && i <= 9; i += 2) {
                const ledgerY = pos.y + (i - pitchIndex) * lineSpacing / 2;
                if (ledgerY > staffTopForNote + 4 * lineSpacing) {
                    ctx.beginPath();
                    ctx.moveTo(pos.x - noteWidth - 3, ledgerY);
                    ctx.lineTo(pos.x + noteWidth + 3, ledgerY);
                    ctx.stroke();
                }
            }
        }
    }

    renderLyricsLayer(totalHeight) {
        const mapper = ScoreState.mapper;
        const config = ScoreState.config;
        const ctx = this.lyricsCtx;
        const fontSize = config.lyricsFontSize;
        ctx.font = `${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textBaseline = 'top';
        ctx.textAlign = 'center';
        mapper.lines.forEach((line, lineIdx) => {
            const yOffset = line.y;
            const staffTop = yOffset + config.staffTop;
            const lyricsY = staffTop + 6 * config.staffLineSpacing + 5;
            const segmentGroups = new Map();
            line.segments.forEach(seg => {
                seg.noteIds.forEach(noteId => {
                    if (!segmentGroups.has(noteId)) segmentGroups.set(noteId, []);
                    segmentGroups.get(noteId).push(seg);
                });
            });
            line.segments.forEach(seg => {
                this.renderLyricSegment(seg, yOffset, lyricsY);
            });
        });
    }

    renderLyricSegment(segment, lineYOffset, baseY) {
        const mapper = ScoreState.mapper;
        const config = ScoreState.config;
        const ctx = this.lyricsCtx;
        const fontSize = config.lyricsFontSize;
        const notes = segment.noteIds.map(id => mapper.notes.get(id)).filter(Boolean);
        if (notes.length === 0) return;
        notes.forEach(n => {
            if (!n.position || n.position.y < 1) {
                n.position = this.calculateNotePosition(n);
            }
        });
        const sortedNotes = notes.sort((a, b) => a.getAbsoluteBeat(config.beatsPerMeasure) - b.getAbsoluteBeat(config.beatsPerMeasure));
        const firstNote = sortedNotes[0];
        const lastNote = sortedNotes[sortedNotes.length - 1];
        const noteFirstPos = firstNote.position;
        const noteLastPos = lastNote.position;
        const lineIdx = segment.lineIndex;
        const staffTopForLine = this.getStaffYOffsetForLine(lineIdx) + config.staffTop;
        const firstY = staffTopForLine + (noteFirstPos.y - config.staffTop);
        const lyricsY = staffTopForLine + 6 * config.staffLineSpacing + 5;
        const startX = noteFirstPos.x;
        const endX = noteLastPos.x + 16;
        const centerX = (startX + endX) / 2;
        const isActive = segment.isActive;
        ctx.save();
        if (isActive) {
            ctx.shadowColor = config.highlightColor;
            ctx.shadowBlur = 10;
            ctx.fillStyle = '#ffffff';
            const textMetrics = ctx.measureText(segment.text);
            const padX = 6;
            const padY = 2;
            const bgX = centerX - textMetrics.width / 2 - padX;
            const bgY = lyricsY - padY;
            const bgW = textMetrics.width + padX * 2;
            const bgH = fontSize + padY * 2;
            const radius = 4;
            ctx.fillStyle = config.highlightColor;
            this.roundRect(ctx, bgX, bgY, bgW, bgH, radius);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
        } else {
            ctx.fillStyle = config.lyricsColor;
        }
        ctx.font = `bold ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(segment.text, centerX, lyricsY);
        if (notes.length > 1 && segment.text.length === 1) {
            ctx.strokeStyle = isActive ? config.highlightColor : '#3498db';
            ctx.lineWidth = 2;
            ctx.beginPath();
            const lineY = lyricsY - 6;
            ctx.moveTo(startX - 8, lineY);
            ctx.quadraticCurveTo(centerX, lineY - 12, endX + 8, lineY);
            ctx.stroke();
        }
        ctx.restore();
    }

    renderHighlightLayer(totalHeight) {
        const ctx = this.ctx;
        const mapper = ScoreState.mapper;
        const config = ScoreState.config;
        ScoreState.activeLyricIds.forEach(lyricId => {
            const lyric = mapper.lyrics.get(lyricId);
            if (!lyric) return;
            const notes = lyric.noteIds.map(id => mapper.notes.get(id)).filter(Boolean);
            if (notes.length === 0) return;
            const lineIdx = lyric.lineIndex;
            const staffTop = this.getStaffYOffsetForLine(lineIdx) + config.staffTop;
            const sortedNotes = notes.sort((a, b) => a.getAbsoluteBeat(config.beatsPerMeasure) - b.getAbsoluteBeat(config.beatsPerMeasure));
            const firstPos = sortedNotes[0].position;
            const lastPos = sortedNotes[sortedNotes.length - 1].position;
            const x = firstPos.x - 25;
            const y = staffTop - 15;
            const w = (lastPos.x + 25) - (firstPos.x - 25);
            const h = 7 * config.staffLineSpacing + 50;
            ctx.save();
            ctx.globalAlpha = 0.08;
            ctx.fillStyle = config.highlightColor;
            this.roundRect(ctx, x, y, w, h, 8);
            ctx.fill();
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = config.highlightColor;
            ctx.lineWidth = 2;
            this.roundRect(ctx, x, y, w, h, 8);
            ctx.stroke();
            ctx.restore();
        });
    }

    renderPlaybackCursor(totalHeight) {
        const ctx = this.ctx;
        const config = ScoreState.config;
        const beatDuration = 60 / config.bpm;
        const currentBeat = ScoreState.currentTime / beatDuration;
        const x = 50 + currentBeat * config.pixelsPerBeat + config.pixelsPerBeat / 2;
        const mapper = ScoreState.mapper;
        const lineCount = Math.max(1, mapper.lines.length);
        const perLineHeight = 260;
        for (let i = 0; i < lineCount; i++) {
            const yTop = this.getStaffYOffsetForLine(i) + 20;
            const yBot = this.getStaffYOffsetForLine(i) + 200;
            ctx.save();
            ctx.strokeStyle = '#e94560';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 3]);
            ctx.beginPath();
            ctx.moveTo(x, yTop);
            ctx.lineTo(x, yBot);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = '#e94560';
            ctx.beginPath();
            ctx.moveTo(x - 6, yTop);
            ctx.lineTo(x + 6, yTop);
            ctx.lineTo(x, yTop + 10);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    exportToImage(includeLyrics = true) {
        const mapper = ScoreState.mapper;
        const totalW = this.calculateTotalWidth();
        const totalH = this.calculateTotalHeight();
        const exportCanvas = document.createElement('canvas');
        const dpr = 2;
        exportCanvas.width = totalW * dpr;
        exportCanvas.height = totalH * dpr;
        exportCanvas.style.width = totalW + 'px';
        exportCanvas.style.height = totalH + 'px';
        const eCtx = exportCanvas.getContext('2d');
        eCtx.scale(dpr, dpr);
        const oldCanvas = this.canvas;
        const oldCtx = this.ctx;
        const oldLyricsCanvas = this.lyricsCanvas;
        const oldLyricsCtx = this.lyricsCtx;
        const oldW = oldCanvas.width;
        const oldH = oldCanvas.height;
        this.canvas = exportCanvas;
        this.ctx = eCtx;
        const lyricsLayer = document.createElement('canvas');
        lyricsLayer.width = totalW * dpr;
        lyricsLayer.height = totalH * dpr;
        const lCtx = lyricsLayer.getContext('2d');
        lCtx.scale(dpr, dpr);
        this.lyricsCanvas = lyricsLayer;
        this.lyricsCtx = lCtx;
        this.setupDPR();
        this.renderBackground(totalW, totalH);
        this.renderAllStaves(totalW);
        this.renderNotes(totalH);
        if (includeLyrics) {
            this.renderLyricsLayer(totalH);
            this.renderHighlightLayer(totalH);
        }
        eCtx.drawImage(lyricsLayer, 0, 0);
        this.canvas = oldCanvas;
        this.ctx = oldCtx;
        this.lyricsCanvas = oldLyricsCanvas;
        this.lyricsCtx = oldLyricsCtx;
        return exportCanvas;
    }

    exportAsDataURL(includeLyrics = true, type = 'image/png', quality = 0.95) {
        const canvas = this.exportToImage(includeLyrics);
        return canvas.toDataURL(type, quality);
    }

    exportAsBlob(includeLyrics = true, type = 'image/png', quality = 0.95) {
        return new Promise((resolve) => {
            const canvas = this.exportToImage(includeLyrics);
            canvas.toBlob((blob) => resolve(blob), type, quality);
        });
    }
}

let scoreRendererInstance = null;
let lyricsEditorInstance = null;

function initScoreRenderer(containerId) {
    scoreRendererInstance = new ScoreRenderer(containerId);
    return scoreRendererInstance;
}

function initLyricsEditor(containerId) {
    lyricsEditorInstance = new LyricsEditor(containerId);
    return lyricsEditorInstance;
}

function refreshScoreRendering() {
    if (scoreRendererInstance) {
        scoreRendererInstance.render();
    }
    if (lyricsEditorInstance) {
        lyricsEditorInstance.renderLines();
    }
}

function handleResize() {
    if (scoreRendererInstance) {
        scoreRendererInstance.render();
    }
}

window.addEventListener('resize', () => {
    clearTimeout(window._resizeTimer);
    window._resizeTimer = setTimeout(handleResize, 200);
});
