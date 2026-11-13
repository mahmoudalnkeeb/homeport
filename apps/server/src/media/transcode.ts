import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { z } from 'zod';

import type { StreamKind } from './media.schema.js';

export interface Probe {
  duration: number | null;
  width: number;
  height: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

export interface Rendition {
  width: number;
  height: number;
  kbps: number;
}

export interface TranscodeResult {
  duration: number | null;
  hasPoster: boolean;
}

export interface Tools {
  ffmpeg: string;
  ffprobe: string;
  signal?: AbortSignal;
}

const VIDEO_LADDER = [
  { short: 1080, kbps: 5000 },
  { short: 720, kbps: 2800 },
  { short: 480, kbps: 1400 },
  { short: 360, kbps: 800 },
] as const;
const LOWEST_KBPS = 800;
const AUDIO_LADDER_KBPS = [192, 128, 64] as const;
const SEGMENT_SECONDS = 4;
const MASTER = 'master.m3u8';
export const POSTER = 'poster.jpg';

const probeSchema = z.object({
  format: z.object({ duration: z.coerce.number().optional() }).optional(),
  streams: z
    .array(
      z.object({
        codec_type: z.string().optional(),
        width: z.number().optional(),
        height: z.number().optional(),
        disposition: z.object({ attached_pic: z.number().optional() }).optional(),
        tags: z.object({ rotate: z.coerce.number().optional() }).optional(),
        side_data_list: z.array(z.object({ rotation: z.coerce.number().optional() })).optional(),
      })
    )
    .default([]),
});

const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);

export function videoRenditions(width: number, height: number): Rendition[] {
  const short = Math.min(width, height);
  const rungs = VIDEO_LADDER.filter((rung) => rung.short <= short);
  const chosen = rungs.length ? rungs : [{ short, kbps: LOWEST_KBPS }];
  return chosen.map((rung) => ({ width: even((width * rung.short) / short), height: even((height * rung.short) / short), kbps: rung.kbps }));
}

function hlsOutput(streamMap: string): string[] {
  return [
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'mpegts',
    '-master_pl_name', MASTER,
    '-var_stream_map', streamMap,
    '-hls_segment_filename', 'v%v/seg_%04d.ts',
    'v%v/index.m3u8',
  ];
}

export function hlsArgs(input: string, probe: Probe): string[] {
  const head = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input];
  if (!probe.hasVideo) {
    return [
      ...head,
      '-vn',
      ...AUDIO_LADDER_KBPS.flatMap(() => ['-map', '0:a:0']),
      '-c:a', 'aac',
      '-ac', '2',
      ...AUDIO_LADDER_KBPS.flatMap((kbps, i) => [`-b:a:${i}`, `${kbps}k`]),
      ...hlsOutput(AUDIO_LADDER_KBPS.map((_, i) => `a:${i}`).join(' ')),
    ];
  }
  const renditions = videoRenditions(probe.width, probe.height);
  const splits = renditions.map((_, i) => `[s${i}]`).join('');
  const scales = renditions.map(({ width, height }, i) => `[s${i}]scale=${width}:${height}[v${i}]`).join(';');
  return [
    ...head,
    '-filter_complex', `[0:v:0]split=${renditions.length}${splits};${scales}`,
    ...renditions.flatMap((_, i) => ['-map', `[v${i}]`, ...(probe.hasAudio ? ['-map', '0:a:0'] : [])]),
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-sc_threshold', '0',
    '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    ...renditions.flatMap(({ kbps }, i) => [
      `-b:v:${i}`, `${kbps}k`,
      `-maxrate:v:${i}`, `${Math.round(kbps * 1.07)}k`,
      `-bufsize:v:${i}`, `${Math.round(kbps * 1.5)}k`,
    ]),
    ...(probe.hasAudio ? ['-c:a', 'aac', '-ac', '2', '-b:a', '128k'] : []),
    ...hlsOutput(renditions.map((_, i) => (probe.hasAudio ? `v:${i},a:${i}` : `v:${i}`)).join(' ')),
  ];
}

function run(command: string, args: string[], { signal, cwd }: { signal?: AbortSignal | undefined; cwd?: string } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { signal, cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr = (stderr + chunk.toString()).slice(-4000)));
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(error.code === 'ENOENT' ? new Error(`${command} was not found; install ffmpeg or set FFMPEG_PATH/FFPROBE_PATH`) : error)
    );
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      const reason = stderr.trim().split('\n')[0]?.trim() ?? '';
      reject(new Error(`${basename(command)} exited with code ${code}${reason ? `: ${reason}` : ''}`));
    });
  });
}

export async function probe(tools: Tools, input: string): Promise<Probe> {
  const output = await run(
    tools.ffprobe,
    ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height:stream_disposition=attached_pic:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', input],
    { signal: tools.signal }
  );
  const parsed = probeSchema.parse(JSON.parse(output));
  const video = parsed.streams.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic && stream.width && stream.height);
  const rotation = Math.abs(video?.side_data_list?.find((data) => data.rotation !== undefined)?.rotation ?? video?.tags?.rotate ?? 0) % 180;
  const width = video?.width ?? 0;
  const height = video?.height ?? 0;
  const duration = parsed.format?.duration;
  return {
    duration: duration !== undefined && Number.isFinite(duration) ? duration : null,
    width: rotation === 90 ? height : width,
    height: rotation === 90 ? width : height,
    hasVideo: video !== undefined,
    hasAudio: parsed.streams.some((stream) => stream.codec_type === 'audio'),
  };
}

export async function transcode(tools: Tools, input: string, outDir: string, kind: StreamKind): Promise<TranscodeResult> {
  const info = await probe(tools, input);
  if (!info.hasVideo && !info.hasAudio) throw new Error('No audio or video stream found');
  const plan = kind === 'audio' ? { ...info, hasVideo: false } : info;
  if (!plan.hasVideo && !plan.hasAudio) throw new Error('No audio stream found');
  const variants = plan.hasVideo ? videoRenditions(plan.width, plan.height).length : AUDIO_LADDER_KBPS.length;
  await Promise.all(Array.from({ length: variants }, (_, i) => mkdir(join(outDir, `v${i}`), { recursive: true })));
  await run(tools.ffmpeg, hlsArgs(input, plan), { signal: tools.signal, cwd: outDir });

  let hasPoster = false;
  if (plan.hasVideo) {
    const at = Math.min(10, (info.duration ?? 0) * 0.1);
    hasPoster = await run(
      tools.ffmpeg,
      ['-hide_banner', '-loglevel', 'error', '-y', '-ss', at.toFixed(2), '-i', input, '-frames:v', '1', '-vf', 'scale=-2:min(720\\,ih)', POSTER],
      { signal: tools.signal, cwd: outDir }
    ).then(
      () => true,
      () => false
    );
  }
  return { duration: info.duration, hasPoster };
}
