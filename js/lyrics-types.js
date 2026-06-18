// ============ 歌词同步引擎 - 类型定义 ============

const NoteTypes = {
    WHOLE: { name: '全音符', duration: 4 },
    HALF: { name: '二分音符', duration: 2 },
    QUARTER: { name: '四分音符', duration: 1 },
    EIGHTH: { name: '八分音符', duration: 0.5 },
    SIXTEENTH: { name: '十六分音符', duration: 0.25 }
};

const PitchMap = {
    'C4': 261.63, 'D4': 293.66, 'E4': 329.63, 'F4': 349.23,
    'G4': 392.00, 'A4': 440.00, 'B4': 493.88,
    'C5': 523.25, 'D5': 587.33, 'E5': 659.25, 'F5': 698.46,
    'G5': 783.99, 'A5': 880.00, 'B5': 987.77,
    'REST': null
};

const DEFAULT_CONFIG = {
    bpm: 120,
    beatsPerMeasure: 4,
    beatValue: 4,
    pixelsPerBeat: 80,
    noteHeight: 60,
    staffTop: 80,
    staffLineSpacing: 10,
    lyricsBottomOffset: 50,
    lyricsFontSize: 16,
    highlightColor: '#e94560',
    lyricsColor: '#1a1a2e',
    measureLineColor: '#ccc'
};

class Note {
    constructor(id, pitch, noteType, measure, beat, isRest = false) {
        this.id = id;
        this.pitch = pitch;
        this.noteType = noteType;
        this.duration = NoteTypes[noteType].duration;
        this.measure = measure;
        this.beat = beat;
        this.isRest = isRest;
        this.lyricIds = [];
        this.position = { x: 0, y: 0 };
    }

    getStartTime(totalBeatsBefore = 0, bpm = DEFAULT_CONFIG.bpm, beatsPerMeasure = DEFAULT_CONFIG.beatsPerMeasure) {
        const beatDuration = 60 / bpm;
        const absoluteBeat = this.getAbsoluteBeat(beatsPerMeasure);
        const totalBeats = totalBeatsBefore + absoluteBeat;
        return totalBeats * beatDuration;
    }

    getEndTime(totalBeatsBefore = 0, bpm = DEFAULT_CONFIG.bpm, beatsPerMeasure = DEFAULT_CONFIG.beatsPerMeasure) {
        return this.getStartTime(totalBeatsBefore, bpm, beatsPerMeasure) + (this.duration * 60 / bpm);
    }

    getAbsoluteBeat(beatsPerMeasure = DEFAULT_CONFIG.beatsPerMeasure) {
        return this.measure * beatsPerMeasure + this.beat;
    }
}

class LyricSegment {
    constructor(id, text, noteIds = [], startTime = null, endTime = null) {
        this.id = id;
        this.text = text;
        this.noteIds = Array.isArray(noteIds) ? [...noteIds] : [];
        this.startTime = startTime;
        this.endTime = endTime;
        this.lineIndex = 0;
        this.isActive = false;
    }

    addNote(noteId) {
        if (!this.noteIds.includes(noteId)) {
            this.noteIds.push(noteId);
        }
    }

    removeNote(noteId) {
        this.noteIds = this.noteIds.filter(id => id !== noteId);
    }
}

class LyricLine {
    constructor(id, segments = [], measureIndex = 0) {
        this.id = id;
        this.segments = segments;
        this.measureIndex = measureIndex;
        this.y = 0;
    }

    getText() {
        return this.segments.map(s => s.text).join('');
    }

    getStartTime() {
        if (this.segments.length === 0) return 0;
        const validTimes = this.segments.map(s => s.startTime).filter(t => t !== null && t !== undefined && !isNaN(t));
        if (validTimes.length === 0) return 0;
        return Math.min(...validTimes);
    }

    getEndTime() {
        if (this.segments.length === 0) return 0;
        const validTimes = this.segments.map(s => s.endTime).filter(t => t !== null && t !== undefined && !isNaN(t));
        if (validTimes.length === 0) return 0;
        return Math.max(...validTimes);
    }
}

class LyricsMapper {
    constructor() {
        this.notes = new Map();
        this.lyrics = new Map();
        this.lines = [];
        this.noteIndex = 1;
        this.lyricIndex = 1;
        this.lineIndex = 0;
    }

    createNote(pitch, noteType, measure, beat, isRest = false) {
        const id = `note_${this.noteIndex++}`;
        const note = new Note(id, pitch, noteType, measure, beat, isRest);
        this.notes.set(id, note);
        return note;
    }

    createLyricSegment(text, noteIds = []) {
        const id = `lyric_${this.lyricIndex++}`;
        const segment = new LyricSegment(id, text, noteIds);
        this.lyrics.set(id, segment);
        noteIds.forEach(noteId => {
            const note = this.notes.get(noteId);
            if (note && !note.lyricIds.includes(id)) {
                note.lyricIds.push(id);
            }
        });
        return segment;
    }

    createLyricLine(segments = [], measureIndex = 0) {
        const line = new LyricLine(`line_${this.lineIndex++}`, segments, measureIndex);
        this.lines.push(line);
        segments.forEach((seg, idx) => {
            seg.lineIndex = this.lines.length - 1;
        });
        return line;
    }

    mapLyricToNote(lyricId, noteId) {
        const lyric = this.lyrics.get(lyricId);
        const note = this.notes.get(noteId);
        if (!lyric || !note) return false;
        lyric.addNote(noteId);
        if (!note.lyricIds.includes(lyricId)) {
            note.lyricIds.push(lyricId);
        }
        return true;
    }

