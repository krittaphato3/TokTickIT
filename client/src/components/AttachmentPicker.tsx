import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';

// ui-spec §5 / mockup Attachments — files are held as pending client state
// ONLY; server upload wiring arrives in Issue #17. Enforced client-side:
// 4-type allowlist (JPG/JPEG, PNG, WEBP, PDF), 5 MB per file, 5 active files.
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const MAX_FILE_SIZE = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 5;

interface PendingFile {
  id: string;
  name: string;
  size: number;
  error?: string;
}

function formatSize(bytes: number): string {
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function extensionOf(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? (parts.pop() as string).toLowerCase() : '';
}

export default function AttachmentPicker({ disabled }: { disabled?: boolean }) {
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(incoming: FileList | File[]) {
    const next = [...files];
    const active = next.filter((f) => !f.error).length;

    for (const file of Array.from(incoming)) {
      const ext = extensionOf(file.name);
      if (active >= MAX_ATTACHMENTS) {
        next.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          error: 'Attachment limit reached (5 max)',
        });
        continue;
      }
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        next.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          error: 'File type not supported',
        });
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        next.push({
          id: `${file.name}-${Date.now()}-${Math.random()}`,
          name: file.name,
          size: file.size,
          error: 'File too large — max 5 MB',
        });
        continue;
      }
      next.push({ id: `${file.name}-${Date.now()}-${Math.random()}`, name: file.name, size: file.size });
    }

    setFiles(next);
  }

  function removeFile(id: string) {
    setFiles((current) => current.filter((f) => f.id !== id));
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragOver(false);
    if (!disabled && event.dataTransfer.files.length > 0) {
      addFiles(event.dataTransfer.files);
    }
  }

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) {
      addFiles(event.target.files);
    }
    event.target.value = '';
  }

  return (
    <>
      <div
        className={`tok-dropzone${dragOver ? ' dragover' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <div>
          Drag and drop files here, or{' '}
          <span
            className="tok-browse"
            role="button"
            tabIndex={0}
            onClick={() => !disabled && inputRef.current?.click()}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
                e.preventDefault();
                inputRef.current?.click();
              }
            }}
          >
            browse files
          </span>
        </div>
        <div className="tok-formats">JPG · PNG · WEBP · PDF</div>
        <input
          ref={inputRef}
          type="file"
          id="fileInput"
          multiple
          hidden
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          onChange={onChange}
          tabIndex={-1}
        />
      </div>

      {files.length > 0 && (
        <div className="tok-chips" id="chips">
          {files.map((file) => (
            <span
              key={file.id}
              className={`tok-chip${file.error ? ' invalid' : ''}`}
            >
              {file.error ? (
                <span className="bang" aria-hidden="true">!</span>
              ) : (
                <span className="ok" aria-hidden="true">✓</span>
              )}
              <span className="name">
                {file.error ? `${file.name} — ${file.error}` : file.name}
              </span>
              {!file.error && <span className="size">{formatSize(file.size)}</span>}
              <button
                type="button"
                className="x"
                aria-label={`Dismiss ${file.name}`}
                onClick={() => removeFile(file.id)}
                disabled={disabled}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}