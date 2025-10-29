import { FileService } from './FileService';
import { PROJECT_ANALYSIS } from '../../src/utils/constants';

export class UserActivityService {
  private activeFiles = new Map<string, number>(); // Map<filePath, timestamp>
  private pruneInterval: NodeJS.Timeout;

  constructor(fileService: FileService) {
    fileService.on('file-changed', this.handleFileChange);
    this.pruneInterval = setInterval(
      this.pruneActiveFiles,
      PROJECT_ANALYSIS.USER_ACTIVITY_PRUNE_INTERVAL_MS
    );
  }

  private handleFileChange = (data: { event: string; path: string }): void => {
    if (data.event === 'change') {
      console.log(`[UserActivityService] Tracking active file: ${data.path}`);
      this.activeFiles.set(data.path, Date.now());
    }
   };
   
  private pruneActiveFiles = (): void => {
    const now = Date.now();
    for (const [path, timestamp] of this.activeFiles.entries()) {
      if (now - timestamp > PROJECT_ANALYSIS.USER_ACTIVITY_WINDOW_MS) {
        this.activeFiles.delete(path);
      }
    }
  };

  public getActiveFiles(): string[] {
    // Prune just before returning to ensure data is fresh,
    // in case the interval hasn't run recently.
    this.pruneActiveFiles();
    return Array.from(this.activeFiles.keys());
  }

  public cleanup(): void {
    clearInterval(this.pruneInterval);
  }
}
