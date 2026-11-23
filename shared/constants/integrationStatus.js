// shared/constants/integrationStatus.js
export const INTEGRATION_STATUS = {
  NOT_CONNECTED: 'NOT_CONNECTED',
  CONNECTING: 'CONNECTING',
  CONNECTED: 'CONNECTED',
  SYNCING: 'SYNCING',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  REQUIRES_ATTENTION: 'REQUIRES_ATTENTION',
  DISCONNECTED: 'DISCONNECTED',
};

export const INTEGRATION_STATUS_LABEL = {
  NOT_CONNECTED: 'Not Connected',
  CONNECTING: 'Connecting',
  CONNECTED: 'Connected',
  SYNCING: 'Syncing',
  FAILED: 'Failed',
  EXPIRED: 'Token Expired',
  REQUIRES_ATTENTION: 'Requires Attention',
  DISCONNECTED: 'Disconnected',
};

export const INTEGRATION_STATUS_COLOR = {
  NOT_CONNECTED: 'gray',
  CONNECTING: 'blue',
  CONNECTED: 'green',
  SYNCING: 'blue',
  FAILED: 'red',
  EXPIRED: 'yellow',
  REQUIRES_ATTENTION: 'yellow',
  DISCONNECTED: 'gray',
};

export const INTEGRATION_TYPE = {
  GA4: 'GA4',
  GSC: 'GSC',
  CLARITY: 'CLARITY',
};
