// ============ 歌词同步引擎 - 歌词编辑器 ============

class LyricsEditor {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.selectedLyricId = null;
        this.selectedNoteIds = [];
        this.isDragging = false;
        this.dragSource = null;
        this.render();
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = `
            <div class="lyrics-editor-header">
                <h3>歌词编辑器</h3>
                <div class="editor-toolbar">
                    <button id="btn-add-line" class="btn btn-sm btn-primary">+ 添加行</button>
                    <button id="btn-add-segment" class="btn btn-sm btn-info">+ 字/段</button>
                    <button id="btn-import-lrc" class="btn btn-sm btn-success">📂 导入LRC</button>
                    <button id="btn-export-lrc" class="btn btn-sm btn-secondary">📤 导出LRC</button>
                    <button id="btn-auto-align" class="btn btn-sm btn-warning">🎯 自动对齐</button>
                </div>
            </div>
            <div class="song-info-inputs">
                <input type="text" id="song-title" placeholder="歌曲标题" value="${ScoreState.songInfo.title}">
                <input type="text" id="song-artist" placeholder="艺术家" value="${ScoreState.songInfo.artist}">
            </div>
            <div class="lyrics-lines" id="lyrics-lines-container"></div>
            <input type="file" id="lrc-file-input" accept=".lrc,.txt" style="display:none">
            <div id="import-text-modal" class="modal hidden">
                <div class="modal-content">
                    <h3>批量导入歌词</h3>
                    <textarea id="lrc-text-input" placeholder="粘贴LRC内容或普通歌词文本" rows="10"></textarea>
                    <div class="modal-buttons">
                        <button id="btn-import-confirm" class="btn btn-primary">确认导入</button>
                        <button id="btn-import-cancel" class="btn btn-danger">取消</button>
                    </div>
                </div>
            </div>
        `;
        this.bindEvents();
        this.renderLines();
    }

    bindEvents() {
        const btnAddLine = document.getElementById('btn-add-line');
        const btnAddSegment = document.getElementById('btn-add-segment');
        const btnImportLRC = document.getElementById('btn-import-lrc');
        const btnExportLRC = document.getElementById('btn-export-lrc');
        const btnAutoAlign = document.getElementById('btn-auto-align');
        const lrcFileInput = document.getElementById('lrc-file-input');
        const songTitle = document.getElementById('song-title');
        const songArtist = document.getElementById('song-artist');

        if (btnAddLine) btnAddLine.addEventListener('click', () => this.addLine());
        if (btnAddSegment) btnAddSegment.addEventListener('click', () => this.addSegmentToSelectedLine());
        if (btnImportLRC) btnImportLRC.addEventListener('click', () => this.showImportModal());
        if (btnExportLRC) btnExportLRC.addEventListener('click', () => this.handleExportLRC());
        if (btnAutoAlign) btnAutoAlign.addEventListener('click', () => this.autoAlign());

        if (lrcFileInput) lrcFileInput.addEventListener('change', (e) => this.handleLRCFileSelected(e));
        if (songTitle) songTitle.addEventListener('input', (e) => {
            ScoreState.songInfo.title = e.target.value;
        });
        if (songArtist) songArtist.addEventListener('input', (e) => {
            ScoreState.songInfo.artist = e.target.value;
        });

        document.getElementById('btn-import-confirm').addEventListener('click', () => {
            this.handleImportText();
        });
        document.getElementById('btn-import-cancel').addEventListener('click', () => {
            document.getElementById('import-text-modal').classList.add('hidden');
        });
    }

    showImportModal() {
        document.getElementById('lrc-text-input').value = '';
        document.getElementById('import-text-modal').classList.remove('hidden');
    }

    handleImportText() {
        const text = document.getElementById('lrc-text-input').value;
        if (!text.trim()) {
            document.getElementById('import-text-modal').classList.add('hidden');
            return;
        }

        const isLRC = /\[\d{1,2}:\d{2}/.test(text);

        if (isLRC) {
            importLRC(text);
        } else {
            this.importPlainText(text);
        }

        document.getElementById('import-text-modal').classList.add('hidden');
        this.renderLines();
        if (typeof refreshScoreRendering === 'function') {
            refreshScoreRendering();
        }
    }

    importPlainText(text) {
        const mapper = ScoreState.mapper;
        const existingLines = [...mapper.lines];
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        const sortedNotes = mapper.getAllNotesSorted();
        let noteCursor = 0;
        let lineIdx = existingLines.length;

        lines.forEach(lineText => {
            const chars = [...lineText.trim()];
            const segments = [];
            chars.forEach(char => {
                if (char === ' ') return;
                const lyric = mapper.createLyricSegment(char);
                if (noteCursor < sortedNotes.length) {
                    mapper.mapLyricToNote(lyric.id, sortedNotes[noteCursor].id);
                    noteCursor++;
                }
                segments.push(lyric);
            });
            if (segments.length > 0) {
                mapper.createLyricLine(segments, lineIdx);
                lineIdx++;
            }
        });

        mapper.recalculateLyricTimestamps(ScoreState.config.bpm, ScoreState.config.beatsPerMeasure);
        calculateTotalDuration();
    }

    handleLRCFileSelected(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = ev.target.result;
            importLRC(text);
            this.renderLines();
            if (typeof refreshScoreRendering === 'function') {
                refreshScoreRendering();
            }
        };
        reader.readAsText(file, 'UTF-8');
        e.target.value = '';
    }

    handleExportLRC() {
        const lrcText = exportLRC();
        const blob = new Blob([lrcText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (ScoreState.songInfo.title || 'lyrics') + '.lrc';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    addLine() {
        const mapper = ScoreState.mapper;
        mapper.createLyricLine([], mapper.lines.length);
        this.renderLines();
    }

    addSegmentToSelectedLine() {
        const mapper = ScoreState.mapper;
        let targetLine = null;
        if (this.selectedLyricId !== null) {
            const lyric = mapper.lyrics.get(this.selectedLyricId);
            if (lyric) {
                targetLine = mapper.lines[lyric.lineIndex];
            }
        }
        if (!targetLine && mapper.lines.length > 0) {
            targetLine = mapper.lines[mapper.lines.length - 1];
        }
        if (!targetLine) {
            targetLine = mapper.createLyricLine([], 0);
        }
        const lyric = mapper.createLyricSegment('新字');
        targetLine.segments.push(lyric);
        lyric.lineIndex = mapper.lines.indexOf(targetLine);
        mapper.recalculateLyricTimestamps();
        calculateTotalDuration();
        this.renderLines();
        if (typeof refreshScoreRendering === 'function') {
            refreshScoreRendering();
        }
    }

    autoAlign() {
        const mapper = ScoreState.mapper;
        const sortedNotes = mapper.getAllNotesSorted();
        const allLyrics = [];
        mapper.lines.forEach(line => {
            line.segments.forEach(seg => allLyrics.push(seg));
        });
        mapper.notes.forEach(note => { note.lyricIds = []; });
        allLyrics.forEach(lyric => { lyric.noteIds = []; });
        const noteCount = sortedNotes.length;
        const lyricCount = allLyrics.length;
        if (lyricCount === 0 || noteCount === 0) return;
        const ratio = noteCount / lyricCount;
        allLyrics.forEach((lyric, idx) => {
            const startNoteIdx = Math.floor(idx * ratio);
            const endNoteIdx = Math.min(noteCount - 1, Math.floor((idx + 1) * ratio) - 1);
            for (let i = startNoteIdx; i <= endNoteIdx; i++) {
                mapper.mapLyricToNote(lyric.id, sortedNotes[i].id);
            }
        });
        mapper.recalculateLyricTimestamps(ScoreState.config.bpm, ScoreState.config.beatsPerMeasure);
        calculateTotalDuration();
        this.renderLines();
        if (typeof refreshScoreRendering === 'function') {
            refreshScoreRendering();
        }
    }

    renderLines() {
        const container = document.getElementById('lyrics-lines-container');
        if (!container) return;
        const mapper = ScoreState.mapper;
        let html = '';
        mapper.lines.forEach((line, lineIdx) => {
            const isActiveLine = lineIdx === ScoreState.activeLineIndex;
            html += `<div class="lyric-line ${isActiveLine ? 'active-line' : ''}" data-line-index="${lineIdx}">
                <div class="line-header">
                    <span class="line-number">第${lineIdx + 1}行</span>
                    <div class="line-tools">
                        <button class="btn-tiny" data-action="delete-line" data-line="${lineIdx}" title="删除行">✕</button>
                    </div>
                </div>
                <div class="line-segments">`;
            line.segments.forEach((seg, segIdx) => {
                const isSelected = seg.id === this.selectedLyricId;
                const isActive = ScoreState.activeLyricIds.includes(seg.id);
                const noteCount = seg.noteIds.length;
                const startTimeStr = seg.startTime !== null ? this.formatTime(seg.startTime) : '--:--';
                html += `<div class="lyric-segment ${isSelected ? 'selected' : ''} ${isActive ? 'highlight' : ''}"
                    data-lyric-id="${seg.id}"
                    draggable="true"
                    title="关联音符: ${noteCount} | 开始: ${startTimeStr}">
                    <input type="text" class="segment-text" value="${this.escapeHtml(seg.text)}"
                        data-lyric-id="${seg.id}" maxlength="10">
                    <span class="segment-note-count">♪${noteCount}</span>
                </div>`;
            });
            html += `</div>
                <div class="line-timeline">
                    <span class="time-label">${this.formatTime(line.getStartTime())} - ${this.formatTime(line.getEndTime())}</span>
                </div>
            </div>`;
        });
        container.innerHTML = html;
        this.bindLineEvents();
    }

    bindLineEvents() {
        const container = document.getElementById('lyrics-lines-container');
        if (!container) return;
        container.querySelectorAll('.segment-text').forEach(input => {
            input.addEventListener('change', (e) => {
                const lyricId = e.target.dataset.lyricId;
                const lyric = ScoreState.mapper.lyrics.get(lyricId);
                if (lyric) {
                    lyric.text = e.target.value;
                    if (typeof refreshScoreRendering === 'function') {
                        refreshScoreRendering();
                    }
                }
            });
            input.addEventListener('focus', (e) => {
                const lyricId = e.target.dataset.lyricId;
                this.selectedLyricId = lyricId;
                this.renderLines();
            });
        });
        container.querySelectorAll('[data-action="delete-line"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const lineIdx = parseInt(btn.dataset.line, 10);
                this.deleteLine(lineIdx);
            });
        });
        container.querySelectorAll('.lyric-segment').forEach(seg => {
            seg.addEventListener('click', (e) => {
                if (e.target.classList.contains('segment-text')) return;
                const lyricId = seg.dataset.lyricId;
                this.selectedLyricId = lyricId;
                syncEngine.seekToLyric(lyricId);
                this.renderLines();
            });
            seg.addEventListener('dragstart', (e) => {
                this.isDragging = true;
                this.dragSource = { type: 'lyric', id: seg.dataset.lyricId };
                e.dataTransfer.effectAllowed = 'link';
            });
            seg.addEventListener('dragend', () => {
                this.isDragging = false;
                this.dragSource = null;
            });
        });
    }

    deleteLine(lineIdx) {
        const mapper = ScoreState.mapper;
        if (lineIdx < 0 || lineIdx >= mapper.lines.length) return;
        const line = mapper.lines[lineIdx];
        line.segments.forEach(seg => {
            seg.noteIds.forEach(noteId => {
                const note = mapper.notes.get(noteId);
                if (note) {
                    note.lyricIds = note.lyricIds.filter(id => id !== seg.id);
                }
            });
            mapper.lyrics.delete(seg.id);
        });
        mapper.lines.splice(lineIdx, 1);
        mapper.lines.forEach((l, idx) => {
            l.segments.forEach(seg => { seg.lineIndex = idx; });
        });
        mapper.recalculateLyricTimestamps();
        calculateTotalDuration();
        this.renderLines();
        if (typeof refreshScoreRendering === 'function') {
            refreshScoreRendering();
        }
    }

    formatTime(seconds) {
        if (seconds === null || seconds === undefined || isNaN(seconds)) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    getSelectedLyric() {
        if (!this.selectedLyricId) return null;
        return ScoreState.mapper.lyrics.get(this.selectedLyricId) || null;
    }

    selectLyricByNote(noteId) {
        const mapper = ScoreState.mapper;
        const note = mapper.notes.get(noteId);
        if (!note || note.lyricIds.length === 0) return;
        this.selectedLyricId = note.lyricIds[0];
        this.renderLines();
    }
}
