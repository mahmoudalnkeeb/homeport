import { formatBytes, Meter, toast } from '@homeport/ui';
import { useCallback, useState } from 'preact/hooks';

export interface UploadJob {
  id: number;
  label: string;
  bytes: number;
  progress: number;
}

let nextId = 1;

export function useUploads() {
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const upload = useCallback(async (files: File[], send: (onProgress: (ratio: number) => void) => Promise<unknown>): Promise<boolean> => {
    if (!files.length) return false;
    const job: UploadJob = {
      id: nextId++,
      label: files.length === 1 ? (files[0]?.name ?? '1 file') : `${files.length} files`,
      bytes: files.reduce((sum, file) => sum + file.size, 0),
      progress: 0,
    };
    setJobs((current) => [...current, job]);
    try {
      await send((progress) => setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, progress } : item))));
      toast(`Uploaded ${job.label}`);
      return true;
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Upload failed', 'error');
      return false;
    } finally {
      setJobs((current) => current.filter((item) => item.id !== job.id));
    }
  }, []);

  return { jobs, upload };
}

export function UploadList({ jobs }: { jobs: UploadJob[] }) {
  if (!jobs.length) return null;
  return (
    <div class="uploads">
      {jobs.map((job) => (
        <div key={job.id} class="upload-item">
          <span class="truncate">{job.label}</span>
          <span class="mono faint">
            {Math.round(job.progress * 100)}% of {formatBytes(job.bytes)}
          </span>
          <Meter value={job.progress} label={`Uploading ${job.label}`} />
        </div>
      ))}
    </div>
  );
}
