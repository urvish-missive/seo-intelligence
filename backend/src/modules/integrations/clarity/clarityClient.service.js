// backend/src/modules/integrations/clarity/clarityClient.service.js
// Official Microsoft Clarity Data Export API HTTP client with fixed allowlisted endpoint and secure error handling.

import axios from 'axios';
import logger from '../../../utils/logger.js';
import {
  BadRequestError,
  UnauthorisedError,
  ForbiddenError,
  AppError,
} from '../../../middleware/errorHandler.js';

export const CLARITY_API_BASE_URL = 'https://www.clarity.ms/export-data/api/v1/project-live-insights';
export const CLARITY_SUPPORTED_DIMENSIONS = [
  'Browser',
  'Device',
  'Country/Region',
  'OS',
  'Source',
  'Medium',
  'Campaign',
  'Channel',
  'URL',
];

export class ClarityClientService {
  constructor(httpClient = axios) {
    this.http = httpClient;
    this.baseUrl = CLARITY_API_BASE_URL;
  }

  /**
   * Validate dimensions against the officially supported Microsoft list.
   *
   * @param {string[]} dimensions - Array of up to 3 dimension names
   */
  validateDimensions(dimensions = []) {
    if (!Array.isArray(dimensions)) {
      throw new BadRequestError('Dimensions must be provided as an array.');
    }

    if (dimensions.length > 3) {
      throw new BadRequestError('Microsoft Clarity Data Export API supports a maximum of 3 dimensions per query.');
    }

    for (const dim of dimensions) {
      const match = CLARITY_SUPPORTED_DIMENSIONS.find(
        (supported) => supported.toLowerCase() === String(dim).trim().toLowerCase()
      );
      if (!match) {
        throw new BadRequestError(
          `Unsupported Clarity dimension "${dim}". Supported: ${CLARITY_SUPPORTED_DIMENSIONS.join(', ')}`
        );
      }
    }
  }

  /**
   * Test a token against the official endpoint.
   *
   * @param {string} apiToken - Plaintext Clarity API token
   * @returns {Promise<{ valid: boolean, sampleData: any }>}
   */
  async testToken(apiToken) {
    if (!apiToken || typeof apiToken !== 'string') {
      throw new BadRequestError('Clarity API token is required.');
    }

    try {
      const response = await this.http.get(this.baseUrl, {
        params: { numOfDays: 1 },
        headers: {
          Authorization: `Bearer ${apiToken.trim()}`,
          Accept: 'application/json',
        },
        timeout: 15000,
      });

      return {
        valid: true,
        sampleData: response.data,
      };
    } catch (err) {
      this.handleClarityError(err);
    }
  }

  /**
   * Fetch live insights from Microsoft Clarity Data Export API.
   *
   * @param {string} apiToken - Plaintext Clarity API token
   * @param {object} options - { numOfDays: 1|2|3, dimensions: string[] }
   * @returns {Promise<any>} Raw JSON response array
   */
  async fetchLiveInsights(apiToken, { numOfDays = 1, dimensions = [] } = {}) {
    if (![1, 2, 3].includes(Number(numOfDays))) {
      throw new BadRequestError('numOfDays must be either 1, 2, or 3 (representing the last 24h, 48h, or 72h).');
    }

    this.validateDimensions(dimensions);

    const params = { numOfDays: Number(numOfDays) };
    if (dimensions.length > 0) params.dimension1 = dimensions[0];
    if (dimensions.length > 1) params.dimension2 = dimensions[1];
    if (dimensions.length > 2) params.dimension3 = dimensions[2];

    try {
      logger.info(
        `Executing Clarity Data Export API request (numOfDays=${numOfDays}, dimensions=[${dimensions.join(', ')}])`
      );

      const response = await this.http.get(this.baseUrl, {
        params,
        headers: {
          Authorization: `Bearer ${apiToken.trim()}`,
          Accept: 'application/json',
        },
        timeout: 20000,
      });

      return response.data;
    } catch (err) {
      this.handleClarityError(err);
    }
  }

  /**
   * Map Microsoft HTTP error responses into structured, safe application errors.
   * Strictly avoids leaking bearer tokens in logs or error messages.
   */
  handleClarityError(err) {
    if (err.response) {
      const status = err.response.status;
      const data = err.response.data;

      logger.warn(`Microsoft Clarity API responded with HTTP ${status}:`, {
        status,
        data: typeof data === 'string' ? data.slice(0, 200) : data,
      });

      if (status === 401) {
        throw new UnauthorisedError(
          'Microsoft Clarity API token is invalid, expired, or revoked. Please check your project settings.'
        );
      }
      if (status === 403) {
        throw new ForbiddenError(
          'Access forbidden. The Clarity API token does not have permission for this resource.'
        );
      }
      if (status === 429) {
        throw new AppError(
          'Microsoft Clarity daily export quota reached (10 requests per project per day). Please retry tomorrow.',
          429
        );
      }
      if (status === 400) {
        throw new BadRequestError(
          `Invalid Microsoft Clarity request parameters: ${data?.message || 'Check numOfDays and dimensions.'}`
        );
      }
      throw new AppError(
        `Microsoft Clarity service error (HTTP ${status}). Please try again later.`,
        status >= 500 ? 502 : status
      );
    }

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      logger.error('Microsoft Clarity API request timed out');
      throw new AppError('Microsoft Clarity API request timed out after 20 seconds. Please try again.', 504);
    }

    logger.error(`Network error connecting to Microsoft Clarity: ${err.message}`);
    throw new AppError('Unable to connect to Microsoft Clarity Data Export API. Check network connectivity.', 502);
  }
}

export const clarityClientService = new ClarityClientService();
export default clarityClientService;
