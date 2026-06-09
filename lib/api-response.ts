import { NextResponse } from 'next/server'

export type ApiSuccess<T> = {
  data: T
  meta?: Record<string, unknown>
}

export type ApiError = {
  error: string
  code: string
}

export function successResponse<T>(
  data: T,
  meta?: Record<string, unknown>,
  status = 200
): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ data, meta }, { status })
}

export function errorResponse(
  error: string,
  code: string,
  status = 400
): NextResponse<ApiError> {
  return NextResponse.json({ error, code }, { status })
}

export function notFound(resource = 'Resource'): NextResponse<ApiError> {
  return errorResponse(`${resource} not found`, 'NOT_FOUND', 404)
}

export function unauthorized(): NextResponse<ApiError> {
  return errorResponse('Unauthorized', 'UNAUTHORIZED', 401)
}

export function forbidden(): NextResponse<ApiError> {
  return errorResponse('Forbidden', 'FORBIDDEN', 403)
}

export function serverError(message = 'Internal server error'): NextResponse<ApiError> {
  return errorResponse(message, 'INTERNAL_ERROR', 500)
}

export function validationError(message: string): NextResponse<ApiError> {
  return errorResponse(message, 'VALIDATION_ERROR', 422)
}
