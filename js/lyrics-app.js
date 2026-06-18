// ============ 歌词同步引擎 - 主应用入口 ============

let lyricsAppInitialized = false;

function initLyricsApp() {
    if (lyricsAppInitialized) return;
    lyricsAppInitialized = true;

    initScoreRenderer('score-render-container');
    initLyricsEditor('lyrics-editor-container');

    bindToolbarEvents();
    bindInspectorEvents();
    bindProgressBarEvents();

    syncEngine.onTimeUpdate(updateTimeDisplay);
    syncEngine.onHighlightChange(updateActiveLyricDisplay);

    loadDemoScore();

    window.addEventListener('resize', () => {
        clearTimeout(window._lyricsResizeTimer);
        window._lyricsResizeTimer = setTimeout(() => {
            if (scoreRendererInstance) scoreRendererInstance.render();
        }, 200);
    });

    document.addEventListener('keydown', handleKeyboardShortcuts);
}

function bindToolbarEvents() {
    const btnPlay = document.getElementById('btn-play');
    const btnPause = document.getElementById('btn-pause');
    const btnStop = document.getElementById('btn-stop');
    const btnDemo = document.getElementById('btn-demo');
    const btnExportImg = document.getElementById('btn-export-img');
    const btnClearAll = document.getElementById('btn-clear-all');
    const bpmInput = document.getElementById('bpm-input');

    if (btnPlay) {
        btnPlay.addEventListener('click', () => {
            syncEngine.startPlayback();
            btnPlay.disabled = true;
            btnPause.disabled = false;
            btnStop.disabled = false;
        });
    }

    if (btnPause) {
        btnPause.addEventListener('click', () => {
            syncEngine.stopPlayback();
            btnPlay.disabled = false;
            btnPause.disabled = true;
            btnStop.disabled = false;
        });
    }

    if (btnStop) {
        btnStop.addEventListener('click', () => {
            syncEngine.stopPlayback();
            syncEngine.seekToTime(0);
            btnPlay.disabled = false;
            btnPause.disabled = true;
            btnStop.disabled = true;
        });
    }

    if (btnDemo) btnDemo.addEventListener('click', loadDemoScore);
    if (btnExportImg) btnExportImg.addEventListener('click', handleExportImage);
    if (btnClearAll) btnClearAll.addEventListener('click', handleClearAll);

    if (bpmInput) {
        bpmInput.addEventListener('change', (e) => {
            const val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                setBPM(val);
                updateStats();
                if (scoreRendererInstance) scoreRendererInstance.render();
            }
        });
    }
}

function bindInspectorEvents() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const tab = btn.dataset.tab;
            document.getElementById('note-to-lyric-panel').classList.toggle('hidden', tab !== 'note-to-lyric');
            document.getElementById('lyric-to-note-panel').classList.toggle('hidden', tab !== 'lyric-to-note');
        });
    });

    const noteSelect = document.getElementById('note-select');
    const lyricSelect = document.getElementById('lyric-select');
    if (noteSelect) {
        noteSelect.addEventListener('change', (e) => {
            updateMappedLyricsList(e.target.value);
        });
    }
    if (lyricSelect) {
        lyricSelect.addEventListener('change', (e) => {
            updateMappedNotesList(e.target.value);
        });
    }
}

function bindProgressBarEvents() {
    const track = document.getElementById('progress-track');
    if (!track) return;
    let isDragging = false;

    const updateFromEvent = (e) => {
        const rect = track.getBoundingClientRect();
        const x = (e.clientX || (e.touches && e.touches[0].clientX)) - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const targetTime = pct * ScoreState.totalDuration;
        syncEngine.seekToTime(targetTime);
    };

    track.addEventListener('mousedown', (e) => {
        isDragging = true;
        updateFromEvent(e);
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) updateFromEvent(e);
    });

    document.addEventListener('mouseup', () => { isDragging = false; });

    track.addEventListener('touchstart', (e) => {
        isDragging = true;
        updateFromEvent(e);
    });

    document.addEventListener('touchmove', (e) => {
        if (isDragging) updateFromEvent(e);
    });

    document.addEventListener('touchend', () => { isDragging = false; });
}

function handleKeyboardShortcuts(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    switch (e.code) {
        case 'Space':
            e.preventDefault();
            if (ScoreState.isPlaying) {
                document.getElementById('btn-pause').click();
            } else {
                document.getElementById('btn-play').click();
            }
            break;
        case 'ArrowLeft':
            syncEngine.seekToTime(Math.max(0, ScoreState.currentTime - 2));
            break;
        case 'ArrowRight':
            syncEngine.seekToTime(Math.min(ScoreState.totalDuration, ScoreState.currentTime + 2));
            break;
        case 'Home':
            syncEngine.seekToTime(0);
            break;
        case 'End':
            syncEngine.seekToTime(ScoreState.totalDuration);
            break;
    }
}

