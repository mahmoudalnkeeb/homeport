import { toast } from '@homelab/ui';
import { useCallback, useState } from 'preact/hooks';

import { uploadFiles } from '../../api';

export interface UploadJob {
  id: number;
  label: string;
  bytes: number;
  progress: number;
}

let nextId = 1;

export function useUploads(onDone: (folder: string) => void) {
  const [jobs, setJobs] = useState<UploadJob[]>([]);

  const upload = useCallback(
    async (folder: string, files: File[]) => {
      if (!files.length) return;
      const job: UploadJob = {
        id: nextId++,
        label: files.length === 1 ? (files[0]?.name ?? '1 file') : `${files.length} files`,
        bytes: files.reduce((sum, file) => sum + file.size, 0),
        progress: 0,
      };
      setJobs((current) => [...current, job]);
      try {
        await uploadFiles(folder, files, (progress) =>
          setJobs((current) => current.map((item) => (item.id === job.id ? { ...item, progress } : item)))
        );
        toast(`Uploaded ${job.label}`);
        onDone(folder);
      } catch (error) {
        toast(error instanceof Error ? error.message : 'Upload failed', 'error');
      } finally {
        setJobs((current) => current.filter((item) => item.id !== job.id));
      }
    },
    [onDone]
  );

  return { jobs, upload };
}
