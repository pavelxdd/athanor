// File detection configuration
export const FILE_DETECTION = {
  // Maximum buffer size for MIME type detection (256KB)
  maxBufferSize: 262144,
  // Minimum ratio of printable characters to consider a file as text
  textThreshold: 0.8,
  // ASCII character ranges
  asciiPrintableMin: 32,
  asciiPrintableMax: 126,
  // Whitespace characters to consider as valid text
  whitespaceChars: new Set([9, 10, 13]), // tab, LF, CR
} as const;

// Common text file extensions that don't require MIME verification
export const KNOWN_TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'cfg',
  'conf',
  'config',
  'ini',
  'env',
  'csv',
  'tsv',
  'yml',
  'yaml',
  'json',
  'xml',
  'html',
  'htm',
  'css',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'php',
  'java',
  'c',
  'cpp',
  'h',
  'hpp',
  'sh',
  'bash',
  'zsh',
  'log',
  'diff',
  'patch',
  'ass',
  'srt',
]);

/**
 * Checks if a file extension indicates a text file
 * @param filePath Path to the file
 * @returns boolean indicating if the extension matches known text files
 */
export function isTextFileExtension(filePath: string): boolean {
  const extension = filePath.split('.').pop()?.toLowerCase();
  return extension ? KNOWN_TEXT_EXTENSIONS.has(extension) : false;
}

/**
 * Detects if a file is a text file using extension and content analysis
 * @param filePath Path to the file to check
 * @returns Promise<boolean> indicating if the file is a text file
 * @throws Error if file access or analysis fails
 */
export async function isTextFile(filePath: string): Promise<boolean> {
  try {
    // Quick check based on extension
    if (isTextFileExtension(filePath)) {
      return true;
    }

    // Read file buffer through Electron's preload API
    const buffer = await window.fileSystem.readFile(filePath, {
      encoding: null,
    });

    // Ensure we have an ArrayBuffer
    const arrayBuffer =
      buffer instanceof ArrayBuffer
        ? buffer
        : typeof buffer === 'string'
          ? new TextEncoder().encode(buffer).buffer
          : buffer;

    // Convert to Uint8Array for analysis
    const uint8Array = new Uint8Array(arrayBuffer);

    // Analyze only the first portion of the file
    const analysisBuffer = uint8Array.slice(0, FILE_DETECTION.maxBufferSize);
    const length = analysisBuffer.length;

    // If buffer is empty, treat as text (empty file)
    if (length === 0) {
      return true;
    }

    const { asciiPrintableMin, asciiPrintableMax, whitespaceChars, textThreshold } = FILE_DETECTION;
    let printableChars = 0;

    // Manual iteration avoids filter allocation
    for (let i = 0; i < length; i++) {
      const byte = analysisBuffer[i];
      if ((byte >= asciiPrintableMin && byte <= asciiPrintableMax) || whitespaceChars.has(byte)) {
        printableChars++;
      }
    }

    return printableChars / length >= textThreshold;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error analyzing file ${filePath}: ${error.message}`);
    }
    throw new Error(`Unknown error analyzing file ${filePath}`);
  }
}

export function isBufferText(buffer: ArrayBuffer): boolean {
  // Convert to Uint8Array for analysis (view, no copy)
  const uint8Array = new Uint8Array(buffer);
  const maxBytes = FILE_DETECTION.maxBufferSize;
  const length = Math.min(uint8Array.length, maxBytes);

  // If buffer is empty, treat as text (empty file)
  if (length === 0) {
    return true;
  }

  const { asciiPrintableMin, asciiPrintableMax, whitespaceChars } = FILE_DETECTION;
  let printableChars = 0;

  // Manual iteration avoids filter allocation
  for (let i = 0; i < length; i++) {
    const byte = uint8Array[i];
    if ((byte >= asciiPrintableMin && byte <= asciiPrintableMax) || whitespaceChars.has(byte)) {
      printableChars++;
    }
  }

  return printableChars / length >= FILE_DETECTION.textThreshold;
}
