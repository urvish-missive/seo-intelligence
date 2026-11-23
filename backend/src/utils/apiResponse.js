// backend/src/utils/apiResponse.js
// Consistent API response shapes.

/**
 * Success response
 * @param {object} res - Express response
 * @param {any} data - Response payload
 * @param {string} message - Optional message
 * @param {number} statusCode - HTTP status (default 200)
 */
export function successResponse(res, data, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
}

/**
 * Created response (201)
 */
export function createdResponse(res, data, message = 'Created successfully') {
  return successResponse(res, data, message, 201);
}

/**
 * Error response
 * @param {object} res - Express response
 * @param {string} message - Error message
 * @param {number} statusCode - HTTP status (default 400)
 * @param {any} errors - Validation errors or additional info
 */
export function errorResponse(res, message, statusCode = 400, errors = null) {
  const body = {
    success: false,
    message,
  };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
}

/**
 * Paginated response
 */
export function paginatedResponse(res, data, pagination, message = 'Success') {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination,
  });
}

/**
 * Build pagination meta from Prisma count + query params
 */
export function buildPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page,
    limit,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export const ApiResponse = {
  success: successResponse,
  created: createdResponse,
  error: errorResponse,
  paginated: paginatedResponse,
};