function updateTimeDisplay(time) {
    const currentEl = document.getElementById('current-time');
    const totalEl = document.getElementById('total-time');
    const fillEl = document.getElementById('progress-fill');
    const handleEl = document.getElementById('progress-handle');

    if (currentEl) currentEl.textContent = formatTimeMMSS(time);
    if (totalEl) totalEl.textContent = formatTimeMMSS(ScoreState.totalDuration);

    const pct = ScoreState.totalDuration > 0 ? (time / ScoreState.totalDuration) * 100 : 0;
    if (fillEl) fillEl.style.width = pct + '%';
    if (handleEl) handleEl.style.left = pct + '%';
}

function formatTimeMMSS(seconds) {
    if (seconds === null || seconds === undefined || isNaN(seconds)) return '00:00.00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

function updateActiveLyricDisplay(activeLyrics, activeLineIndex) {
    const box = document.getElementById('active-lyric-display');
    if (!box) return;

    const line = ScoreState.mapper.lines[activeLineIndex];
    if (line) {
        const lineText = line.segments.map(seg => {
            return ScoreState.activeLyricIds.includes(seg.id)
                ? `<span style="color:#ffeb3b; text-shadow:0 0 8px rgba(255,235,59,0.8)">${escapeHtml(seg.text)}</span>`
                : `<span style="opacity:0.7">${escapeHtml(seg.text)}</span>`;
        }).join('');
        box.innerHTML = `<div class="active-lyric-line">${lineText}</div>`;
    } else {
        box.innerHTML = `<div class="active-lyric-line">—</div>`;
    }

    updateActiveNoteInfo();
    updateStats();
    refreshSelectOptions();
}

function updateActiveNoteInfo() {
    const box = document.getElementById('active-note-info');
    if (!box) return;
    const activeNotes = syncEngine.getActiveNotes();

    if (activeNotes.length === 0) {
        box.innerHTML = `<p class="hint">点击音符查看详情</p>`;
        return;
    }

    let html = '';
    activeNotes.forEach(note => {
        const lyrics = ScoreState.mapper.getLyricsForNote(note.id);
        const lyricText = lyrics.map(l => l.text).join('') || '(无歌词)';
        html += `
            <div class="detail-row">
                <span class="detail-label">音高</span>
                <span class="detail-value">${note.pitch}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">时值</span>
                <span class="detail-value">${NoteTypes[note.noteType].name}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">小节</span>
                <span class="detail-value">第${note.measure + 1}小节</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">拍位</span>
                <span class="detail-value">${note.beat}</span>
            </div>
            <div class="detail-row">
                <span class="detail-label">歌词</span>
                <span class="detail-value" style="color:#f39c12">${escapeHtml(lyricText)}</span>
            </div>
        `;
    });
    box.innerHTML = html;
}

function updateStats() {
    const mapper = ScoreState.mapper;
    const notesEl = document.getElementById('stat-notes');
    const lyricsEl = document.getElementById('stat-lyrics');
    const linesEl = document.getElementById('stat-lines');
    const mappingsEl = document.getElementById('stat-mappings');

    let mappingCount = 0;
    mapper.notes.forEach(n => mappingCount += n.lyricIds.length);

    if (notesEl) notesEl.textContent = mapper.notes.size;
    if (lyricsEl) lyricsEl.textContent = mapper.lyrics.size;
    if (linesEl) linesEl.textContent = mapper.lines.length;
    if (mappingsEl) mappingsEl.textContent = mappingCount;
}

function refreshSelectOptions() {
    const mapper = ScoreState.mapper;
    const noteSelect = document.getElementById('note-select');
    const lyricSelect = document.getElementById('lyric-select');

    if (noteSelect) {
        const currentVal = noteSelect.value;
        const sortedNotes = mapper.getAllNotesSorted();
        let opts = '<option value="">选择音符...</option>';
        sortedNotes.forEach(n => {
            const lyrics = mapper.getLyricsForNote(n).map(l => l.text).join('');
            opts += `<option value="${n.id}" ${n.id === currentVal ? 'selected' : ''}>${n.id} | ${n.pitch} | 第${n.measure + 1}小节${n.beat}拍 | ${escapeHtml(lyrics) || '(无)'}</option>`;
        });
        noteSelect.innerHTML = opts;
    }

    if (lyricSelect) {
        const currentVal = lyricSelect.value;
        let opts = '<option value="">选择歌词...</option>';
        mapper.lyrics.forEach(l => {
            opts += `<option value="${l.id}" ${l.id === currentVal ? 'selected' : ''}>第${l.lineIndex + 1}行 | "${escapeHtml(l.text)}" | ♪×${l.noteIds.length}</option>`;
        });
        lyricSelect.innerHTML = opts;
    }
}

function updateMappedLyricsList(noteId) {
    const listEl = document.getElementById('mapped-lyrics-list');
    if (!listEl) return;
    if (!noteId) {
        listEl.innerHTML = '<p class="hint">暂无关联歌词</p>';
        return;
    }
    const lyrics = ScoreState.mapper.getLyricsForNote(noteId);
    if (lyrics.length === 0) {
        listEl.innerHTML = '<p class="hint">暂无关联歌词</p>';
        return;
    }
    let html = '';
    lyrics.forEach(l => {
        html += `<div class="mapping-item">
            <span class="mi-lyric">"${escapeHtml(l.text)}"</span>
            <span class="mi-time">${formatTimeMMSS(l.startTime)}</span>
        </div>`;
    });
    listEl.innerHTML = html;
}

function updateMappedNotesList(lyricId) {
    const listEl = document.getElementById('mapped-notes-list');
    if (!listEl) return;
    if (!lyricId) {
        listEl.innerHTML = '<p class="hint">暂无关联音符</p>';
        return;
    }
    const notes = ScoreState.mapper.getNotesForLyric(lyricId);
    if (notes.length === 0) {
        listEl.innerHTML = '<p class="hint">暂无关联音符</p>';
        return;
    }
    let html = '';
    notes.forEach(n => {
        html += `<div class="mapping-item">
            <span class="mi-note">${n.pitch} ${NoteTypes[n.noteType].name}</span>
            <span class="mi-time">${n.measure + 1}-${n.beat}</span>
        </div>`;
    });
    listEl.innerHTML = html;
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = (str ?? '').toString();
    return div.innerHTML;
}

function handleExportImage() {
    if (!scoreRendererInstance) return;
    const dataUrl = scoreRendererInstance.exportAsDataURL(true, 'image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = (ScoreState.songInfo.title || 'score') + '_' + Date.now() + '.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function handleClearAll() {
    if (!confirm('确定要清空所有内容吗？')) return;
    resetScoreState();
    refreshScoreRendering();
    updateStats();
    updateTimeDisplay(0);
    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-stop').disabled = true;
    refreshSelectOptions();
}

function loadDemoScore() {
    resetScoreState();

    const noteDataList = [
        { pitch: 'C4', noteType: 'QUARTER', measure: 0, beat: 0 },
        { pitch: 'D4', noteType: 'QUARTER', measure: 0, beat: 1 },
        { pitch: 'E4', noteType: 'QUARTER', measure: 0, beat: 2 },
        { pitch: 'F4', noteType: 'QUARTER', measure: 0, beat: 3 },

        { pitch: 'E4', noteType: 'QUARTER', measure: 1, beat: 0 },
        { pitch: 'D4', noteType: 'QUARTER', measure: 1, beat: 1 },
        { pitch: 'C4', noteType: 'HALF', measure: 1, beat: 2 },

        { pitch: 'G4', noteType: 'QUARTER', measure: 2, beat: 0 },
        { pitch: 'A4', noteType: 'QUARTER', measure: 2, beat: 1 },
        { pitch: 'B4', noteType: 'QUARTER', measure: 2, beat: 2 },
        { pitch: 'C5', noteType: 'QUARTER', measure: 2, beat: 3 },

        { pitch: 'B4', noteType: 'QUARTER', measure: 3, beat: 0 },
        { pitch: 'A4', noteType: 'QUARTER', measure: 3, beat: 1 },
        { pitch: 'G4', noteType: 'HALF', measure: 3, beat: 2 },

        { pitch: 'E4', noteType: 'QUARTER', measure: 4, beat: 0 },
        { pitch: 'F4', noteType: 'QUARTER', measure: 4, beat: 1 },
        { pitch: 'G4', noteType: 'QUARTER', measure: 4, beat: 2 },
        { pitch: 'A4', noteType: 'QUARTER', measure: 4, beat: 3 },

        { pitch: 'G4', noteType: 'QUARTER', measure: 5, beat: 0 },
        { pitch: 'F4', noteType: 'QUARTER', measure: 5, beat: 1 },
        { pitch: 'E4', noteType: 'HALF', measure: 5, beat: 2 },

        { pitch: 'C4', noteType: 'QUARTER', measure: 6, beat: 0 },
        { pitch: 'REST', noteType: 'QUARTER', measure: 6, beat: 1, isRest: true },
        { pitch: 'G4', noteType: 'QUARTER', measure: 6, beat: 2 },
        { pitch: 'C4', noteType: 'QUARTER', measure: 6, beat: 3 },

        { pitch: 'G4', noteType: 'QUARTER', measure: 7, beat: 0 },
        { pitch: 'REST', noteType: 'QUARTER', measure: 7, beat: 1, isRest: true },
        { pitch: 'C4', noteType: 'HALF', measure: 7, beat: 2 },
    ];

    ScoreState.songInfo = {
        title: '小星星',
        artist: '传统儿歌',
        album: '经典童谣'
    };

    const lyricLines = [
        { text: '一闪一闪亮晶晶', measureIndex: 0 },
        { text: '满天都是小星星', measureIndex: 2 },
        { text: '挂在天上放光明', measureIndex: 4 },
        { text: '好像许多小眼睛', measureIndex: 6 },
    ];

    buildScoreFromNotes(noteDataList, lyricLines);

    document.getElementById('song-title').value = ScoreState.songInfo.title;
    document.getElementById('song-artist').value = ScoreState.songInfo.artist;

    refreshScoreRendering();
    updateStats();
    updateTimeDisplay(0);
    refreshSelectOptions();

    document.getElementById('btn-play').disabled = false;
    document.getElementById('btn-pause').disabled = true;
    document.getElementById('btn-stop').disabled = true;
}

document.addEventListener('DOMContentLoaded', initLyricsApp);