    unmapLyricFromNote(lyricId, noteId) {
        const lyric = this.lyrics.get(lyricId);
        const note = this.notes.get(noteId);
        if (!lyric || !note) return false;
        lyric.removeNote(noteId);
        note.lyricIds = note.lyricIds.filter(id => id !== lyricId);
        return true;
    }

    getLyricsForNote(noteId) {
        const note = this.notes.get(noteId);
        if (!note) return [];
        return note.lyricIds.map(id => this.lyrics.get(id)).filter(Boolean);
    }

    getNotesForLyric(lyricId) {
        const lyric = this.lyrics.get(lyricId);
        if (!lyric) return [];
        return lyric.noteIds.map(id => this.notes.get(id)).filter(Boolean);
    }

    clear() {
        this.notes.clear();
        this.lyrics.clear();
        this.lines = [];
        this.noteIndex = 1;
        this.lyricIndex = 1;
        this.lineIndex = 0;
    }

    getAllNotesSorted() {
        return Array.from(this.notes.values()).sort((a, b) => {
            const aBeat = a.getAbsoluteBeat();
            const bBeat = b.getAbsoluteBeat();
            return aBeat - bBeat;
        });
    }

    recalculateLyricTimestamps(bpm = DEFAULT_CONFIG.bpm, beatsPerMeasure = DEFAULT_CONFIG.beatsPerMeasure) {
        const sortedNotes = this.getAllNotesSorted();
        const beatDuration = 60 / bpm;

        const noteTimeMap = new Map();
        sortedNotes.forEach(note => {
            const startBeat = note.getAbsoluteBeat(beatsPerMeasure);
            const startTime = startBeat * beatDuration;
            const endTime = startTime + (note.duration * beatDuration);
            noteTimeMap.set(note.id, { startTime, endTime });
        });

        this.lyrics.forEach(lyric => {
            if (lyric.noteIds.length === 0) {
                lyric.startTime = null;
                lyric.endTime = null;
                return;
            }
            const times = lyric.noteIds
                .map(id => noteTimeMap.get(id))
                .filter(Boolean);
            if (times.length === 0) return;
            lyric.startTime = Math.min(...times.map(t => t.startTime));
            lyric.endTime = Math.max(...times.map(t => t.endTime));
        });
    }

    findActiveLyricAtTime(time, tolerance = 0.05) {
        const activeLyrics = [];
        this.lyrics.forEach(lyric => {
            if (lyric.startTime !== null && lyric.endTime !== null) {
                if (time >= lyric.startTime - tolerance && time <= lyric.endTime + tolerance) {
                    activeLyrics.push(lyric);
                }
            }
        });
        return activeLyrics;
    }

    findActiveLineAtTime(time) {
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const line = this.lines[i];
            if (time >= line.getStartTime()) {
                return i;
            }
        }
        return 0;
    }

    exportMapping() {
        return {
            notes: Array.from(this.notes.values()).map(n => ({
                id: n.id,
                pitch: n.pitch,
                noteType: n.noteType,
                measure: n.measure,
                beat: n.beat,
                isRest: n.isRest,
                lyricIds: [...n.lyricIds]
            })),
            lyrics: Array.from(this.lyrics.values()).map(l => ({
                id: l.id,
                text: l.text,
                noteIds: [...l.noteIds],
                startTime: l.startTime,
                endTime: l.endTime,
                lineIndex: l.lineIndex
            })),
            lines: this.lines.map(line => ({
                id: line.id,
                segmentIds: line.segments.map(s => s.id),
                measureIndex: line.measureIndex
            }))
        };
    }
}

const LRC_PARSER = {
    parse(lrcText) {
        const lines = lrcText.split(/\r?\n/);
        const result = [];
        const metadata = {};

        const timePattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;
        const metaPattern = /\[(\w+):([^\]]+)\]/;

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const metaMatch = trimmed.match(metaPattern);
            if (metaMatch && !timePattern.test(trimmed)) {
                metadata[metaMatch[1]] = metaMatch[2].trim();
                continue;
            }

            timePattern.lastIndex = 0;
            const times = [];
            let match;
            while ((match = timePattern.exec(trimmed)) !== null) {
                const minutes = parseInt(match[1], 10);
                const seconds = parseInt(match[2], 10);
                const milliseconds = match[3] ? parseInt(match[3].padEnd(3, '0'), 10) : 0;
                times.push(minutes * 60 + seconds + milliseconds / 1000);
            }

            if (times.length === 0) continue;

            const text = trimmed.replace(timePattern, '').trim();
            for (const time of times) {
                result.push({ time, text });
            }
        }

        result.sort((a, b) => a.time - b.time);

        for (let i = 0; i < result.length; i++) {
            if (i < result.length - 1) {
                result[i].endTime = result[i + 1].time;
            } else {
                result[i].endTime = result[i].time + 3;
            }
        }

        return { metadata, entries: result };
    },

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 100);
        return `[${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}]`;
    },

    generate(entries, metadata = {}) {
        let result = '';
        for (const [key, value] of Object.entries(metadata)) {
            result += `[${key}:${value}]\n`;
        }
        result += '\n';
        for (const entry of entries) {
            result += `${this.formatTime(entry.time)}${entry.text}\n`;
        }
        return result;
    }
};
