// ============ 歌词同步引擎 - 状态管理和核心引擎 ============

const ScoreState = {
    mapper: new LyricsMapper(),
    config: { ...DEFAULT_CONFIG },
    currentTime: 0,
    isPlaying: false,
    playInterval: null,
    scrollOffset: { x: 0, y: 0 },
    activeLineIndex: 0,
    activeLyricIds: [],
    viewport: { width: 1200, height: 800 },
    totalDuration: 0,
    songInfo: {
        title: '',
        artist: '',
        album: ''
    }
};

function resetScoreState() {
    ScoreState.mapper = new LyricsMapper();
    ScoreState.config = { ...DEFAULT_CONFIG };
    ScoreState.currentTime = 0;
    ScoreState.isPlaying = false;
    if (ScoreState.playInterval) {
        clearInterval(ScoreState.playInterval);
        ScoreState.playInterval = null;
    }
    ScoreState.scrollOffset = { x: 0, y: 0 };
    ScoreState.activeLineIndex = 0;
    ScoreState.activeLyricIds = [];
    ScoreState.totalDuration = 0;
    ScoreState.songInfo = { title: '', artist: '', album: '' };
}

function setBPM(bpm) {
    ScoreState.config.bpm = Math.max(20, Math.min(300, bpm));
    ScoreState.mapper.recalculateLyricTimestamps(ScoreState.config.bpm, ScoreState.config.beatsPerMeasure);
    calculateTotalDuration();
}

function calculateTotalDuration() {
    const sortedNotes = ScoreState.mapper.getAllNotesSorted();
    if (sortedNotes.length === 0) {
        ScoreState.totalDuration = 0;
        return 0;
    }
    const lastNote = sortedNotes[sortedNotes.length - 1];
    const beatDuration = 60 / ScoreState.config.bpm;
    const endBeat = lastNote.getAbsoluteBeat(ScoreState.config.beatsPerMeasure) + lastNote.duration;
    ScoreState.totalDuration = endBeat * beatDuration;
    return ScoreState.totalDuration;
}

class LyricsSyncEngine {
    constructor() {
        this.highlightChangedCallbacks = [];
        this.timeUpdateCallbacks = [];
        this.scrollCallbacks = [];
    }

    get mapper() {
        return ScoreState.mapper;
    }

    get config() {
        return ScoreState.config;
    }

    onHighlightChange(callback) {
        this.highlightChangedCallbacks.push(callback);
    }

    onTimeUpdate(callback) {
        this.timeUpdateCallbacks.push(callback);
    }

    onScrollChange(callback) {
        this.scrollCallbacks.push(callback);
    }

    updateCurrentTime(time) {
        ScoreState.currentTime = Math.max(0, Math.min(time, ScoreState.totalDuration));
        const activeLyrics = this.mapper.findActiveLyricAtTime(ScoreState.currentTime);
        const prevActiveIds = [...ScoreState.activeLyricIds];
        ScoreState.activeLyricIds = activeLyrics.map(l => l.id);

        ScoreState.activeLineIndex = this.mapper.findActiveLineAtTime(ScoreState.currentTime);

        this.mapper.lyrics.forEach(lyric => {
            lyric.isActive = ScoreState.activeLyricIds.includes(lyric.id);
        });

        this.timeUpdateCallbacks.forEach(cb => cb(ScoreState.currentTime));

        const idsChanged = prevActiveIds.length !== ScoreState.activeLyricIds.length ||
            prevActiveIds.some(id => !ScoreState.activeLyricIds.includes(id)) ||
            ScoreState.activeLyricIds.some(id => !prevActiveIds.includes(id));
        if (idsChanged) {
            this.highlightChangedCallbacks.forEach(cb => cb(activeLyrics, ScoreState.activeLineIndex));
            this.autoScrollForActiveLyric();
        }
    }

    autoScrollForActiveLyric() {
        if (ScoreState.activeLineIndex < 0) return;
        const line = this.mapper.lines[ScoreState.activeLineIndex];
        if (!line) return;
        const targetY = Math.max(0, line.y - ScoreState.viewport.height * 0.3);
        if (Math.abs(targetY - ScoreState.scrollOffset.y) > 5) {
            this.setScrollOffset(ScoreState.scrollOffset.x, targetY);
        }
    }

    setScrollOffset(x, y) {
        ScoreState.scrollOffset.x = Math.max(0, x);
        ScoreState.scrollOffset.y = Math.max(0, y);
        this.scrollCallbacks.forEach(cb => cb(ScoreState.scrollOffset));
    }

    startPlayback(updateIntervalMs = 50) {
        if (ScoreState.isPlaying) return;
        ScoreState.isPlaying = true;
        const startTime = performance.now() - ScoreState.currentTime * 1000;
        ScoreState.playInterval = setInterval(() => {
            const elapsed = (performance.now() - startTime) / 1000;
            if (elapsed >= ScoreState.totalDuration) {
                this.stopPlayback();
                this.updateCurrentTime(ScoreState.totalDuration);
                return;
            }
            this.updateCurrentTime(elapsed);
        }, updateIntervalMs);
    }

    stopPlayback() {
        ScoreState.isPlaying = false;
        if (ScoreState.playInterval) {
            clearInterval(ScoreState.playInterval);
            ScoreState.playInterval = null;
        }
    }

    seekToTime(time) {
        this.updateCurrentTime(time);
    }

    seekToNote(noteId) {
        const note = this.mapper.notes.get(noteId);
        if (!note) return;
        const beatDuration = 60 / this.config.bpm;
        const time = note.getAbsoluteBeat(this.config.beatsPerMeasure) * beatDuration;
        this.seekToTime(time);
    }

