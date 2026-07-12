export const API_BASE = window.location.port === '3001'
    ? window.location.origin
    : `${window.location.protocol}//${window.location.hostname}:3001`;
