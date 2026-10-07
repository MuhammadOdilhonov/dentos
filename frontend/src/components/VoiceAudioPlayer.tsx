'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';

interface VoiceAudioPlayerProps {
  src: string;
  duration?: number;
  authorName?: string;
  className?: string;
}

export default function VoiceAudioPlayer({
  src,
  duration,
  authorName,
  className = ''
}: VoiceAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSourceConnectedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration || 0);
  const [isMuted, setIsMuted] = useState(false);
  // Dynamic heights for 32 Telegram-style voice waveform bars
  const [barHeights, setBarHeights] = useState<number[]>([
    25, 40, 65, 30, 80, 50, 95, 60, 45, 85, 55, 90, 70, 40, 85, 50,
    95, 65, 40, 80, 55, 90, 60, 35, 75, 45, 30, 60, 40, 25, 20, 25
  ]);

  // Connect Web Audio API Analyser when user plays
  const setupAudioContext = () => {
    if (audioCtxRef.current || !audioRef.current) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.5;

      if (!isSourceConnectedRef.current) {
        try {
          const source = ctx.createMediaElementSource(audioRef.current);
          source.connect(analyser);
          analyser.connect(ctx.destination);
          isSourceConnectedRef.current = true;
        } catch (e) {
          console.warn('Audio node connection fallback', e);
        }
      }

      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
    } catch (e) {
      console.warn('AudioContext not supported or restricted', e);
    }
  };

  // Real-time animation loop reacting to sound
  const startVisualizerLoop = () => {
    const update = () => {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) {
        return;
      }

      if (analyserRef.current) {
        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let j = 0; j < bufferLength; j++) sum += dataArray[j];
        const avg = sum / (bufferLength || 1);

        if (avg > 5) {
          const newHeights = Array.from({ length: 32 }).map((_, i) => {
            const distFromCenter = Math.abs(i - 15.5);
            const binIdx = Math.min(Math.floor((1 - distFromCenter / 16) * bufferLength), bufferLength - 1);
            const val = dataArray[binIdx] || 0;
            const pct = Math.max(15, Math.min(100, Math.round((val / 180) * 80 + (avg / 255) * 45)));
            return pct;
          });
          setBarHeights(newHeights);
        } else {
          const t = audio.currentTime * 10;
          const fallback = Array.from({ length: 32 }).map((_, i) => {
            const wave = Math.sin(t + i * 0.4) * 35 + Math.cos(t * 1.6 + i * 0.6) * 25 + 45;
            return Math.max(18, Math.min(95, Math.round(wave)));
          });
          setBarHeights(fallback);
        }
      } else {
        const t = (audio.currentTime || (Date.now() / 200)) * 8;
        const fallback = Array.from({ length: 32 }).map((_, i) => {
          const wave = Math.sin(t + i * 0.4) * 35 + Math.cos(t * 1.6 + i * 0.6) * 25 + 45;
          return Math.max(18, Math.min(95, Math.round(wave)));
        });
        setBarHeights(fallback);
      }

      animFrameRef.current = requestAnimationFrame(update);
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    animFrameRef.current = requestAnimationFrame(update);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        setTotalDuration(Math.round(audio.duration));
      } else if (duration) {
        setTotalDuration(duration);
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      setBarHeights([
        25, 40, 65, 30, 80, 50, 95, 60, 45, 85, 55, 90, 70, 40, 85, 50,
        95, 65, 40, 80, 55, 90, 60, 35, 75, 45, 30, 60, 40, 25, 20, 25
      ]);
    };

    const onPause = () => {
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };

    const onPlay = async () => {
      setIsPlaying(true);
      setupAudioContext();
      if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
        try {
          await audioCtxRef.current.resume();
        } catch {}
      }
      startVisualizerLoop();
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [duration, src]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    setupAudioContext();
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch(console.error);
    }
  };

  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickFraction = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = clickFraction * (totalDuration || audioRef.current?.duration || 0);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = totalDuration > 0 ? Math.min(100, Math.max(0, (currentTime / totalDuration) * 100)) : 0;

  return (
    <div className={`p-3 bg-gradient-to-r from-blue-50/90 via-sky-50/70 to-indigo-50/60 dark:from-slate-800/90 dark:via-slate-800/70 dark:to-slate-800/50 border border-blue-200/90 dark:border-slate-700 rounded-2xl shadow-xs ${className}`}>
      <audio ref={audioRef} src={src} preload="metadata" crossOrigin="anonymous" />

      <div className="flex items-center gap-3">
        {/* Telegram-style Circular Play / Pause button */}
        <button
          type="button"
          onClick={togglePlay}
          className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-all transform active:scale-90 shadow-md shrink-0 ${
            isPlaying
              ? 'bg-blue-700 hover:bg-blue-800 ring-2 ring-blue-300 dark:ring-blue-900'
              : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
          }`}
          title={isPlaying ? 'Pauza' : 'Eshitish'}
        >
          {isPlaying ? (
            <Pause className="w-4 h-4 fill-current" />
          ) : (
            <Play className="w-4 h-4 ml-0.5 fill-current" />
          )}
        </button>

        {/* Telegram Audio Waveform with sweeping progress needle */}
        <div className="flex-1 min-w-0 flex flex-col justify-center space-y-1">
          {/* Interactive Waveform Container */}
          <div
            onClick={handleWaveformClick}
            className="relative h-9 flex items-center gap-0.5 sm:gap-1 px-1 cursor-pointer group select-none py-1"
            title="Bosib vaqtni surish"
          >
            {/* Telegram progress scrubber line (sweeps across to the end) */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-blue-600 dark:bg-sky-400 z-10 pointer-events-none rounded-full transition-all duration-75 shadow-xs"
              style={{ left: `${progressPercent}%` }}
            >
              <div className="w-2 h-2 rounded-full bg-blue-600 dark:bg-sky-400 -ml-[3px] -top-0.5 relative shadow-xs" />
            </div>

            {/* 32 Centered Waveform bars */}
            {barHeights.map((h, i) => {
              const barPos = (i / barHeights.length) * 100;
              const isPlayed = barPos <= progressPercent;
              return (
                <div
                  key={i}
                  className="flex-1 h-full flex items-center justify-center pointer-events-none"
                >
                  <span
                    className={`w-full max-w-[4px] rounded-full transition-all duration-75 ${
                      isPlayed
                        ? 'bg-blue-600 dark:bg-sky-400'
                        : 'bg-slate-300/80 dark:bg-slate-600'
                    }`}
                    style={{ height: `${Math.max(15, h)}%` }}
                  />
                </div>
              );
            })}
          </div>

          {/* Time tracker */}
          <div className="flex items-center justify-between text-[11px] font-mono select-none px-1">
            <span className="font-bold text-blue-600 dark:text-sky-400 tabular-nums">
              {formatTime(currentTime)}
            </span>
            <span className="text-slate-400 dark:text-slate-500 tabular-nums">
              {formatTime(totalDuration)}
            </span>
          </div>
        </div>

        {/* Mute toggle */}
        <button
          type="button"
          onClick={toggleMute}
          className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-lg transition shrink-0"
          title={isMuted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}
        >
          {isMuted ? <VolumeX className="w-4 h-4 text-rose-500" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
