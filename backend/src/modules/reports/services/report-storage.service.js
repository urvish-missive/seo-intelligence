// backend/src/modules/reports/services/report-storage.service.js
// Secure report storage abstraction with path validation and streaming downloads.

import fs from 'fs';
import path from 'path';
import { env } from '../../../config/environment.js';
import logger from '../../../utils/logger.js';
import { NotFoundError, BadRequestError } from '../../../middleware/errorHandler.js';

export class ReportStorageService {
  constructor() {
    this.storageDir = path.resolve(process.cwd(), env.REPORTS_DIR || './storage/reports');
    this.ensureStorageDirExists();
  }

  /**
   * Ensure directory exists on startup.
   */
  ensureStorageDirExists() {
    try {
      if (!fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true });
        logger.info(`Initialized report storage directory at: ${this.storageDir}`);
      }
    } catch (err) {
      logger.error(`Failed to initialize report storage directory: ${err.message}`);
    }
  }

  /**
   * Generate an isolated file key and absolute target path.
   */
  resolveFilePath(filename) {
    if (!filename || typeof filename !== 'string') {
      throw new BadRequestError('Invalid file identifier.');
    }

    // Path traversal defense
    const safeFilename = path.basename(filename);
    const resolvedPath = path.resolve(this.storageDir, safeFilename);

    if (!resolvedPath.startsWith(this.storageDir)) {
      throw new BadRequestError('Access denied: Illegal file path traversal attempt.');
    }

    return {
      filename: safeFilename,
      absolutePath: resolvedPath,
    };
  }

  /**
   * Check whether a report file exists on disk.
   */
  fileExists(filename) {
    const { absolutePath } = this.resolveFilePath(filename);
    return fs.existsSync(absolutePath);
  }

  /**
   * Get file stats (size in bytes).
   */
  getFileStats(filename) {
    const { absolutePath } = this.resolveFilePath(filename);
    if (!fs.existsSync(absolutePath)) {
      return null;
    }
    return fs.statSync(absolutePath);
  }

  /**
   * Create a readable stream for authenticated downloading.
   */
  createReadStream(filename) {
    const { absolutePath } = this.resolveFilePath(filename);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundError('Requested report file was not found on server storage.');
    }
    return fs.createReadStream(absolutePath);
  }

  /**
   * Delete report file from storage.
   */
  deleteFile(filename) {
    try {
      if (!filename) return false;
      const { absolutePath } = this.resolveFilePath(filename);
      if (fs.existsSync(absolutePath)) {
        fs.unlinkSync(absolutePath);
        return true;
      }
      return false;
    } catch (err) {
      logger.warn(`Failed to delete report file ${filename}: ${err.message}`);
      return false;
    }
  }
}

export const reportStorageService = new ReportStorageService();
