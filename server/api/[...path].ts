import { defineEventHandler, setResponseStatus } from 'h3';

// Catch-all for unknown /api routes → return normalized 404 JSON instead of HTML/redirects
export default defineEventHandler((event) => {
  setResponseStatus(event, 404);
  return {
    error: true,
    code: 'NOT_FOUND',
    message: 'Route not found',
    path: event.path,
  };
});