    seekToLyric(lyricId) {
        const lyric = this.mapper.lyrics.get(lyricId);
        if (!lyric || lyric.startTime === null) return;
        this.seekToTime(lyric.startTime);
    }

    getActiveNotes() {
        const activeNotes = [];
        const bpm = this.config.bpm;
        const beatsPerMeasure = this.config.beatsPerMeasure;
        const beatDuration = 60 / bpm;

        this.mapper.notes.forEach(note => {
            const startBeat = note.getAbsoluteBeat(beatsPerMeasure);
            const startTime = startBeat * beatDuration;
            const endTime = startTime + (note.duration * beatDuration);
            if (ScoreState.currentTime >= startTime && ScoreState.currentTime < endTime) {
                activeNotes.push(note);
            }
        });
        return activeNotes;
    }

    getActiveLyrics() {
        return ScoreState.activeLyricIds
            .map(id => this.mapper.lyrics.get(id))
            .filter(Boolean);
    }
}

const syncEngine = new LyricsSyncEngine();

function buildScoreFromNotes(noteDataList, lyricLines = []) {
    const mapper = ScoreState.mapper;
    mapper.clear();

    noteDataList.forEach(nd => {
        mapper.createNote(nd.pitch, nd.noteType, nd.measure, nd.beat, nd.isRest);
    });

    if (lyricLines && lyricLines.length > 0) {
        const sortedNotes = mapper.getAllNotesSorted();
        const nonRestNotes = sortedNotes.filter(n => !n.isRest);
        let noteCursor = 0;

        lyricLines.forEach((lineData, lineIdx) => {
            const segments = [];
            const lineMeasure = lineData.measureIndex ?? lineIdx * 4;

            if (Array.isArray(lineData.segments)) {
                lineData.segments.forEach(seg => {
                    const lyric = mapper.createLyricSegment(seg.text || '');
                    const noteCount = seg.noteCount || Math.max(1, Math.floor(seg.text.length / 2) || 1);
                    let assigned = 0;
                    while (assigned < noteCount && noteCursor < nonRestNotes.length) {
                        mapper.mapLyricToNote(lyric.id, nonRestNotes[noteCursor].id);
                        noteCursor++;
                        assigned++;
                    }
                    if (seg.noteIds) {
                        seg.noteIds.forEach(nid => mapper.mapLyricToNote(lyric.id, nid));
                    }
                    segments.push(lyric);
                });
            } else if (typeof lineData.text === 'string') {
                const chars = [...lineData.text];
                chars.forEach(char => {
                    if (noteCursor < nonRestNotes.length) {
                        const lyric = mapper.createLyricSegment(char, [nonRestNotes[noteCursor].id]);
                        segments.push(lyric);
                        noteCursor++;
                    }
                });
            }

            mapper.createLyricLine(segments, lineMeasure);
        });
    }

    mapper.recalculateLyricTimestamps(ScoreState.config.bpm, ScoreState.config.beatsPerMeasure);
    calculateTotalDuration();
    return mapper;
}

function importLRC(lrcText, noteDataList = null) {
    const parsed = LRC_PARSER.parse(lrcText);
    ScoreState.songInfo.title = parsed.metadata.ti || parsed.metadata.title || '';
    ScoreState.songInfo.artist = parsed.metadata.ar || parsed.metadata.artist || '';
    ScoreState.songInfo.album = parsed.metadata.al || parsed.metadata.album || '';

    if (noteDataList) {
        ScoreState.mapper.clear();
        noteDataList.forEach(nd => {
            ScoreState.mapper.createNote(nd.pitch, nd.noteType, nd.measure, nd.beat, nd.isRest);
        });
    }

    const sortedNotes = ScoreState.mapper.getAllNotesSorted();
    const nonRestNotes = sortedNotes.filter(n => !n.isRest);
    const segments = [];

    parsed.entries.forEach((entry, idx) => {
        const lyric = ScoreState.mapper.createLyricSegment(entry.text);
        lyric.startTime = entry.time;
        lyric.endTime = entry.endTime;
        segments.push(lyric);
    });

    const lines = [];
    let currentLineSegments = [];
    let lastTime = -Infinity;

    segments.forEach(seg => {
        if (seg.startTime - lastTime > 2 && currentLineSegments.length > 0) {
            lines.push({ segments: [...currentLineSegments], measureIndex: 0 });
            currentLineSegments = [];
        }
        currentLineSegments.push(seg);
        lastTime = seg.startTime;
    });
    if (currentLineSegments.length > 0) {
        lines.push({ segments: currentLineSegments, measureIndex: 0 });
    }

    let noteCursor = 0;
    lines.forEach(lineData => {
        const lineSegIds = [];
        lineData.segments.forEach(seg => {
            lineSegIds.push(seg);
            if (noteCursor < nonRestNotes.length) {
                ScoreState.mapper.mapLyricToNote(seg.id, nonRestNotes[noteCursor].id);
                noteCursor++;
            }
        });
        ScoreState.mapper.createLyricLine(lineSegIds, lineData.measureIndex);
    });

    ScoreState.mapper.recalculateLyricTimestamps(ScoreState.config.bpm, ScoreState.config.beatsPerMeasure);
    calculateTotalDuration();
    return { metadata: parsed.metadata, lineCount: lines.length };
}

function exportLRC() {
    const entries = [];
    const lines = ScoreState.mapper.lines;

    lines.forEach(line => {
        line.segments.forEach(seg => {
            if (seg.startTime !== null && seg.text.trim()) {
                entries.push({
                    time: seg.startTime,
                    endTime: seg.endTime,
                    text: seg.text
                });
            }
        });
    });

    return LRC_PARSER.generate(entries, {
        ti: ScoreState.songInfo.title,
        ar: ScoreState.songInfo.artist,
        al: ScoreState.songInfo.album
    });
}
